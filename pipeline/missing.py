"""
pipeline/missing.py
===================
sklearn-compatible transformers for missing value imputation.

Three transformers, one per data family:

  NumericalImputer      - Median imputation for numeric columns
                          Reason: Median is robust to the heavy right-skew and
                          extreme outliers found in latitude/longitude and any
                          future numeric features; mean would be pulled by
                          outliers (e.g. the 140-day closure events).

  CategoricalImputer    - Per-column fill strategy:
                          · Known-unknown string (e.g. "unknown_vehicle") for
                            semantically meaningful missingness (veh_type, zone,
                            junction) — preserves the information that no value
                            was provided, which may itself be predictive.
                          · Mode for columns where missingness is random / small
                            (corridor, priority) — a single missing value among
                            8173 rows carries little signal about absence.

  TextImputer           - Empty-string imputation for text columns
                          Reason: Downstream TF-IDF/count vectorizers handle ""
                          gracefully; dropping rows with missing descriptions
                          would lose 16% of the dataset.

All transformers follow the sklearn BaseEstimator + TransformerMixin API so
they compose cleanly inside Pipeline and ColumnTransformer objects.
"""

from __future__ import annotations

import logging
from typing import Optional, Union

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from pipeline.config import CATEGORICAL_FILL, TEXT_FILL

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Numerical Imputer
# ---------------------------------------------------------------------------

