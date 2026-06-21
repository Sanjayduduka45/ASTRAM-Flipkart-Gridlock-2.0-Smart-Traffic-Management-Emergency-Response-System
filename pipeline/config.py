"""
pipeline/config.py
==================
Central configuration for the Astram preprocessing pipeline.

Defines:
  - Column partitions (drop, target, feature sets)
  - High-risk junction coordinates (Haversine anchor points)
  - Bengaluru bounding box for coordinate validation
  - Peak-hour definitions derived from EDA
  - Imputation fill values
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# 1. COLUMNS TO DROP UNCONDITIONALLY (pre-fit)
# ---------------------------------------------------------------------------
# Reason legend:
#   [CONST]    - 100% null; carry zero information
#   [ID]       - Unique row/entity identifier; no predictive value
#   [QUASI]    - Quasi-constant (>99% single value)
#   [HIGHCARD] - High-cardinality free-text IDs with no semantic value
#   [LEAK]     - Populated AFTER the incident is resolved/closed → data leakage
#   [REDUND]   - Redundant with a better column
#   [MISSING]  - >90% missing; not usable at scale

DROP_COLUMNS: list[str] = [
    # [CONST] constant null columns
    "map_file",
    "comment",
    "meta_data",
    # [ID] unique identifiers
    "id",
    # [QUASI] quasi-constant
    "client_id",
    # [HIGHCARD] high-cardinality database IDs
    "veh_no",
    "created_by_id",
    "last_modified_by_id",
    "kgid",
    "assigned_to_police_id",
    "citizen_accident_id",
    # [LEAK] post-event timestamps & IDs
    "modified_datetime",
    "closed_datetime",
    "closed_by_id",
    "resolved_datetime",
    "resolved_by_id",
    "resolved_at_address",
    "resolved_at_latitude",
    "resolved_at_longitude",
    # [LEAK] status represents final state after events unfold
    "status",
    # [REDUND] created_date is redundant with start_datetime
    "created_date",
    # [MISSING >90%] end coordinates contain data corruption
    "endlatitude",
    "endlongitude",
    "end_address",
    "direction",
    "route_path",
    # [MISSING >94%]
    "end_datetime",
    # [MISSING >96%]
    "cargo_material",
    "reason_breakdown",
    "age_of_truck",
]

# ---------------------------------------------------------------------------
# 2. TARGET VARIABLES (excluded from feature matrix)
# ---------------------------------------------------------------------------
TARGET_COLUMNS: dict[str, str] = {
    "requires_road_closure": "binary_classification",  # primary; 91.7% / 8.3%
    "priority": "binary_classification",                # secondary; 61.5% / 38.5%
    "event_cause": "multiclass_classification",         # tertiary; 17 classes
}

# Default target for the pipeline runner
DEFAULT_TARGET: str = "requires_road_closure"

# ---------------------------------------------------------------------------
# 3. FEATURE COLUMN SETS (after drops)
# ---------------------------------------------------------------------------

# Raw numeric features (no imputation needed — 100% complete)
NUMERIC_FEATURES: list[str] = [
    "latitude",
    "longitude",
]

# Categorical features that need imputation + encoding
CATEGORICAL_FEATURES: list[str] = [
    "event_type",       # 2 classes; 0% missing
    "authenticated",    # 2 classes; 0% missing
    "veh_type",         # 10 classes; 40% missing → impute "unknown_vehicle"
    "corridor",         # 22 classes; 0.24% missing → impute mode
    "police_station",   # 54 classes; 0% missing
    "gba_identifier",   # 5 classes; 57.8% missing → impute "unknown_gba"
    "zone",             # 10 classes; 57.8% missing → impute "unknown_zone"
    "junction",         # 294 classes; 69.3% missing → impute "unknown_junction"
]

# Text features requiring special treatment
TEXT_FEATURES: list[str] = [
    "description",  # 16.6% missing → impute ""
    "address",      # 0.04% missing → impute ""
]

# Datetime source column
DATETIME_COLUMN: str = "start_datetime"

# ---------------------------------------------------------------------------
# 4. IMPUTATION FILL VALUES (per-column overrides)
# ---------------------------------------------------------------------------
CATEGORICAL_FILL: dict[str, str] = {
    "veh_type": "unknown_vehicle",
    "gba_identifier": "unknown_gba",
    "zone": "unknown_zone",
    "junction": "unknown_junction",
    # corridor and police_station → filled with mode (computed at fit-time)
}

TEXT_FILL: dict[str, str] = {
    "description": "",
    "address": "",
}

# ---------------------------------------------------------------------------
# 5. BENGALURU BOUNDING BOX
# ---------------------------------------------------------------------------
# Derived from audit: lat [12.80, 13.27], lon [77.31, 77.77]
# Used for coordinate validation in the geospatial transformer.
BENGALURU_BOUNDS: dict[str, tuple[float, float]] = {
    "latitude":  (12.50, 13.50),
    "longitude": (77.00, 78.00),
}

# ---------------------------------------------------------------------------
# 6. HIGH-RISK JUNCTION ANCHOR POINTS
# ---------------------------------------------------------------------------
# The top-10 junctions by incident frequency from the audit.
# Used by GeoFeatureTransformer to compute Haversine distances.
# Format: (junction_name, latitude, longitude)
HIGH_RISK_JUNCTIONS: list[tuple[str, float, float]] = [
    ("mekhri_circle",           13.0165, 77.5672),
    ("ayyappa_temple_junc",     12.9341, 77.6960),
    ("satellite_bus_stand",     12.9716, 77.5501),
    ("yeshwanthpura_circle",    13.0255, 77.5522),
    ("silk_board_junc",         12.9170, 77.6228),
    ("mysore_road_toll",        12.9500, 77.4875),
    ("jalahalli_cross",         13.0265, 77.5440),
    ("nagavara_orr_junc",       13.0481, 77.6160),
    ("kr_circle",               12.9716, 77.5935),
    ("hebbal_flyover",          13.0453, 77.5960),
]

# ---------------------------------------------------------------------------
# 7. PEAK HOUR DEFINITIONS
# ---------------------------------------------------------------------------
# Derived from EDA bimodal distribution (see hourly_distribution.png)
MORNING_PEAK_HOURS: tuple[int, int] = (4, 7)   # 04:00 - 07:59
NIGHT_PEAK_HOURS:   tuple[int, int] = (19, 23)  # 19:00 - 23:59

# ---------------------------------------------------------------------------
# 8. OUTLIER DETECTION SETTINGS
# ---------------------------------------------------------------------------
IQR_MULTIPLIER: float = 1.5              # standard fence
ISOLATION_FOREST_CONTAMINATION: float = 0.05   # 5% expected anomaly rate
ISOLATION_FOREST_RANDOM_STATE: int = 42

# ---------------------------------------------------------------------------
# 9. ENCODING CARDINALITY THRESHOLDS
# ---------------------------------------------------------------------------
# Columns with unique count <= LOW_CARD_THRESHOLD → Label / OHE encoding
# Columns with unique count  > LOW_CARD_THRESHOLD → Frequency / Target encoding
LOW_CARDINALITY_THRESHOLD: int = 15
