"""
models/reporter.py
===================
Generates the final model comparison report tables and ranking.

Outputs
-------
  model_comparison.csv          — Full metrics table (CV + test), ranked by AUC
  model_ranking.csv             — Compact ranking table for all 5 metrics
  model_comparison_summary.txt  — Human-readable formatted report
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

logger = logging.getLogger(__name__)

# Metric display names
METRIC_DISPLAY = {
    "test_accuracy":  "Accuracy",
    "test_precision": "Precision",
    "test_recall":    "Recall",
    "test_f1":        "F1 Score",
    "test_roc_auc":   "ROC AUC",
}


def _rank_col(series: pd.Series, ascending: bool = False) -> pd.Series:
    """Rank a metric column (1 = best). All metrics: higher is better."""
    return series.rank(ascending=ascending, method="min").astype(int)


def build_ranking_table(comparison_df: pd.DataFrame) -> pd.DataFrame:
    """
    Build a composite ranking table.

    For each model, compute its rank on each of the 5 test metrics,
    then compute an overall_rank from the sum of individual ranks (lower = better).
    """
    df = comparison_df[["model_name"] + list(METRIC_DISPLAY.keys())].copy()

    # Per-metric ranks
    for col in METRIC_DISPLAY:
        df[f"rank_{col.replace('test_','')}"] = _rank_col(df[col])

    rank_cols = [f"rank_{m.replace('test_','')}" for m in METRIC_DISPLAY]
    df["rank_sum"]     = df[rank_cols].sum(axis=1)
    df["overall_rank"] = df["rank_sum"].rank(method="min").astype(int)

    df = df.sort_values("overall_rank").reset_index(drop=True)
    return df


def write_report(
    comparison_df:  pd.DataFrame,
    ranking_df:     pd.DataFrame,
    output_dir:     Path,
    results_list:   list[dict],
) -> None:
    """Write all CSVs and the formatted text summary."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── CSVs ─────────────────────────────────────────────────────────────────
    comparison_df.to_csv(output_dir / "model_comparison.csv", index=False)
    ranking_df.to_csv(   output_dir / "model_ranking.csv",    index=False)
    logger.info("Saved: model_comparison.csv, model_ranking.csv")

    # ── Text Report ───────────────────────────────────────────────────────────
    LINE  = "=" * 90
    SEP   = "-" * 90

    with open(output_dir / "model_comparison_summary.txt", "w", encoding="utf-8") as f:

        f.write(f"{LINE}\n")
        f.write("ASTRAM TRAFFIC EVENT — MACHINE LEARNING MODEL COMPARISON REPORT\n")
        f.write(f"{LINE}\n\n")
        f.write("Task       : Binary Classification (requires_road_closure)\n")
        f.write("Split      : Stratified 80/20 train-test\n")
        f.write("Validation : 5-Fold Stratified Cross-Validation on training set\n")
        f.write("Imbalance  : 12.35:1 (negative:positive) — class weights applied\n")
        f.write("Features   : Top-30 ensemble-consensus features from feature selection\n\n")

        # ── Model Ranking Table ───────────────────────────────────────────────
        f.write(f"{LINE}\n OVERALL MODEL RANKING (by composite rank across all 5 metrics)\n{LINE}\n")
        rank_display = ranking_df[[
            "overall_rank", "model_name",
            "test_accuracy", "test_precision", "test_recall", "test_f1", "test_roc_auc",
            "rank_accuracy", "rank_precision", "rank_recall", "rank_f1", "rank_roc_auc",
            "rank_sum",
        ]].copy()
        rank_display.columns = [
            "Rank", "Model",
            "Accuracy", "Precision", "Recall", "F1", "ROC-AUC",
            "Rk-Acc", "Rk-Pre", "Rk-Rec", "Rk-F1", "Rk-AUC",
            "RankSum",
        ]
        f.write(rank_display.to_string(index=False))
        f.write("\n\n")

        # ── Test Set Performance ──────────────────────────────────────────────
        f.write(f"{LINE}\n HOLD-OUT TEST SET PERFORMANCE\n{LINE}\n")
        test_cols = ["model_name", "test_accuracy", "test_precision",
                     "test_recall", "test_f1", "test_roc_auc"]
        test_disp = comparison_df[test_cols].copy()
        test_disp.columns = ["Model", "Accuracy", "Precision", "Recall", "F1", "ROC-AUC"]
        f.write(test_disp.to_string(index=False))
        f.write("\n\n")

        # ── CV Summary ────────────────────────────────────────────────────────
        f.write(f"{LINE}\n 5-FOLD CROSS-VALIDATION SUMMARY (mean ± std)\n{LINE}\n")
        cv_rows = []
        for _, row in comparison_df.iterrows():
            cv_rows.append({
                "Model":    row["model_name"],
                "CV-Acc":   f"{row['cv_accuracy_mean']:.4f}±{row['cv_accuracy_std']:.4f}",
                "CV-Pre":   f"{row['cv_precision_mean']:.4f}±{row['cv_precision_std']:.4f}",
                "CV-Rec":   f"{row['cv_recall_mean']:.4f}±{row['cv_recall_std']:.4f}",
                "CV-F1":    f"{row['cv_f1_mean']:.4f}±{row['cv_f1_std']:.4f}",
                "CV-AUC":   f"{row['cv_roc_auc_mean']:.4f}±{row['cv_roc_auc_std']:.4f}",
            })
        f.write(pd.DataFrame(cv_rows).to_string(index=False))
        f.write("\n\n")

        # ── Confusion Matrices ────────────────────────────────────────────────
        f.write(f"{LINE}\n CONFUSION MATRICES (Test Set)\n{LINE}\n")
        f.write(f"  {'Model':<30} {'TN':>6} {'FP':>6} {'FN':>6} {'TP':>6} "
                f"{'Specificity':>12} {'Sensitivity':>12}\n")
        f.write(f"  {SEP}\n")
        for _, row in comparison_df.iterrows():
            tn, fp, fn, tp = row["tn"], row["fp"], row["fn"], row["tp"]
            specificity  = tn / (tn + fp) if (tn + fp) > 0 else 0
            sensitivity  = tp / (tp + fn) if (tp + fn) > 0 else 0
            f.write(
                f"  {row['model_name']:<30} {int(tn):>6} {int(fp):>6} "
                f"{int(fn):>6} {int(tp):>6} {specificity:>12.4f} {sensitivity:>12.4f}\n"
            )
        f.write("\n")

        # ── Per-Metric Rankings ───────────────────────────────────────────────
        f.write(f"{LINE}\n PER-METRIC TOP-3 MODELS\n{LINE}\n")
        for metric_col, metric_name in METRIC_DISPLAY.items():
            top3 = comparison_df.nlargest(3, metric_col)[["model_name", metric_col]]
            f.write(f"\n  [{metric_name}]\n")
            for i, (_, row) in enumerate(top3.iterrows(), 1):
                f.write(f"    {i}. {row['model_name']:<30} {row[metric_col]:.6f}\n")

        f.write("\n")

        # ── Training Times ────────────────────────────────────────────────────
        f.write(f"{LINE}\n TRAINING TIMES\n{LINE}\n")
        time_disp = comparison_df[["model_name", "cv_time_s", "fit_time_s", "total_time_s"]].copy()
        time_disp.columns = ["Model", "CV Time (s)", "Fit Time (s)", "Total Time (s)"]
        time_disp = time_disp.sort_values("Total Time (s)")
        f.write(time_disp.to_string(index=False))
        f.write("\n\n")

        # ── Winner Summary ───────────────────────────────────────────────────
        f.write(f"{LINE}\n SUMMARY\n{LINE}\n")
        best_auc   = comparison_df.loc[comparison_df["test_roc_auc"].idxmax(),   "model_name"]
        best_f1    = comparison_df.loc[comparison_df["test_f1"].idxmax(),        "model_name"]
        best_rec   = comparison_df.loc[comparison_df["test_recall"].idxmax(),    "model_name"]
        best_prec  = comparison_df.loc[comparison_df["test_precision"].idxmax(), "model_name"]
        best_over  = ranking_df.iloc[0]["model_name"]
        fastest    = comparison_df.loc[comparison_df["total_time_s"].idxmin(),   "model_name"]

        f.write(f"  Best ROC-AUC        : {best_auc}\n")
        f.write(f"  Best F1 Score       : {best_f1}\n")
        f.write(f"  Best Recall         : {best_rec}\n")
        f.write(f"  Best Precision      : {best_prec}\n")
        f.write(f"  Best Overall (rank) : {best_over}\n")
        f.write(f"  Fastest model       : {fastest}\n\n")

        f.write(f"{LINE}\n END OF REPORT\n{LINE}\n")

    logger.info("Report written to: %s", output_dir.resolve())


