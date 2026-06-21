"""
pipeline/outliers.py
====================
Outlier detection and treatment for numerical features.

Two complementary methods are implemented and compared:

Method A — IQR Fencing (InterQuartileRangeFencer)
---------------------------------------------------
  Classic non-parametric method. For each numeric column:
    lower_fence = Q1 - k * IQR
    upper_fence = Q3 + k * IQR   (default k = 1.5, configurable)

  Detected outliers are CLIPPED (Winsorized) to the fence values rather
  than dropped. Rationale: The audit found that lat/lon distances are
  correct Bengaluru values — outliers in engineered distance features likely
  represent unusual-but-real events at city periphery, not data errors.
  Clipping preserves the row while bounding influence on linear models.

  An additional binary flag `{col}_iqr_outlier` is optionally appended so
  tree-based models can learn that extreme values are themselves predictive
  (e.g. an event at max distance from all junctions may mean a highway event).

Method B — Isolation Forest (IsolationForestAnomalyFlagger)
-----------------------------------------------------------
  Unsupervised anomaly detection trained on the joint distribution of
  selected numeric features. Returns a binary flag column `if_anomaly`
  (1 = anomaly, 0 = normal) rather than modifying feature values.

  Rationale for not using IF as a filter:
    - IF detects multivariate anomalies; a point can be normal on any single
      feature but anomalous in combination (e.g. a nighttime event at a
      daytime-only location). Dropping such rows may remove meaningful signal.
    - Instead, we expose the IF score as a feature: `if_anomaly_score`
      (raw decision function, more negative = more anomalous).

Comparison summary (logged to INFO during transform):
  After fitting both methods on training data, the pipeline logs:
    · Number of per-column IQR outliers per feature
    · Number of Isolation Forest anomalies
    · Overlap: rows flagged by BOTH methods (high-confidence anomalies)
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import IsolationForest

from pipeline.config import (
    IQR_MULTIPLIER,
    ISOLATION_FOREST_CONTAMINATION,
    ISOLATION_FOREST_RANDOM_STATE,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. IQR Fencer
# ---------------------------------------------------------------------------

class IQRFencer(BaseEstimator, TransformerMixin):
    """
    Winsorize numerical columns at IQR-derived fences, with outlier flags.

    Parameters
    ----------
    columns : list of str, optional
        Numerical columns to process. Defaults to all numeric columns.
    multiplier : float
        IQR fence multiplier (k). Standard = 1.5; 3.0 for extreme-only.
    add_flag : bool
        If True, add `{col}_iqr_outlier` binary columns.
    clip : bool
        If True, clip values to fence (Winsorize). If False, only flag.
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        multiplier: float = IQR_MULTIPLIER,
        add_flag: bool = True,
        clip: bool = True,
    ):
        self.columns = columns
        self.multiplier = multiplier
        self.add_flag = add_flag
        self.clip = clip

    def fit(self, X: pd.DataFrame, y=None) -> "IQRFencer":
        num_cols = list(X.select_dtypes(include=[np.number]).columns)
        cols = self.columns if self.columns else num_cols
        self.columns_ = [c for c in cols if c in X.columns]

        self.lower_: dict[str, float] = {}
        self.upper_: dict[str, float] = {}

        for col in self.columns_:
            q1 = float(X[col].quantile(0.25))
            q3 = float(X[col].quantile(0.75))
            iqr = q3 - q1
            self.lower_[col] = q1 - self.multiplier * iqr
            self.upper_[col] = q3 + self.multiplier * iqr
            logger.debug(
                "IQRFencer %s: Q1=%.4f Q3=%.4f IQR=%.4f "
                "→ fence [%.4f, %.4f]",
                col, q1, q3, iqr, self.lower_[col], self.upper_[col],
            )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        total_flagged = 0

        for col in self.columns_:
            if col not in X.columns:
                continue
            lo, hi = self.lower_[col], self.upper_[col]
            outlier_mask = (X[col] < lo) | (X[col] > hi)
            n_out = int(outlier_mask.sum())
            total_flagged += n_out

            if self.add_flag:
                X[f"{col}_iqr_outlier"] = outlier_mask.astype(int)

            if self.clip:
                X[col] = X[col].clip(lower=lo, upper=hi)

            if n_out:
                logger.info(
                    "IQRFencer: %s → %d outlier(s) (%.1f%%) clipped to [%.3f, %.3f]",
                    col, n_out, 100 * n_out / len(X), lo, hi,
                )

        logger.info(
            "IQRFencer: total outlier cells flagged/clipped = %d across %d columns.",
            total_flagged, len(self.columns_),
        )
        return X


