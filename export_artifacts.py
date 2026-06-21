"""
export_artifacts.py
====================
Production artifact exporter for the Astram road-closure model.

Creates a self-contained, deployment-ready artifacts/ directory:

  artifacts/
    model.pkl             — fitted sklearn classifier (Extra Trees, pruned)
    preprocessor.pkl      — fitted AstramPreprocessor (full pipeline)
    feature_list.json     — ordered list of model input features
    metadata.json         — version, training provenance, metrics, thresholds
    README.md             — usage guide

Also validates that:
  - The preprocessing pipeline round-trips correctly
  - The model predicts on the sample event without error
  - All artifacts can be reloaded cleanly (integrity check)

Usage:
    python3 export_artifacts.py
    python3 export_artifacts.py --artifacts-dir my_release/v2/
    python3 export_artifacts.py --version 1.2.0
"""

from __future__ import annotations

import argparse
import json
import logging
import pickle
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("artifact_exporter")

# ── Directory constants ───────────────────────────────────────────────────────
OUTPUT_DIR      = PROJECT_ROOT / "output"
REFINEMENT_DIR  = OUTPUT_DIR   / "refinement"
EXPLAIN_DIR     = OUTPUT_DIR   / "explainability"
FINAL_MODEL_DIR = PROJECT_ROOT / "models" / "final"
SAVED_MODEL_DIR = PROJECT_ROOT / "models" / "saved"
TUNED_MODEL_DIR = PROJECT_ROOT / "models" / "tuned"
DEFAULT_ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"


def parse_args():
    p = argparse.ArgumentParser(description="Export Astram production artifacts")
    p.add_argument("--artifacts-dir", default=str(DEFAULT_ARTIFACTS_DIR),
                   help="Destination directory (default: artifacts/)")
    p.add_argument("--version", default="1.0.0",
                   help="Model version tag (default: 1.0.0)")
    p.add_argument("--threshold", type=float, default=0.35,
                   help="Prediction threshold (default: 0.35)")
    p.add_argument("--skip-validation", action="store_true",
                   help="Skip end-to-end integrity check")
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Model loading
# ─────────────────────────────────────────────────────────────────────────────

def load_final_model():
    """
    Load the final production model in priority order:
    1. models/final/extra_trees_final.pkl      (pruned, refined)
    2. models/tuned/extra_trees_tuned_roc_auc.pkl (HPO-tuned)
    3. models/saved/extra_trees.pkl             (baseline fallback)
    """
    candidates = [
        FINAL_MODEL_DIR / "extra_trees_final.pkl",
        TUNED_MODEL_DIR / "extra_trees_tuned_roc_auc.pkl",
        SAVED_MODEL_DIR / "extra_trees.pkl",
    ]
    labels = ["Pruned+Refined", "HPO-Tuned", "Baseline"]

    for path, label in zip(candidates, labels):
        if path.exists():
            with open(path, "rb") as f:
                model = pickle.load(f)
            logger.info("Model loaded (%s): %s", label, path)
            return model, label, str(path)

    logger.error("No Extra Trees model found in any of: %s", candidates)
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Preprocessor fitting + saving
# ─────────────────────────────────────────────────────────────────────────────

def build_preprocessor(raw_data_path: Path):
    """
    Refit AstramPreprocessor on the full training data and return it.
    Also saves preprocessor.pkl to artifacts/.
    """
    from pipeline.pipeline import AstramPreprocessor

    if not raw_data_path.exists():
        logger.error("Raw training data not found: %s", raw_data_path)
        sys.exit(1)

    logger.info("Loading raw training data: %s", raw_data_path)
    df = pd.read_csv(raw_data_path, low_memory=False)
    logger.info("Raw data shape: %s", df.shape)

    preprocessor = AstramPreprocessor(
        target="requires_road_closure",
        encoding_strategy="frequency",
        run_isolation_forest=True,
        scale_numerics=False,
    )

    logger.info("Fitting AstramPreprocessor on full training data...")
    t0 = time.time()
    X_out, y_out = preprocessor.fit_transform(df)
    logger.info(
        "Preprocessor fitted in %.1fs | output shape: %s",
        time.time() - t0, X_out.shape,
    )
    return preprocessor


