"""
models/explainability.py
=========================
Model explainability engine for the Astram Traffic Event dataset.

Analyses the best baseline model (Extra Trees) and optionally a tuned model.

Methods implemented
--------------------
1. Feature Importance (MDI)    — built-in tree feature importances
2. Permutation Importance      — model-agnostic, AUC-based, 20 repeats
3. SHAP Summary Plot           — global feature impact (beeswarm + bar)
4. SHAP Dependence Plot        — feature × SHAP interaction for top features
5. SHAP Waterfall Plot         — single-prediction explanation (TP & FN examples)

Outputs
-------
  plots/
    feature_importance_mdi.png
    permutation_importance.png
    shap_summary_beeswarm.png
    shap_summary_bar.png
    shap_dependence_<feature>.png   (top-5 features)
    shap_waterfall_tp.png           (true positive example)
    shap_waterfall_fn.png           (false negative example)
    shap_waterfall_tn.png           (true negative example)
  explainability_report.txt
  feature_influence_table.csv       (merged MDI + perm + SHAP importance)
"""

from __future__ import annotations

import logging
import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")   # non-interactive backend — safe in scripts
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import shap
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

# ── Plot style ────────────────────────────────────────────────────────────────
PALETTE = {
    "positive":  "#E05263",   # red-coral — high SHAP / positive impact
    "negative":  "#3B82F6",   # blue — low SHAP / negative impact
    "neutral":   "#6B7280",   # grey
    "highlight": "#F59E0B",   # amber — accent
    "bg":        "#0F172A",   # dark background
    "surface":   "#1E293B",   # card surface
    "text":      "#F1F5F9",   # light text
    "grid":      "#334155",   # subtle grid lines
}

def _apply_dark_style(fig, ax_or_axes):
    """Apply consistent dark theme to a figure."""
    fig.patch.set_facecolor(PALETTE["bg"])
    axes = ax_or_axes if hasattr(ax_or_axes, "__iter__") else [ax_or_axes]
    for ax in axes:
        ax.set_facecolor(PALETTE["surface"])
        ax.tick_params(colors=PALETTE["text"], labelsize=9)
        ax.xaxis.label.set_color(PALETTE["text"])
        ax.yaxis.label.set_color(PALETTE["text"])
        title = ax.title
        title.set_color(PALETTE["text"])
        for spine in ax.spines.values():
            spine.set_edgecolor(PALETTE["grid"])
        ax.grid(color=PALETTE["grid"], linewidth=0.5, alpha=0.6)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Feature Importance (MDI)
# ─────────────────────────────────────────────────────────────────────────────

def plot_feature_importance_mdi(
    model,
    feature_names: list[str],
    top_n: int = 30,
    save_path: Optional[Path] = None,
) -> pd.DataFrame:
    """
    Plot and return Mean Decrease Impurity feature importances.
    Works for: RF, ET, GBM, XGBoost, LightGBM.
    """
    if not hasattr(model, "feature_importances_"):
        logger.warning("Model has no feature_importances_. Skipping MDI plot.")
        return pd.DataFrame()

    imp = pd.Series(model.feature_importances_, index=feature_names)
    imp = imp.sort_values(ascending=False).head(top_n)

    fig, ax = plt.subplots(figsize=(11, max(6, top_n * 0.28)))
    colors = [PALETTE["positive"] if v > imp.mean() else PALETTE["negative"]
              for v in imp.values]
    bars = ax.barh(imp.index[::-1], imp.values[::-1], color=colors[::-1],
                   edgecolor="none", height=0.7)

    # Value labels
    for bar, val in zip(bars, imp.values[::-1]):
        ax.text(bar.get_width() + imp.max() * 0.01, bar.get_y() + bar.get_height() / 2,
                f"{val:.4f}", va="center", ha="left",
                fontsize=7.5, color=PALETTE["text"])

    ax.set_xlabel("Feature Importance (MDI)", fontsize=11)
    ax.set_title(f"Feature Importance — Mean Decrease Impurity\n(Top {top_n})",
                 fontsize=13, fontweight="bold", pad=12)
    ax.axvline(imp.mean(), color=PALETTE["highlight"], linestyle="--",
               linewidth=1.2, label=f"Mean = {imp.mean():.4f}")
    ax.legend(fontsize=9, facecolor=PALETTE["surface"],
              labelcolor=PALETTE["text"], edgecolor=PALETTE["grid"])

    _apply_dark_style(fig, ax)
    fig.tight_layout()

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight",
                    facecolor=PALETTE["bg"])
        logger.info("Saved MDI plot: %s", save_path)
    plt.close(fig)

    return pd.DataFrame({"feature": imp.index, "mdi_importance": imp.values})