# ---------------------------------------------------------------------------
# 2. Isolation Forest Anomaly Flagger
# ---------------------------------------------------------------------------

class IsolationForestAnomalyFlagger(BaseEstimator, TransformerMixin):
    """
    Flag multivariate anomalies using an Isolation Forest.

    Produces two new columns:
      • `if_anomaly`       — 1 if anomaly, 0 if normal (binary)
      • `if_anomaly_score` — raw decision function score (more negative = more
                             anomalous). Useful as a continuous feature for
                             gradient-boosted models.

    Parameters
    ----------
    columns : list of str, optional
        Columns to use for anomaly detection. Defaults to all numeric columns
        present after previous transformations.
    contamination : float
        Expected proportion of anomalies in the dataset. Set to 0.05 (5%)
        based on audit findings (coordinate corruption, timestamp errors, etc.)
    random_state : int
        Reproducibility seed.
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        contamination: float = ISOLATION_FOREST_CONTAMINATION,
        random_state: int = ISOLATION_FOREST_RANDOM_STATE,
    ):
        self.columns = columns
        self.contamination = contamination
        self.random_state = random_state

    def fit(self, X: pd.DataFrame, y=None) -> "IsolationForestAnomalyFlagger":
        num_cols = list(X.select_dtypes(include=[np.number]).columns)
        self.columns_ = [c for c in (self.columns or num_cols) if c in X.columns]

        self.model_ = IsolationForest(
            contamination=self.contamination,
            random_state=self.random_state,
            n_estimators=200,
            n_jobs=-1,
        )
        X_fit = X[self.columns_].fillna(0)  # IF cannot handle NaN
        self.model_.fit(X_fit)
        logger.info(
            "IsolationForest fitted on %d features, contamination=%.2f.",
            len(self.columns_), self.contamination,
        )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        X_score = X[self.columns_].fillna(0)

        preds  = self.model_.predict(X_score)       # +1 = normal, -1 = anomaly
        scores = self.model_.decision_function(X_score)

        X["if_anomaly"]       = (preds == -1).astype(int)
        X["if_anomaly_score"] = np.round(scores, 6)

        n_anomalies = int((preds == -1).sum())
        logger.info(
            "IsolationForest: flagged %d anomalies (%.1f%% of %d rows).",
            n_anomalies, 100 * n_anomalies / len(X), len(X),
        )
        return X


# ---------------------------------------------------------------------------
# 3. Comparison utility
# ---------------------------------------------------------------------------

def compare_outlier_methods(
    df_transformed: pd.DataFrame,
    iqr_cols: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Generate a comparison table between IQR and Isolation Forest detections.

    Returns a DataFrame showing per-column IQR outlier counts and the
    overlap with Isolation Forest anomalies.

    Parameters
    ----------
    df_transformed : pd.DataFrame
        DataFrame that has already been transformed by both IQRFencer and
        IsolationForestAnomalyFlagger (must contain `if_anomaly` column and
        `{col}_iqr_outlier` columns).
    iqr_cols : list of str, optional
        Base column names to look for their `_iqr_outlier` indicators.

    Returns
    -------
    pd.DataFrame
        Summary comparison table.
    """
    if "if_anomaly" not in df_transformed.columns:
        raise ValueError("df_transformed must contain 'if_anomaly' column.")

    rows = []
    iqr_flag_cols = [c for c in df_transformed.columns if c.endswith("_iqr_outlier")]

    if iqr_cols:
        iqr_flag_cols = [f"{c}_iqr_outlier" for c in iqr_cols
                         if f"{c}_iqr_outlier" in df_transformed.columns]

    for flag_col in iqr_flag_cols:
        base = flag_col.replace("_iqr_outlier", "")
        iqr_mask = df_transformed[flag_col] == 1
        if_mask  = df_transformed["if_anomaly"] == 1
        overlap  = (iqr_mask & if_mask).sum()
        rows.append({
            "feature":             base,
            "iqr_outliers":        int(iqr_mask.sum()),
            "if_anomalies_total":  int(if_mask.sum()),
            "overlap":             int(overlap),
            "iqr_pct":             round(100 * iqr_mask.mean(), 2),
            "overlap_pct_of_iqr":  round(100 * overlap / max(iqr_mask.sum(), 1), 1),
        })

    summary = pd.DataFrame(rows).sort_values("iqr_outliers", ascending=False)
    logger.info("\nOutlier Method Comparison:\n%s", summary.to_string(index=False))
    return summary
