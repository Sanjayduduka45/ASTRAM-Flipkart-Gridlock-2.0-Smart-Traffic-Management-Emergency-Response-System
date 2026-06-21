"""
run_refinement.py
==================
Final refinement pipeline:

1. Load explainability results → identify & remove weak features
2. Retrain top-3 models on pruned feature set (5-fold CV + hold-out)
3. Learning curves — bias-variance diagnosis per model
4. Validation curves — hyperparameter sensitivity
5. Baseline vs. pruned performance comparison
6. Final model selection (weighted score + BV penalty)
7. Save final production model + comprehensive report

Usage:
    python3 run_refinement.py                      # default settings
    python3 run_refinement.py --weak-pct 0.25      # drop bottom 25%
    python3 run_refinement.py --shap-thr 0.001     # stricter SHAP threshold
    python3 run_refinement.py --models "Extra Trees,Random Forest,XGBoost"
"""

from __future__ import annotations

import argparse
import logging
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models.config      import DROP_COLS_FROM_FEATURES, TOP_30_FEATURES
from models.definitions import get_model_zoo
from models.trainer     import prepare_features
from models.refinement  import (
    identify_weak_features,
    retrain_model,
    plot_learning_curves,
    plot_validation_curves,
    plot_performance_comparison,
    select_final_model,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s : %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("refinement_runner")

OUTPUT_DIR      = PROJECT_ROOT / "output"
EXPLAIN_DIR     = OUTPUT_DIR   / "explainability"
MODEL_RESULTS   = OUTPUT_DIR   / "model_results"
REFINEMENT_DIR  = OUTPUT_DIR   / "refinement"
PLOT_DIR        = REFINEMENT_DIR / "plots"
FINAL_MODEL_DIR = PROJECT_ROOT / "models" / "final"

# Default top-3 models to retrain (by CV-AUC from baseline)
DEFAULT_RETRAIN_MODELS = ["Extra Trees", "Random Forest", "Logistic Regression"]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--weak-pct",  type=float, default=0.20,
                   help="Bottom percentile to flag as weak (default: 0.20)")
    p.add_argument("--shap-thr",  type=float, default=0.0005,
                   help="SHAP mean|abs| below which a feature is weak (default: 0.0005)")
    p.add_argument("--perm-thr",  type=float, default=0.0,
                   help="Permutation <= this value is weak (default: 0.0)")
    p.add_argument("--models",    type=str, default=None,
                   help="Comma-separated models to retrain. Default: top-3 by CV-AUC")
    p.add_argument("--cv-splits", type=int, default=5)
    p.add_argument("--lc-scoring",type=str, default="roc_auc")
    p.add_argument("--seed",      type=int, default=42)
    return p.parse_args()


def load_data():
    X_train = pd.read_csv(OUTPUT_DIR / "X_train_features.csv", low_memory=False)
    X_test  = pd.read_csv(OUTPUT_DIR / "X_test_features.csv",  low_memory=False)
    y_train = pd.read_csv(OUTPUT_DIR / "y_train.csv").squeeze()
    y_test  = pd.read_csv(OUTPUT_DIR / "y_test.csv").squeeze()
    return X_train, y_train, X_test, y_test


def load_baseline():
    path = MODEL_RESULTS / "model_comparison.csv"
    if not path.exists():
        logger.error("Baseline results not found. Run run_model_training.py first.")
        sys.exit(1)
    return pd.read_csv(path)