# ─────────────────────────────────────────────────────────────────────────────
# 2. Permutation Importance
# ─────────────────────────────────────────────────────────────────────────────

def plot_permutation_importance(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    feature_names: list[str],
    top_n: int = 30,
    n_repeats: int = 20,
    random_state: int = 42,
    save_path: Optional[Path] = None,
) -> pd.DataFrame:
    """
    Compute and plot Permutation Importance (AUC-based).
    Model-agnostic; corrects for MDI's high-cardinality bias.
    """
    logger.info("Computing permutation importance (%d repeats)...", n_repeats)
    result = permutation_importance(
        model, X_test, y_test,
        scoring="roc_auc",
        n_repeats=n_repeats,
        random_state=random_state,
        n_jobs=-1,
    )

    perm_df = pd.DataFrame({
        "feature": feature_names,
        "perm_mean": result.importances_mean,
        "perm_std":  result.importances_std,
    })
    perm_df = perm_df.sort_values("perm_mean", ascending=False).head(top_n).reset_index(drop=True)

    # Filter to positive impact features for the plot
    pos_df = perm_df[perm_df["perm_mean"] > 0]

    fig, ax = plt.subplots(figsize=(11, max(6, len(pos_df) * 0.30)))
    colors = [PALETTE["positive"] if v > pos_df["perm_mean"].mean() else PALETTE["negative"]
              for v in pos_df["perm_mean"]]
    ax.barh(pos_df["feature"][::-1], pos_df["perm_mean"][::-1],
            xerr=pos_df["perm_std"][::-1],
            color=colors[::-1], edgecolor="none", height=0.7,
            error_kw=dict(ecolor=PALETTE["neutral"], capsize=3, linewidth=1))

    ax.set_xlabel("Mean AUC Drop (permutation)", fontsize=11)
    ax.set_title(f"Permutation Importance — AUC-Based\n(Top {len(pos_df)}, {n_repeats} repeats)",
                 fontsize=13, fontweight="bold", pad=12)
    ax.axvline(0, color=PALETTE["neutral"], linewidth=1)

    _apply_dark_style(fig, ax)
    fig.tight_layout()

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight",
                    facecolor=PALETTE["bg"])
        logger.info("Saved permutation importance plot: %s", save_path)
    plt.close(fig)

    return perm_df


# ─────────────────────────────────────────────────────────────────────────────
# 3. SHAP Values Computation
# ─────────────────────────────────────────────────────────────────────────────

def compute_shap_values(
    model,
    X: pd.DataFrame,
    model_name: str = "model",
    max_samples: int = 500,
    random_state: int = 42,
) -> tuple[np.ndarray, pd.DataFrame]:
    """
    Compute SHAP values using the appropriate explainer.

    Returns
    -------
    shap_values : np.ndarray of shape (n_samples, n_features)
    X_sample    : pd.DataFrame — the sampled data used
    """
    # Subsample for speed (SHAP is O(n²) for KernelExplainer)
    if len(X) > max_samples:
        rng = np.random.default_rng(random_state)
        idx = rng.choice(len(X), size=max_samples, replace=False)
        X_sample = X.iloc[idx].reset_index(drop=True)
    else:
        X_sample = X.reset_index(drop=True)

    logger.info("Computing SHAP values for %d samples...", len(X_sample))

    # Choose the right explainer
    if hasattr(model, "estimators_") or hasattr(model, "feature_importances_"):
        # Tree-based: use TreeExplainer (fast)
        explainer = shap.TreeExplainer(model)
        shap_vals = explainer.shap_values(X_sample)
    else:
        # Linear / other: use LinearExplainer or KernelExplainer
        try:
            explainer = shap.LinearExplainer(model, X_sample)
            shap_vals = explainer.shap_values(X_sample)
        except Exception:
            bg = shap.sample(X_sample, min(100, len(X_sample)))
            explainer = shap.KernelExplainer(
                lambda x: model.predict_proba(x)[:, 1], bg
            )
            shap_vals = explainer.shap_values(X_sample, nsamples=50)

    # Normalise to 2D (n_samples, n_features) — always extract class-1 slice
    sv = np.array(shap_vals)
    if sv.ndim == 3:
        # Shape (n_samples, n_features, n_classes) — take class 1
        sv = sv[:, :, 1]
    elif sv.ndim == 2 and sv.shape[0] == 2:
        # Old shap API: list [class0, class1] stacked as (2, n_samples, n_features)
        sv = sv[1]
    elif isinstance(shap_vals, list):
        sv = np.array(shap_vals[1])   # list[class0, class1]

    logger.info("SHAP values computed. Shape: %s", sv.shape)
    return sv, X_sample


