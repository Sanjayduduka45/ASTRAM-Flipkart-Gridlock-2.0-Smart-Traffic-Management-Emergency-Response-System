"""
pipeline/datetime_feats.py
==========================
sklearn-compatible transformer that extracts temporal features from the
`start_datetime` column.

Features extracted
------------------
  Cyclical encoding (sin/cos):
    • hour_sin / hour_cos     — 24-hour cycle
    • dow_sin  / dow_cos      — day-of-week cycle (0=Monday)
    • month_sin / month_cos   — annual cycle

  Why cyclical? Features like hour=0 and hour=23 are temporally adjacent
  (midnight), but a plain integer would make them maximally distant (0 vs 23).
  Sine/cosine encoding wraps the period so that distance in feature space
  reflects true temporal proximity.

  Linear / categorical flags:
    • hour              — raw 0–23 (useful for tree-based models that split
                          on thresholds and don't care about circularity)
    • day_of_week       — 0=Monday, 6=Sunday
    • month             — 1–12
    • is_weekend        — 1 if Sat/Sun, else 0
    • is_morning_peak   — 1 if hour ∈ [4, 7] (early-morning HGV window)
    • is_night_peak     — 1 if hour ∈ [19, 23] (evening HGV entry window)
    • reporting_lag_min — minutes between start_datetime and created_date
                          (if created_date is present); captures operator
                          response speed, which may correlate with priority

Peak hours rationale:
  Audit revealed a bimodal hour distribution:
    · Peak A at 21:00 (810 events), 20:00 (681), attributable to trucks
      entering the city after the 8 PM daytime ban lifts.
    · Peak B at 05:00 (661), 06:00 (660), attributable to trucks completing
      routes and exiting before the 8 AM daytime ban reinstates.

The transformer is NaT-safe: rows with unparseable start_datetime receive
fill values (0 for cyclical/linear, −1 for lag) rather than being dropped.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from pipeline.config import MORNING_PEAK_HOURS, NIGHT_PEAK_HOURS

logger = logging.getLogger(__name__)


class DatetimeFeatureExtractor(BaseEstimator, TransformerMixin):
    """
    Extract rich temporal features from `start_datetime`.

    Parameters
    ----------
    datetime_col : str
        Source datetime column. Default: "start_datetime".
    created_col : str
        Optional reference column used to compute reporting lag.
        If the column does not exist in X, lag computation is skipped.
    drop_source : bool
        If True, drop the raw datetime string column after extraction.
        Set False during debugging to keep the original column.
    """

    def __init__(
        self,
        datetime_col: str = "start_datetime",
        created_col: str = "created_date",
        drop_source: bool = True,
    ):
        self.datetime_col = datetime_col
        self.created_col = created_col
        self.drop_source = drop_source

    def fit(self, X: pd.DataFrame, y=None) -> "DatetimeFeatureExtractor":
        # Stateless — nothing to learn from training data for datetime parsing
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()

        if self.datetime_col not in X.columns:
            logger.warning(
                "DatetimeFeatureExtractor: column '%s' not found. Skipping.",
                self.datetime_col,
            )
            return X

        # ------------------------------------------------------------------ #
        # Parse to UTC-aware datetime; coerce errors → NaT                    #
        # ------------------------------------------------------------------ #
        dt = pd.to_datetime(X[self.datetime_col], errors="coerce", utc=True)

        hour = dt.dt.hour          # 0–23, NaT → NaN
        dow  = dt.dt.dayofweek     # 0=Mon, NaT → NaN
        month= dt.dt.month         # 1–12, NaT → NaN

        # ------------------------------------------------------------------ #
        # Cyclical encoding (sin / cos)                                        #
        # NaN-safe: np.sin(np.nan) = NaN → fill with 0 (sin/cos of 0 cycle)  #
        # ------------------------------------------------------------------ #
        X["hour_sin"]   = np.sin(2 * np.pi * hour  / 24).fillna(0)
        X["hour_cos"]   = np.cos(2 * np.pi * hour  / 24).fillna(0)
        X["dow_sin"]    = np.sin(2 * np.pi * dow   / 7 ).fillna(0)
        X["dow_cos"]    = np.cos(2 * np.pi * dow   / 7 ).fillna(0)
        X["month_sin"]  = np.sin(2 * np.pi * (month - 1) / 12).fillna(0)
        X["month_cos"]  = np.cos(2 * np.pi * (month - 1) / 12).fillna(0)

        # ------------------------------------------------------------------ #
        # Linear / integer features (tree-model friendly)                      #
        # ------------------------------------------------------------------ #
        X["hour"]        = hour.fillna(-1).astype(int)
        X["day_of_week"] = dow .fillna(-1).astype(int)
        X["month"]       = month.fillna(-1).astype(int)

        # ------------------------------------------------------------------ #
        # Boolean flags                                                         #
        # ------------------------------------------------------------------ #
        mp_lo, mp_hi = MORNING_PEAK_HOURS
        np_lo, np_hi = NIGHT_PEAK_HOURS

        X["is_weekend"] = (dow >= 5).fillna(False).astype(int)

        # Peak flags — if hour is NaN, default to 0 (not in peak)
        hour_filled = hour.fillna(-1)
        X["is_morning_peak"] = hour_filled.between(mp_lo, mp_hi).astype(int)
        X["is_night_peak"]   = hour_filled.between(np_lo, np_hi).astype(int)

        # ------------------------------------------------------------------ #
        # Reporting lag: seconds between event start and record creation       #
        # A large lag may indicate the event was logged retrospectively,       #
        # which could correlate with lower-quality metadata.                   #
        # ------------------------------------------------------------------ #
        if self.created_col in X.columns:
            created_dt = pd.to_datetime(
                X[self.created_col], errors="coerce", utc=True
            )
            lag_sec = (created_dt - dt).dt.total_seconds()
            # Negative lags (created before start) are possible for pre-planned
            # events; we keep the raw signed value rather than clamping.
            X["reporting_lag_min"] = lag_sec.div(60).fillna(-1)
        else:
            logger.debug(
                "DatetimeFeatureExtractor: '%s' not in X; skipping lag.",
                self.created_col,
            )

        # ------------------------------------------------------------------ #
        # Optionally drop raw source columns                                   #
        # ------------------------------------------------------------------ #
        if self.drop_source:
            cols_to_drop = [
                c for c in [self.datetime_col, self.created_col]
                if c in X.columns
            ]
            X = X.drop(columns=cols_to_drop)

        logger.info(
            "DatetimeFeatureExtractor: extracted %d temporal features.",
            sum(c.startswith(("hour", "dow", "month", "is_", "reporting"))
                for c in X.columns),
        )
        return X
