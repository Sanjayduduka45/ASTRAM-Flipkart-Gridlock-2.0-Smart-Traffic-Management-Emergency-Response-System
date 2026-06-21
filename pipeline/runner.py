"""
pipeline/runner.py
==================
End-to-end preprocessing runner and comprehensive report generator.

This script:
  1. Loads the raw Astram event CSV.
  2. Splits into train (80%) / test (20%) using a chronological split
     to respect temporal ordering (no future data leaked into training).
  3. Runs AstramPreprocessor.fit_transform() on train.
  4. Runs AstramPreprocessor.transform() on test.
  5. Generates a comprehensive preprocessing report:
       - Missing value audit (before vs after)
       - IQR outlier summary per feature
       - Isolation Forest anomaly count
       - Encoding comparison table (label vs frequency vs target)
       - Final feature matrix statistics
  6. Saves processed datasets to CSV and the fitted pipeline to .pkl.

Usage:
  python -m pipeline.runner
  python -m pipeline.runner --encoding target --no-iso-forest
  python -m pipeline.runner --target priority --scale
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# ── ensure project root is in Python path ──────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.encoding import compare_encodings
from pipeline.outliers import compare_outlier_methods
from pipeline.pipeline import AstramPreprocessor

# ── configure logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("runner")

# ── paths ────────────────────────────────────────────────────────────────────
DATA_PATH   = PROJECT_ROOT / "Data" / "Astram event data_anonymized - Astram event data_anonymizedb40ac87.csv"
OUTPUT_DIR  = PROJECT_ROOT / "output"
MODEL_DIR   = PROJECT_ROOT / "models"


def chronological_split(
    df: pd.DataFrame,
    datetime_col: str = "start_datetime",
    test_fraction: float = 0.20,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Sort by datetime and return (train, test) DataFrames.

    Why chronological instead of random?
    -------------------------------------
    Random shuffling would let the model see future events during training.
    In a real deployment, predictions are always made on events that happen
    AFTER the model was trained. Chronological splitting simulates this.

    The latest `test_fraction` proportion of the dataset (by start_datetime)
    is reserved as the test set.
    """
    df = df.copy()
    dt = pd.to_datetime(df[datetime_col], errors="coerce", utc=True)
    df["_sort_dt"] = dt
    df = df.sort_values("_sort_dt").drop(columns=["_sort_dt"]).reset_index(drop=True)

    split_idx = int(len(df) * (1 - test_fraction))
    train = df.iloc[:split_idx].copy()
    test  = df.iloc[split_idx:].copy()

    logger.info(
        "Chronological split: train=%d rows (%s – %s) | test=%d rows (%s – %s)",
        len(train),
        pd.to_datetime(train[datetime_col], errors="coerce", utc=True).min().date(),
        pd.to_datetime(train[datetime_col], errors="coerce", utc=True).max().date(),
        len(test),
        pd.to_datetime(test[datetime_col], errors="coerce", utc=True).min().date(),
        pd.to_datetime(test[datetime_col], errors="coerce", utc=True).max().date(),
    )
    return train, test


def print_missing_summary(df_before: pd.DataFrame, df_after: pd.DataFrame) -> None:
    """Log before/after missing value counts for every column."""
    logger.info("\n" + "=" * 72)
    logger.info("MISSING VALUE AUDIT: BEFORE vs AFTER PREPROCESSING")
    logger.info("=" * 72)
    logger.info(f"{'Column':<40} {'Before':>8} {'After':>8}")
    logger.info("-" * 72)
    for col in df_before.columns:
        if col in df_after.columns:
            b = int(df_before[col].isna().sum())
            a = int(df_after[col].isna().sum())
            if b > 0:
                logger.info(f"  {col:<38} {b:>8,} {a:>8,}")
    logger.info("=" * 72 + "\n")