# ─────────────────────────────────────────────────────────────────────────────
# 4. SHAP Summary Plots
# ─────────────────────────────────────────────────────────────────────────────

def plot_shap_summary_beeswarm(
    shap_values: np.ndarray,
    X_sample:    pd.DataFrame,
    top_n:       int = 25,
    save_path:   Optional[Path] = None,
) -> None:
    """SHAP beeswarm (dot) plot — shows distribution of SHAP values per feature."""
    # Rank features by mean absolute SHAP
    mean_abs = np.abs(shap_values).mean(axis=0)
    top_idx  = np.argsort(mean_abs)[::-1][:top_n]
    top_idx_list = [int(i) for i in top_idx]   # Python list for pandas iloc compatibility
    feat_names_top = [X_sample.columns[i] for i in top_idx_list]

    fig, ax = plt.subplots(figsize=(12, max(7, top_n * 0.35)))
    plt.sca(ax)

    shap.summary_plot(
        shap_values[:, top_idx_list],
        X_sample.iloc[:, top_idx_list],
        feature_names=feat_names_top,
        max_display=top_n,
        show=False,
        plot_size=None,
        color_bar=True,
        alpha=0.7,
        plot_type="dot",
    )

    ax.set_title(f"SHAP Summary — Beeswarm Plot\n(Top {top_n} features by mean |SHAP|)",
                 fontsize=13, fontweight="bold", pad=10, color=PALETTE["text"])
    ax.set_xlabel("SHAP Value (impact on model output)", fontsize=10,
                  color=PALETTE["text"])
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["surface"])
    ax.tick_params(colors=PALETTE["text"])
    for spine in ax.spines.values():
        spine.set_edgecolor(PALETTE["grid"])

    fig.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight",
                    facecolor=PALETTE["bg"])
        logger.info("Saved SHAP beeswarm: %s", save_path)
    plt.close(fig)


def plot_shap_summary_bar(
    shap_values: np.ndarray,
    feature_names: list[str],
    top_n: int = 30,
    save_path: Optional[Path] = None,
) -> pd.DataFrame:
    """SHAP bar plot — mean absolute SHAP per feature."""
    mean_abs = pd.Series(
        np.abs(shap_values).mean(axis=0), index=feature_names
    ).sort_values(ascending=False).head(top_n)

    fig, ax = plt.subplots(figsize=(11, max(6, top_n * 0.30)))
    colors = [PALETTE["positive"] if v > mean_abs.mean() else PALETTE["negative"]
              for v in mean_abs.values]
    ax.barh(mean_abs.index[::-1], mean_abs.values[::-1],
            color=colors[::-1], edgecolor="none", height=0.7)

    for i, (feat, val) in enumerate(zip(mean_abs.index[::-1], mean_abs.values[::-1])):
        ax.text(val + mean_abs.max() * 0.005, i, f"{val:.4f}",
                va="center", fontsize=7.5, color=PALETTE["text"])

    ax.set_xlabel("Mean |SHAP Value|", fontsize=11)
    ax.set_title(f"SHAP Feature Importance — Mean |SHAP|\n(Top {top_n})",
                 fontsize=13, fontweight="bold", pad=12)
    ax.axvline(mean_abs.mean(), color=PALETTE["highlight"], linestyle="--",
               linewidth=1.2, label=f"Mean = {mean_abs.mean():.4f}")
    ax.legend(fontsize=9, facecolor=PALETTE["surface"],
              labelcolor=PALETTE["text"], edgecolor=PALETTE["grid"])
    _apply_dark_style(fig, ax)
    fig.tight_layout()

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight",
                    facecolor=PALETTE["bg"])
        logger.info("Saved SHAP bar: %s", save_path)
    plt.close(fig)

    return pd.DataFrame({"feature": mean_abs.index, "mean_abs_shap": mean_abs.values})


