"""
models/hpo_reporter.py
=======================
Generates the HPO improvement report:
  - Best parameters per model per objective
  - Best CV scores vs hold-out test scores
  - Improvement delta table (tuned vs baseline)
  - Full comparison CSV
  - Human-readable text summary
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

OBJECTIVES = ["f1", "recall", "roc_auc"]
ALL_METRICS = ["accuracy", "precision", "recall", "f1", "roc_auc"]


def build_improvement_table(all_results: dict) -> pd.DataFrame:
    """
    Flatten the nested all_results dict into a tidy improvement DataFrame.

    Columns: model, objective, baseline_test, tuned_test, delta, pct_change,
             best_source, rand_cv_score, grid_cv_score,
             tuned_accuracy, tuned_precision, tuned_recall, tuned_f1, tuned_roc_auc
    """
    rows = []
    for model_name, model_data in all_results.items():
        for obj, imp in model_data.get("improvement", {}).items():
            test_m = imp.get("best_test_metrics", {})
            rows.append({
                "model":          model_name,
                "objective":      obj,
                "baseline_test":  imp.get("baseline_test", np.nan),
                "tuned_test":     imp.get("tuned_test",    np.nan),
                "delta":          imp.get("delta",         np.nan),
                "pct_change":     imp.get("pct_change",    np.nan),
                "best_source":    imp.get("best_source",   ""),
                "rand_cv_score":  imp.get("rand_cv_score", np.nan),
                "grid_cv_score":  imp.get("grid_cv_score", np.nan),
                "tuned_accuracy": test_m.get("accuracy",  np.nan),
                "tuned_precision":test_m.get("precision", np.nan),
                "tuned_recall":   test_m.get("recall",    np.nan),
                "tuned_f1":       test_m.get("f1",        np.nan),
                "tuned_roc_auc":  test_m.get("roc_auc",   np.nan),
            })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(["objective", "delta"], ascending=[True, False]).reset_index(drop=True)
    return df


def build_best_params_table(all_results: dict) -> pd.DataFrame:
    """
    Produce a table of best parameters per model × objective × search_type.
    """
    rows = []
    for model_name, model_data in all_results.items():
        rand = model_data.get("rand", {})
        grid = model_data.get("grid", {})
        for obj in OBJECTIVES:
            for source, results in [("RandomSearch", rand), ("GridSearch", grid)]:
                params = results.get(f"{obj}_{source.lower().replace('search','')}_best_params")
                if params is None:
                    # Try alternate key format
                    key = f"{obj}_rand_best_params" if source == "RandomSearch" else f"{obj}_grid_best_params"
                    params = results.get(key, {})
                cv_key = f"{obj}_rand_best_cv_score" if source == "RandomSearch" else f"{obj}_grid_best_cv_score"
                cv_score = results.get(cv_key, np.nan)
                rows.append({
                    "model":       model_name,
                    "objective":   obj,
                    "search_type": source,
                    "cv_score":    round(float(cv_score), 6) if not np.isnan(float(cv_score) if cv_score is not None else float("nan")) else np.nan,
                    "params":      str(params) if params else "",
                })
    return pd.DataFrame(rows)


def write_hpo_report(
    all_results:    dict,
    improvement_df: pd.DataFrame,
    best_params_df: pd.DataFrame,
    baseline_df:    pd.DataFrame,
    output_dir:     Path,
) -> None:
    """Write all HPO outputs: CSVs + formatted text report."""
    output_dir.mkdir(parents=True, exist_ok=True)

    improvement_df.to_csv(output_dir / "hpo_improvement_table.csv",  index=False)
    best_params_df.to_csv(output_dir / "hpo_best_params.csv",        index=False)
    logger.info("Saved: hpo_improvement_table.csv, hpo_best_params.csv")

    LINE = "=" * 88
    SEP  = "-" * 88

    with open(output_dir / "hpo_report.txt", "w", encoding="utf-8") as f:

        f.write(f"{LINE}\n")
        f.write("ASTRAM TRAFFIC EVENT — HYPERPARAMETER OPTIMIZATION REPORT\n")
        f.write(f"{LINE}\n\n")
        f.write("Strategy:\n")
        f.write("  Stage 1 — RandomizedSearchCV  (60 iterations, wide scipy distributions)\n")
        f.write("  Stage 2 — GridSearchCV         (focused neighbourhood grid from Stage 1)\n")
        f.write("  CV      — 5-Fold Stratified\n")
        f.write("  Objectives optimised: F1 Score | Recall | ROC AUC\n\n")

        models_done = list(all_results.keys())
        f.write(f"Models tuned: {', '.join(models_done)}\n\n")

        # ── Improvement Summary Table ─────────────────────────────────────────
        f.write(f"{LINE}\n IMPROVEMENT SUMMARY (tuned test score vs. baseline test score)\n{LINE}\n")
        f.write(f"  {'Model':<25} {'Objective':<10} {'Baseline':>10} {'Tuned':>10} "
                f"{'Δ':>8} {'%Chg':>8} {'Source':<14}\n")
        f.write(f"  {SEP}\n")
        for _, row in improvement_df.iterrows():
            delta_str = f"{row['delta']:+.4f}" if not pd.isna(row['delta']) else "   N/A"
            pct_str   = f"{row['pct_change']:+.1f}%" if not pd.isna(row['pct_change']) else "  N/A"
            f.write(
                f"  {row['model']:<25} {row['objective']:<10} "
                f"{row['baseline_test']:>10.4f} {row['tuned_test']:>10.4f} "
                f"{delta_str:>8} {pct_str:>8} {row.get('best_source',''):>14}\n"
            )
        f.write("\n")

        # ── Per-model Detail ──────────────────────────────────────────────────
        for model_name, model_data in all_results.items():
            f.write(f"{LINE}\n MODEL: {model_name}\n{LINE}\n")

            baseline = model_data.get("baseline", {})
            f.write("  Baseline (test set):\n")
            for m in ALL_METRICS:
                f.write(f"    {m:<12}: {baseline.get(m, 'N/A')}\n")
            f.write("\n")

            rand = model_data.get("rand", {})
            grid = model_data.get("grid", {})

            for obj in OBJECTIVES:
                f.write(f"  ┌─ Objective: {obj.upper()} {'─'*50}\n")

                # RandomSearch
                r_params = rand.get(f"{obj}_rand_best_params", {})
                r_cv     = rand.get(f"{obj}_rand_best_cv_score", np.nan)
                r_test   = rand.get(f"{obj}_rand_test_metrics",  {})
                f.write(f"  │  [RandomSearch]\n")
                f.write(f"  │    CV Score   : {r_cv:.4f}\n" if not _isnan(r_cv) else "  │    CV Score   : N/A\n")
                f.write(f"  │    Test Acc   : {r_test.get('accuracy',  'N/A')}\n")
                f.write(f"  │    Test Prec  : {r_test.get('precision', 'N/A')}\n")
                f.write(f"  │    Test Rec   : {r_test.get('recall',    'N/A')}\n")
                f.write(f"  │    Test F1    : {r_test.get('f1',        'N/A')}\n")
                f.write(f"  │    Test AUC   : {r_test.get('roc_auc',   'N/A')}\n")
                if r_params:
                    f.write(f"  │    Best Params:\n")
                    for k, v in sorted(r_params.items()):
                        f.write(f"  │      {k}: {v}\n")
                f.write("  │\n")

                # GridSearch
                g_params = grid.get(f"{obj}_grid_best_params", {})
                g_cv     = grid.get(f"{obj}_grid_best_cv_score", np.nan)
                g_test   = grid.get(f"{obj}_grid_test_metrics",  {})
                f.write(f"  │  [GridSearch]\n")
                f.write(f"  │    CV Score   : {g_cv:.4f}\n" if not _isnan(g_cv) else "  │    CV Score   : N/A\n")
                f.write(f"  │    Test Acc   : {g_test.get('accuracy',  'N/A')}\n")
                f.write(f"  │    Test Prec  : {g_test.get('precision', 'N/A')}\n")
                f.write(f"  │    Test Rec   : {g_test.get('recall',    'N/A')}\n")
                f.write(f"  │    Test F1    : {g_test.get('f1',        'N/A')}\n")
                f.write(f"  │    Test AUC   : {g_test.get('roc_auc',   'N/A')}\n")
                if g_params:
                    f.write(f"  │    Best Params:\n")
                    for k, v in sorted(g_params.items()):
                        f.write(f"  │      {k}: {v}\n")

                # Improvement
                imp = model_data.get("improvement", {}).get(obj, {})
                delta = imp.get("delta", np.nan)
                pct   = imp.get("pct_change", np.nan)
                src   = imp.get("best_source", "?")
                f.write(f"  │\n")
                f.write(f"  │  Net improvement ({src}): Δ{obj}={delta:+.4f}  ({pct:+.1f}%)\n"
                        if not _isnan(delta) else "  │  Net improvement: N/A\n")
                f.write(f"  └{'─'*64}\n\n")

            # Saved tuned models
            saved = model_data.get("saved", {})
            if saved:
                f.write("  Saved tuned models:\n")
                for obj, info in saved.items():
                    f.write(f"    [{obj}] {info.get('path','?')}  (source: {info.get('source','?')})\n")
            f.write("\n")

        # ── Per-Metric Best Overall ───────────────────────────────────────────
        f.write(f"{LINE}\n BEST TUNED MODEL PER METRIC\n{LINE}\n")
        for obj in OBJECTIVES:
            sub = improvement_df[improvement_df["objective"] == obj]
            if sub.empty:
                continue
            best_row = sub.loc[sub["tuned_test"].idxmax()]
            f.write(
                f"  Best {obj.upper():<10}: {best_row['model']:<25} "
                f"tuned={best_row['tuned_test']:.4f}  "
                f"baseline={best_row['baseline_test']:.4f}  "
                f"Δ={best_row['delta']:+.4f}\n"
            )
        f.write("\n")

        f.write(f"{LINE}\n END OF HPO REPORT\n{LINE}\n")

    logger.info("HPO report written to: %s", output_dir.resolve())


def _isnan(v) -> bool:
    try:
        return np.isnan(float(v))
    except Exception:
        return True


def print_hpo_console_summary(improvement_df: pd.DataFrame) -> None:
    """Print a compact improvement table to the console."""
    logger.info("\n%s\nHPO IMPROVEMENT SUMMARY\n%s", "=" * 88, "=" * 88)
    if improvement_df.empty:
        logger.info("No results to display.")
        return
    disp = improvement_df[[
        "model", "objective", "baseline_test", "tuned_test", "delta", "pct_change", "best_source"
    ]].copy()
    disp.columns = ["Model", "Objective", "Baseline", "Tuned", "Δ", "%Chg", "Source"]
    logger.info("\n%s", disp.to_string(index=False))
