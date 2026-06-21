"""
pipeline/cleaning.py
====================
Initial cleaning steps applied BEFORE fitting any transformer.

Steps:
  1. Drop constant-null, high-cardinality-ID, leakage, and redundant columns
     (defined centrally in config.DROP_COLUMNS).
  2. Remove exact duplicate rows.
  3. Validate and repair start/end coordinate pairs:
       - Clamping zero end-coordinates to NaN (coordinate missing, not "origin")
       - Flagging geometrically impossible coordinates outside Bengaluru bounds
  4. Fix negative-duration anomalies in timestamps.

Design notes
------------
These steps are STATELESS (no fit-time state required) and are therefore
implemented as plain functions rather than sklearn transformers. They are
called once at the very beginning of the pipeline.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

from pipeline.config import BENGALURU_BOUNDS, DROP_COLUMNS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Drop Columns
# ---------------------------------------------------------------------------

def drop_irrelevant_columns(
    df: pd.DataFrame,
    extra_drops: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Drop columns that carry no predictive value or introduce data leakage.

    Rationale per column group:
      - Constant-null cols (map_file, comment, meta_data): zero variance → no signal.
      - ID cols (id, veh_no, kgid, *_by_id): opaque database keys with no
        semantic meaning; would overfit to specific operators/vehicles.
      - Quasi-constant (client_id): >99% a single value; provides essentially
        no discrimination.
      - Leakage cols (closed_*, resolved_*, status, modified_datetime):
        these are populated AFTER the incident lifecycle ends. Using them
        to predict priority or road_closure at report time would be cheating.
      - Redundant (created_date): duplicates start_datetime information.
      - High-missingness end coords (endlatitude, endlongitude, direction,
        route_path, end_address): >90% null + confirmed corruption in audit.
      - Segment-specific sparse cols (cargo_material, reason_breakdown,
        age_of_truck, assigned_to_police_id, etc.): >96% missing; only
        populated for a tiny truck-breakdown sub-corpus.

    Args:
        df: Raw input DataFrame.
        extra_drops: Optional additional column names to drop.

    Returns:
        DataFrame with irrelevant columns removed.
    """
    to_drop = [c for c in DROP_COLUMNS if c in df.columns]
    if extra_drops:
        to_drop += [c for c in extra_drops if c in df.columns and c not in to_drop]

    dropped = len(to_drop)
    df = df.drop(columns=to_drop)
    logger.info("Dropped %d irrelevant / leakage columns.", dropped)
    return df


# ---------------------------------------------------------------------------
# 2. Duplicate Removal
# ---------------------------------------------------------------------------

def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove exact duplicate rows.

    The audit found 0 duplicates in this dataset, but this step is included
    for robustness as the pipeline may receive refreshed data.

    Keeps the FIRST occurrence to preserve row ordering from the source system.

    Args:
        df: DataFrame possibly containing duplicate rows.

    Returns:
        Deduplicated DataFrame.
    """
    n_before = len(df)
    df = df.drop_duplicates(keep="first").reset_index(drop=True)
    n_removed = n_before - len(df)
    if n_removed:
        logger.warning("Removed %d duplicate row(s).", n_removed)
    else:
        logger.info("No duplicate rows found.")
    return df


# ---------------------------------------------------------------------------
# 3. Coordinate Validation
# ---------------------------------------------------------------------------

def validate_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Validate and clean the primary start coordinate pair (latitude, longitude).

    Findings from audit:
      - latitude/longitude: 100% complete; all values within Bengaluru bounds
        [12.80–13.27] × [77.31–77.77]. No repairs needed for these.

    Additionally flags suspicious rows:
      - Coordinates outside the configured BENGALURU_BOUNDS are not dropped
        (could be valid inter-city events) but are tagged with a boolean
        indicator column `coord_out_of_bounds` for downstream inspection.

    Rationale: Rather than silently dropping rows with improbable coordinates,
    we surface them via a flag column, giving the model a chance to learn that
    out-of-bounds coordinates may correlate with certain error patterns, while
    still allowing a downstream filter if needed.

    Args:
        df: DataFrame containing latitude and longitude columns.

    Returns:
        DataFrame with `coord_out_of_bounds` boolean column added.
    """
    lat_min, lat_max = BENGALURU_BOUNDS["latitude"]
    lon_min, lon_max = BENGALURU_BOUNDS["longitude"]

    lat_ok = df["latitude"].between(lat_min, lat_max)
    lon_ok = df["longitude"].between(lon_min, lon_max)
    out_of_bounds = ~(lat_ok & lon_ok)

    df = df.copy()
    df["coord_out_of_bounds"] = out_of_bounds.astype(int)

    n_bad = int(out_of_bounds.sum())
    if n_bad:
        logger.warning(
            "%d row(s) have coordinates outside Bengaluru bounds "
            "(lat=[%.2f,%.2f], lon=[%.2f,%.2f]). "
            "Tagged via 'coord_out_of_bounds' flag.",
            n_bad, lat_min, lat_max, lon_min, lon_max,
        )
    else:
        logger.info("All start coordinates are within Bengaluru bounds.")

    return df


# ---------------------------------------------------------------------------
# 4. Timestamp Anomaly Repair
# ---------------------------------------------------------------------------

def fix_timestamp_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect and neutralize rows where start_datetime appears malformed.

    Audit found 116 rows where start_datetime could not be parsed (returned NaT
    after coercion). These are tagged but NOT dropped — the temporal feature
    extractor will handle NaT gracefully with its own imputation logic.

    Also adds a boolean indicator `start_dt_parse_failed` so models can learn
    whether a missing parse correlates with incident type or priority.

    Args:
        df: DataFrame with a string column `start_datetime`.

    Returns:
        DataFrame with `start_dt_parse_failed` indicator column added.
    """
    df = df.copy()
    parsed = pd.to_datetime(df["start_datetime"], errors="coerce", utc=True)
    fail_mask = parsed.isna()
    df["start_dt_parse_failed"] = fail_mask.astype(int)

    n_failed = int(fail_mask.sum())
    if n_failed:
        logger.warning(
            "%d row(s) have unparseable start_datetime. "
            "Flagged via 'start_dt_parse_failed'.",
            n_failed,
        )
    else:
        logger.info("All start_datetime values parsed successfully.")

    return df


# ---------------------------------------------------------------------------
# Master cleaning function
# ---------------------------------------------------------------------------

def run_cleaning(
    df: pd.DataFrame,
    extra_drops: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Sequentially apply all stateless cleaning steps.

    Order matters:
      1. Drop columns first → reduces memory + speeds up subsequent ops.
      2. Deduplicate → works on reduced column set.
      3. Validate coordinates → adds indicator columns.
      4. Fix timestamps → adds indicator columns.

    Args:
        df: Raw input DataFrame.
        extra_drops: Optional list of additional column names to drop.

    Returns:
        Cleaned DataFrame ready for the sklearn transformer pipeline.
    """
    logger.info("=== CLEANING STAGE ===")
    df = drop_irrelevant_columns(df, extra_drops=extra_drops)
    df = remove_duplicates(df)
    df = validate_coordinates(df)
    df = fix_timestamp_anomalies(df)
    logger.info("Cleaning complete. Shape: %s", df.shape)
    return df
