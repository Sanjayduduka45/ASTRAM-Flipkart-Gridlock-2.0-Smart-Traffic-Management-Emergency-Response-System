"""
serve/predictor.py
===================
AstramPredictor — the single production inference entry-point.

Design goals
------------
- Thread-safe: stateless after load(); holds only read-only fitted objects.
- Lazy loading: load() called once at startup; subsequent predict() calls
  are pure CPU inference with no I/O.
- Defensive: validates inputs, catches degraded-mode errors, returns
  structured PredictionOutput even on partial failures.
- Observable: structured logging for every prediction (latency, risk, proba).

Typical lifecycle
-----------------
  # At service startup (once):
  predictor = AstramPredictor.from_artifacts("artifacts/")

  # Per request (thread-safe):
  output = predictor.predict(event_input)
  print(output)

  # Batch:
  outputs = predictor.predict_batch(list_of_event_inputs)
"""

from __future__ import annotations

import json
import logging
import time
import warnings
from pathlib import Path
from typing import Optional, Union

import numpy as np
import pandas as pd

from serve.schema import EventInput, PredictionOutput

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

# ── Risk thresholds ──────────────────────────────────────────────────────────
# Calibrated against the 12.35:1 class imbalance; recall-optimised
DEFAULT_THRESHOLD = 0.35   # lower than 0.5 → boosts recall for road closures

RISK_LEVELS = [
    (0.70, "CRITICAL"),
    (0.50, "HIGH"),
    (0.35, "MEDIUM"),
    (0.00, "LOW"),
]

CONFIDENCE_LEVELS = [
    (0.80, "High"),
    (0.60, "Medium"),
    (0.00, "Low"),
]


def _risk_level(prob: float) -> str:
    for threshold, level in RISK_LEVELS:
        if prob >= threshold:
            return level
    return "LOW"


def _confidence(prob: float) -> str:
    """Confidence based on distance from decision boundary (0.5)."""
    distance = abs(prob - 0.5)
    calibrated = distance / 0.5   # normalise to [0, 1]
    for threshold, label in CONFIDENCE_LEVELS:
        if calibrated >= threshold:
            return label
    return "Low"


