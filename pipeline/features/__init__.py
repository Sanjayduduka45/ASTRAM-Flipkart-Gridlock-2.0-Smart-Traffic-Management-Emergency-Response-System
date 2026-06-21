"""
pipeline/features/__init__.py
==============================
Advanced Feature Engineering package for the Astram Traffic Event dataset.

Modules:
    temporal        - Advanced time-based features (shift patterns, decay, cycles)
    event           - Event-cause severity scores, type interactions, priority signals
    congestion      - Traffic congestion risk, density proxies, corridor pressure
    road_closure    - Road-closure risk factors derived from cause × location × time
    zone            - Zone-level risk scores and spatial hierarchy features
    junction        - Junction density, hotspot proximity, safety index
    route           - Corridor-level features, route risk encoding
    geospatial      - Advanced spatial features (grid cells, density surfaces, radial bins)
    interactions    - Cross-feature interaction terms (event × time × space)
    aggregations    - Group statistics and historical means per context group
    rolling         - Time-ordered rolling window counts and rates
    assembler       - Master AdvancedFeatureEngineer: assembles all sub-transformers
"""
