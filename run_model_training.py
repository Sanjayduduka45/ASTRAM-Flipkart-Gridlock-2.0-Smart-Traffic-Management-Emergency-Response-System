"""
run_model_training.py
======================
End-to-end model training runner for the Astram Traffic Event dataset.

Trains 8 classifiers using the top-30 feature-selected features, with
stratified splits, 5-fold CV, class weight compensation, and full
evaluation on a held-out test set.

Usage:
    python3 run_model_training.py                      # default: top30 features
    python3 run_model_training.py --features all       # all numeric features
    python3 run_model_training.py --features top21     # deduplicated top-21
    python3 run_model_training.py --features top30     # top-30 (default)
    python3 run_model_training.py --cv-splits 10       # 10-fold CV
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

# ── Path bootstrap ───────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models.config import (
    DROP_COLS_FROM_FEATURES,
    TOP_30_FEATURES,
    TOP_21_FEATURES,
    CV_N_SPLITS,
    RANDOM_STATE,
)
from models.definitions import get_model_zoo
from models.trainer     import train_all_models
from models.reporter    import build_ranking_table, write_report, print_console_summary

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("model_training_runner")

OUTPUT_DIR   = PROJECT_ROOT / "output"
MODEL_DIR    = PROJECT_ROOT / "models" / "saved"
RESULTS_DIR  = OUTPUT_DIR   / "model_results"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Astram Model Training Runner")
    p.add_argument(
        "--features", default="top30",
        choices=["all", "top21", "top30"],
        help="Feature subset to use (default: top30)",
    )
    p.add_argument("--cv-splits",  type=int, default=CV_N_SPLITS,
                   help=f"Number of CV folds (default: {CV_N_SPLITS})")
    p.add_argument("--seed",       type=int, default=RANDOM_STATE)
    return p.parse_args()


def load_data() -> tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
    """Load pre-engineered train/test splits from output/."""
    x_train_path = OUTPUT_DIR / "X_train_features.csv"
    x_test_path  = OUTPUT_DIR / "X_test_features.csv"
    y_train_path = OUTPUT_DIR / "y_train.csv"
    y_test_path  = OUTPUT_DIR / "y_test.csv"

    for p in [x_train_path, x_test_path, y_train_path, y_test_path]:
        if not p.exists():
            logger.error("Required file not found: %s", p)
            sys.exit(1)

    logger.info("Loading feature matrices...")
    X_train = pd.read_csv(x_train_path, low_memory=False)
    X_test  = pd.read_csv(x_test_path,  low_memory=False)
    y_train = pd.read_csv(y_train_path).squeeze()
    y_test  = pd.read_csv(y_test_path).squeeze()

    logger.info("X_train: %s | X_test: %s", X_train.shape, X_test.shape)
    logger.info(
        "Class balance — train: %s | test: %s",
        dict(y_train.value_counts()),
        dict(y_test.value_counts()),
    )
    return X_train, y_train, X_test, y_test


def main():
    args = parse_args()

    logger.info("=" * 70)
    logger.info("ASTRAM — MACHINE LEARNING MODEL COMPARISON STUDY")
    logger.info("=" * 70)
    logger.info("Feature set  : %s", args.features)
    logger.info("CV folds     : %d-Fold Stratified", args.cv_splits)
    logger.info("Random seed  : %d", args.seed)
    logger.info("=" * 70)

    # ── Load data ─────────────────────────────────────────────────────────────
    X_train, y_train, X_test, y_test = load_data()

    # ── Feature subset ────────────────────────────────────────────────────────
    if args.features == "top30":
        feature_cols = TOP_30_FEATURES
        logger.info("Using top-30 feature-selected features.")
    elif args.features == "top21":
        feature_cols = TOP_21_FEATURES
        logger.info("Using deduplicated top-21 features.")
    else:
        feature_cols = None
        logger.info("Using all numeric features.")

    # ── Model zoo ─────────────────────────────────────────────────────────────
    model_zoo = get_model_zoo()
    logger.info("Models to train: %s", list(model_zoo.keys()))

    # ── Train ─────────────────────────────────────────────────────────────────
    comparison_df = train_all_models(
        model_zoo    = model_zoo,
        X_train      = X_train,
        y_train      = y_train,
        X_test       = X_test,
        y_test       = y_test,
        feature_cols = feature_cols,
        drop_cols    = DROP_COLS_FROM_FEATURES,
        n_cv_splits  = args.cv_splits,
        random_state = args.seed,
        model_dir    = MODEL_DIR,
    )

    # ── Build ranking table ───────────────────────────────────────────────────
    ranking_df = build_ranking_table(comparison_df)

    # ── Console output ────────────────────────────────────────────────────────
    results_list = comparison_df.to_dict("records")
    print_console_summary(comparison_df, ranking_df)

    # ── Write reports ─────────────────────────────────────────────────────────
    write_report(
        comparison_df = comparison_df,
        ranking_df    = ranking_df,
        output_dir    = RESULTS_DIR,
        results_list  = results_list,
    )

    logger.info("\n%s\nOUTPUTS\n%s", "=" * 70, "=" * 70)
    logger.info("  output/model_results/model_comparison.csv")
    logger.info("  output/model_results/model_ranking.csv")
    logger.info("  output/model_results/model_comparison_summary.txt")
    logger.info("  models/saved/<model_name>.pkl")

    return comparison_df, ranking_df


if __name__ == "__main__":
    main()
