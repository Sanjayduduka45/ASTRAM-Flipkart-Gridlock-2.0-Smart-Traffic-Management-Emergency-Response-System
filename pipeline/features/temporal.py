"""
pipeline/features/temporal.py
==============================
Advanced temporal feature engineering for the Astram traffic event dataset.

Features Generated
------------------
1.  hour_bin_label          - Coarse time-of-day window (5 bins)
2.  hour_bin_code           - Integer encoding of hour_bin_label
3.  is_daytime_ban_window   - 1 if hour ∈ [8, 20) (HGV daytime ban in Bengaluru)
4.  is_transition_hour      - 1 if hour ∈ {7, 8, 19, 20} (ban change-over rush)
5.  is_pre_dawn             - 1 if hour ∈ [2, 4] (lowest-activity, data anomaly window)
6.  hour_quadrant           - 6-hour quadrant (0: midnight-6, 1: 6-12, 2: 12-18, 3: 18-24)
7.  is_month_end            - 1 if day-of-month >= 28 (end-of-month effects)
8.  quarter                 - Calendar quarter (1-4)
9.  days_since_epoch        - Absolute day count from dataset start (temporal ordering)
10. time_since_midnight_min - Minutes elapsed since midnight (continuous; better than hour)
11. cos_hour_fine           - Cosine of 2π×minute/1440 (sub-hour periodicity)
12. sin_hour_fine           - Sine of 2π×minute/1440

Reasoning
---------
- Bengaluru municipal rule: HGV, BMTC buses and freight vehicles are restricted
  from city corridors between 08:00 and 20:00. Events cluster at ban-window
  boundaries (19:00-21:00 and 05:00-07:00). Capturing the ban-change transition
  hours separately isolates the surge in breakdown risk.
- `time_since_midnight_min` is continuous and more informative for gradient
  boosted trees than a binned integer hour.
- `days_since_epoch` provides a temporal ordering signal useful for models that
  need to learn concept drift within the 5-month data window (Nov 2023–Apr 2024).
"""

from __future__ import annotations
import logging
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

logger = logging.getLogger(__name__)

# Bengaluru HGV daytime ban windows (city-center corridors only)
_HGV_BAN_START = 8
_HGV_BAN_END   = 20
_TRANSITION_HOURS = {7, 8, 19, 20}

_HOUR_BIN_LABELS = {
    "deep_night":  (0,  4),   # 00:00 – 03:59
    "early_morn":  (4,  8),   # 04:00 – 07:59  (morning-peak HGV window)
    "daytime":     (8,  14),  # 08:00 – 13:59  (daytime ban active)
    "afternoon":   (14, 19),  # 14:00 – 18:59  (ban still active)
    "evening":     (19, 24),  # 19:00 – 23:59  (night-peak HGV window)
}
_BIN_CODE = {label: i for i, label in enumerate(_HOUR_BIN_LABELS)}


def _assign_hour_bin(hour: pd.Series) -> pd.Series:
    result = pd.Series("unknown", index=hour.index, dtype=str)
    for label, (lo, hi) in _HOUR_BIN_LABELS.items():
        result[hour.between(lo, hi - 1)] = label
    return result


class AdvancedTemporalFeatures(BaseEstimator, TransformerMixin):
    """
    Derive rich temporal features from `start_datetime`.

    Parameters
    ----------
    datetime_col : str
        Raw datetime string column. Default: "start_datetime".
    dataset_start : str
        ISO date string for epoch reference (days_since_epoch anchor).
        Set to the dataset's earliest date detected in audit: "2023-11-09".
    drop_source : bool
        Drop raw datetime column after extraction. Default False (runner
        will have already dropped it; set True when using standalone).
    """

    def __init__(
        self,
        datetime_col: str = "start_datetime",
        dataset_start: str = "2023-11-09",
        drop_source: bool = False,
    ):
        self.datetime_col = datetime_col
        self.dataset_start = dataset_start
        self.drop_source = drop_source

    def fit(self, X: pd.DataFrame, y=None) -> "AdvancedTemporalFeatures":
        self._epoch = pd.Timestamp(self.dataset_start, tz="UTC")
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()

        if self.datetime_col not in X.columns:
            logger.warning("AdvancedTemporalFeatures: '%s' not found. Skipping.", self.datetime_col)
            return X

        dt = pd.to_datetime(X[self.datetime_col], errors="coerce", utc=True)
        hour   = dt.dt.hour.fillna(-1)
        minute = dt.dt.minute.fillna(0)
        day    = dt.dt.day.fillna(15)
        month  = dt.dt.month.fillna(1)

        # 1. Hour bin (5 categories)
        X["hour_bin_label"] = _assign_hour_bin(hour)
        X["hour_bin_code"]  = X["hour_bin_label"].map(_BIN_CODE).fillna(-1).astype(int)

        # 2. HGV ban indicators
        X["is_daytime_ban_window"] = hour.between(_HGV_BAN_START, _HGV_BAN_END - 1).astype(int)
        X["is_transition_hour"]    = hour.isin(_TRANSITION_HOURS).astype(int)
        X["is_pre_dawn"]           = hour.between(2, 4).astype(int)

        # 3. Quadrant (6-hour blocks)
        X["hour_quadrant"] = (hour // 6).clip(0, 3).astype(int)

        # 4. Month-end proxy
        X["is_month_end"] = (day >= 28).astype(int)

        # 5. Quarter
        X["quarter"] = ((month - 1) // 3 + 1).fillna(-1).astype(int)

        # 6. Days since dataset epoch (temporal ordering)
        elapsed = (dt - self._epoch).dt.total_seconds()
        X["days_since_epoch"] = (elapsed / 86400.0).fillna(-1).round(3)

        # 7. Continuous minutes-since-midnight (360 × better granularity than hour)
        X["time_since_midnight_min"] = (hour * 60 + minute).fillna(-1).astype(int)

        # 8. Fine-grained sub-hour cyclical encoding
        mins_in_day = (hour * 60 + minute).fillna(0)
        X["sin_hour_fine"] = np.sin(2 * np.pi * mins_in_day / 1440).round(6)
        X["cos_hour_fine"] = np.cos(2 * np.pi * mins_in_day / 1440).round(6)

        if self.drop_source and self.datetime_col in X.columns:
            X = X.drop(columns=[self.datetime_col])

        logger.info("AdvancedTemporalFeatures: added 12 temporal features.")
        return X