def write_final_report(
    weak_df:       pd.DataFrame,
    weak_features: list,
    pruned_features: list,
    pruned_df:     pd.DataFrame,
    baseline_df:   pd.DataFrame,
    lc_results:    dict,
    vc_results:    dict,
    scores_df:     pd.DataFrame,
    winner:        str,
    output_dir:    Path,
    plot_dir:      Path,
) -> None:
    """Write the comprehensive final model report."""
    output_dir.mkdir(parents=True, exist_ok=True)
    LINE = "=" * 84
    SEP  = "-" * 84

    with open(output_dir / "final_model_report.txt", "w", encoding="utf-8") as f:
        f.write(f"{LINE}\n")
        f.write("ASTRAM TRAFFIC EVENT — FINAL MODEL REPORT\n")
        f.write(f"{LINE}\n\n")
        f.write(f"Final Production Model : {winner}\n")
        f.write(f"Feature pruning        : {len(weak_features)} features removed from top-30\n")
        f.write(f"Pruned feature count   : {len(pruned_features)}\n\n")

        # ── Weak Features Removed ─────────────────────────────────────────────
        f.write(f"{LINE}\n WEAK FEATURES REMOVED ({len(weak_features)})\n{LINE}\n")
        if weak_df.empty:
            f.write("  No weak features identified.\n\n")
        else:
            f.write(weak_df.to_string(index=False))
            f.write("\n\n")

        # ── Pruned Feature Set ────────────────────────────────────────────────
        f.write(f"{LINE}\n PRUNED FEATURE SET ({len(pruned_features)} features retained)\n{LINE}\n")
        for i, feat in enumerate(pruned_features, 1):
            f.write(f"  {i:>2}. {feat}\n")
        f.write("\n")

        # ── Old vs New Performance ────────────────────────────────────────────
        f.write(f"{LINE}\n BASELINE vs. PRUNED — PERFORMANCE COMPARISON\n{LINE}\n")
        for _, pr in pruned_df.iterrows():
            name = pr["model_name"]
            base = baseline_df[baseline_df["model_name"] == name]
            f.write(f"\n  {name}\n  {'─'*50}\n")
            f.write(f"  {'Metric':<14} {'Baseline':>10} {'Pruned':>10} {'Δ':>8}\n")
            for m in ["test_accuracy", "test_precision", "test_recall", "test_f1", "test_roc_auc"]:
                label  = m.replace("test_", "").capitalize()
                b_val  = base[m].values[0] if not base.empty and m in base.columns else 0
                p_val  = pr.get(m, 0)
                delta  = p_val - b_val
                f.write(f"  {label:<14} {b_val:>10.4f} {p_val:>10.4f} {delta:>+8.4f}\n")

        f.write("\n")

        # ── Bias-Variance Diagnosis ───────────────────────────────────────────
        f.write(f"{LINE}\n BIAS-VARIANCE DIAGNOSIS (Learning Curves, ROC-AUC)\n{LINE}\n")
        f.write(f"  {'Model':<28} {'Train':>8} {'Val':>8} {'Gap':>8} {'Diagnosis':<20}\n")
        f.write(f"  {SEP}\n")
        for name, lc in lc_results.items():
            f.write(
                f"  {name:<28} {lc.get('train_final',0):>8.4f} "
                f"{lc.get('val_final',0):>8.4f} "
                f"{lc.get('gap',0):>+8.4f} "
                f"{lc.get('diagnosis','N/A'):<20}\n"
            )
        f.write("\n")

        # ── Validation Curve Insights ─────────────────────────────────────────
        f.write(f"{LINE}\n VALIDATION CURVE INSIGHTS\n{LINE}\n")
        for name, vc in vc_results.items():
            f.write(
                f"  {name:<28} optimal {vc.get('param_name','?')}="
                f"{vc.get('best_value','?')}  "
                f"(val score={vc.get('best_val_score',0):.4f})\n"
            )
        f.write("\n")

        # ── Final Model Selection ─────────────────────────────────────────────
        f.write(f"{LINE}\n FINAL MODEL SELECTION SCORES\n{LINE}\n")
        f.write("  Weights: ROC-AUC=35% | F1=30% | Recall=20% | Precision=10% | Accuracy=5%\n")
        f.write("  BV Penalty: -0.04 for Overfit/High Variance | -0.02 for Underfit\n\n")
        f.write(scores_df[[
            "rank","model_name","test_roc_auc","test_f1","test_recall",
            "weighted_score","bv_penalty","final_score","bv_diagnosis"
        ]].to_string(index=False))
        f.write("\n\n")

        # ── Winner Summary ────────────────────────────────────────────────────
        f.write(f"{LINE}\n PRODUCTION MODEL: {winner.upper()}\n{LINE}\n")
        winner_pruned = pruned_df[pruned_df["model_name"] == winner]
        winner_base   = baseline_df[baseline_df["model_name"] == winner]
        if not winner_pruned.empty:
            wp = winner_pruned.iloc[0]
            wb = winner_base.iloc[0] if not winner_base.empty else {}
            f.write(f"  {'Metric':<14} {'Baseline':>10} {'Pruned':>10} {'Δ':>8}\n")
            f.write(f"  {SEP}\n")
            for m in ["test_accuracy","test_precision","test_recall","test_f1","test_roc_auc"]:
                label = m.replace("test_","").capitalize()
                b_val = wb.get(m, 0) if isinstance(wb, dict) or hasattr(wb, 'get') else wb[m]
                p_val = wp.get(m, 0)
                f.write(f"  {label:<14} {float(b_val):>10.4f} {p_val:>10.4f} {p_val-float(b_val):>+8.4f}\n")

        lc_w = lc_results.get(winner, {})
        f.write(f"\n  Bias-Variance : {lc_w.get('diagnosis','N/A')}")
        f.write(f"  (train={lc_w.get('train_final',0):.4f}, ")
        f.write(f"val={lc_w.get('val_final',0):.4f}, ")
        f.write(f"gap={lc_w.get('gap',0):+.4f})\n")

        vc_w = vc_results.get(winner, {})
        f.write(f"  Best hyperparam: {vc_w.get('param_name','?')}={vc_w.get('best_value','?')}\n")
        f.write(f"  Saved to       : models/final/{winner.lower().replace(' ','_')}_final.pkl\n\n")

        # ── Plots ─────────────────────────────────────────────────────────────
        f.write(f"{LINE}\n GENERATED PLOTS\n{LINE}\n")
        for p in sorted(plot_dir.glob("*.png")):
            f.write(f"  {p.name}\n")

        f.write(f"\n{LINE}\n END OF FINAL MODEL REPORT\n{LINE}\n")

    logger.info("Final report written to: %s", output_dir.resolve())


