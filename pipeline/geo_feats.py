"""
pipeline/geo_feats.py
=====================
Geospatial feature engineering for the Astram event dataset.

Features produced
-----------------
  For each HIGH_RISK_JUNCTION j:
    • dist_to_{j}     — Haversine distance (km) from event lat/lon to junction

  Aggregate distance features:
    • dist_to_nearest_junction  — minimum of all junction distances
    • nearest_junction_idx      — index of nearest junction (integer label)

  Coordinate quality indicators (already added by cleaning.py, but
  referenced here so the transformer is self-documenting):
    • coord_out_of_bounds       — 1 if lat/lon outside Bengaluru bounding box

Haversine vs Euclidean distance
---------------------------------
Euclidean distance on raw lat/lon coordinates is geometrically incorrect for
spherical Earth geometry. At Bengaluru's latitude (~13°N), 1° of longitude ≈
109.6 km but 1° of latitude ≈ 111.0 km — small difference, but we use
Haversine for correctness and because the computation overhead is negligible
for 8k rows.

Why distance features matter
------------------------------
The audit showed that top junctions like MekhriCircle (64 events) and
AyyappaTempleJunc (49 events) are structural hotspots. Proximity to a
high-risk junction is a strong proxy for:
  · Congestion risk (requires_road_closure correlation)
  · Priority classification (events near critical arterials = High priority)
  · Event type prediction (junction proximity → accident / congestion)
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from pipeline.config import HIGH_RISK_JUNCTIONS

logger = logging.getLogger(__name__)

# Earth radius in kilometres
_EARTH_RADIUS_KM = 6371.0


def haversine_km(
    lat1: np.ndarray,
    lon1: np.ndarray,
    lat2: float,
    lon2: float,
) -> np.ndarray:
    """
    Vectorised Haversine formula.

    Parameters
    ----------
    lat1, lon1 : array-like of float
        Event coordinates (degrees).
    lat2, lon2 : float
        Reference point coordinates (degrees).

    Returns
    -------
    np.ndarray of float
        Great-circle distances in kilometres.
    """
    r = np.deg2rad

    dlat = r(lat2) - r(lat1)
    dlon = r(lon2) - r(lon1)
    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(r(lat1)) * np.cos(r(lat2)) * np.sin(dlon / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


class GeoFeatureTransformer(BaseEstimator, TransformerMixin):
    """
    Add Haversine-distance features from event coordinates to each
    high-risk junction anchor defined in config.HIGH_RISK_JUNCTIONS.

    Parameters
    ----------
    lat_col : str
        Column name for event latitude. Default: "latitude".
    lon_col : str
        Column name for event longitude. Default: "longitude".
    junctions : list of (name, lat, lon) tuples, optional
        Junction anchors. Defaults to HIGH_RISK_JUNCTIONS from config.
    add_aggregate : bool
        If True, add `dist_to_nearest_junction` and `nearest_junction_idx`
        summary features.
    """

    def __init__(
        self,
        lat_col: str = "latitude",
        lon_col: str = "longitude",
        junctions: Optional[list[tuple[str, float, float]]] = None,
        add_aggregate: bool = True,
    ):
        self.lat_col = lat_col
        self.lon_col = lon_col
        self.junctions = junctions
        self.add_aggregate = add_aggregate

    def fit(self, X: pd.DataFrame, y=None) -> "GeoFeatureTransformer":
        self.junctions_ = self.junctions or HIGH_RISK_JUNCTIONS
        logger.info(
            "GeoFeatureTransformer: %d junction anchors loaded.",
            len(self.junctions_),
        )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()

        if self.lat_col not in X.columns or self.lon_col not in X.columns:
            logger.warning(
                "GeoFeatureTransformer: lat/lon columns not found. Skipping."
            )
            return X

        lat = X[self.lat_col].to_numpy(dtype=float)
        lon = X[self.lon_col].to_numpy(dtype=float)

        dist_matrix: list[np.ndarray] = []
        for jname, jlat, jlon in self.junctions_:
            col_name = f"dist_to_{jname}"
            dist = haversine_km(lat, lon, jlat, jlon)
            X[col_name] = np.round(dist, 4)
            dist_matrix.append(dist)
            logger.debug("Computed %s: mean=%.2f km", col_name, dist.mean())

        if self.add_aggregate and dist_matrix:
            stacked = np.stack(dist_matrix, axis=1)  # shape (n_rows, n_junctions)
            X["dist_to_nearest_junction"] = np.round(stacked.min(axis=1), 4)
            X["nearest_junction_idx"]     = stacked.argmin(axis=1).astype(int)

        logger.info(
            "GeoFeatureTransformer: added %d distance features.",
            len(self.junctions_) + (2 if self.add_aggregate else 0),
        )
        return X
