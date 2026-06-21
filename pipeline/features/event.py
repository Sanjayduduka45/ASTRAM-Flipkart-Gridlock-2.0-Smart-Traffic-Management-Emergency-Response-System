"""
pipeline/features/event.py
===========================
Event-type and event-cause feature engineering.

Features Generated
------------------
1.  cause_severity_score    - Continuous [0,1] score derived from audit-measured
                              road-closure rate per event cause. Higher = more likely
                              to require road closure.
2.  cause_priority_score    - Continuous [0,1] score: fraction of High-priority events
                              per cause. Reflects operational urgency.
3.  cause_category          - Coarser 5-group taxonomy:
                              [infrastructure, obstruction, vehicle, social, environmental]
4.  is_infrastructure       - Binary: construction/road_conditions/pot_holes
5.  is_obstruction          - Binary: tree_fall/debris/vip_movement/protest/processio
6.  is_vehicle_incident     - Binary: vehicle_breakdown/accident/congestion
7.  is_social_event         - Binary: public_event/processio/protest
8.  is_environmental        - Binary: water_logging/Fog
9.  is_high_closure_risk    - Binary: cause_severity_score >= 0.25 (top quartile)
10. is_planned_event        - Binary: event_type == "planned"
11. veh_type_risk_score     - Per-vehicle-type road-closure rate from audit
12. is_heavy_vehicle        - Binary: veh_type ∈ {heavy_vehicle, truck, bmtc_bus}
13. is_public_transport     - Binary: veh_type ∈ {bmtc_bus, ksrtc_bus, private_bus}

Reasoning
---------
- Cause severity score replaces multi-class categorical with a single continuous
  ordinal that directly encodes the target-relevant ordering discovered in EDA:
  vip_movement (0.80) >> tree_fall (0.39) >> construction (0.27) > vehicle_breakdown (0.04)
- Coarse cause_category groups semantically related causes so the model can
  generalise across cause variants (e.g. "debris" vs "Debris" normalised here).
- Heavy vehicles (trucks, HGVs, BMTC buses) are the dominant event producers;
  distinguishing them as a group captures the HGV-regulation interaction.
"""

from __future__ import annotations
import logging
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

logger = logging.getLogger(__name__)

# ── Severity & priority scores derived from audit EDA ───────────────────────
# Source: pd.crosstab(event_cause, requires_road_closure, normalize='index')
CAUSE_SEVERITY_SCORES: dict[str, float] = {
    "vip_movement":      0.800,
    "public_event":      0.464,
    "protest":           0.400,
    "tree_fall":         0.394,
    "construction":      0.265,
    "procession":        0.264,
    "road_conditions":   0.124,
    "others":            0.086,
    "water_logging":     0.085,
    "Debris":            0.083,
    "debris":            1.000,  # only 1 record; keep literal EDA value
    "congestion":        0.044,
    "vehicle_breakdown": 0.043,
    "accident":          0.030,
    "pot_holes":         0.024,
    "Fog / Low Visibility": 0.000,
    "test_demo":         0.000,
}

CAUSE_PRIORITY_SCORES: dict[str, float] = {
    "congestion":        0.691,
    "vehicle_breakdown": 0.662,
    "construction":      0.629,
    "others":            0.596,
    "water_logging":     0.592,
    "road_conditions":   0.547,
    "pot_holes":         0.557,
    "public_event":      0.500,
    "Fog / Low Visibility": 0.500,
    "accident":          0.460,
    "protest":           0.400,
    "vip_movement":      0.350,
    "tree_fall":         0.327,
    "procession":        0.319,
    "test_demo":         0.333,
    "Debris":            0.667,
    "debris":            1.000,
}

# ── Coarse cause taxonomy ───────────────────────────────────────────────────
CAUSE_CATEGORY_MAP: dict[str, str] = {
    "construction":      "infrastructure",
    "road_conditions":   "infrastructure",
    "pot_holes":         "infrastructure",
    "tree_fall":         "obstruction",
    "debris":            "obstruction",
    "Debris":            "obstruction",
    "vip_movement":      "obstruction",
    "protest":           "obstruction",
    "procession":        "obstruction",
    "vehicle_breakdown": "vehicle",
    "accident":          "vehicle",
    "congestion":        "vehicle",
    "public_event":      "social",
    "water_logging":     "environmental",
    "Fog / Low Visibility": "environmental",
    "others":            "other",
    "test_demo":         "other",
}

