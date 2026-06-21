"""
run_explainability.py
======================
End-to-end model explainability runner for Astram Traffic Event dataset.

Loads the best baseline model (Extra Trees — highest CV-AUC), runs:
  1. MDI Feature Importance
  2. Permutation Importance (AUC, 20 repeats)
  3. SHAP TreeExplainer (500-sample subsample)
  4. SHAP Summary — Beeswarm + Bar
  5. SHAP Dependence Plots (top 5 features)
  6. SHAP Waterfall Plots (TP, FN, TN, FP cases)
  7. Composite influence table + text report

Usage:
    python3 run_explainability.py                          # Extra Trees (best baseline)
    python3 run_explainability.py --model random_forest
    python3 run_explainability.py --model xgboost --shap-samples 300
    python3 run_explainability.py --model-path models/tuned/extra_trees_tuned_roc_auc.pkl
"""

from __future__ import annotations

import argparse
import logging
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models.config import DROP_COLS_FROM_FEATURES, TOP_30_FEATURES
from models.trainer import prepare_features
from models.explainability import (
    plot_feature_importance_mdi,
    plot_permutation_importance,
    compute_shap_values,
    plot_shap_summary_beeswarm,
    plot_shap_summary_bar,
    plot_shap_dependence,
    plot_shap_waterfall,
    build_influence_table,
    write_explainability_report,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("explainability_runner")

OUTPUT_DIR      = PROJECT_ROOT / "output"
EXPLAIN_DIR     = OUTPUT_DIR   / "explainability"
PLOT_DIR        = EXPLAIN_DIR  / "plots"
MODEL_SAVED_DIR = PROJECT_ROOT / "models" / "saved"
MODEL_TUNED_DIR = PROJECT_ROOT / "models" / "tuned"

# Best model by CV-AUC from baseline
DEFAULT_MODEL = "extra_trees"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Astram Explainability Runner")
    p.add_argument("--model", default=DEFAULT_MODEL,
                   help="Model name (e.g. extra_trees, random_forest, xgboost)")
    p.add_argument("--model-path", default=None,
                   help="Direct path to a .pkl file (overrides --model)")
    p.add_argument("--features", default="top30",
                   choices=["all", "top30"],
                   help="Feature set to use (should match training)")
    p.add_argument("--shap-samples", type=int, default=500,
                   help="Number of samples for SHAP computation (default: 500)")
    p.add_argument("--perm-repeats", type=int, default=20,
                   help="Permutation importance repeats (default: 20)")
    p.add_argument("--top-n-plots", type=int, default=25,
                   help="Top-N features for importance plots (default: 25)")
    p.add_argument("--dep-plots", type=int, default=5,
                   help="Number of SHAP dependence plots (default: 5 for top features)")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def load_model(args) -> tuple:
    """Load the specified model. Returns (model, model_name, model_label)."""
    if args.model_path:
        path = Path(args.model_path)
        if not path.exists():
            logger.error("Model path not found: %s", path)
            sys.exit(1)
        with open(path, "rb") as f:
            model = pickle.load(f)
        model_name  = path.stem
        model_label = path.stem.replace("_", " ").title()
        logger.info("Loaded model from: %s", path)
        return model, model_name, model_label

    # Try tuned model first, fall back to saved baseline
    tuned_path  = MODEL_TUNED_DIR / f"{args.model}_tuned_roc_auc.pkl"
    saved_path  = MODEL_SAVED_DIR / f"{args.model}.pkl"

    if tuned_path.exists():
        with open(tuned_path, "rb") as f:
            model = pickle.load(f)
        logger.info("Loaded TUNED model: %s", tuned_path)
        model_label = args.model.replace("_", " ").title() + " (Tuned)"
    elif saved_path.exists():
        with open(saved_path, "rb") as f:
            model = pickle.load(f)
        logger.info("Loaded BASELINE model: %s", saved_path)
        model_label = args.model.replace("_", " ").title() + " (Baseline)"
    else:
        logger.error("No model found for '%s'. Check models/saved/ or models/tuned/.", args.model)
        sys.exit(1)

    return model, args.model, model_label


def load_data(feature_cols, drop_cols):
    """Load and prepare feature matrices."""
    X_train_raw = pd.read_csv(OUTPUT_DIR / "X_train_features.csv", low_memory=False)
    X_test_raw  = pd.read_csv(OUTPUT_DIR / "X_test_features.csv",  low_memory=False)
    y_train     = pd.read_csv(OUTPUT_DIR / "y_train.csv").squeeze()
    y_test      = pd.read_csv(OUTPUT_DIR / "y_test.csv").squeeze()

    X_train = prepare_features(X_train_raw, feature_cols, drop_cols)
    X_test  = prepare_features(X_test_raw,  feature_cols, drop_cols)

    logger.info("X_train: %s | X_test: %s", X_train.shape, X_test.shape)
    return X_train, X_test, y_train, y_test


def main():
    args = parse_args()

    EXPLAIN_DIR.mkdir(parents=True, exist_ok=True)
    PLOT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 70)
    logger.info("ASTRAM — MODEL EXPLAINABILITY")
    logger.info("=" * 70)

    # ── Load model ────────────────────────────────────────────────────────────
    model, model_name, model_label = load_model(args)
    logger.info("Model: %s", model_label)

    # ── Load data ─────────────────────────────────────────────────────────────
    feature_cols = TOP_30_FEATURES if args.features == "top30" else None
    X_train, X_test, y_train, y_test = load_data(feature_cols, DROP_COLS_FROM_FEATURES)
    feature_names = list(X_test.columns)

    logger.info("=" * 70)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. MDI Feature Importance
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[1/7] MDI Feature Importance...")
    mdi_df = plot_feature_importance_mdi(
        model, feature_names,
        top_n=args.top_n_plots,
        save_path=PLOT_DIR / "feature_importance_mdi.png",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Permutation Importance
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[2/7] Permutation Importance...")
    perm_df = plot_permutation_importance(
        model,
        X_test.values, y_test.values,
        feature_names,
        top_n=args.top_n_plots,
        n_repeats=args.perm_repeats,
        random_state=args.seed,
        save_path=PLOT_DIR / "permutation_importance.png",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Compute SHAP Values
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[3/7] Computing SHAP values (TreeExplainer, %d samples)...",
                args.shap_samples)
    shap_values, X_shap = compute_shap_values(
        model, X_test,
        model_name=model_name,
        max_samples=args.shap_samples,
        random_state=args.seed,
    )

    # ─────────────────────────────────────────────────────────────────────────
    # 4. SHAP Summary — Beeswarm
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[4/7] SHAP Summary Beeswarm Plot...")
    plot_shap_summary_beeswarm(
        shap_values, X_shap,
        top_n=args.top_n_plots,
        save_path=PLOT_DIR / "shap_summary_beeswarm.png",
    )

    # SHAP Summary Bar
    shap_bar_df = plot_shap_summary_bar(
        shap_values, feature_names,
        top_n=args.top_n_plots,
        save_path=PLOT_DIR / "shap_summary_bar.png",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # 5. SHAP Dependence Plots — top features by mean|SHAP|
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[5/7] SHAP Dependence Plots (top %d features)...", args.dep_plots)
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    top_feat_idx  = np.argsort(mean_abs_shap)[::-1][:args.dep_plots]
    top_features  = [feature_names[i] for i in top_feat_idx]

    for feat in top_features:
        safe_name = feat.replace("/", "_").replace(" ", "_")[:50]
        plot_shap_dependence(
            shap_values, X_shap,
            feature=feat,
            save_path=PLOT_DIR / f"shap_dependence_{safe_name}.png",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 6. SHAP Waterfall Plots — TP, FN, TN, FP
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[6/7] SHAP Waterfall Plots (TP, FN, TN, FP)...")

    # Align y_true to the SHAP sample indices
    shap_idx = X_shap.index if hasattr(X_shap, "index") else np.arange(len(X_shap))
    y_true_shap = y_test.values[:len(X_shap)]
    y_pred_shap = model.predict(X_shap)

    for case in ["tp", "fn", "tn", "fp"]:
        plot_shap_waterfall(
            model, X_shap,
            shap_values, y_true_shap, y_pred_shap,
            case=case,
            max_display=15,
            save_path=PLOT_DIR / f"shap_waterfall_{case}.png",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Composite Influence Table + Report
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[7/7] Building influence table and report...")

    # Align all dataframes on the same feature set
    all_features = pd.DataFrame({"feature": feature_names})

    mdi_full = all_features.merge(
        mdi_df if not mdi_df.empty else pd.DataFrame({"feature": feature_names, "mdi_importance": 0}),
        on="feature", how="left"
    ).fillna(0)
    mdi_full = mdi_full.rename(columns={"mdi_importance": "mdi_importance"})

    influence_df = build_influence_table(
        mdi_df   = mdi_full.rename(columns={"mdi_importance": "mdi_importance"})
                           if "mdi_importance" in mdi_full.columns
                           else pd.DataFrame({"feature": feature_names, "mdi_importance": 0}),
        perm_df  = perm_df,
        shap_df  = shap_bar_df,
    )

    # Save CSVs
    influence_df.to_csv(EXPLAIN_DIR / "feature_influence_table.csv", index=False)
    shap_bar_df.to_csv( EXPLAIN_DIR / "shap_mean_abs_importance.csv", index=False)
    perm_df.to_csv(     EXPLAIN_DIR / "permutation_importance.csv",   index=False)
    if not mdi_df.empty:
        mdi_df.to_csv(  EXPLAIN_DIR / "mdi_importance.csv",           index=False)

    # Write text report
    write_explainability_report(influence_df, model_label, EXPLAIN_DIR, PLOT_DIR)

    # ─────────────────────────────────────────────────────────────────────────
    # Console Summary
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("\n%s\nMOST INFLUENTIAL FEATURES\n%s", "=" * 70, "=" * 70)
    most_inf = influence_df[influence_df["influence"] == "Most Influential"]
    for _, row in most_inf.iterrows():
        logger.info(
            "  [%2d] %-42s MDI=%7.5f  Perm=%7.5f  SHAP=%7.5f",
            row["composite_rank"], row["feature"],
            row.get("mdi", 0), row.get("perm_imp", 0), row.get("shap_mean_abs", 0),
        )

    logger.info("\n%s\nLEAST USEFUL FEATURES\n%s", "=" * 70, "=" * 70)
    least_use = influence_df[influence_df["influence"] == "Least Useful"].tail(10)
    for _, row in least_use.iterrows():
        logger.info(
            "  [%2d] %-42s MDI=%7.5f  Perm=%7.5f  SHAP=%7.5f",
            row["composite_rank"], row["feature"],
            row.get("mdi", 0), row.get("perm_imp", 0), row.get("shap_mean_abs", 0),
        )

    logger.info("\n%s\nOUTPUTS\n%s", "=" * 70, "=" * 70)
    logger.info("  output/explainability/feature_influence_table.csv")
    logger.info("  output/explainability/shap_mean_abs_importance.csv")
    logger.info("  output/explainability/permutation_importance.csv")
    logger.info("  output/explainability/mdi_importance.csv")
    logger.info("  output/explainability/explainability_report.txt")
    logger.info("  output/explainability/plots/  (%d PNG files)", len(list(PLOT_DIR.glob("*.png"))))

    return influence_df


if __name__ == "__main__":
    main()
