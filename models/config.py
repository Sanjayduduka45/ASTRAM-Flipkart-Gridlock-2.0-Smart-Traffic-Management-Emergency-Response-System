"""
models/config.py
=================
Centralised configuration for model training:
  - Feature sets (all numeric, top-30, deduped-top-21)
  - Model definitions with hyperparameters
  - Evaluation metric definitions
  - Cross-validation strategy
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# 1. COLUMNS TO EXCLUDE FROM FEATURE MATRIX
#    (non-numeric raw strings that survived to the feature CSV)
# ---------------------------------------------------------------------------
DROP_COLS_FROM_FEATURES: list[str] = [
    "start_datetime",
    "event_cause",
    "hour_bin_label",
    "cause_category",
    "spatial_grid_id",
]

# ---------------------------------------------------------------------------
# 2. FEATURE SUBSETS
#    Three modes the trainer can operate in:
#      "all"    - all numeric features (~185 after dropping string cols)
#      "top30"  - ensemble consensus top-30 from feature selection
#      "top21"  - top-30 after removing the 9 identified redundant features
# ---------------------------------------------------------------------------

# Top-30 from feature selection (ensemble consensus rank)
TOP_30_FEATURES: list[str] = [
    "veh_type_was_missing",
    "dist_to_city_centre",
    "zone_risk_x_hour",
    "days_since_epoch",
    "hour_closure_risk",
    "hour_cause_closure_rate",
    "dist_to_kr_circle",
    "events_same_day",
    "description_has_tree_iqr_outlier",
    "description_len_words",
    "closure_risk_composite",
    "description_has_slow_iqr_outlier",
    "dist_to_satellite_bus_stand",
    "dist_to_hebbal_flyover",
    "radial_band",
    "dist_to_mekhri_circle",
    "dist_to_nagavara_orr_junc",
    "description_has_closed_iqr_outlier",
    "dist_to_yeshwanthpura_circle",
    "dist_to_nearest_junction",
    "dist_to_ayyappa_temple_junc",
    "dist_to_silk_board_junc",
    "month_sin",
    "hour_cos",
    "dist_to_jalahalli_cross",
    "rolling_6h_system_count",
    "cause_severity_score",
    "if_anomaly_score",
    "rolling_3h_system_count",
    "dist_to_mysore_road_toll",
]

# Top-21: top-30 with 9 redundant features removed (|r|>=0.90 pairs, keep higher-ranked)
TOP_21_FEATURES: list[str] = [
    "veh_type_was_missing",
    "dist_to_city_centre",
    "zone_risk_x_hour",          # keeps; drops hour_closure_risk (r=0.9999)
    "days_since_epoch",           # keeps; drops month_sin (r=0.979)
    "hour_cause_closure_rate",
    "events_same_day",
    "description_has_tree_iqr_outlier",
    "description_len_words",
    "closure_risk_composite",     # keeps; drops cause_severity_score (r=0.991)
    "description_has_slow_iqr_outlier",
    "dist_to_satellite_bus_stand",
    "dist_to_hebbal_flyover",     # keeps; drops dist_to_nagavara_orr_junc (r=0.967)
    "dist_to_mekhri_circle",      # keeps; drops dist_to_yeshwanthpura + dist_to_jalahalli
    "description_has_closed_iqr_outlier",
    "dist_to_nearest_junction",
    "dist_to_ayyappa_temple_junc",
    "dist_to_silk_board_junc",
    "hour_cos",
    "rolling_6h_system_count",
    "if_anomaly_score",
    "rolling_3h_system_count",
]

# ---------------------------------------------------------------------------
# 3. CLASS WEIGHT
#    Imbalance: 6003 negative vs 486 positive (12.6% positive rate, ratio ≈12.3:1)
# ---------------------------------------------------------------------------
CLASS_IMBALANCE_RATIO: float = 6003 / 486   # ≈ 12.35
SCALE_POS_WEIGHT: float = CLASS_IMBALANCE_RATIO  # for XGBoost

# ---------------------------------------------------------------------------
# 4. CROSS-VALIDATION STRATEGY
# ---------------------------------------------------------------------------
CV_N_SPLITS: int = 5
CV_RANDOM_STATE: int = 42
STRATIFIED_SPLIT_TEST_SIZE: float = 0.20

# ---------------------------------------------------------------------------
# 5. RANDOM SEEDS
# ---------------------------------------------------------------------------
RANDOM_STATE: int = 42