def load_or_build_preprocessor(artifacts_dir: Path, raw_data_path: Path):
    """Try to find a pre-saved preprocessor, otherwise rebuild from scratch."""
    # Priority 1: already exported from a previous run
    candidates = [
        artifacts_dir / "preprocessor.pkl",                        # already exported
        PROJECT_ROOT  / "models" / "astram_preprocessor.pkl",      # saved by pipeline runner
        OUTPUT_DIR    / "preprocessor.pkl",                        # alternate pipeline output
    ]
    for path in candidates:
        if path.exists():
            with open(path, "rb") as f:
                pp = pickle.load(f)
            logger.info("Preprocessor loaded from: %s  (%.1f MB)",
                        path, path.stat().st_size / 1_048_576)
            return pp

    # Fallback: refit from raw data
    logger.info("No saved preprocessor found. Rebuilding from raw data...")
    return build_preprocessor(raw_data_path)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Feature list
# ─────────────────────────────────────────────────────────────────────────────

def resolve_feature_list() -> list[str]:
    """
    Load the pruned feature list from refinement output.
    Falls back to TOP_30_FEATURES from config if not found.
    """
    pruned_path = REFINEMENT_DIR / "pruned_feature_set.csv"
    if pruned_path.exists():
        features = pd.read_csv(pruned_path)["feature"].tolist()
        logger.info("Feature list loaded from pruned set: %d features", len(features))
        return features

    # Fallback to top-30
    from models.config import TOP_30_FEATURES
    logger.warning(
        "Pruned feature list not found. Using TOP_30_FEATURES (%d features).",
        len(TOP_30_FEATURES),
    )
    return TOP_30_FEATURES


# ─────────────────────────────────────────────────────────────────────────────
# 4. Metrics from refinement results
# ─────────────────────────────────────────────────────────────────────────────

def load_model_metrics() -> dict:
    """Pull the final model's test metrics from pruned_model_results.csv."""
    results_path = REFINEMENT_DIR / "pruned_model_results.csv"
    if not results_path.exists():
        # Try baseline
        results_path = OUTPUT_DIR / "model_results" / "model_comparison.csv"

    if results_path.exists():
        df = pd.read_csv(results_path)
        row = df[df["model_name"] == "Extra Trees"]
        if not row.empty:
            r = row.iloc[0]
            return {
                "test_accuracy":  float(r.get("test_accuracy",  0)),
                "test_precision": float(r.get("test_precision", 0)),
                "test_recall":    float(r.get("test_recall",    0)),
                "test_f1":        float(r.get("test_f1",        0)),
                "test_roc_auc":   float(r.get("test_roc_auc",  0)),
                "cv_roc_auc_mean":float(r.get("cv_roc_auc_mean",0)),
                "cv_f1_mean":     float(r.get("cv_f1_mean",     0)),
            }
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# 5. Metadata
# ─────────────────────────────────────────────────────────────────────────────

