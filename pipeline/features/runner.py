"""
pipeline/features/runner.py
=============================
End-to-end runner for the advanced feature engineering stage.

Loads the processed train/test outputs from the preprocessing pipeline,
applies the AdvancedFeatureEngineer, computes feature importance rankings,
and saves all outputs.

Usage:
    python -m pipeline.features.runner
"""

from __future__ import annotations
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.features.assembler  import AdvancedFeatureEngineer
from pipeline.features.importance import rank_feature_importance

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("features.runner")

OUTPUT_DIR = PROJECT_ROOT / "output"
MODEL_DIR  = PROJECT_ROOT / "models"
DATA_PATH  = PROJECT_ROOT / "Data" / "Astram event data_anonymized - Astram event data_anonymizedb40ac87.csv"


def run():
    logger.info("=" * 72)
    logger.info("ASTRAM ADVANCED FEATURE ENGINEERING PIPELINE")
    logger.info("=" * 72)

    # Load preprocessed feature matrices
    X_train = pd.read_csv(OUTPUT_DIR / "X_train_processed.csv")
    X_test  = pd.read_csv(OUTPUT_DIR / "X_test_processed.csv")
    y_train = pd.read_csv(OUTPUT_DIR / "y_train.csv").squeeze()
    y_test  = pd.read_csv(OUTPUT_DIR / "y_test.csv").squeeze()

    logger.info("Loaded X_train=%s X_test=%s", X_train.shape, X_test.shape)

    # Inject raw datetime + context cols back from raw CSV
    # (they were dropped by the preprocessor; needed for temporal + rolling features)
    raw = pd.read_csv(DATA_PATH, low_memory=False)
    raw["_sort_dt"] = pd.to_datetime(raw["start_datetime"], errors="coerce", utc=True)
    raw = raw.sort_values("_sort_dt").reset_index(drop=True)

    # Align split exactly to the preprocessed row counts (not a fixed fraction)
    n_train = len(X_train)
    n_test  = len(X_test)
    raw_train = raw.iloc[:n_train].reset_index(drop=True)
    raw_test  = raw.iloc[n_train: n_train + n_test].reset_index(drop=True)

    # Merge raw context columns that the feature engineer needs
    CONTEXT_COLS = [
        "start_datetime", "event_cause", "event_type", "veh_type",
        "corridor", "zone", "junction", "police_station", "gba_identifier",
    ]
    for col in CONTEXT_COLS:
        if col not in X_train.columns and col in raw_train.columns:
            X_train[col] = raw_train[col].values
        if col not in X_test.columns and col in raw_test.columns:
            X_test[col]  = raw_test[col].values

    logger.info("Context columns injected for feature engineering.")

    # ── Fit + Transform ─────────────────────────────────────────────────────
    eng = AdvancedFeatureEngineer(
        datetime_col="start_datetime",
        rolling_windows=[3, 6],
    )
    X_train_rich = eng.fit_transform(X_train.copy(), y_train)
    X_test_rich  = eng.transform(X_test.copy())

    logger.info("Feature engineering complete.")
    logger.info("  X_train: %s → %s", X_train.shape, X_train_rich.shape)
    logger.info("  X_test:  %s → %s", X_test.shape,  X_test_rich.shape)

    new_feats = [c for c in X_train_rich.columns if c not in X_train.columns]
    logger.info("  New features added: %d", len(new_feats))

    # ── Feature Importance Ranking ───────────────────────────────────────────
    logger.info("\n%s\nRANKING FEATURE IMPORTANCE\n%s", "="*72, "="*72)
    importance_df = rank_feature_importance(X_train_rich, y_train, top_n=80)

    logger.info("\nTOP 30 FEATURES BY MEAN RANK:")
    logger.info(
        "\n%s",
        importance_df[["overall_rank","feature","category","rf_importance","mi_score","pearson_r","mean_rank"]]
        .head(30).to_string(index=False)
    )

    logger.info("\nIMPORTANCE BY CATEGORY:")
    cat_summary = (
        importance_df.groupby("category")
        .agg(
            n_features=("feature","count"),
            mean_rf=("rf_importance","mean"),
            mean_mi=("mi_score","mean"),
            best_rank=("overall_rank","min"),
        )
        .sort_values("mean_rf", ascending=False)
        .round(6)
    )
    logger.info("\n%s", cat_summary.to_string())

    # ── Save outputs ─────────────────────────────────────────────────────────
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    X_train_rich.to_csv(OUTPUT_DIR / "X_train_features.csv", index=False)
    X_test_rich.to_csv( OUTPUT_DIR / "X_test_features.csv",  index=False)
    importance_df.to_csv(OUTPUT_DIR / "feature_importance.csv", index=False)
    cat_summary.to_csv(  OUTPUT_DIR / "importance_by_category.csv")
    eng.save(MODEL_DIR / "feature_engineer.pkl")

    logger.info("\nOutputs saved:")
    logger.info("  X_train_features.csv       → %d rows × %d cols", *X_train_rich.shape)
    logger.info("  X_test_features.csv        → %d rows × %d cols", *X_test_rich.shape)
    logger.info("  feature_importance.csv     → %d features ranked", len(importance_df))
    logger.info("  importance_by_category.csv → %d categories", len(cat_summary))
    logger.info("  feature_engineer.pkl       → saved")

    return {
        "X_train_rich": X_train_rich,
        "X_test_rich":  X_test_rich,
        "importance":   importance_df,
        "cat_summary":  cat_summary,
        "engineer":     eng,
    }


if __name__ == "__main__":
    run()
