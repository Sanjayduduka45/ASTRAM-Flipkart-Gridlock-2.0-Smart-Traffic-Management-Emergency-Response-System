"""
pipeline/features/importance.py
=================================
Feature importance ranking using three complementary methods:

1. RandomForest feature importances    — mean decrease in impurity (MDI)
   Fast; works on any feature type; captures nonlinear relationships.
   Bias: can overrate high-cardinality continuous features.

2. Mutual Information (MI) scores      — information-theoretic measure
   Model-agnostic; captures both linear and nonlinear associations.
   Better than correlation for skewed binary targets.

3. Pearson / Point-biserial correlation — linear association with target
   Simple baseline; useful for quickly identifying near-zero-signal features.

Output
------
Returns a ranked DataFrame with columns:
    feature, rf_importance, mi_score, pearson_r, mean_rank, category

`mean_rank` is computed by averaging the rank (1=best) across all three methods,
providing a robust ensemble importance estimate that is more stable than any
single method.

Usage
-----
    from pipeline.features.importance import rank_feature_importance
    result = rank_feature_importance(X_train, y_train, top_n=50)
    result.to_csv("output/feature_importance.csv", index=False)
"""

from __future__ import annotations
import logging
from typing import Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import mutual_info_classif
from scipy.stats import pointbiserialr

logger = logging.getLogger(__name__)

# Feature category mapping (prefix-based)
_FEATURE_CATEGORIES = {
    # Temporal
    "hour": "Temporal", "dow": "Temporal", "month": "Temporal",
    "is_weekend": "Temporal", "is_morning_peak": "Temporal", "is_night_peak": "Temporal",
    "is_daytime_ban": "Temporal", "is_transition": "Temporal", "is_pre_dawn": "Temporal",
    "hour_bin": "Temporal", "hour_quadrant": "Temporal", "quarter": "Temporal",
    "days_since": "Temporal", "time_since_midnight": "Temporal",
    "sin_hour_fine": "Temporal", "cos_hour_fine": "Temporal",
    # Event
    "cause": "Event", "event_type": "Event", "veh_type": "Event",
    "is_planned": "Event", "is_heavy": "Event", "is_public": "Event",
    "is_infrastructure": "Event", "is_obstruction": "Event", "is_vehicle": "Event",
    "is_social": "Event", "is_environmental": "Event", "is_high_closure": "Event",
    # Congestion
    "corridor": "Congestion", "is_arterial": "Congestion", "is_non_corridor": "Congestion",
    "is_cbd": "Congestion", "is_peak_congestion": "Congestion",
    "hour_corridor": "Congestion", "hour_bin_system": "Congestion",
    "vehicles_per": "Congestion", "police_station": "Congestion",
    # Zone
    "zone": "Zone", "gba": "Zone", "is_high_risk_zone": "Zone",
    "is_unknown_zone": "Zone",
    # Junction
    "junction": "Junction",
    # Road Closure Risk
    "closure_risk": "RoadClosure", "hour_closure": "RoadClosure",
    # Geospatial
    "lat": "Geospatial", "lon": "Geospatial", "dist_to": "Geospatial",
    "radial_band": "Geospatial", "lat_lon": "Geospatial",
    "spatial_grid": "Geospatial", "coord_out": "Geospatial",
    # Route
    "is_radial": "Route", "is_orbital": "Route",
    "corridor_cluster": "Route", "corridor_length": "Route",
    # Interaction
    "cause_x": "Interaction", "heavy_x": "Interaction",
    "obstruction_x": "Interaction", "social_x": "Interaction",
    "zone_risk_x": "Interaction", "dist_centre_x": "Interaction",
    "corridor_x": "Interaction", "junction_x": "Interaction",
    # Group Stats
    "corridor_zone": "GroupStat", "hour_cause": "GroupStat",
    "zone_cause": "GroupStat", "police_hour": "GroupStat",
    # Rolling
    "rolling": "Rolling", "events_same": "Rolling",
    # Text
    "description": "Text", "address": "Text",
    # Other
    "if_anomaly": "Anomaly", "authenticated": "Other",
    "start_dt_parse": "Other", "veh_type_was": "Missing",
    "zone_was": "Missing", "junction_was": "Missing",
    "corridor_was": "Missing", "gba_identifier_was": "Missing",
}