def build_metadata(
    version:        str,
    model_label:    str,
    model_path:     str,
    feature_list:   list[str],
    metrics:        dict,
    threshold:      float,
) -> dict:
    return {
        "schema_version":     "1.0",
        "model_name":         "Extra Trees",
        "model_full_name":    f"Extra Trees Classifier ({model_label})",
        "model_version":      version,
        "model_path_origin":  model_path,
        "task":               "binary_classification",
        "target":             "requires_road_closure",
        "dataset":            "Astram Bangalore Traffic Events",
        "n_features":         len(feature_list),
        "feature_set":        "pruned_top26_explainability",
        "class_imbalance_ratio": 12.35,
        "threshold":          threshold,
        "threshold_rationale":"Recall-optimised; lower than 0.5 to reduce missed road closures",
        "training_date":      datetime.now(timezone.utc).isoformat(),
        "cv_strategy":        "StratifiedKFold(n_splits=5, shuffle=True)",
        "class_weight":       "balanced",
        "preprocessing": {
            "pipeline":       "AstramPreprocessor",
            "encoding":       "frequency",
            "outliers":       "IQR + IsolationForest",
            "imputation":     "median (numeric) / constant (categorical)",
        },
        "performance": metrics,
        "risk_levels": {
            "CRITICAL": "P >= 0.70",
            "HIGH":     "P >= 0.50",
            "MEDIUM":   "P >= 0.35",
            "LOW":      "P  < 0.35",
        },
        "notes": (
            "4 weak features removed (cause_severity_score, closure_risk_composite, "
            "rolling_6h_system_count, hour_cos) after SHAP + permutation analysis. "
            "Bias-variance diagnosis: Overfit (train-val gap ~0.05 AUC). "
            "Recommended mitigation: collect more positive-class examples."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. README
# ─────────────────────────────────────────────────────────────────────────────

README_TEMPLATE = """# Astram Road-Closure Prediction — Production Artifacts

## Model Summary
| Property | Value |
|---|---|
| Model | Extra Trees Classifier |
| Version | {version} |
| Target | `requires_road_closure` (binary: 0/1) |
| Features | {n_features} (pruned from top-30 by explainability analysis) |
| Threshold | {threshold} (recall-optimised for missed-closure minimisation) |
| Training date | {training_date} |

## Performance (Hold-out Test Set)
| Metric | Score |
|---|---|
| ROC-AUC | {roc_auc:.4f} |
| F1 Score | {f1:.4f} |
| Recall | {recall:.4f} |
| Precision | {precision:.4f} |
| Accuracy | {accuracy:.4f} |

## Artifacts
```
artifacts/
  model.pkl          — fitted sklearn ExtraTreesClassifier
  preprocessor.pkl   — fitted AstramPreprocessor (full feature engineering pipeline)
  feature_list.json  — ordered list of {n_features} model input features
  metadata.json      — version, metrics, thresholds, provenance
  README.md          — this file
```

## Quick Start
```python
import sys; sys.path.insert(0, "/path/to/Prototype")
from serve.predictor import AstramPredictor
from serve.schema import EventInput

# Load once at startup
predictor = AstramPredictor.from_artifacts("artifacts/")

# Single prediction
event = EventInput(
    start_datetime="2024-06-15T08:30:00+05:30",
    latitude=12.9716,
    longitude=77.5946,
    event_cause="accident",
    description="heavy vehicle breakdown blocking two lanes",
    veh_type="HGV",
)
result = predictor.predict(event)
print(result)
# [HIGH] P(closure)=0.612 | label=1 | confidence=Medium

# Batch prediction
results = predictor.predict_batch([event1, event2, event3])

# Health check
print(predictor.health_check())
```

## Risk Levels
| Level | Condition | Action |
|---|---|---|
| CRITICAL | P ≥ 0.70 | Immediate road closure protocol |
| HIGH | P ≥ 0.50 | Alert traffic control |
| MEDIUM | P ≥ 0.35 | Monitor; pre-position assets |
| LOW | P < 0.35 | No immediate action |

## Important Notes
- **Threshold = {threshold}** (not 0.5). Lower threshold → higher recall → fewer missed closures.
- The preprocessor must be from the same fitted object as used during training.
  Never refit the preprocessor on new data without retraining the model.
- Missing input fields are handled gracefully (imputed to median/mode).
- Features not found in the processed output are filled with 0.
"""


# ─────────────────────────────────────────────────────────────────────────────
# 7. Integrity validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_artifacts(artifacts_dir: Path) -> bool:
    """
    Reload all artifacts from disk and run a sample prediction.
    Returns True if everything is healthy.
    """
    logger.info("── Integrity validation ──────────────────────────────")
    try:
        from serve.predictor import AstramPredictor
        from serve.schema import EventInput

        predictor = AstramPredictor.from_artifacts(artifacts_dir, threshold=0.35)

        # Health check
        health = predictor.health_check()
        if health["status"] != "OK":
            logger.error("Health check failed: %s", health)
            return False

        logger.info("Health check: OK")
        logger.info(
            "  model=%s | version=%s | features=%d",
            health["model_name"], health["model_version"], health["features"],
        )

        # Spot-check a sample event
        event = EventInput(
            start_datetime="2024-06-15T08:30:00+05:30",
            latitude=12.9716,
            longitude=77.5946,
            event_cause="accident",
            description="multiple vehicles blocking all lanes near MG Road",
            veh_type="HGV",
        )
        result = predictor.predict(event, event_id="validation_test")
        logger.info("Sample prediction: %s", result)
        logger.info("  → Probability: %.4f | Risk: %s | Confidence: %s",
                    result.probability_closure, result.risk_level, result.confidence)

        logger.info("── Integrity validation PASSED ──────────────────────")
        return True

    except Exception as e:
        logger.error("Integrity validation FAILED: %s", e, exc_info=True)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 70)
    logger.info("ASTRAM — PRODUCTION ARTIFACT EXPORT")
    logger.info("=" * 70)
    logger.info("Artifacts directory : %s", artifacts_dir.resolve())
    logger.info("Version             : %s", args.version)
    logger.info("Threshold           : %.2f", args.threshold)
    logger.info("=" * 70)

    # ── 1. Load final model ────────────────────────────────────────────────
    logger.info("[1/6] Loading final model...")
    model, model_label, model_path = load_final_model()

    # ── 2. Preprocessor ───────────────────────────────────────────────────
    logger.info("[2/6] Building/loading preprocessor...")
    raw_data_path = OUTPUT_DIR / "train_raw.csv"
    preprocessor = load_or_build_preprocessor(artifacts_dir, raw_data_path)

    # ── 3. Feature list ───────────────────────────────────────────────────
    logger.info("[3/6] Resolving feature list...")
    feature_list = resolve_feature_list()

    # ── 4. Metadata ───────────────────────────────────────────────────────
    logger.info("[4/6] Building metadata...")
    metrics  = load_model_metrics()
    metadata = build_metadata(
        version=args.version,
        model_label=model_label,
        model_path=model_path,
        feature_list=feature_list,
        metrics=metrics,
        threshold=args.threshold,
    )

    # ── 5. Write all artifacts ────────────────────────────────────────────
    logger.info("[5/6] Writing artifacts...")

    # model.pkl
    model_pkl_path = artifacts_dir / "model.pkl"
    with open(model_pkl_path, "wb") as f:
        pickle.dump(model, f, protocol=pickle.HIGHEST_PROTOCOL)
    logger.info("  ✓ model.pkl  (%.1f KB)", model_pkl_path.stat().st_size / 1024)

    # preprocessor.pkl
    pp_pkl_path = artifacts_dir / "preprocessor.pkl"
    with open(pp_pkl_path, "wb") as f:
        pickle.dump(preprocessor, f, protocol=pickle.HIGHEST_PROTOCOL)
    logger.info("  ✓ preprocessor.pkl  (%.1f KB)", pp_pkl_path.stat().st_size / 1024)

    # feature_list.json
    feat_json_path = artifacts_dir / "feature_list.json"
    with open(feat_json_path, "w") as f:
        json.dump(
            {
                "n_features":   len(feature_list),
                "feature_set":  "pruned_top26_explainability",
                "features":     feature_list,
            },
            f, indent=2,
        )
    logger.info("  ✓ feature_list.json  (%d features)", len(feature_list))

    # metadata.json
    meta_json_path = artifacts_dir / "metadata.json"
    with open(meta_json_path, "w") as f:
        json.dump(metadata, f, indent=2, default=str)
    logger.info("  ✓ metadata.json")

    # README.md
    readme_path = artifacts_dir / "README.md"
    perf = metadata.get("performance", {})
    readme_content = README_TEMPLATE.format(
        version=args.version,
        n_features=len(feature_list),
        threshold=args.threshold,
        training_date=metadata.get("training_date", "—")[:10],
        roc_auc=perf.get("test_roc_auc",   0),
        f1=perf.get("test_f1",             0),
        recall=perf.get("test_recall",      0),
        precision=perf.get("test_precision",0),
        accuracy=perf.get("test_accuracy",  0),
    )
    readme_path.write_text(readme_content, encoding="utf-8")
    logger.info("  ✓ README.md")

    # ── 6. Integrity validation ───────────────────────────────────────────
    if not args.skip_validation:
        logger.info("[6/6] Running integrity validation...")
        ok = validate_artifacts(artifacts_dir)
        if not ok:
            logger.warning(
                "Validation had issues. Artifacts still exported — "
                "but review logs before deploying."
            )
    else:
        logger.info("[6/6] Validation skipped (--skip-validation)")

    # ── Summary ───────────────────────────────────────────────────────────
    logger.info("\n%s\nARTIFACT EXPORT COMPLETE\n%s", "=" * 70, "=" * 70)
    logger.info("  Directory: %s", artifacts_dir.resolve())
    total_kb = sum(p.stat().st_size for p in artifacts_dir.glob("*") if p.is_file()) / 1024
    logger.info("  Total size: %.1f KB", total_kb)
    for p in sorted(artifacts_dir.glob("*")):
        if p.is_file():
            logger.info("    %-30s %8.1f KB", p.name, p.stat().st_size / 1024)


if __name__ == "__main__":
    main()