class NumericalImputer(BaseEstimator, TransformerMixin):
    """
    Median-based imputer for numerical columns.

    Why median over mean?
    ---------------------
    The audit revealed that closure durations have a mean of 6,352 min but
    a median of 64.5 min — extreme right-skew driven by zombie open tickets.
    Any numeric feature derived from such sources would have its mean dragged
    far from the typical value. Median imputation is invariant to such outliers.

    Parameters
    ----------
    columns : list of str
        Numeric columns to impute. If None, all float64/int64 columns are used.
    add_indicator : bool
        If True, adds a binary `{col}_was_missing` column for each imputed
        column that had at least one NaN at fit time. This lets models learn
        whether absence of a value is itself informative.
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        add_indicator: bool = True,
    ):
        self.columns = columns
        self.add_indicator = add_indicator

    def fit(self, X: pd.DataFrame, y=None) -> "NumericalImputer":
        cols = self.columns or list(X.select_dtypes(include=[np.number]).columns)
        self.columns_ = [c for c in cols if c in X.columns]
        self.medians_: dict[str, float] = {}
        self.has_missing_: dict[str, bool] = {}

        for col in self.columns_:
            self.medians_[col] = float(X[col].median())
            self.has_missing_[col] = bool(X[col].isna().any())
            logger.debug("NumericalImputer: %s median=%.4f", col, self.medians_[col])

        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        for col in self.columns_:
            if col not in X.columns:
                continue
            if self.add_indicator and self.has_missing_[col]:
                X[f"{col}_was_missing"] = X[col].isna().astype(int)
            X[col] = X[col].fillna(self.medians_[col])
        return X


# ---------------------------------------------------------------------------
# 2. Categorical Imputer
# ---------------------------------------------------------------------------

class CategoricalImputer(BaseEstimator, TransformerMixin):
    """
    Flexible imputer for categorical columns supporting two fill strategies.

    Strategy A — "constant" (default for most columns):
        Fills NaN with a fixed string defined in config.CATEGORICAL_FILL.
        Used for veh_type, zone, junction, gba_identifier where missing data
        has semantic meaning: the operator did not supply the vehicle type /
        the zone was not resolved. Preserving "unknown_X" as a distinct
        category lets the model learn that missing context may correlate
        with certain incident types.

    Strategy B — "mode" (for sparse random missingness):
        Fills NaN with the most frequent value seen during fit.
        Used for corridor (0.24% missing) and priority (0.02% missing)
        where the absence is almost certainly a data entry gap rather
        than meaningful.

    Parameters
    ----------
    columns : list of str, optional
        Columns to process. Defaults to all object-dtype columns.
    strategy : str
        "constant" or "mode". Applied column-by-column via CATEGORICAL_FILL
        overrides; this parameter sets the default for unspecified columns.
    add_indicator : bool
        Append `{col}_was_missing` binary column for columns that had NaN
        at fit time. Allows models to capture missingness patterns.
    """

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        strategy: str = "constant",
        add_indicator: bool = True,
    ):
        self.columns = columns
        self.strategy = strategy
        self.add_indicator = add_indicator

    def fit(self, X: pd.DataFrame, y=None) -> "CategoricalImputer":
        cols = self.columns or list(X.select_dtypes(include=["object", "category"]).columns)
        self.columns_ = [c for c in cols if c in X.columns]
        self.fill_values_: dict[str, str] = {}
        self.has_missing_: dict[str, bool] = {}

        for col in self.columns_:
            self.has_missing_[col] = bool(X[col].isna().any())
            if col in CATEGORICAL_FILL:
                # Named constant override (semantically meaningful missingness)
                self.fill_values_[col] = CATEGORICAL_FILL[col]
            elif self.strategy == "mode":
                mode_val = X[col].mode()
                self.fill_values_[col] = str(mode_val.iloc[0]) if len(mode_val) else "unknown"
            else:
                # Default constant: infer from column name
                self.fill_values_[col] = f"unknown_{col}"

            logger.debug(
                "CategoricalImputer: %s → fill='%s'", col, self.fill_values_[col]
            )

        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        for col in self.columns_:
            if col not in X.columns:
                continue
            if self.add_indicator and self.has_missing_[col]:
                X[f"{col}_was_missing"] = X[col].isna().astype(int)
            X[col] = X[col].fillna(self.fill_values_[col])
        return X


# ---------------------------------------------------------------------------
# 3. Text Imputer
# ---------------------------------------------------------------------------

class TextImputer(BaseEstimator, TransformerMixin):
    """
    Imputes missing text fields with empty strings.

    Rationale:
    -----------
    Dropping rows with missing descriptions would discard 16.6% of the dataset
    (1,360 rows). sklearn's TF-IDF and CountVectorizer handle empty strings
    gracefully — they produce all-zero sparse vectors, which is the correct
    representation for "no text provided."

    Additionally computes two lightweight derived features per text column:
      - `{col}_len_words`: word count of the description (0 if missing)
      - `{col}_has_keyword`: binary flag for high-signal keyword matches

    These hand-crafted features capture text signal without requiring a full
    vectorizer in this transformer (vectorizers are separate pipeline steps).

    Parameters
    ----------
    columns : list of str, optional
        Text columns to impute. Defaults to TEXT_FILL keys.
    keywords : dict of {col: list[str]}, optional
        Per-column keyword lists for binary feature creation.
        Defaults to a domain-relevant set from the audit.
    """

    # Default high-signal keywords derived from EDA description analysis
    DEFAULT_KEYWORDS: dict[str, list[str]] = {
        "description": [
            "block", "slow", "tree", "accident", "metro", "water",
            "pothole", "bus", "truck", "breakdown", "closed",
        ],
        "address": [
            "ring road", "bellary", "mysore", "tumkur", "hosur",
            "nh", "highway",
        ],
    }

    def __init__(
        self,
        columns: Optional[list[str]] = None,
        keywords: Optional[dict[str, list[str]]] = None,
    ):
        self.columns = columns
        self.keywords = keywords

    def fit(self, X: pd.DataFrame, y=None) -> "TextImputer":
        from pipeline.config import TEXT_FILL
        self.columns_ = self.columns or [c for c in TEXT_FILL if c in X.columns]
        self.keywords_ = self.keywords or self.DEFAULT_KEYWORDS
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        for col in self.columns_:
            if col not in X.columns:
                continue

            # Impute missing with empty string
            X[col] = X[col].fillna("").astype(str)

            # Feature: word count
            X[f"{col}_len_words"] = X[col].apply(lambda t: len(t.split()) if t else 0)

            # Feature: keyword presence flags
            kws = self.keywords_.get(col, [])
            for kw in kws:
                feat_name = f"{col}_has_{kw.replace(' ', '_')}"
                X[feat_name] = X[col].str.lower().str.contains(
                    kw, regex=False, na=False
                ).astype(int)

        # PIN code extraction from address (e.g. "Pin-560037")
        if "address" in X.columns:
            X["address_pin_code"] = (
                X["address"]
                .str.extract(r"Pin-(\d{6})", expand=False)
                .fillna("unknown_pin")
            )

        return X