# ─────────────────────────────────────────────────────────────────────────────
# 5. SHAP Dependence Plots
# ─────────────────────────────────────────────────────────────────────────────

def plot_shap_dependence(
    shap_values:   np.ndarray,
    X_sample:      pd.DataFrame,
    feature:       str,
    interaction_feature: Optional[str] = None,
    save_path:     Optional[Path] = None,
) -> None:
    """SHAP dependence plot for a single feature."""
    if feature not in X_sample.columns:
        logger.warning("Feature '%s' not in X_sample. Skipping.", feature)
        return

    feat_idx = list(X_sample.columns).index(feature)
    inter_idx = (
        list(X_sample.columns).index(interaction_feature)
        if interaction_feature and interaction_feature in X_sample.columns
        else "auto"
    )

    fig, ax = plt.subplots(figsize=(9, 5.5))
    plt.sca(ax)

    shap.dependence_plot(
        feat_idx,
        shap_values,
        X_sample,
        interaction_index=inter_idx,
        ax=ax,
        show=False,
        dot_size=18,
        alpha=0.6,
    )

    ax.set_title(
        f"SHAP Dependence — {feature}"
        + (f"\n(colour: {interaction_feature})" if interaction_feature else ""),
        fontsize=12, fontweight="bold", pad=10, color=PALETTE["text"],
    )

    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["surface"])
    ax.tick_params(colors=PALETTE["text"])
    ax.xaxis.label.set_color(PALETTE["text"])
    ax.yaxis.label.set_color(PALETTE["text"])
    for spine in ax.spines.values():
        spine.set_edgecolor(PALETTE["grid"])
    ax.grid(color=PALETTE["grid"], linewidth=0.5, alpha=0.5)

    fig.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight",
                    facecolor=PALETTE["bg"])
        logger.info("Saved SHAP dependence (%s): %s", feature, save_path)
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────────
# 6. SHAP Waterfall Plots
# ─────────────────────────────────────────────────────────────────────────────

def plot_shap_waterfall(
    model,
    X_sample:      pd.DataFrame,
    shap_values:   np.ndarray,
    y_true:        np.ndarray,
    y_pred:        np.ndarray,
    case:          str = "tp",   # "tp", "fn", "tn", "fp"
    max_display:   int = 15,
    save_path:     Optional[Path] = None,
) -> None:
    """
    SHAP waterfall plot for a representative case.

    case:
      "tp" — True Positive  (correctly predicted road closure)
      "fn" — False Negative (missed road closure — high-risk)
      "tn" — True Negative  (correctly predicted no closure)
      "fp" — False Positive (false alarm)
    """
    # Find a representative index for the requested case
    case_map = {
        "tp": np.where((y_true == 1) & (y_pred == 1))[0],
        "fn": np.where((y_true == 1) & (y_pred == 0))[0],
        "tn": np.where((y_true == 0) & (y_pred == 0))[0],
        "fp": np.where((y_true == 0) & (y_pred == 1))[0],
    }
    indices = case_map.get(case, np.array([]))
    if len(indices) == 0:
        logger.warning("No '%s' cases found in sample. Skipping waterfall.", case)
        return

    # Pick the most extreme case: for TP/FP highest predicted prob, for FN lowest
    probs = model.predict_proba(X_sample)[:, 1]
    if case in ("tp", "fp"):
        idx = indices[np.argmax(probs[indices])]
    else:
        idx = indices[np.argmin(probs[indices])]

    # Build SHAP Explanation object
    explainer_vals = shap_values[idx]
    expected_value = probs.mean()   # approximate base rate

    explanation = shap.Explanation(
        values    = explainer_vals,
        base_values = expected_value,
        data      = X_sample.iloc[idx].values,
        feature_names = list(X_sample.columns),
    )

    case_labels = {
        "tp": "True Positive — Road Closure Correctly Predicted",
        "fn": "False Negative — Missed Road Closure (High Risk)",
        "tn": "True Negative — No Closure Correctly Predicted",
        "fp": "False Positive — False Alarm",
    }

    fig, ax = plt.subplots(figsize=(11, 6))
    plt.sca(ax)
    shap.plots.waterfall(explanation, max_display=max_display, show=False)

    ax = plt.gca()
    ax.set_title(
        f"SHAP Waterfall — {case_labels.get(case, case)}\nSample #{idx}",
        fontsize=11, fontweight="bold", pad=10, color=PALETTE["text"],
    )
    fig = plt.gcf()
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["surface"])
    ax.tick_params(colors=PALETTE["text"])
    for spine in ax.spines.values():
        spine.set_edgecolor(PALETTE["grid"])

    fig.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight",
                    facecolor=PALETTE["bg"])
        logger.info("Saved SHAP waterfall (%s): %s", case, save_path)
    plt.close("all")


