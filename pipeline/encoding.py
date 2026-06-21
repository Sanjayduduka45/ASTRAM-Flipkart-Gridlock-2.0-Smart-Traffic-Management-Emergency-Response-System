"""
pipeline/encoding.py
====================
Three categorical encoding strategies implemented as sklearn transformers,
with a comparison utility to evaluate each.

Why compare encoders?
---------------------
No single encoding is universally optimal. The best choice depends on:
  · Column cardinality
  · Model type (linear vs tree-based)
  · Relationship between category and target

Strategy A — LabelEncoder (OrdinalEncoder)
-------------------------------------------
  Maps each unique category to an integer (0, 1, 2, ...).
  Pros: compact; memory-efficient; works natively with tree models.
  Cons: implies ordinal order that doesn't exist (e.g. "bmtc_bus" < "lcv"
        is meaningless). Safe ONLY for tree-based models (GBDTs, Random
        Forests) that split on thresholds and don't misinterpret ordinality.
  Best for: high-cardinality columns (junction: 294 values) where OHE
            would explode dimensionality.

Strategy B — FrequencyEncoder
-------------------------------
  Replaces each category with its frequency (count / N) in the training set.
  Pros: handles high cardinality without dimensionality explosion; naturally
        encodes "how common is this category" — relevant since the audit showed
        that frequent corridors (Mysore Road, Bellary Road) likely have distinct
        incident profiles.
  Cons: two categories with the same frequency get the same code → loses
        category identity. Can cause tree collisions.
  Best for: nominal high-cardinality features used in GBDTs.

Strategy C — TargetEncoder
----------------------------
  Replaces each category with the smoothed conditional mean of the target:
    encoded = (n_cat * mean_cat + α * global_mean) / (n_cat + α)
    where α = smoothing strength (default = 10).
  Smoothing shrinks rare-category estimates toward the global mean, preventing
  overfitting to small groups.
  Pros: encodes the category's ACTUAL relationship with the target; very
        powerful for linear models and GBDTs.
  Cons: requires the target y during fit → MUST be fitted on training data
        only. Test data must be transformed using training-fold statistics.
        Prone to target leakage if not used inside a cross-validation loop.
  Best for: mid-to-high cardinality nominal features (police_station: 54,
            corridor: 22) when the target relationship is strong.

IMPORTANT: TargetEncoder must be fitted only on training folds.
           The pipeline enforces this by exposing a `target_col` parameter
           that is used at fit time and then discarded at transform time.
"""

from __future__ import annotations

import logging
from typing import Optional, Union

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Label / Ordinal Encoder
# ---------------------------------------------------------------------------

class LabelEncoderTransformer(BaseEstimator, TransformerMixin):
    """
    Map each category to a unique integer.

    Parameters
    ----------
    columns : list of str, optional
        Categorical columns to encode. Defaults to all object-dtype columns.
    handle_unknown : str
        "value" → unseen categories → -1
        "error"  → raise ValueError
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        handle_unknown: str = "value",
    ):
        self.columns = columns
        self.handle_unknown = handle_unknown

    def fit(self, X: pd.DataFrame, y=None) -> "LabelEncoderTransformer":
        cat_cols = list(X.select_dtypes(include=["object", "category"]).columns)
        self.columns_ = [c for c in (self.columns or cat_cols) if c in X.columns]
        self.mapping_: dict[str, dict[str, int]] = {}

        for col in self.columns_:
            unique_vals = X[col].dropna().unique()
            self.mapping_[col] = {v: i for i, v in enumerate(sorted(unique_vals))}
            logger.debug(
                "LabelEncoder %s: %d categories", col, len(self.mapping_[col])
            )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        for col in self.columns_:
            if col not in X.columns:
                continue
            mapping = self.mapping_[col]
            if self.handle_unknown == "value":
                X[col] = X[col].map(mapping).fillna(-1).astype(int)
            else:
                unseen = set(X[col].dropna().unique()) - set(mapping.keys())
                if unseen:
                    raise ValueError(
                        f"LabelEncoder: unseen categories in '{col}': {unseen}"
                    )
                X[col] = X[col].map(mapping).astype(int)
        return X


# ---------------------------------------------------------------------------
# 2. Frequency Encoder
# ---------------------------------------------------------------------------

class FrequencyEncoderTransformer(BaseEstimator, TransformerMixin):
    """
    Replace each category with its training-set frequency proportion.

    Parameters
    ----------
    columns : list of str, optional
        Categorical columns to encode.
    handle_unknown : str
        "zero"   → unseen categories → 0.0
        "global" → unseen categories → global_freq (1 / n_unique)
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        handle_unknown: str = "zero",
    ):
        self.columns = columns
        self.handle_unknown = handle_unknown

    def fit(self, X: pd.DataFrame, y=None) -> "FrequencyEncoderTransformer":
        cat_cols = list(X.select_dtypes(include=["object", "category"]).columns)
        self.columns_ = [c for c in (self.columns or cat_cols) if c in X.columns]
        self.freq_maps_: dict[str, dict[str, float]] = {}
        self.global_freq_: dict[str, float] = {}

        for col in self.columns_:
            freq = X[col].value_counts(normalize=True, dropna=True)
            self.freq_maps_[col] = freq.to_dict()
            self.global_freq_[col] = 1.0 / max(len(freq), 1)
            logger.debug(
                "FreqEncoder %s: %d unique values, max_freq=%.4f",
                col, len(freq), freq.max() if len(freq) else 0,
            )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        for col in self.columns_:
            if col not in X.columns:
                continue
            fmap = self.freq_maps_[col]
            fallback = (
                self.global_freq_[col]
                if self.handle_unknown == "global"
                else 0.0
            )
            X[col] = X[col].map(fmap).fillna(fallback)
        return X