def main():
    args = parse_args()

    REFINEMENT_DIR.mkdir(parents=True, exist_ok=True)
    PLOT_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_MODEL_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 70)
    logger.info("ASTRAM — MODEL REFINEMENT & FINAL SELECTION")
    logger.info("=" * 70)

    # ── Check explainability outputs exist ────────────────────────────────────
    influence_path = EXPLAIN_DIR / "feature_influence_table.csv"
    shap_path      = EXPLAIN_DIR / "shap_mean_abs_importance.csv"
    perm_path      = EXPLAIN_DIR / "permutation_importance.csv"

    for p in [influence_path, shap_path, perm_path]:
        if not p.exists():
            logger.error("Missing explainability file: %s", p)
            logger.error("Run run_explainability.py first.")
            sys.exit(1)

    # ── Load data ─────────────────────────────────────────────────────────────
    X_train_raw, y_train, X_test_raw, y_test = load_data()
    baseline_df = load_baseline()

    # ── Step 1: Identify weak features ───────────────────────────────────────
    logger.info("─" * 50)
    logger.info("STEP 1: Identifying weak features...")
    weak_features, pruned_features, weak_df = identify_weak_features(
        influence_path = influence_path,
        shap_path      = shap_path,
        perm_path      = perm_path,
        weak_pct       = args.weak_pct,
        shap_threshold = args.shap_thr,
        perm_threshold = args.perm_thr,
    )
    logger.info("Weak features (%d): %s", len(weak_features), weak_features)
    logger.info("Pruned set: %d features", len(pruned_features))

    weak_df.to_csv(REFINEMENT_DIR / "weak_features.csv", index=False)
    pd.DataFrame({"feature": pruned_features}).to_csv(
        REFINEMENT_DIR / "pruned_feature_set.csv", index=False
    )

    # ── Prepare pruned matrices ───────────────────────────────────────────────
    X_tr = prepare_features(X_train_raw, pruned_features, DROP_COLS_FROM_FEATURES)
    X_te = prepare_features(X_test_raw,  pruned_features, DROP_COLS_FROM_FEATURES)
    logger.info("Pruned matrix: train=%s test=%s", X_tr.shape, X_te.shape)

    # ── Step 2: Select models to retrain ─────────────────────────────────────
    if args.models:
        retrain_names = [m.strip() for m in args.models.split(",")]
    else:
        # Top-3 by CV-AUC from baseline
        retrain_names = (
            baseline_df.sort_values("cv_roc_auc_mean", ascending=False)
            .head(3)["model_name"].tolist()
        )
    logger.info("─" * 50)
    logger.info("STEP 2: Retraining models: %s", retrain_names)

    model_zoo = get_model_zoo()
    cv = StratifiedKFold(n_splits=args.cv_splits, shuffle=True, random_state=args.seed)

    retrain_results = []
    retrain_models_fitted = {}

    for name in retrain_names:
        if name not in model_zoo:
            logger.warning("'%s' not in model zoo. Skipping.", name)
            continue

        model = model_zoo[name]
        safe  = name.lower().replace(" ", "_")
        save_path = FINAL_MODEL_DIR / f"{safe}_pruned.pkl"

        logger.info("  Training: %s on %d features...", name, X_tr.shape[1])
        t0 = time.time()
        result = retrain_model(name, model, X_tr.values, y_train.values,
                               X_te.values, y_test.values, cv, save_path)
        logger.info(
            "  Done in %.1fs | AUC=%.4f | F1=%.4f | Rec=%.4f",
            time.time() - t0, result["test_roc_auc"],
            result["test_f1"], result["test_recall"],
        )
        retrain_results.append(result)
        retrain_models_fitted[name] = model

    pruned_df = pd.DataFrame(retrain_results)
    pruned_df.to_csv(REFINEMENT_DIR / "pruned_model_results.csv", index=False)

    # ── Step 3: Learning Curves ───────────────────────────────────────────────
    logger.info("─" * 50)
    logger.info("STEP 3: Learning Curves (bias-variance diagnosis)...")
    lc_results = plot_learning_curves(
        models     = retrain_models_fitted,
        X_train    = X_tr.values,
        y_train    = y_train.values,
        cv         = cv,
        save_path  = PLOT_DIR / "learning_curves.png",
        scoring    = args.lc_scoring,
        train_sizes= np.linspace(0.10, 1.0, 10),
    )

    # ── Step 4: Validation Curves ─────────────────────────────────────────────
    logger.info("─" * 50)
    logger.info("STEP 4: Validation Curves (hyperparameter sensitivity)...")
    vc_results = plot_validation_curves(
        models    = retrain_models_fitted,
        X_train   = X_tr.values,
        y_train   = y_train.values,
        cv        = cv,
        save_path = PLOT_DIR / "validation_curves.png",
        scoring   = args.lc_scoring,
    )

    # ── Step 5: Baseline vs Pruned comparison ─────────────────────────────────
    logger.info("─" * 50)
    logger.info("STEP 5: Baseline vs. Pruned comparison...")

    # Filter baseline to same models
    base_sub = baseline_df[baseline_df["model_name"].isin(retrain_names)].copy()
    plot_performance_comparison(
        baseline_df = base_sub,
        pruned_df   = pruned_df,
        save_path   = PLOT_DIR / "baseline_vs_pruned.png",
    )

    # ── Step 6: Final model selection ─────────────────────────────────────────
    logger.info("─" * 50)
    logger.info("STEP 6: Final model selection...")
    winner, scores_df = select_final_model(pruned_df, lc_results, vc_results)
    scores_df.to_csv(REFINEMENT_DIR / "model_selection_scores.csv", index=False)

    # ── Save final production model ───────────────────────────────────────────
    if winner in retrain_models_fitted:
        final_path = FINAL_MODEL_DIR / f"{winner.lower().replace(' ', '_')}_final.pkl"
        with open(final_path, "wb") as f:
            pickle.dump(retrain_models_fitted[winner], f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Final model saved: %s", final_path)

    # ── Write full report ─────────────────────────────────────────────────────
    logger.info("─" * 50)
    logger.info("STEP 7: Generating final report...")
    write_final_report(
        weak_df        = weak_df,
        weak_features  = weak_features,
        pruned_features= pruned_features,
        pruned_df      = pruned_df,
        baseline_df    = baseline_df,
        lc_results     = lc_results,
        vc_results     = vc_results,
        scores_df      = scores_df,
        winner         = winner,
        output_dir     = REFINEMENT_DIR,
        plot_dir       = PLOT_DIR,
    )

    # ── Console summary ───────────────────────────────────────────────────────
    logger.info("\n%s\nFINAL MODEL: %s\n%s", "=" * 70, winner.upper(), "=" * 70)
    w_row = pruned_df[pruned_df["model_name"] == winner].iloc[0]
    logger.info(
        "  AUC=%.4f | F1=%.4f | Recall=%.4f | Precision=%.4f | Acc=%.4f",
        w_row["test_roc_auc"], w_row["test_f1"],
        w_row["test_recall"],  w_row["test_precision"], w_row["test_accuracy"],
    )
    logger.info("  B-V Diagnosis: %s", lc_results.get(winner, {}).get("diagnosis", "N/A"))

    logger.info("\n%s\nOUTPUTS\n%s", "=" * 70, "=" * 70)
    logger.info("  output/refinement/weak_features.csv")
    logger.info("  output/refinement/pruned_feature_set.csv")
    logger.info("  output/refinement/pruned_model_results.csv")
    logger.info("  output/refinement/model_selection_scores.csv")
    logger.info("  output/refinement/final_model_report.txt")
    logger.info("  output/refinement/plots/learning_curves.png")
    logger.info("  output/refinement/plots/validation_curves.png")
    logger.info("  output/refinement/plots/baseline_vs_pruned.png")
    logger.info("  models/final/%s_final.pkl", winner.lower().replace(" ", "_"))

    return winner, pruned_df, scores_df


if __name__ == "__main__":
    main()
