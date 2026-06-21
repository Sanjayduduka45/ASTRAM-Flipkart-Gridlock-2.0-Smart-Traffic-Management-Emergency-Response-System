"""
run_feature_selection.py
=========================
Standalone CLI runner for the Astram Feature Selection Analysis.

Loads the pre-engineered feature matrices from output/, runs all 6 selection
methods, and writes results to output/feature_selection/.

Usage:
    python run_feature_selection.py
    python run_feature_selection.py --target priority
    python run_feature_selection.py --rf-trees 300 --perm-repeats 15
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

import pandas as pd

# ── Path setup ──────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.features.selection import run_feature_selection, write_report

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("feature_selection_runner")

OUTPUT_DIR   = PROJECT_ROOT / "output"
FEATURES_DIR = OUTPUT_DIR / "feature_selection"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Astram Feature Selection Runner")
    p.add_argument(
        "--target", default="requires_road_closure",
        choices=["requires_road_closure", "priority"],
        help="Target column to use for scoring (default: requires_road_closure)",
    )
    p.add_argument("--rf-trees",      type=int, default=200,
                   help="Number of RF estimators (default: 200)")
    p.add_argument("--perm-repeats",  type=int, default=10,
                   help="Permutation importance repeats (default: 10)")
    p.add_argument("--redundancy-thr",type=float, default=0.90,
                   help="Correlation threshold for redundancy (default: 0.90)")
    p.add_argument("--seed",          type=int, default=42)
    return p.parse_args()


def load_data(target: str) -> tuple[pd.DataFrame, pd.Series]:
    """Load engineered feature matrix and target from output/."""
    x_path = OUTPUT_DIR / "X_train_features.csv"
    y_path = OUTPUT_DIR / "y_train.csv"

    if not x_path.exists():
        logger.error("X_train_features.csv not found. Run feature engineering first.")
        sys.exit(1)
    if not y_path.exists():
        logger.error("y_train.csv not found. Run preprocessing first.")
        sys.exit(1)

    logger.info("Loading X_train_features.csv...")
    X = pd.read_csv(x_path, low_memory=False)

    # Load y
    y_df = pd.read_csv(y_path)
    if target in y_df.columns:
        y = y_df[target].squeeze()
    elif y_df.shape[1] == 1:
        y = y_df.squeeze()
    else:
        raise ValueError(f"Target '{target}' not found in y_train.csv columns: {y_df.columns.tolist()}")

    logger.info("Loaded X: %s, y: %s (target=%s)", X.shape, y.shape, target)

    # Drop non-numeric / leaking columns that shouldn't be evaluated
    drop_cols = ["start_datetime", "event_cause", "hour_bin_label", "cause_category",
                 "event_type", "veh_type", "corridor", "police_station", "gba_identifier",
                 "zone", "junction", "address", "description",
                 "spatial_grid_id"]  # string grid cell
    X = X.drop(columns=[c for c in drop_cols if c in X.columns])

    # Align index
    min_len = min(len(X), len(y))
    X = X.iloc[:min_len].reset_index(drop=True)
    y = y.iloc[:min_len].reset_index(drop=True)

    return X, y


def main():
    args = parse_args()

    logger.info("=" * 72)
    logger.info("ASTRAM — COMPREHENSIVE FEATURE SELECTION ANALYSIS")
    logger.info("=" * 72)
    logger.info("Target           : %s", args.target)
    logger.info("RF estimators    : %d", args.rf_trees)
    logger.info("Perm repeats     : %d", args.perm_repeats)
    logger.info("Redundancy thr.  : %.2f", args.redundancy_thr)
    logger.info("Random seed      : %d", args.seed)
    logger.info("=" * 72)

    # Load
    X, y = load_data(args.target)
    logger.info("Feature matrix: %d samples × %d features", *X.shape)

    # Run selection
    t0 = time.time()
    results = run_feature_selection(
        X=X,
        y=y,
        rf_n_estimators=args.rf_trees,
        perm_n_repeats=args.perm_repeats,
        random_state=args.seed,
        redundancy_threshold=args.redundancy_thr,
    )
    elapsed = time.time() - t0
    logger.info("Feature selection completed in %.1fs", elapsed)

    # Write report
    write_report(results, output_dir=FEATURES_DIR)

    # ── Console Summary ───────────────────────────────────────────────────────
    report = results["full_report"]
    logger.info("\n%s\nTOP-30 FEATURES (Ensemble Consensus Rank)\n%s", "="*72, "="*72)
    display = report[[
        "ensemble_rank", "feature", "category",
        "correlation", "mutual_info", "chi2", "anova_f",
        "rf_importance", "permutation_imp", "mean_rank",
    ]].head(30)
    display.columns = [
        "Rank", "Feature", "Category",
        "Corr", "MI", "Chi2", "ANOVA-F", "RF-Imp", "Perm-Imp", "MeanRank"
    ]
    logger.info("\n%s", display.to_string(index=False))

    logger.info("\n%s\nTOP-10 FEATURES\n%s", "="*72, "="*72)
    for _, row in results["top10"].iterrows():
        logger.info(
            "  [%2d] %-45s | Corr=%.4f  MI=%.4f  Chi2=%.2f  ANOVA=%.2f  RF=%.4f  Perm=%.4f",
            row["ensemble_rank"], row["feature"],
            row["correlation"], row["mutual_info"],
            row["chi2"], row["anova_f"],
            row["rf_importance"], row["permutation_imp"],
        )

    if not results["redundant"].empty:
        logger.info("\n%s\nREDUNDANT FEATURE PAIRS (|r|>=%.2f) IN TOP-30\n%s",
                    "="*72, args.redundancy_thr, "="*72)
        logger.info("\n%s", results["redundant"].to_string(index=False))

    logger.info("\n%s\nCATEGORY SUMMARY\n%s", "="*72, "="*72)
    logger.info("\n%s", results["category_summary"].to_string())

    logger.info("\n%s\nOUTPUTS WRITTEN\n%s", "="*72, "="*72)
    logger.info("  output/feature_selection/feature_selection_report.csv")
    logger.info("  output/feature_selection/top10_features.csv")
    logger.info("  output/feature_selection/top20_features.csv")
    logger.info("  output/feature_selection/top30_features.csv")
    logger.info("  output/feature_selection/redundant_features.csv")
    logger.info("  output/feature_selection/category_summary.csv")
    logger.info("  output/feature_selection/feature_selection_summary.txt")


if __name__ == "__main__":
    main()