def print_feature_summary(df: pd.DataFrame, label: str) -> None:
    """Log shape and dtype distribution of a processed DataFrame."""
    logger.info("\n" + "=" * 72)
    logger.info(f"FEATURE MATRIX SUMMARY — {label}")
    logger.info("=" * 72)
    logger.info("  Shape    : %s", df.shape)
    logger.info("  float64  : %d columns", (df.dtypes == "float64").sum())
    logger.info("  int64    : %d columns", (df.dtypes == "int64").sum())
    logger.info("  object   : %d columns", (df.dtypes == "object").sum())
    logger.info("  Null cells: %d", int(df.isna().sum().sum()))

    logger.info("\n  Feature list (%d features):", len(df.columns))
    for i, col in enumerate(sorted(df.columns), 1):
        logger.info("    %3d. %s", i, col)
    logger.info("=" * 72 + "\n")


def run(
    target: str = "requires_road_closure",
    encoding_strategy: str = "frequency",
    run_isolation_forest: bool = True,
    scale_numerics: bool = False,
    save_outputs: bool = True,
) -> dict:
    """
    Execute the full preprocessing pipeline and return output DataFrames.

    Returns
    -------
    dict with keys:
        X_train, y_train, X_test, y_test,
        preprocessor, encoding_comparison, outlier_comparison
    """
    logger.info("=" * 72)
    logger.info("ASTRAM PREPROCESSING PIPELINE")
    logger.info("Target        : %s", target)
    logger.info("Encoding      : %s", encoding_strategy)
    logger.info("IsoForest     : %s", run_isolation_forest)
    logger.info("Scale numerics: %s", scale_numerics)
    logger.info("=" * 72 + "\n")

    # ── Load raw data ────────────────────────────────────────────────────────
    logger.info("Loading dataset from: %s", DATA_PATH)
    df_raw = pd.read_csv(DATA_PATH, low_memory=False)
    logger.info("Raw shape: %s", df_raw.shape)

    # ── Chronological train / test split ────────────────────────────────────
    df_train_raw, df_test_raw = chronological_split(df_raw, test_fraction=0.20)

    # ── Missing value snapshot BEFORE processing ────────────────────────────
    df_before_snapshot = df_train_raw.copy()

    # ── Fit + transform on training data ─────────────────────────────────────
    preprocessor = AstramPreprocessor(
        target=target,
        encoding_strategy=encoding_strategy,
        run_isolation_forest=run_isolation_forest,
        scale_numerics=scale_numerics,
    )
    X_train, y_train = preprocessor.fit_transform(df_train_raw.copy())

    # ── Missing value audit ──────────────────────────────────────────────────
    print_missing_summary(df_before_snapshot, X_train)

    # ── Outlier comparison (IQR vs Isolation Forest) ────────────────────────
    outlier_comparison = None
    if run_isolation_forest and "if_anomaly" in X_train.columns:
        outlier_comparison = compare_outlier_methods(X_train)

    # ── Encoding comparison ──────────────────────────────────────────────────
    # Re-run on a clean copy just for comparison logging (does NOT affect
    # the fitted preprocessor or X_train)
    logger.info("\n" + "=" * 72)
    logger.info("ENCODING STRATEGY COMPARISON (on training data)")
    logger.info("=" * 72)
    from pipeline.cleaning import run_cleaning
    from pipeline.config import CATEGORICAL_FEATURES, TEXT_FEATURES, NUMERIC_FEATURES
    from pipeline.missing import CategoricalImputer, NumericalImputer, TextImputer

    _df_enc = run_cleaning(df_train_raw.copy())
    _df_enc_y = None
    if target in _df_enc.columns:
        _df_enc_y = _df_enc[target].copy()
        if _df_enc_y.dtype == bool:
            _df_enc_y = _df_enc_y.astype(int)
        elif target == "priority":
            _df_enc_y = _df_enc_y.map({"High": 1, "Low": 0})
        from pipeline.config import TARGET_COLUMNS
        _df_enc = _df_enc.drop(columns=[c for c in TARGET_COLUMNS if c in _df_enc.columns])

    _cat_imp = CategoricalImputer(columns=CATEGORICAL_FEATURES).fit(_df_enc)
    _df_enc = _cat_imp.transform(_df_enc)
    _df_enc = NumericalImputer(columns=NUMERIC_FEATURES).fit(_df_enc).transform(_df_enc)
    _df_enc = TextImputer(columns=TEXT_FEATURES).fit(_df_enc).transform(_df_enc)

    enc_cols = [c for c in CATEGORICAL_FEATURES if c in _df_enc.columns]
    encoding_comparison = compare_encodings(_df_enc, enc_cols, _df_enc_y)

    # ── Transform test data ───────────────────────────────────────────────────
    X_test, y_test = preprocessor.transform(df_test_raw.copy())

    # ── Feature matrix summary ────────────────────────────────────────────────
    print_feature_summary(X_train, "TRAIN")
    print_feature_summary(X_test,  "TEST")

    # ── Save outputs ──────────────────────────────────────────────────────────
    if save_outputs:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        MODEL_DIR.mkdir(parents=True, exist_ok=True)

        train_out = OUTPUT_DIR / "X_train_processed.csv"
        test_out  = OUTPUT_DIR / "X_test_processed.csv"
        y_train_out = OUTPUT_DIR / "y_train.csv"
        y_test_out  = OUTPUT_DIR / "y_test.csv"
        model_out = MODEL_DIR / "astram_preprocessor.pkl"
        enc_cmp_out = OUTPUT_DIR / "encoding_comparison.csv"
        if outlier_comparison is not None:
            out_cmp_out = OUTPUT_DIR / "outlier_comparison.csv"
            outlier_comparison.to_csv(out_cmp_out, index=False)
            logger.info("Saved outlier comparison → %s", out_cmp_out)

        X_train.to_csv(train_out, index=False)
        X_test.to_csv(test_out, index=False)
        if y_train is not None:
            y_train.to_csv(y_train_out, index=False, header=[target])
        if y_test is not None:
            y_test.to_csv(y_test_out, index=False, header=[target])
        encoding_comparison.to_csv(enc_cmp_out, index=False)
        preprocessor.save(model_out)

        logger.info("\nOutputs saved:")
        logger.info("  X_train  → %s", train_out)
        logger.info("  X_test   → %s", test_out)
        logger.info("  y_train  → %s", y_train_out)
        logger.info("  y_test   → %s", y_test_out)
        logger.info("  Pipeline → %s", model_out)
        logger.info("  Enc cmp  → %s", enc_cmp_out)

    return {
        "X_train": X_train,
        "y_train": y_train,
        "X_test":  X_test,
        "y_test":  y_test,
        "preprocessor": preprocessor,
        "encoding_comparison": encoding_comparison,
        "outlier_comparison": outlier_comparison,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Astram Event Data preprocessing pipeline",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--target",
        choices=["requires_road_closure", "priority", "event_cause"],
        default="requires_road_closure",
        help="Target variable for the preprocessor.",
    )
    parser.add_argument(
        "--encoding",
        choices=["label", "frequency", "target"],
        default="frequency",
        help="Categorical encoding strategy.",
    )
    parser.add_argument(
        "--no-iso-forest",
        action="store_true",
        default=False,
        help="Disable Isolation Forest anomaly detection (faster).",
    )
    parser.add_argument(
        "--scale",
        action="store_true",
        default=False,
        help="Apply StandardScaler to numeric features (for linear models).",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        default=False,
        help="Skip saving outputs to disk.",
    )
    args = parser.parse_args()

    run(
        target=args.target,
        encoding_strategy=args.encoding,
        run_isolation_forest=not args.no_iso_forest,
        scale_numerics=args.scale,
        save_outputs=not args.no_save,
    )


if __name__ == "__main__":
    main()
