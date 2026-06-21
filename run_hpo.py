"""
run_hpo.py
===========
End-to-end Hyperparameter Optimization runner for the Astram Traffic Event dataset.

Applies two-stage HPO (RandomizedSearch → GridSearch) on the top-N baseline models,
optimising for F1 Score, Recall, and ROC AUC simultaneously.

Usage:
    python3 run_hpo.py                          # default: top-5 models, top30 features
    python3 run_hpo.py --top-n 4               # tune top-4 models only
    python3 run_hpo.py --features top21        # use deduplicated feature set
    python3 run_hpo.py --n-iter 80             # more RandomSearch iterations
    python3 run_hpo.py --models "XGBoost,LightGBM,Extra Trees"  # specific models
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models.config import (
    DROP_COLS_FROM_FEATURES,
    TOP_30_FEATURES,
    TOP_21_FEATURES,
    RANDOM_STATE,
)
from models.definitions  import get_model_zoo
from models.optimizer    import run_hpo
from models.hpo_reporter import (
    build_improvement_table,
    build_best_params_table,
    write_hpo_report,
    print_hpo_console_summary,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("hpo_runner")

OUTPUT_DIR      = PROJECT_ROOT / "output"
MODEL_RESULTS   = OUTPUT_DIR   / "model_results"
HPO_RESULTS_DIR = OUTPUT_DIR   / "hpo_results"
TUNED_MODEL_DIR = PROJECT_ROOT / "models" / "tuned"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Astram HPO Runner")
    p.add_argument("--features", default="top30", choices=["all", "top21", "top30"])
    p.add_argument("--top-n",    type=int, default=5,
                   help="Number of top baseline models to tune (default: 5)")
    p.add_argument("--n-iter",   type=int, default=60,
                   help="RandomizedSearch iterations per objective (default: 60)")
    p.add_argument("--seed",     type=int, default=RANDOM_STATE)
    p.add_argument(
        "--models", type=str, default=None,
        help="Comma-separated model names to tune (overrides --top-n). "
             "E.g. 'XGBoost,LightGBM,Extra Trees'"
    )
    return p.parse_args()


def load_data():
    paths = {
        "X_train": OUTPUT_DIR / "X_train_features.csv",
        "X_test":  OUTPUT_DIR / "X_test_features.csv",
        "y_train": OUTPUT_DIR / "y_train.csv",
        "y_test":  OUTPUT_DIR / "y_test.csv",
    }
    for name, p in paths.items():
        if not p.exists():
            logger.error("Missing: %s. Run preprocessing + feature engineering first.", p)
            sys.exit(1)

    logger.info("Loading feature matrices...")
    X_train = pd.read_csv(paths["X_train"], low_memory=False)
    X_test  = pd.read_csv(paths["X_test"],  low_memory=False)
    y_train = pd.read_csv(paths["y_train"]).squeeze()
    y_test  = pd.read_csv(paths["y_test"]).squeeze()
    logger.info("X_train: %s | X_test: %s", X_train.shape, X_test.shape)
    return X_train, y_train, X_test, y_test


def load_baseline() -> pd.DataFrame:
    path = MODEL_RESULTS / "model_comparison.csv"
    if not path.exists():
        logger.error(
            "Baseline results not found at %s.\n"
            "Run: python3 run_model_training.py first.", path
        )
        sys.exit(1)
    df = pd.read_csv(path)
    logger.info("Baseline results loaded: %d models.", len(df))
    return df


def main():
    args = parse_args()

    logger.info("=" * 70)
    logger.info("ASTRAM — HYPERPARAMETER OPTIMIZATION")
    logger.info("=" * 70)
    logger.info("Feature set        : %s", args.features)
    logger.info("Top-N models       : %s", args.models if args.models else args.top_n)
    logger.info("RandomSearch iters : %d per objective (× 3 objectives)", args.n_iter)
    logger.info("GridSearch         : focused neighbourhood grid")
    logger.info("CV                 : 5-Fold Stratified")
    logger.info("Objectives         : F1 | Recall | ROC AUC")
    logger.info("=" * 70)

    X_train, y_train, X_test, y_test = load_data()
    baseline_df = load_baseline()

    # Feature subset
    if args.features == "top30":
        feature_cols = TOP_30_FEATURES
    elif args.features == "top21":
        feature_cols = TOP_21_FEATURES
    else:
        feature_cols = None

    # If specific models are named, override top-N selection
    if args.models:
        model_names = [m.strip() for m in args.models.split(",")]
        # Inject them at the top of the baseline so top-N picks them
        dummy_rows = []
        for name in model_names:
            row = baseline_df[baseline_df["model_name"] == name]
            if row.empty:
                logger.warning("Model '%s' not in baseline results. It will still be tuned.", name)
                dummy_rows.append({"model_name": name, "cv_roc_auc_mean": 999})
            else:
                dummy_rows.append(row.iloc[0].to_dict())
        baseline_for_selection = pd.DataFrame(dummy_rows)
        top_n = len(model_names)
    else:
        baseline_for_selection = baseline_df
        top_n = args.top_n

    model_zoo = get_model_zoo()

    # ── Run HPO ───────────────────────────────────────────────────────────────
    all_results = run_hpo(
        model_zoo       = model_zoo,
        baseline_df     = baseline_for_selection,
        X_train         = X_train,
        y_train         = y_train,
        X_test          = X_test,
        y_test          = y_test,
        feature_cols    = feature_cols,
        drop_cols       = DROP_COLS_FROM_FEATURES,
        top_n_models    = top_n,
        n_iter_random   = args.n_iter,
        random_state    = args.seed,
        tuned_model_dir = TUNED_MODEL_DIR,
    )

    # ── Build report tables ───────────────────────────────────────────────────
    improvement_df = build_improvement_table(all_results)
    best_params_df = build_best_params_table(all_results)

    # Console summary
    print_hpo_console_summary(improvement_df)

    # Write full report
    write_hpo_report(
        all_results    = all_results,
        improvement_df = improvement_df,
        best_params_df = best_params_df,
        baseline_df    = baseline_df,
        output_dir     = HPO_RESULTS_DIR,
    )

    logger.info("\n%s\nOUTPUTS\n%s", "=" * 70, "=" * 70)
    logger.info("  output/hpo_results/hpo_improvement_table.csv")
    logger.info("  output/hpo_results/hpo_best_params.csv")
    logger.info("  output/hpo_results/hpo_report.txt")
    logger.info("  models/tuned/<model>_tuned_<objective>.pkl")

    return all_results, improvement_df


if __name__ == "__main__":
    main()