def print_console_summary(comparison_df: pd.DataFrame, ranking_df: pd.DataFrame) -> None:
    """Print a concise ranked table to the console."""
    logger.info("\n%s\nMODEL COMPARISON — TEST SET RESULTS (ranked by ROC-AUC)\n%s",
                "=" * 90, "=" * 90)
    disp = comparison_df[[
        "rank", "model_name",
        "test_accuracy", "test_precision", "test_recall", "test_f1", "test_roc_auc",
        "cv_roc_auc_mean", "cv_f1_mean",
    ]].copy()
    disp.columns = [
        "Rank", "Model",
        "Acc", "Prec", "Rec", "F1", "AUC",
        "CV-AUC(mean)", "CV-F1(mean)",
    ]
    logger.info("\n%s", disp.to_string(index=False))

    logger.info("\n%s\nOVERALL RANKING (composite across all 5 metrics)\n%s",
                "=" * 90, "=" * 90)
    rank_disp = ranking_df[[
        "overall_rank", "model_name",
        "rank_accuracy", "rank_precision", "rank_recall", "rank_f1", "rank_roc_auc",
        "rank_sum",
    ]].copy()
    rank_disp.columns = [
        "OverallRank", "Model",
        "Rk-Acc", "Rk-Pre", "Rk-Rec", "Rk-F1", "Rk-AUC", "RankSum",
    ]
    logger.info("\n%s", rank_disp.to_string(index=False))
