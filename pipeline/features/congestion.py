"""
pipeline/features/congestion.py
================================
Congestion and traffic pressure feature engineering.

Features Generated
------------------
1.  corridor_risk_score      - Per-corridor road-closure rate (fit-time stat)
2.  corridor_event_density   - Normalised event count per corridor in training set
3.  is_arterial_corridor     - 1 for major arterials (Mysore, Bellary, ORR, Tumkur etc.)
4.  is_non_corridor          - 1 if corridor == "Non-corridor"
5.  is_cbd_corridor          - 1 if corridor ∈ {CBD 1, CBD 2}
6.  hour_corridor_density    - Mean event count at this corridor × hour_bin in training
7.  hour_bin_system_load     - System-wide events per hour_bin (normalised)
                               Proxy for "how busy the network is right now"
8.  is_peak_congestion       - 1 if (is_night_peak OR is_morning_peak) AND
                               (is_vehicle_incident OR is_infrastructure)
                               — the specific compound condition that drives most events
9.  vehicles_per_corridor    - Fraction of vehicle-incident events on this corridor
10. police_station_risk      - Per-station road-closure rate (fit-time stat)

Reasoning
---------
- Corridor risk is a compact encoding of the geospatial-administrative relationship
  between network topology and closure rate: Non-corridor leads at 12.1%, CBD at 11.5%.
- hour_corridor_density captures the interaction between when and where an event
  occurs — a breakdown on Mysore Road at night is structurally different from one
  on an empty ring road at 3 AM.
- is_peak_congestion is a compound interaction flag motivated by the EDA finding that
  vehicle breakdowns and infrastructure events cluster in peak hours and are the
  dominant closure drivers.
- police_station_risk encodes local area characteristics because police jurisdictions
  in Bengaluru correlate with road network density and historical incident patterns
  (Kengeri: 36%, K.G. Halli: 27% closure rates).
"""

from __future__ import annotations
import logging
from typing import Optional
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

logger = logging.getLogger(__name__)

# Major arterial corridors (high incident volume from audit)
_ARTERIAL_CORRIDORS = {
    "Mysore Road", "Bellary Road 1", "Bellary Road 2", "Tumkur Road",
    "Hosur Road", "Old Madras Road", "ORR North 1", "ORR North 2",
    "ORR East 1", "ORR East 2", "Airport New South Road",
}
_CBD_CORRIDORS     = {"CBD 1", "CBD 2"}


class CongestionFeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Compute corridor-level and system-level congestion pressure features.

    Parameters
    ----------
    corridor_col        : str  Corridor column name.
    police_col          : str  Police station column name.
    cause_col           : str  Event cause column (for compound flags).
    hour_bin_col        : str  Hour bin code column (from AdvancedTemporalFeatures).
    night_peak_col      : str  is_night_peak boolean column.
    morning_peak_col    : str  is_morning_peak boolean column.
    min_corridor_count  : int  Minimum events to compute a reliable corridor stat;
                               corridors with fewer are assigned the global mean.
    """

    def __init__(
        self,
        corridor_col:     str = "corridor",
        police_col:       str = "police_station",
        cause_col:        str = "event_cause",
        hour_bin_col:     str = "hour_bin_code",
        night_peak_col:   str = "is_night_peak",
        morning_peak_col: str = "is_morning_peak",
        min_corridor_count: int = 20,
    ):
        self.corridor_col      = corridor_col
        self.police_col        = police_col
        self.cause_col         = cause_col
        self.hour_bin_col      = hour_bin_col
        self.night_peak_col    = night_peak_col
        self.morning_peak_col  = morning_peak_col
        self.min_corridor_count = min_corridor_count

    def fit(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> "CongestionFeatureEngineer":
        """Learn corridor and police-station statistics from training data."""
        global_mean = float(y.mean()) if y is not None else 0.083
        self._global_mean = global_mean

        # ── Corridor risk (target conditional mean) ─────────────────────────
        if self.corridor_col in X.columns and y is not None:
            df_tmp = pd.DataFrame({"corridor": X[self.corridor_col], "target": y.values})
            stats = df_tmp.groupby("corridor")["target"].agg(["count", "mean"])
            # Use smoothed mean (α = 20) for small corridors
            α = 20
            stats["smoothed"] = (
                (stats["count"] * stats["mean"] + α * global_mean)
                / (stats["count"] + α)
            )
            # Zero-out corridors with too few samples
            stats.loc[stats["count"] < self.min_corridor_count, "smoothed"] = global_mean
            self._corridor_risk: dict[str, float] = stats["smoothed"].to_dict()

            # Event density (normalised count)
            total = len(X)
            density = df_tmp.groupby("corridor").size() / total
            self._corridor_density: dict[str, float] = density.to_dict()
        else:
            self._corridor_risk     = {}
            self._corridor_density  = {}

        # ── Hour × Corridor density ─────────────────────────────────────────
        if (self.corridor_col in X.columns and self.hour_bin_col in X.columns):
            hc = X.groupby([self.corridor_col, self.hour_bin_col]).size()
            hc_norm = hc / len(X)
            self._hour_corridor_density: dict = hc_norm.to_dict()
        else:
            self._hour_corridor_density = {}

        # ── Hour_bin system load ─────────────────────────────────────────────
        if self.hour_bin_col in X.columns:
            load = X[self.hour_bin_col].value_counts(normalize=True)
            self._system_load: dict = load.to_dict()
        else:
            self._system_load = {}

        # ── Police station risk ──────────────────────────────────────────────
        if self.police_col in X.columns and y is not None:
            df_ps = pd.DataFrame({"ps": X[self.police_col], "target": y.values})
            ps_stats = df_ps.groupby("ps")["target"].agg(["count", "mean"])
            α_ps = 10
            ps_stats["smoothed"] = (
                (ps_stats["count"] * ps_stats["mean"] + α_ps * global_mean)
                / (ps_stats["count"] + α_ps)
            )
            self._ps_risk: dict[str, float] = ps_stats["smoothed"].to_dict()
        else:
            self._ps_risk = {}

        # ── Per-corridor vehicle-incident fraction ───────────────────────────
        if self.corridor_col in X.columns and self.cause_col in X.columns:
            df_cv = X.copy()
            df_cv["is_veh"] = (df_cv[self.cause_col] == "vehicle_breakdown").astype(int)
            veh_frac = df_cv.groupby(self.corridor_col)["is_veh"].mean()
            self._corridor_veh_frac: dict[str, float] = veh_frac.to_dict()
        else:
            self._corridor_veh_frac = {}

        logger.info("CongestionFeatureEngineer fitted on %d rows.", len(X))
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        gm = self._global_mean

        # 1. Corridor risk score
        if self.corridor_col in X.columns:
            corr = X[self.corridor_col].astype(str)
            X["corridor_risk_score"]    = corr.map(self._corridor_risk).fillna(gm).round(4)
            X["corridor_event_density"] = corr.map(self._corridor_density).fillna(0.0).round(5)
            X["is_arterial_corridor"]   = corr.isin(_ARTERIAL_CORRIDORS).astype(int)
            X["is_non_corridor"]        = (corr == "Non-corridor").astype(int)
            X["is_cbd_corridor"]        = corr.isin(_CBD_CORRIDORS).astype(int)
            X["vehicles_per_corridor"]  = corr.map(self._corridor_veh_frac).fillna(0.5).round(4)

        # 2. Hour × corridor density
        if self.corridor_col in X.columns and self.hour_bin_col in X.columns:
            pairs = list(zip(X[self.corridor_col].astype(str), X[self.hour_bin_col]))
            X["hour_corridor_density"]  = [
                self._hour_corridor_density.get(p, 0.0) for p in pairs
            ]

        # 3. System load at this hour bin
        if self.hour_bin_col in X.columns:
            X["hour_bin_system_load"] = (
                X[self.hour_bin_col].map(self._system_load).fillna(0.2).round(5)
            )

        # 4. Peak congestion compound flag
        peak_flag = pd.Series(0, index=X.index)
        if self.night_peak_col in X.columns:
            peak_flag |= X[self.night_peak_col]
        if self.morning_peak_col in X.columns:
            peak_flag |= X[self.morning_peak_col]
        if self.cause_col in X.columns:
            vehicle_or_infra = X[self.cause_col].isin({
                "vehicle_breakdown", "construction", "road_conditions", "pot_holes"
            }).astype(int)
            X["is_peak_congestion"] = (peak_flag & vehicle_or_infra).astype(int)
        else:
            X["is_peak_congestion"] = peak_flag.astype(int)

        # 5. Police station risk
        if self.police_col in X.columns:
            X["police_station_risk"] = (
                X[self.police_col].astype(str).map(self._ps_risk).fillna(gm).round(4)
            )

        logger.info("CongestionFeatureEngineer: added 10 congestion features.")
        return X
