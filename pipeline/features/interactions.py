"""
pipeline/features/interactions.py
===================================
Cross-feature interaction and aggregation features.

Categories
----------
A. INTERACTION FEATURES (pairwise products / logical AND combinations)
   1.  cause_x_peak           - cause_severity_score × is_night_peak
   2.  cause_x_weekend        - cause_severity_score × is_weekend
   3.  cause_x_arterial       - cause_severity_score × is_arterial_corridor
   4.  cause_x_zone_risk      - cause_severity_score × zone_risk_score
   5.  heavy_x_night          - is_heavy_vehicle × is_night_peak
                                (most impactful: HGV ban-lift causes night events)
   6.  heavy_x_arterial       - is_heavy_vehicle × is_arterial_corridor
   7.  obstruction_x_daytime  - is_obstruction × is_daytime_ban_window
   8.  social_x_weekend       - is_social_event × is_weekend
                                (public events, protests predominantly weekend)
   9.  zone_risk_x_hour       - zone_risk_score × hour_closure_risk
   10. dist_centre_x_severity - dist_to_city_centre × cause_severity_score
                                (peripheral high-severity events may behave differently)
   11. corridor_x_peak_load   - corridor_risk_score × hour_bin_system_load
   12. junction_x_severity    - junction_closure_rate × cause_severity_score

B. AGGREGATED GROUP STATISTICS (fit-time; prevent leakage via train-only stats)
   13. corridor_zone_risk      - Mean closure rate for (corridor, zone) combination
   14. hour_cause_closure_rate - Closure rate for (hour_bin_code, event_cause) pair
   15. zone_cause_closure_rate - Closure rate for (zone, event_cause) pair
   16. police_hour_closure_rate- Closure rate for (police_station, hour_bin_code) pair

C. ROLLING TEMPORAL FEATURES (ordered by start_datetime)
   NOTE: Rolling features require the data to be sorted by time.
   These are computed on the RAW (pre-processed) data and then joined
   back as static features. They simulate "how many events happened in the
   last N hours / days at this location / corridor".
   
   17. rolling_3h_system_count - Events in 3-hour rolling window system-wide
   18. rolling_6h_corridor_count - Events in 6-hour window on same corridor
   19. events_same_day         - Total events on the same calendar day
   20. events_same_zone_day    - Events in same zone on same day (spatial density)

Reasoning
---------
- Interactions encode domain logic as explicit numeric features. A tree model
  can discover (cause_severity × is_night_peak) if given enough depth, but
  explicitly providing it speeds learning, reduces required depth, and improves
  interpretability.
- Group statistics turn the categorical×categorical relationship into a single
  numeric feature, collapsing the combinatorial expansion while retaining the
  signal.
- Rolling features capture local spatio-temporal density — a breakdown at a
  location that already has 5 events in the past 3 hours is more likely to
  require road closure than an isolated first event at the same spot.
"""

from __future__ import annotations
import logging
from typing import Optional
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

logger = logging.getLogger(__name__)


class InteractionFeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Build interaction, aggregated group-stat, and rolling temporal features.

    Parameters
    ----------
    datetime_col     : str   Raw datetime column (needed for rolling features).
    corridor_col     : str
    zone_col         : str
    cause_col        : str
    police_col       : str
    hour_bin_col     : str   Integer hour-bin code column.
    rolling_windows  : list  Hours for rolling event-count windows.
    min_group_count  : int   Minimum group size for reliable group stats.
    """

    def __init__(
        self,
        datetime_col:    str = "start_datetime",
        corridor_col:    str = "corridor",
        zone_col:        str = "zone",
        cause_col:       str = "event_cause",
        police_col:      str = "police_station",
        hour_bin_col:    str = "hour_bin_code",
        rolling_windows: list = None,
        min_group_count: int = 5,
    ):
        self.datetime_col    = datetime_col
        self.corridor_col    = corridor_col
        self.zone_col        = zone_col
        self.cause_col       = cause_col
        self.police_col      = police_col
        self.hour_bin_col    = hour_bin_col
        self.rolling_windows = rolling_windows or [3, 6]
        self.min_group_count = min_group_count

    # ──────────────────────────────────────────────────────────────────────── #
    # FIT: learn all group statistics from training data                        #
    # ──────────────────────────────────────────────────────────────────────── #
    def fit(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> "InteractionFeatureEngineer":
        self._global_mean = float(y.mean()) if y is not None else 0.083
        gm = self._global_mean
        α = 10  # smoothing

        y_arr = y.values if y is not None else np.full(len(X), gm)

        def _group_rate(df_tmp: pd.DataFrame, group_cols: list, target_col: str) -> dict:
            """Return smoothed target mean keyed by group tuple."""
            grouped = df_tmp.groupby(group_cols)[target_col].agg(["count", "mean"])
            grouped["smoothed"] = (
                (grouped["count"] * grouped["mean"] + α * gm) / (grouped["count"] + α)
            )
            # Drop groups below minimum count
            grouped.loc[grouped["count"] < self.min_group_count, "smoothed"] = gm
            return grouped["smoothed"].to_dict()

        base = X.copy()
        base["_target"] = y_arr

        # B. Group statistics
        # 1. (corridor, zone)
        if self.corridor_col in X.columns and self.zone_col in X.columns:
            self._corridor_zone_rate = _group_rate(base, [self.corridor_col, self.zone_col], "_target")
        else:
            self._corridor_zone_rate = {}

        # 2. (hour_bin, event_cause)
        if self.hour_bin_col in X.columns and self.cause_col in X.columns:
            self._hour_cause_rate = _group_rate(base, [self.hour_bin_col, self.cause_col], "_target")
        else:
            self._hour_cause_rate = {}

        # 3. (zone, event_cause)
        if self.zone_col in X.columns and self.cause_col in X.columns:
            self._zone_cause_rate = _group_rate(base, [self.zone_col, self.cause_col], "_target")
        else:
            self._zone_cause_rate = {}

        # 4. (police_station, hour_bin)
        if self.police_col in X.columns and self.hour_bin_col in X.columns:
            self._police_hour_rate = _group_rate(base, [self.police_col, self.hour_bin_col], "_target")
        else:
            self._police_hour_rate = {}

        # C. Rolling features — precompute training temporal stats
        # We store the sorted training datetime index for rolling lookups
        if self.datetime_col in X.columns:
            self._train_dt = pd.to_datetime(X[self.datetime_col], errors="coerce", utc=True)
            self._train_corridor = X.get(self.corridor_col, pd.Series("", index=X.index))
            self._train_zone     = X.get(self.zone_col,     pd.Series("", index=X.index))
        else:
            self._train_dt = None

        logger.info("InteractionFeatureEngineer fitted on %d rows.", len(X))
        return self

    # ──────────────────────────────────────────────────────────────────────── #
    # TRANSFORM                                                                  #
    # ──────────────────────────────────────────────────────────────────────── #
    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        gm = self._global_mean

        # ── A. INTERACTION FEATURES ──────────────────────────────────────────
        # Pull needed columns (may not exist if run standalone)
        def _col(name, default=0.0):
            return X[name] if name in X.columns else pd.Series(default, index=X.index)

        cause_sev  = _col("cause_severity_score", gm)
        zone_risk  = _col("zone_risk_score",  gm)
        corr_risk  = _col("corridor_risk_score", gm)
        hr_risk    = _col("hour_closure_risk", gm)
        load       = _col("hour_bin_system_load", 0.2)
        dist_cc    = _col("dist_to_city_centre", 10.0)
        junc_cr    = _col("junction_closure_rate", gm)
        is_night   = _col("is_night_peak", 0)
        is_morn    = _col("is_morning_peak", 0)
        is_wknd    = _col("is_weekend", 0)
        is_art     = _col("is_arterial_corridor", 0)
        is_daytban = _col("is_daytime_ban_window", 0)
        is_heavy   = _col("is_heavy_vehicle", 0)
        is_obstr   = _col("is_obstruction", 0)
        is_social  = _col("is_social_event", 0)

        X["cause_x_peak"]            = (cause_sev * is_night).round(4)
        X["cause_x_weekend"]         = (cause_sev * is_wknd).round(4)
        X["cause_x_arterial"]        = (cause_sev * is_art).round(4)
        X["cause_x_zone_risk"]       = (cause_sev * zone_risk).round(4)
        X["heavy_x_night"]           = (is_heavy * is_night).astype(int)
        X["heavy_x_arterial"]        = (is_heavy * is_art).astype(int)
        X["obstruction_x_daytime"]   = (is_obstr * is_daytban).astype(int)
        X["social_x_weekend"]        = (is_social * is_wknd).astype(int)
        X["zone_risk_x_hour"]        = (zone_risk * hr_risk).round(4)
        X["dist_centre_x_severity"]  = (dist_cc * cause_sev).round(4)
        X["corridor_x_peak_load"]    = (corr_risk * load).round(6)
        X["junction_x_severity"]     = (junc_cr * cause_sev).round(4)

        # ── B. GROUP STATISTICS ───────────────────────────────────────────────
        # (corridor, zone)
        if self.corridor_col in X.columns and self.zone_col in X.columns:
            keys = list(zip(X[self.corridor_col].astype(str), X[self.zone_col].astype(str)))
            X["corridor_zone_risk"] = [self._corridor_zone_rate.get(k, gm) for k in keys]
        else:
            X["corridor_zone_risk"] = gm

        # (hour_bin, event_cause)
        if self.hour_bin_col in X.columns and self.cause_col in X.columns:
            keys = list(zip(X[self.hour_bin_col], X[self.cause_col].astype(str)))
            X["hour_cause_closure_rate"] = [self._hour_cause_rate.get(k, gm) for k in keys]
        else:
            X["hour_cause_closure_rate"] = gm

        # (zone, event_cause)
        if self.zone_col in X.columns and self.cause_col in X.columns:
            keys = list(zip(X[self.zone_col].astype(str), X[self.cause_col].astype(str)))
            X["zone_cause_closure_rate"] = [self._zone_cause_rate.get(k, gm) for k in keys]
        else:
            X["zone_cause_closure_rate"] = gm

        # (police, hour_bin)
        if self.police_col in X.columns and self.hour_bin_col in X.columns:
            keys = list(zip(X[self.police_col].astype(str), X[self.hour_bin_col]))
            X["police_hour_closure_rate"] = [self._police_hour_rate.get(k, gm) for k in keys]
        else:
            X["police_hour_closure_rate"] = gm

        # ── C. ROLLING TEMPORAL FEATURES ────────────────────────────────────
        if self.datetime_col in X.columns:
            dt = pd.to_datetime(X[self.datetime_col], errors="coerce", utc=True)

            # System-wide rolling count (3h and 6h windows)
            # Use a merged sorted approach against training timestamps
            if self._train_dt is not None:
                all_dt = pd.concat([
                    self._train_dt.rename("dt"),
                    dt.rename("dt")
                ], ignore_index=False).sort_values()

            for window_h in self.rolling_windows:
                col_name = f"rolling_{window_h}h_system_count"
                # Per-row: count training events within window_h hours before this event
                window_sec = window_h * 3600
                counts = []
                for ts in dt:
                    if pd.isna(ts) or self._train_dt is None:
                        counts.append(0)
                        continue
                    # Count events in (ts - window, ts]
                    n = int(((self._train_dt >= ts - pd.Timedelta(hours=window_h)) &
                             (self._train_dt < ts)).sum())
                    counts.append(n)
                X[col_name] = counts

            # Same-day event count (system-wide)
            if self._train_dt is not None:
                X["events_same_day"] = dt.dt.date.map(
                    self._train_dt.dt.date.value_counts().to_dict()
                ).fillna(0).astype(int)
            else:
                X["events_same_day"] = 0

            # Same zone, same day
            if self.zone_col in X.columns and self._train_dt is not None:
                train_zone_day = pd.DataFrame({
                    "zone": self._train_zone.values,
                    "date": self._train_dt.dt.date.values
                })
                zone_day_counts = train_zone_day.groupby(["zone","date"]).size().to_dict()
                X["events_same_zone_day"] = [
                    zone_day_counts.get((z, d), 0)
                    for z, d in zip(X[self.zone_col].astype(str), dt.dt.date)
                ]
            else:
                X["events_same_zone_day"] = 0

        n_added = sum(1 for c in [
            "cause_x_peak", "cause_x_weekend", "cause_x_arterial", "cause_x_zone_risk",
            "heavy_x_night", "heavy_x_arterial", "obstruction_x_daytime", "social_x_weekend",
            "zone_risk_x_hour", "dist_centre_x_severity", "corridor_x_peak_load", "junction_x_severity",
            "corridor_zone_risk", "hour_cause_closure_rate", "zone_cause_closure_rate",
            "police_hour_closure_rate",
            "rolling_3h_system_count", "rolling_6h_system_count", "events_same_day", "events_same_zone_day"
        ] if c in X.columns)
        logger.info("InteractionFeatureEngineer: added %d features.", n_added)
        return X