def _get_category(feature_name: str) -> str:
    for prefix, cat in _FEATURE_CATEGORIES.items():
        if feature_name.lower().startswith(prefix.lower()):
            return cat
    return "Other"


def rank_feature_importance(
    X: pd.DataFrame,
    y: pd.Series,
    top_n: int = 60,
    rf_n_estimators: int = 200,
    rf_random_state: int = 42,
    drop_object_cols: bool = True,
) -> pd.DataFrame:
    """
    Compute and rank feature importance using RF + MI + Pearson.

    Parameters
    ----------
    X               : pd.DataFrame  Feature matrix (processed, numeric).
    y               : pd.Series     Binary target (0/1).
    top_n           : int           Number of top features to return.
    rf_n_estimators : int           Trees in RandomForest.
    rf_random_state : int           Seed.
    drop_object_cols: bool          Drop string/object columns before scoring.

    Returns
    -------
    pd.DataFrame sorted by mean_rank ascending (rank 1 = most important).
    """
    if drop_object_cols:
        X = X.select_dtypes(include=[np.number])

    # Fill any remaining NaN (shouldn't happen post-pipeline but guard anyway)
    X = X.fillna(0)
    y_num = y.astype(int)

    features = list(X.columns)
    n = len(features)

    logger.info("Ranking %d features via RF + MI + Pearson...", n)

    # ── 1. Random Forest Importances ────────────────────────────────────────
    rf = RandomForestClassifier(
        n_estimators=rf_n_estimators,
        max_depth=8,
        class_weight="balanced",
        n_jobs=-1,
        random_state=rf_random_state,
    )
    rf.fit(X, y_num)
    rf_imp = pd.Series(rf.feature_importances_, index=features)

    # ── 2. Mutual Information ────────────────────────────────────────────────
    mi = mutual_info_classif(X, y_num, discrete_features=False, random_state=rf_random_state)
    mi_scores = pd.Series(mi, index=features)

    # ── 3. Pearson Correlation (point-biserial for binary target) ────────────
    pearson_r = {}
    for col in features:
        try:
            if X[col].std() == 0:  # constant column → undefined correlation
                pearson_r[col] = 0.0
            else:
                r, _ = pointbiserialr(y_num, X[col])
                pearson_r[col] = abs(r) if np.isfinite(r) else 0.0
        except Exception:
            pearson_r[col] = 0.0
    pearson_series = pd.Series(pearson_r)

    # ── Combine into DataFrame ────────────────────────────────────────────────
    result = pd.DataFrame({
        "feature":       features,
        "rf_importance": rf_imp.fillna(0).values,
        "mi_score":      mi_scores.fillna(0).values,
        "pearson_r":     pearson_series.fillna(0).values,
    })

    # Rank within each method (1 = best); fillna handles ties from NaN scores
    result["rf_rank"]      = result["rf_importance"].rank(ascending=False, method="min").fillna(n).astype(int)
    result["mi_rank"]      = result["mi_score"].rank(ascending=False, method="min").fillna(n).astype(int)
    result["pearson_rank"] = result["pearson_r"].rank(ascending=False, method="min").fillna(n).astype(int)
    result["mean_rank"]    = (result["rf_rank"] + result["mi_rank"] + result["pearson_rank"]) / 3.0

    # Add category
    result["category"] = result["feature"].apply(_get_category)

    # Sort by mean rank
    result = result.sort_values("mean_rank").reset_index(drop=True)
    result["overall_rank"] = range(1, len(result) + 1)

    # Round for display
    for col in ["rf_importance", "mi_score", "pearson_r", "mean_rank"]:
        result[col] = result[col].round(6)

    logger.info("Feature importance ranking complete. Top feature: %s", result["feature"].iloc[0])
    return result.head(top_n) if top_n else result