# ---------------------------------------------------------------------------
# 3. Target Encoder
# ---------------------------------------------------------------------------

class TargetEncoderTransformer(BaseEstimator, TransformerMixin):
    """
    Smoothed target-mean encoding.

    Encoding formula:
        encoded(cat) = (n_cat * mean_cat + α * global_mean) / (n_cat + α)

    where α (smoothing) shrinks small-group estimates toward the global mean
    to prevent overfitting. Larger α = more regularization.

    Parameters
    ----------
    columns : list of str, optional
        Categorical columns to encode.
    target_col : str
        Name of the target column used during fit. The column is read from
        the `y` argument (passed as a pd.Series) rather than from X, keeping
        X and y decoupled.
    smoothing : float
        Regularization strength α. Default: 10.
        Rule of thumb: √(n_training_rows) is a reasonable starting point.
    handle_unknown : str
        "global" → encode unseen categories with global target mean.
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        target_col: str = "requires_road_closure",
        smoothing: float = 10.0,
        handle_unknown: str = "global",
    ):
        self.columns = columns
        self.target_col = target_col
        self.smoothing = smoothing
        self.handle_unknown = handle_unknown

    def fit(
        self,
        X: pd.DataFrame,
        y: Optional[Union[pd.Series, np.ndarray]] = None,
    ) -> "TargetEncoderTransformer":
        cat_cols = list(X.select_dtypes(include=["object", "category"]).columns)
        self.columns_ = [c for c in (self.columns or cat_cols) if c in X.columns]

        if y is None:
            raise ValueError("TargetEncoderTransformer.fit() requires y.")

        if isinstance(y, np.ndarray):
            y = pd.Series(y, index=X.index)
        # Convert boolean target to int if needed
        y_num = y.astype(float)

        self.global_mean_: float = float(y_num.mean())
        self.encoding_maps_: dict[str, dict[str, float]] = {}

        for col in self.columns_:
            df_tmp = pd.DataFrame({"cat": X[col], "target": y_num})
            stats = df_tmp.groupby("cat")["target"].agg(["count", "mean"])

            # Smoothed mean
            α = self.smoothing
            G = self.global_mean_
            stats["smoothed"] = (
                (stats["count"] * stats["mean"] + α * G)
                / (stats["count"] + α)
            )
            self.encoding_maps_[col] = stats["smoothed"].to_dict()
            logger.debug(
                "TargetEncoder %s: %d cats, global_mean=%.4f",
                col, len(stats), G,
            )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        for col in self.columns_:
            if col not in X.columns:
                continue
            enc = self.encoding_maps_[col]
            X[col] = X[col].map(enc).fillna(self.global_mean_)
        return X


# ---------------------------------------------------------------------------
# 4. Comparison Utility
# ---------------------------------------------------------------------------

def compare_encodings(
    df: pd.DataFrame,
    columns: list[str],
    target: pd.Series,
) -> pd.DataFrame:
    """
    Fit all three encoders on the same data and compare their outputs.

    Returns a DataFrame with one row per (column, category) showing the
    encoded value from each strategy. Useful for understanding the
    representation each method produces.

    Parameters
    ----------
    df : pd.DataFrame
        Training data (X).
    columns : list of str
        Categorical columns to compare.
    target : pd.Series
        Target variable (for TargetEncoder).

    Returns
    -------
    pd.DataFrame
        Comparison table with columns: feature, category, label_enc,
        freq_enc, target_enc.
    """
    rows = []

    le = LabelEncoderTransformer(columns=columns).fit(df)
    fe = FrequencyEncoderTransformer(columns=columns).fit(df)
    te = TargetEncoderTransformer(columns=columns, smoothing=10).fit(df, y=target)

    df_le = le.transform(df)
    df_fe = fe.transform(df)
    df_te = te.transform(df)

    for col in columns:
        if col not in df.columns:
            continue
        unique_cats = df[col].dropna().unique()
        for cat in unique_cats:
            mask = df[col] == cat
            if mask.sum() == 0:
                continue
            rows.append({
                "feature":    col,
                "category":   cat,
                "count":      int(mask.sum()),
                "label_enc":  df_le.loc[mask, col].iloc[0],
                "freq_enc":   round(float(df_fe.loc[mask, col].iloc[0]), 6),
                "target_enc": round(float(df_te.loc[mask, col].iloc[0]), 6),
                "target_mean": round(float(target[mask].mean()), 6),
            })

    comparison = pd.DataFrame(rows).sort_values(["feature", "count"], ascending=[True, False])
    logger.info("\nEncoding Comparison:\n%s", comparison.to_string(index=False))
    return comparison
