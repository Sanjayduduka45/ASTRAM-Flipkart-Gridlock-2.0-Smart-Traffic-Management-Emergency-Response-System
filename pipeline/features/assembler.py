"""
pipeline/features/assembler.py
================================
AdvancedFeatureEngineer: master transformer that orchestrates all
feature-engineering sub-modules in the correct dependency order.

Execution Order (dependency-aware)
------------------------------------
  ① AdvancedTemporalFeatures       — produces hour_bin_code, is_*_peak, etc.
  ② EventFeatureEngineer           — produces cause_severity_score, is_heavy, etc.
  ③ CongestionFeatureEngineer      — consumes hour_bin_code + event_cause
                                     produces corridor_risk_score, etc.
  ④ ZoneJunctionGeoFeatureEngineer — consumes zone, junction, corridor,
                                     cause_severity_score, corridor_risk_score
                                     produces zone_risk_score, dist_to_city_centre, etc.
  ⑤ InteractionFeatureEngineer     — consumes all of the above
                                     produces interaction terms + rolling counts

Usage
------
  from pipeline.features.assembler import AdvancedFeatureEngineer

  eng = AdvancedFeatureEngineer()
  X_rich = eng.fit_transform(X_preprocessed, y_train)
  X_test_rich = eng.transform(X_test_preprocessed)

  eng.save("models/feature_engineer.pkl")
"""

from __future__ import annotations
import logging
import pickle
from pathlib import Path
from typing import Optional, Tuple
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from pipeline.features.temporal      import AdvancedTemporalFeatures
from pipeline.features.event         import EventFeatureEngineer
from pipeline.features.congestion    import CongestionFeatureEngineer
from pipeline.features.zone_junction import ZoneJunctionGeoFeatureEngineer
from pipeline.features.interactions  import InteractionFeatureEngineer

logger = logging.getLogger(__name__)


class AdvancedFeatureEngineer(BaseEstimator, TransformerMixin):
    """
    End-to-end advanced feature engineering pipeline.

    Parameters
    ----------
    datetime_col : str
        Raw start_datetime column (must be present in X for temporal + rolling features).
        If the preprocessing pipeline already dropped it, set datetime_col to None to skip.
    target_name  : str
        Name of the target for logging purposes only.
    rolling_windows : list[int]
        Hour windows for rolling count features (default: [3, 6]).
    """

    def __init__(
        self,
        datetime_col:    Optional[str] = "start_datetime",
        target_name:     str = "requires_road_closure",
        rolling_windows: Optional[list] = None,
    ):
        self.datetime_col    = datetime_col
        self.target_name     = target_name
        self.rolling_windows = rolling_windows or [3, 6]
        self._is_fitted      = False

    def fit(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> "AdvancedFeatureEngineer":
        logger.info("=== AdvancedFeatureEngineer.fit ===  shape=%s", X.shape)

        # ① Temporal (stateless — no fit needed, but we call fit for API compliance)
        self._temporal = AdvancedTemporalFeatures(
            datetime_col=self.datetime_col or "start_datetime",
            drop_source=False
        ).fit(X)
        X_t = self._temporal.transform(X)

        # ② Event features (stateless)
        self._event = EventFeatureEngineer().fit(X_t)
        X_e = self._event.transform(X_t)

        # ③ Congestion (stateful: learns corridor & police stats)
        self._congestion = CongestionFeatureEngineer().fit(X_e, y)
        X_c = self._congestion.transform(X_e)

        # ④ Zone / Junction / Geo (stateful)
        self._zone_junc = ZoneJunctionGeoFeatureEngineer().fit(X_c, y)
        X_z = self._zone_junc.transform(X_c)

        # ⑤ Interactions (stateful: learns group stats)
        self._interactions = InteractionFeatureEngineer(
            datetime_col=self.datetime_col or "start_datetime",
            rolling_windows=self.rolling_windows,
        ).fit(X_z, y)

        self._is_fitted = True
        self._feature_names_in = list(X.columns)
        logger.info("AdvancedFeatureEngineer fitted successfully.")
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        if not self._is_fitted:
            raise RuntimeError("Call fit() first.")
        logger.info("=== AdvancedFeatureEngineer.transform ===  shape=%s", X.shape)

        X = self._temporal.transform(X)
        X = self._event.transform(X)
        X = self._congestion.transform(X)
        X = self._zone_junc.transform(X)
        X = self._interactions.transform(X)

        logger.info("AdvancedFeatureEngineer.transform complete. Output shape: %s", X.shape)
        return X

    def fit_transform(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> pd.DataFrame:
        return self.fit(X, y).transform(X)

    def get_new_feature_names(self) -> list[str]:
        """Return list of feature names added by this engineer (not in original X)."""
        if not self._is_fitted:
            raise RuntimeError("Call fit() first.")
        return [c for c in self._feature_names_out if c not in self._feature_names_in]

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("AdvancedFeatureEngineer saved to: %s", path.resolve())

    @classmethod
    def load(cls, path: str | Path) -> "AdvancedFeatureEngineer":
        with open(path, "rb") as f:
            obj = pickle.load(f)
        logger.info("AdvancedFeatureEngineer loaded from: %s", path.resolve())
        return obj
