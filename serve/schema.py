"""
serve/schema.py
================
Input/output dataclasses for the Astram road-closure prediction API.

These define the canonical contract between upstream data and the predictor:
  - EventInput  : one raw traffic event record
  - PredictionOutput : structured prediction result

Validation rules match the dataset's known constraints and ensure the
predictor will not silently accept garbage inputs.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional
import json


# ── Bangalore bounding box ─────────────────────────────────────────────────
LAT_MIN, LAT_MAX = 12.7, 13.2
LON_MIN, LON_MAX = 77.4, 77.8

VALID_CAUSES = {
    "accident", "breakdown", "construction", "flooding",
    "others", "pothole", "tree fall", "utility work",
}


@dataclass
class EventInput:
    """
    A single raw Astram traffic event record.

    All fields mirror the original dataset schema.
    Optional fields represent frequently-missing columns.
    """
    # Required core fields
    start_datetime: str              # ISO-8601 timestamp with timezone
    latitude:       float
    longitude:      float

    # Frequently available
    event_cause:    Optional[str]  = None
    description:    Optional[str]  = None
    veh_type:       Optional[str]  = None   # "HGV", "LGV", "CAR", etc.
    duration_mins:  Optional[float]= None
    num_lanes:      Optional[int]  = None

    # Optional enrichment
    zone_id:        Optional[str]  = None
    road_category:  Optional[str]  = None

    def validate(self) -> list[str]:
        """Return list of validation error strings. Empty list = valid."""
        errors = []
        # Timestamp
        try:
            datetime.fromisoformat(
                self.start_datetime.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            errors.append(f"Invalid start_datetime: '{self.start_datetime}'")

        # Coordinates
        if not (LAT_MIN <= self.latitude <= LAT_MAX):
            errors.append(
                f"latitude {self.latitude} outside Bangalore bounds "
                f"[{LAT_MIN}, {LAT_MAX}]"
            )
        if not (LON_MIN <= self.longitude <= LON_MAX):
            errors.append(
                f"longitude {self.longitude} outside Bangalore bounds "
                f"[{LON_MIN}, {LON_MAX}]"
            )
        return errors

    def to_dataframe(self):
        """Convert to a single-row pandas DataFrame for pipeline ingestion."""
        import pandas as pd
        return pd.DataFrame([asdict(self)])

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "EventInput":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @classmethod
    def from_json(cls, json_str: str) -> "EventInput":
        return cls.from_dict(json.loads(json_str))


@dataclass
class PredictionOutput:
    """
    Structured prediction result returned by AstramPredictor.predict().
    """
    # Core predictions
    predicted_label:      int           # 0 or 1
    probability_closure:  float         # P(road_closure=1)
    probability_no_closure: float       # P(road_closure=0)

    # Thresholded risk
    risk_level:           str           # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

    # Decision confidence
    confidence:           str           # "High" | "Medium" | "Low"

    # Metadata
    model_name:           str
    model_version:        str
    features_used:        int
    threshold_used:       float

    # Optional request tracking
    event_id:             Optional[str] = None
    prediction_timestamp: str = field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z"
    )

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def __str__(self) -> str:
        return (
            f"[{self.risk_level}] P(closure)={self.probability_closure:.3f} "
            f"| label={self.predicted_label} | confidence={self.confidence}"
        )