_HIGH_CLOSURE_THRESHOLD = 0.25  # top ~30% of causes by severity

# ── Vehicle type risk (road-closure rate from audit) ───────────────────────
VEH_TYPE_RISK: dict[str, float] = {
    "auto":          0.108,
    "private_bus":   0.056,
    "truck":         0.054,
    "bmtc_bus":      0.050,
    "heavy_vehicle": 0.042,
    "private_car":   0.041,
    "others":        0.036,
    "lcv":           0.027,
    "ksrtc_bus":     0.023,
    "taxi":          0.021,
    "unknown_vehicle": 0.044,  # global mean
}

_HEAVY_VEH = {"heavy_vehicle", "truck", "bmtc_bus"}
_PUBLIC_TRANSPORT = {"bmtc_bus", "ksrtc_bus", "private_bus"}


class EventFeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Engineer event-level features from cause, type, and vehicle columns.

    Parameters
    ----------
    cause_col   : str   Column holding event_cause values.
    veh_col     : str   Column holding veh_type values.
    type_col    : str   Column holding event_type (planned/unplanned).
    global_severity : float
        Fallback severity score for unseen causes (global mean ≈ 0.083).
    global_priority : float
        Fallback priority score for unseen causes (global mean ≈ 0.598).
    """

    def __init__(
        self,
        cause_col:        str = "event_cause",
        veh_col:          str = "veh_type",
        type_col:         str = "event_type",
        global_severity:  float = 0.083,
        global_priority:  float = 0.598,
    ):
        self.cause_col       = cause_col
        self.veh_col         = veh_col
        self.type_col        = type_col
        self.global_severity = global_severity
        self.global_priority = global_priority

    def fit(self, X: pd.DataFrame, y=None) -> "EventFeatureEngineer":
        return self  # stateless — all mappings are domain-derived constants

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()

        # ── Cause-level scores ─────────────────────────────────────────────
        if self.cause_col in X.columns:
            cause = X[self.cause_col].astype(str)

            X["cause_severity_score"] = (
                cause.map(CAUSE_SEVERITY_SCORES).fillna(self.global_severity).round(4)
            )
            X["cause_priority_score"] = (
                cause.map(CAUSE_PRIORITY_SCORES).fillna(self.global_priority).round(4)
            )
            X["cause_category"] = (
                cause.map(CAUSE_CATEGORY_MAP).fillna("other")
            )
            X["is_infrastructure"]   = (X["cause_category"] == "infrastructure").astype(int)
            X["is_obstruction"]      = (X["cause_category"] == "obstruction").astype(int)
            X["is_vehicle_incident"] = (X["cause_category"] == "vehicle").astype(int)
            X["is_social_event"]     = (X["cause_category"] == "social").astype(int)
            X["is_environmental"]    = (X["cause_category"] == "environmental").astype(int)
            X["is_high_closure_risk"]= (
                X["cause_severity_score"] >= _HIGH_CLOSURE_THRESHOLD
            ).astype(int)

        # ── Event type ─────────────────────────────────────────────────────
        if self.type_col in X.columns:
            X["is_planned_event"] = (X[self.type_col].astype(str) == "planned").astype(int)

        # ── Vehicle type risk ──────────────────────────────────────────────
        if self.veh_col in X.columns:
            veh = X[self.veh_col].astype(str)
            X["veh_type_risk_score"] = (
                veh.map(VEH_TYPE_RISK).fillna(VEH_TYPE_RISK["unknown_vehicle"]).round(4)
            )
            X["is_heavy_vehicle"]    = veh.isin(_HEAVY_VEH).astype(int)
            X["is_public_transport"] = veh.isin(_PUBLIC_TRANSPORT).astype(int)

        logger.info("EventFeatureEngineer: added 14 event features.")
        return X