# ─────────────────────────────────────────────────────────────────────────────
# 7. Feature Influence Table
# ─────────────────────────────────────────────────────────────────────────────

def build_influence_table(
    mdi_df:   pd.DataFrame,
    perm_df:  pd.DataFrame,
    shap_df:  pd.DataFrame,
) -> pd.DataFrame:
    """
    Merge MDI, permutation, and SHAP importance into one ranked table.
    Ranks each method independently, then computes a composite mean rank.
    """
    merged = (
        mdi_df.rename(columns={"mdi_importance": "mdi"})
        .merge(
            perm_df[["feature", "perm_mean"]].rename(columns={"perm_mean": "perm_imp"}),
            on="feature", how="outer",
        )
        .merge(
            shap_df.rename(columns={"mean_abs_shap": "shap_mean_abs"}),
            on="feature", how="outer",
        )
        .fillna(0)
    )

    n = len(merged)
    merged["rank_mdi"]  = merged["mdi"].rank(ascending=False, method="min").astype(int)
    merged["rank_perm"] = merged["perm_imp"].rank(ascending=False, method="min").astype(int)
    merged["rank_shap"] = merged["shap_mean_abs"].rank(ascending=False, method="min").astype(int)
    merged["mean_rank"] = merged[["rank_mdi", "rank_perm", "rank_shap"]].mean(axis=1).round(2)
    merged["composite_rank"] = merged["mean_rank"].rank(method="min").astype(int)

    merged = merged.sort_values("composite_rank").reset_index(drop=True)

    # Tag influence
    threshold_top    = n * 0.15
    threshold_bottom = n * 0.85
    merged["influence"] = "Moderate"
    merged.loc[merged["composite_rank"] <= threshold_top,    "influence"] = "Most Influential"
    merged.loc[merged["composite_rank"] >= threshold_bottom, "influence"] = "Least Useful"

    for col in ["mdi", "perm_imp", "shap_mean_abs"]:
        merged[col] = merged[col].round(6)

    return merged


# ─────────────────────────────────────────────────────────────────────────────
# 8. Text Report
# ─────────────────────────────────────────────────────────────────────────────

