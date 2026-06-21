"""
Astram Event Data - Preprocessing Pipeline Package
====================================================
A reusable, production-ready preprocessing pipeline for the
Bengaluru traffic event dataset.

Modules:
    config          - Column definitions, constants, and HIGH_RISK_JUNCTIONS map
    cleaning        - Drop strategy, duplicate removal, coordinate validation
    missing         - Numerical/categorical/text imputers (sklearn-compatible)
    datetime_feats  - Temporal feature extraction transformer
    geo_feats       - Haversine distance + coordinate validation transformer
    outliers        - IQR clipper + IsolationForest anomaly flag transformer
    encoding        - Label / Frequency / Target encoding transformers (compared)
    pipeline        - Master AstramPreprocessor pipeline (fit / transform / save)
    runner          - CLI entry-point for end-to-end preprocessing
"""