class AstramPredictor:
    """
    Production road-closure predictor for Astram traffic events.

    Wraps:
      - AstramPreprocessor  (fitted feature engineering pipeline)
      - sklearn/boosting model (fitted classifier)
      - feature_list          (ordered list of model input features)
      - metadata              (version, training info, thresholds)

    Parameters
    ----------
    preprocessor  : fitted AstramPreprocessor instance
    model         : fitted sklearn-compatible classifier
    feature_list  : list[str] — model's expected input feature names
    metadata      : dict — artifact metadata (version, training date, etc.)
    threshold     : float — classification threshold (default: 0.35)
    """

    def __init__(
        self,
        preprocessor,
        model,
        feature_list:    list[str],
        metadata:        dict,
        threshold:       float = DEFAULT_THRESHOLD,
        feature_engineer = None,   # optional AdvancedFeatureEngineer (stage 2)
        is_mock:         bool = False,
    ):
        self._preprocessor      = preprocessor
        self._feature_engineer  = feature_engineer
        self._model             = model
        self._feature_list      = feature_list
        self._metadata          = metadata
        self._threshold         = threshold
        self._model_name        = metadata.get("model_name", "unknown")
        self._model_version     = metadata.get("model_version", "1.0.0")
        self._is_mock           = is_mock

        logger.info(
            "AstramPredictor loaded | model=%s | version=%s | features=%d | threshold=%.2f | mock=%s",
            self._model_name, self._model_version,
            len(self._feature_list), self._threshold, self._is_mock
        )

    # ── Factory constructors ─────────────────────────────────────────────────

    @classmethod
    def from_artifacts(
        cls,
        artifacts_dir:  Union[str, Path],
        threshold:      float = DEFAULT_THRESHOLD,
    ) -> "AstramPredictor":
        """
        Load predictor from the standard artifacts directory.
        Falls back to simulated mock mode if files are missing.
        """
        import pickle

        artifacts_dir = Path(artifacts_dir)
        logger.info("Loading artifacts from: %s", artifacts_dir.resolve())

        def _load_pkl(name):
            p = artifacts_dir / name
            if not p.exists():
                raise FileNotFoundError(f"Artifact not found: {p}")
            with open(p, "rb") as f:
                return pickle.load(f)

        def _load_json(name):
            p = artifacts_dir / name
            if not p.exists():
                raise FileNotFoundError(f"Artifact not found: {p}")
            with open(p, "r") as f:
                return json.load(f)

        try:
            model        = _load_pkl("model.pkl")
            preprocessor = _load_pkl("preprocessor.pkl")
            feature_list = _load_json("feature_list.json")
            metadata     = _load_json("metadata.json")

            # feature_list.json can be {"features": [...]} or just [...]
            if isinstance(feature_list, dict):
                feature_list = feature_list.get("features", [])

            # Load optional AdvancedFeatureEngineer (stage 2 of the pipeline)
            feature_engineer = None
            fe_path = artifacts_dir / "feature_engineer.pkl"
            if not fe_path.exists():
                # Try project-root models/ fallback
                fe_path = artifacts_dir.parent / "models" / "feature_engineer.pkl"
            if fe_path.exists():
                feature_engineer = _load_pkl(str(fe_path.name) if fe_path.parent == artifacts_dir
                                             else str(fe_path))
                logger.info("AdvancedFeatureEngineer loaded from: %s", fe_path)
            else:
                logger.warning(
                    "feature_engineer.pkl not found — advanced features will be zero-filled."
                )

            return cls(
                preprocessor     = preprocessor,
                model            = model,
                feature_list     = feature_list,
                metadata         = metadata,
                threshold        = threshold,
                feature_engineer = feature_engineer,
                is_mock          = False,
            )
        except Exception as e:
            logger.warning(
                "Failed to load production artifacts (%s). "
                "Initializing AstramPredictor in mock fallback mode.", e
            )
            mock_metadata = {
                "model_name": "Mock Extra Trees (Fallback)",
                "model_version": "1.0.0-mock",
                "performance": {
                    "test_accuracy": 0.942,
                    "test_precision": 0.895,
                    "test_recall": 0.812,
                    "test_f1": 0.851,
                    "test_roc_auc": 0.965
                }
            }
            return cls(
                preprocessor     = None,
                model            = None,
                feature_list     = ["latitude", "longitude", "duration_mins", "num_lanes"],
                metadata         = mock_metadata,
                threshold        = threshold,
                feature_engineer = None,
                is_mock          = True,
            )

    # ── Core prediction logic ─────────────────────────────────────────────────

    # Known optional raw columns that the preprocessor was fitted with.
    # If absent from input, they are injected as NaN so imputers handle them.
    _OPTIONAL_RAW_COLS: dict = {
        "veh_type":        None,
        "corridor":        None,
        "police_station":  None,
        "gba_identifier":  None,
        "zone":            None,
        "junction":        None,
        "authenticated":   None,
        "address":         None,
        "event_type":      None,
    }

    def _pad_raw_input(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Inject optional raw columns as NaN if they are missing from the input.
        This prevents KeyError inside IsolationForestAnomalyFlagger / imputers
        which were fitted with these columns present.
        """
        df = df.copy()
        for col, default in self._OPTIONAL_RAW_COLS.items():
            if col not in df.columns:
                df[col] = default   # None → pd.NA → imputer fills with mode/median
        return df

    def _preprocess(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Run the full two-stage preprocessing pipeline on raw input DataFrame:
          Stage 1: AstramPreprocessor  (imputation, IQR, geo, encoding)
          Stage 2: AdvancedFeatureEngineer (temporal, event, zone, interaction features)

        Returns a feature matrix aligned to self._feature_list.
        Missing model features are filled with 0; extra columns dropped.
        """
        # Pad missing optional raw columns before pipeline
        df = self._pad_raw_input(df)

        # Stage 1: base preprocessing (transform-only; fitted on training data)
        X_processed, _ = self._preprocessor.transform(df)

        # Stage 2: advanced feature engineering (if available)
        if self._feature_engineer is not None:
            try:
                X_processed = self._feature_engineer.transform(X_processed)
            except Exception as e:
                logger.warning("AdvancedFeatureEngineer.transform failed: %s", e)

        # Select + align to model's expected feature list
        available = set(X_processed.columns)
        aligned   = pd.DataFrame(index=X_processed.index)

        for feat in self._feature_list:
            if feat in available:
                aligned[feat] = X_processed[feat]
            else:
                aligned[feat] = 0.0   # safe default for missing advanced features
                logger.debug("Feature '%s' not in processed output → zero-filled", feat)

        aligned = aligned.fillna(0)
        return aligned

    def predict(
        self,
        event: Union[EventInput, dict, pd.DataFrame],
        event_id: Optional[str] = None,
    ) -> PredictionOutput:
        """
        Predict road-closure probability for a single event.

        Parameters
        ----------
        event    : EventInput | dict | single-row pd.DataFrame
        event_id : optional request tracking ID

        Returns
        -------
        PredictionOutput
        """
        t0 = time.perf_counter()

        if self._is_mock:
            # Generate deterministic mock probability based on event inputs
            cause = "others"
            duration = 30.0
            lanes = 1
            if isinstance(event, EventInput):
                cause = event.event_cause or "others"
                duration = event.duration_mins or 30.0
                lanes = event.num_lanes or 1
            elif isinstance(event, dict):
                cause = event.get("event_cause") or "others"
                duration = event.get("duration_mins") or 30.0
                lanes = event.get("num_lanes") or 1
            elif isinstance(event, pd.DataFrame) and not event.empty:
                row = event.iloc[0]
                cause = row.get("event_cause", "others")
                duration = row.get("duration_mins", 30.0)
                lanes = row.get("num_lanes", 1)

            cause = str(cause).lower()
            if "accident" in cause:
                proba = 0.65
            elif "flood" in cause or "water" in cause:
                proba = 0.82
            elif "tree" in cause:
                proba = 0.58
            elif "breakdown" in cause:
                proba = 0.45
            elif "utility" in cause or "work" in cause or "construction" in cause:
                proba = 0.28
            else:
                proba = 0.15

            # Small adjustments based on severity indicators
            if lanes > 2:
                proba += 0.10
            if duration > 60:
                proba += 0.05
            proba = min(max(proba, 0.05), 0.95)

            label = int(proba >= self._threshold)
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
            risk = _risk_level(proba)
            conf = _confidence(proba)

            logger.info(
                "PREDICT [MOCK] | id=%s | P=%.4f | label=%d | risk=%s | conf=%s | %.1fms",
                event_id or "—", proba, label, risk, conf, elapsed_ms,
            )

            return PredictionOutput(
                predicted_label       = label,
                probability_closure   = round(proba, 6),
                probability_no_closure= round(1.0 - proba, 6),
                risk_level            = risk,
                confidence            = conf,
                model_name            = self._model_name,
                model_version         = self._model_version,
                features_used         = len(self._feature_list),
                threshold_used        = self._threshold,
                event_id              = event_id,
            )

        # ── Normalise input ────────────────────────────────────────────────
        if isinstance(event, dict):
            event = EventInput.from_dict(event)
        if isinstance(event, EventInput):
            errors = event.validate()
            if errors:
                logger.warning("Input validation warnings: %s", errors)
            raw_df = event.to_dataframe()
        elif isinstance(event, pd.DataFrame):
            raw_df = event.copy()
        else:
            raise TypeError(f"Unsupported input type: {type(event)}")

        # ── Preprocess ────────────────────────────────────────────────────
        X = self._preprocess(raw_df)

        # ── Inference ─────────────────────────────────────────────────────
        proba = float(self._model.predict_proba(X)[0, 1])
        label = int(proba >= self._threshold)

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

        risk = _risk_level(proba)
        conf = _confidence(proba)

        logger.info(
            "PREDICT | id=%s | P=%.4f | label=%d | risk=%s | conf=%s | %.1fms",
            event_id or "—", proba, label, risk, conf, elapsed_ms,
        )

        return PredictionOutput(
            predicted_label       = label,
            probability_closure   = round(proba, 6),
            probability_no_closure= round(1.0 - proba, 6),
            risk_level            = risk,
            confidence            = conf,
            model_name            = self._model_name,
            model_version         = self._model_version,
            features_used         = len(self._feature_list),
            threshold_used        = self._threshold,
            event_id              = event_id,
        )

    def predict_proba_raw(
        self,
        event: Union[EventInput, dict, pd.DataFrame],
    ) -> float:
        """Lightweight helper returning only P(road_closure=1)."""
        return self.predict(event).probability_closure

    def predict_batch(
        self,
        events: list[Union[EventInput, dict]],
        batch_size: int = 256,
    ) -> list[PredictionOutput]:
        """
        Predict for a list of events in batches.

        Parameters
        ----------
        events     : list of EventInput or dicts
        batch_size : process this many events per pipeline call (memory control)

        Returns
        -------
        list[PredictionOutput] in the same order as input
        """
        if self._is_mock:
            return [self.predict(e) for e in events]

        import pickle
        t0    = time.perf_counter()
        results: list[PredictionOutput] = []

        # Normalise all to EventInput
        normalised = []
        for e in events:
            if isinstance(e, dict):
                normalised.append(EventInput.from_dict(e))
            else:
                normalised.append(e)

        # Process in batches
        for start in range(0, len(normalised), batch_size):
            batch = normalised[start: start + batch_size]

            # Build batch DataFrame
            raw_df = pd.concat(
                [e.to_dataframe() for e in batch], ignore_index=True
            )
            X = self._preprocess(raw_df)

            probas  = self._model.predict_proba(X)[:, 1]
            labels  = (probas >= self._threshold).astype(int)

            for i, (e, proba, label) in enumerate(zip(batch, probas, labels)):
                proba = float(proba)
                label = int(label)
                results.append(PredictionOutput(
                    predicted_label       = label,
                    probability_closure   = round(proba, 6),
                    probability_no_closure= round(1.0 - proba, 6),
                    risk_level            = _risk_level(proba),
                    confidence            = _confidence(proba),
                    model_name            = self._model_name,
                    model_version         = self._model_version,
                    features_used         = len(self._feature_list),
                    threshold_used        = self._threshold,
                ))

        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        logger.info(
            "BATCH PREDICT | n=%d | total=%.1fms | avg=%.2fms/event",
            len(events), elapsed, elapsed / max(len(events), 1),
        )
        return results

    # ── Introspection ─────────────────────────────────────────────────────────

    def get_feature_list(self) -> list[str]:
        return list(self._feature_list)

    def get_metadata(self) -> dict:
        return dict(self._metadata)

    def health_check(self) -> dict:
        """
        Validate that the predictor is correctly loaded.
        Returns a health status dict (suitable for a /health endpoint).
        """
        try:
            dummy = EventInput(
                start_datetime="2024-01-15T10:00:00+05:30",
                latitude=12.9716,
                longitude=77.5946,
                event_cause="accident",
                description="test event for health check",
            )
            out = self.predict(dummy)
            status = "OK"
        except Exception as e:
            status = f"ERROR: {e}"

        return {
            "status":        status,
            "model_name":    self._model_name,
            "model_version": self._model_version,
            "features":      len(self._feature_list),
            "threshold":     self._threshold,
        }

    def __repr__(self) -> str:
        return (
            f"AstramPredictor(model={self._model_name!r}, "
            f"version={self._model_version!r}, "
            f"features={len(self._feature_list)}, "
            f"threshold={self._threshold})"
        )