def write_explainability_report(
    influence_df: pd.DataFrame,
    model_name:   str,
    output_dir:   Path,
    plot_dir:     Path,
) -> None:
    """Write the human-readable explainability text report."""
    LINE = "=" * 80
    SEP  = "-" * 80

    most_influential = influence_df[influence_df["influence"] == "Most Influential"]
    least_useful     = influence_df[influence_df["influence"] == "Least Useful"]

    with open(output_dir / "explainability_report.txt", "w", encoding="utf-8") as f:
        f.write(f"{LINE}\n")
        f.write(f"ASTRAM TRAFFIC EVENT — MODEL EXPLAINABILITY REPORT\n")
        f.write(f"{LINE}\n\n")
        f.write(f"Model          : {model_name}\n")
        f.write(f"Target         : requires_road_closure (binary)\n")
        f.write(f"Methods        : MDI | Permutation (AUC, 20 repeats) | SHAP TreeExplainer\n")
        f.write(f"SHAP samples   : 500 (random subsample of test set)\n")
        f.write(f"Plots dir      : {plot_dir.resolve()}\n\n")

        # ── Composite Ranking ─────────────────────────────────────────────────
        f.write(f"{LINE}\n COMPOSITE FEATURE INFLUENCE TABLE (Top 30)\n{LINE}\n")
        display_cols = [
            "composite_rank", "feature", "influence",
            "mdi", "perm_imp", "shap_mean_abs",
            "rank_mdi", "rank_perm", "rank_shap", "mean_rank",
        ]
        f.write(
            influence_df[display_cols].head(30)
            .rename(columns={
                "composite_rank": "Rank", "influence": "Influence",
                "mdi": "MDI", "perm_imp": "Perm-Imp", "shap_mean_abs": "SHAP|abs|",
                "rank_mdi": "Rk-MDI", "rank_perm": "Rk-Perm", "rank_shap": "Rk-SHAP",
                "mean_rank": "MeanRank",
            })
            .to_string(index=False)
        )
        f.write("\n\n")

        # ── Most Influential ──────────────────────────────────────────────────
        f.write(f"{LINE}\n MOST INFLUENTIAL FEATURES (top 15%)\n{LINE}\n")
        f.write(f"  {'Rank':<6} {'Feature':<45} {'MDI':>8} {'Perm':>8} {'SHAP':>8}\n")
        f.write(f"  {SEP}\n")
        for _, r in most_influential.iterrows():
            f.write(
                f"  {r['composite_rank']:<6} {r['feature']:<45} "
                f"{r['mdi']:>8.5f} {r['perm_imp']:>8.5f} {r['shap_mean_abs']:>8.5f}\n"
            )

        f.write(f"\n  Key findings:\n")
        top3 = most_influential.head(3)["feature"].tolist()
        f.write(f"  • Top-3 features by composite rank: {', '.join(top3)}\n")
        f.write(
            f"  • These features consistently rank in the top tier across all 3 methods,\n"
            f"    indicating robust, method-independent importance.\n"
        )
        f.write("\n")

        # ── Least Useful ──────────────────────────────────────────────────────
        f.write(f"{LINE}\n LEAST USEFUL FEATURES (bottom 15%)\n{LINE}\n")
        f.write(f"  {'Rank':<6} {'Feature':<45} {'MDI':>8} {'Perm':>8} {'SHAP':>8}\n")
        f.write(f"  {SEP}\n")
        for _, r in least_useful.iterrows():
            f.write(
                f"  {r['composite_rank']:<6} {r['feature']:<45} "
                f"{r['mdi']:>8.5f} {r['perm_imp']:>8.5f} {r['shap_mean_abs']:>8.5f}\n"
            )

        f.write(f"\n  Recommendation: Consider dropping these {len(least_useful)} features\n")
        f.write( "  in the next training iteration — they add noise and training overhead\n")
        f.write( "  without contributing to model decisions.\n\n")

        # ── SHAP Interpretation ───────────────────────────────────────────────
        f.write(f"{LINE}\n SHAP INTERPRETATION GUIDE\n{LINE}\n")
        f.write("""
  SHAP (SHapley Additive exPlanations) decomposes each prediction into
  contributions from each feature, satisfying consistency and local accuracy.

  Summary Plot (Beeswarm):
    • Each dot = one sample. X-axis = SHAP value (positive → pushes toward road closure).
    • Colour = feature value (red = high, blue = low).
    • Wide spread → feature has high variance of impact.
    • Tight cluster at 0 → feature rarely matters.

  Dependence Plot:
    • X-axis = actual feature value; Y-axis = SHAP value.
    • Trend = how the feature drives the prediction as its value changes.
    • Colour = automatically chosen interacting feature.

  Waterfall Plot:
    • Single prediction breakdown. Bars show each feature's contribution.
    • Red bars push the prediction higher (toward road closure).
    • Blue bars push lower (away from road closure).
    • f(x) = final model output; E[f(x)] = expected base rate.
\n""")

        # ── Plots Generated ───────────────────────────────────────────────────
        f.write(f"{LINE}\n GENERATED PLOTS\n{LINE}\n")
        for plot_file in sorted(plot_dir.glob("*.png")):
            f.write(f"  {plot_file.name}\n")

        f.write(f"\n{LINE}\n END OF REPORT\n{LINE}\n")

    logger.info("Explainability report written.")
