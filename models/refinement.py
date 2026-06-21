"""
models/refinement.py
=====================
Post-explainability model refinement pipeline.

Steps
-----
1. Load explainability results → identify weak / redundant features to drop
2. Build pruned feature set (top-30 minus weak features)
3. Retrain top-3 models on pruned set
4. Plot Learning Curves (bias-variance diagnosis)
5. Plot Validation Curves (hyperparameter sensitivity)
6. Compare pruned vs. baseline performance
7. Select final production model
8. Save final model + generate report
"""

from __future__ import annotations

import logging
import pickle
import time
import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from sklearn.model_selection import (
    StratifiedKFold,
    learning_curve,
    validation_curve,
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score,
)
from sklearn.utils.class_weight import compute_sample_weight

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

# ── Shared palette ────────────────────────────────────────────────────────────
P = {
    "bg":       "#0F172A",
    "surface":  "#1E293B",
    "text":     "#F1F5F9",
    "grid":     "#334155",
    "red":      "#E05263",
    "blue":     "#3B82F6",
    "green":    "#10B981",
    "amber":    "#F59E0B",
    "purple":   "#8B5CF6",
    "cyan":     "#06B6D4",
    "train_c":  "#3B82F6",
    "val_c":    "#E05263",
}

_NEEDS_SAMPLE_WEIGHT = {"Gradient Boosting"}


def _apply_dark(fig, axes):
    fig.patch.set_facecolor(P["bg"])
    if not hasattr(axes, "__iter__"):
        axes = [axes]
    for ax in axes:
        ax.set_facecolor(P["surface"])
        ax.tick_params(colors=P["text"], labelsize=8)
        ax.xaxis.label.set_color(P["text"])
        ax.yaxis.label.set_color(P["text"])
        ax.title.set_color(P["text"])
        for sp in ax.spines.values():
            sp.set_edgecolor(P["grid"])
        ax.grid(color=P["grid"], linewidth=0.4, alpha=0.6)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Feature pruning from explainability results
# ─────────────────────────────────────────────────────────────────────────────

def identify_weak_features(
    influence_path: Path,
    shap_path:      Path,
    perm_path:      Path,
    weak_pct:       float = 0.20,
    shap_threshold: float = 0.0005,
    perm_threshold: float = 0.0,
) -> tuple[list[str], list[str], pd.DataFrame]:
    """
    Identify weak features using three criteria:
    1. Bottom `weak_pct` by composite rank in influence table
    2. mean |SHAP| < shap_threshold
    3. Permutation importance ≤ perm_threshold (zero or negative impact)

    Returns
    -------
    weak_features   : features flagged by ≥2 criteria (drop these)
    pruned_features : all features minus weak ones
    weak_df         : DataFrame showing why each weak feature is flagged
    """
    influence_df = pd.read_csv(influence_path)
    shap_df      = pd.read_csv(shap_path)
    perm_df      = pd.read_csv(perm_path)

    n = len(influence_df)
    bottom_n = max(1, int(n * weak_pct))

    # Criterion 1: bottom by composite rank
    weak_by_rank = set(
        influence_df.nlargest(bottom_n, "composite_rank")["feature"].tolist()
    )

    # Criterion 2: low SHAP
    weak_by_shap = set(
        shap_df[shap_df["mean_abs_shap"] < shap_threshold]["feature"].tolist()
    )

    # Criterion 3: zero/negative permutation
    weak_by_perm = set(
        perm_df[perm_df["perm_mean"] <= perm_threshold]["feature"].tolist()
    )

    # Vote: flagged by ≥2 criteria
    all_features  = set(influence_df["feature"].tolist())
    weak_features = []
    rows = []
    for feat in all_features:
        criteria = []
        if feat in weak_by_rank: criteria.append("low_rank")
        if feat in weak_by_shap: criteria.append("low_shap")
        if feat in weak_by_perm: criteria.append("zero_perm")
        if len(criteria) >= 2:
            weak_features.append(feat)
            rows.append({"feature": feat, "criteria": "|".join(criteria),
                         "n_criteria": len(criteria)})

    weak_df = pd.DataFrame(rows).sort_values("n_criteria", ascending=False)
    pruned  = [f for f in influence_df["feature"].tolist() if f not in weak_features]

    logger.info("Weak features identified: %d (from %d total)", len(weak_features), n)
    logger.info("Pruned feature set: %d features", len(pruned))
    return weak_features, pruned, weak_df


# ─────────────────────────────────────────────────────────────────────────────
# 2. Evaluation helpers
# ─────────────────────────────────────────────────────────────────────────────

def _eval(model, X, y) -> dict:
    yp = model.predict(X)
    yb = model.predict_proba(X)[:, 1]
    return {
        "accuracy":  round(accuracy_score(y, yp), 6),
        "precision": round(precision_score(y, yp, zero_division=0), 6),
        "recall":    round(recall_score(y, yp, zero_division=0), 6),
        "f1":        round(f1_score(y, yp, zero_division=0), 6),
        "roc_auc":   round(roc_auc_score(y, yb), 6),
    }


def retrain_model(name, model, X_tr, y_tr, X_te, y_te,
                  cv: StratifiedKFold, save_path: Path) -> dict:
    """Fit + evaluate one model on the pruned feature set."""
    from sklearn.model_selection import cross_validate
    fk = {}
    if name in _NEEDS_SAMPLE_WEIGHT:
        fk["sample_weight"] = compute_sample_weight("balanced", y_tr)

    scoring = {"accuracy": "accuracy", "precision": "precision",
               "recall": "recall", "f1": "f1", "roc_auc": "roc_auc"}

    cv_res = cross_validate(model, X_tr, y_tr, cv=cv, scoring=scoring,
                            return_train_score=False, n_jobs=1,
                            params=fk if fk else None, error_score=0.0)

    t0 = time.time()
    model.fit(X_tr, y_tr, **fk)
    fit_time = round(time.time() - t0, 2)

    test_m = _eval(model, X_te, y_te)

    with open(save_path, "wb") as f:
        pickle.dump(model, f, protocol=pickle.HIGHEST_PROTOCOL)

    result = {"model_name": name, "fit_time_s": fit_time}
    for m in ["accuracy", "precision", "recall", "f1", "roc_auc"]:
        result[f"cv_{m}_mean"] = round(float(np.mean(cv_res[f"test_{m}"])), 6)
        result[f"cv_{m}_std"]  = round(float(np.std(cv_res[f"test_{m}"])),  6)
        result[f"test_{m}"]    = test_m[m]
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 3. Learning Curves
# ─────────────────────────────────────────────────────────────────────────────

def plot_learning_curves(
    models:       dict,
    X_train:      np.ndarray,
    y_train:      np.ndarray,
    cv:           StratifiedKFold,
    save_path:    Path,
    scoring:      str = "roc_auc",
    train_sizes:  np.ndarray = None,
) -> dict:
    """
    Plot learning curves for each model in a grid.

    Diagnoses:
    - High train score + low val score → Overfitting
    - Both low → Underfitting
    - Converging curves → Good generalisation
    - Large gap = high variance; small scores = high bias
    """
    if train_sizes is None:
        train_sizes = np.linspace(0.10, 1.0, 10)

    n_models  = len(models)
    n_cols    = min(3, n_models)
    n_rows    = (n_models + n_cols - 1) // n_cols

    fig, axes = plt.subplots(n_rows, n_cols,
                             figsize=(7 * n_cols, 5 * n_rows),
                             squeeze=False)
    fig.suptitle(
        f"Learning Curves — {scoring.upper()} Score\n(Bias–Variance Diagnosis)",
        fontsize=14, fontweight="bold", color=P["text"], y=1.01,
    )

    lc_results = {}

    for idx, (name, model) in enumerate(models.items()):
        ax = axes[idx // n_cols][idx % n_cols]

        try:
            tr_sz, tr_sc, val_sc = learning_curve(
                model, X_train, y_train,
                cv=cv,
                train_sizes=train_sizes,
                scoring=scoring,
                n_jobs=-1,
                error_score=0.0,
            )
        except Exception as e:
            logger.warning("Learning curve failed for %s: %s", name, e)
            ax.text(0.5, 0.5, f"Failed: {e}", ha="center", va="center",
                    color=P["text"], fontsize=9, transform=ax.transAxes)
            _apply_dark(fig, [ax])
            continue

        tr_mean  = tr_sc.mean(axis=1)
        tr_std   = tr_sc.std(axis=1)
        val_mean = val_sc.mean(axis=1)
        val_std  = val_sc.std(axis=1)

        ax.plot(tr_sz, tr_mean, color=P["train_c"], lw=2,
                label=f"Train ({scoring})", marker="o", ms=4)
        ax.fill_between(tr_sz, tr_mean - tr_std, tr_mean + tr_std,
                        alpha=0.15, color=P["train_c"])
        ax.plot(tr_sz, val_mean, color=P["val_c"], lw=2,
                label=f"Val ({scoring})", marker="s", ms=4)
        ax.fill_between(tr_sz, val_mean - val_std, val_mean + val_std,
                        alpha=0.15, color=P["val_c"])

        # Diagnosis label
        gap      = tr_mean[-1] - val_mean[-1]
        tr_final = tr_mean[-1]
        val_final = val_mean[-1]

        if tr_final > 0.85 and gap > 0.10:
            diag, diag_col = "⚠ Overfit", P["red"]
        elif val_final < 0.60 and gap < 0.05:
            diag, diag_col = "⚠ Underfit", P["amber"]
        elif gap > 0.06:
            diag, diag_col = "High Variance", P["amber"]
        elif tr_final < 0.70:
            diag, diag_col = "High Bias", P["amber"]
        else:
            diag, diag_col = "✓ Good Fit", P["green"]

        ax.text(0.97, 0.05, diag, transform=ax.transAxes,
                ha="right", va="bottom", fontsize=9, fontweight="bold",
                color=diag_col,
                bbox=dict(boxstyle="round,pad=0.3", facecolor=P["surface"],
                          edgecolor=diag_col, alpha=0.8))

        ax.set_title(name, fontsize=11, fontweight="bold")
        ax.set_xlabel("Training Set Size", fontsize=9)
        ax.set_ylabel(scoring.replace("_", " ").upper(), fontsize=9)
        ax.set_ylim(max(0, val_mean.min() - 0.1), min(1.02, tr_mean.max() + 0.05))
        leg = ax.legend(fontsize=8, facecolor=P["surface"],
                        labelcolor=P["text"], edgecolor=P["grid"])

        lc_results[name] = {
            "train_final": round(float(tr_final), 4),
            "val_final":   round(float(val_final), 4),
            "gap":         round(float(gap), 4),
            "diagnosis":   diag.replace("⚠ ", "").replace("✓ ", ""),
        }

    # Hide unused axes
    for i in range(n_models, n_rows * n_cols):
        axes[i // n_cols][i % n_cols].set_visible(False)

    _apply_dark(fig, [ax for row in axes for ax in row])
    fig.tight_layout(rect=[0, 0, 1, 0.98])
    fig.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=P["bg"])
    plt.close(fig)
    logger.info("Saved learning curves: %s", save_path)
    return lc_results


# ─────────────────────────────────────────────────────────────────────────────
# 4. Validation Curves
# ─────────────────────────────────────────────────────────────────────────────

VALIDATION_CURVE_PARAMS = {
    "Extra Trees": {
        "param_name":  "n_estimators",
        "param_range": [50, 100, 150, 200, 250, 300, 400, 500],
    },
    "Random Forest": {
        "param_name":  "n_estimators",
        "param_range": [50, 100, 150, 200, 250, 300, 400, 500],
    },
    "XGBoost": {
        "param_name":  "max_depth",
        "param_range": [2, 3, 4, 5, 6, 7, 8, 9],
    },
    "LightGBM": {
        "param_name":  "num_leaves",
        "param_range": [15, 31, 47, 63, 79, 95, 127],
    },
    "Gradient Boosting": {
        "param_name":  "max_depth",
        "param_range": [2, 3, 4, 5, 6, 7],
    },
    "Logistic Regression": {
        "param_name":  "C",
        "param_range": [0.001, 0.01, 0.1, 1.0, 10.0, 100.0],
    },
    "CatBoost": {
        "param_name":  "depth",
        "param_range": [3, 4, 5, 6, 7, 8],
    },
    "Decision Tree": {
        "param_name":  "max_depth",
        "param_range": [2, 3, 4, 5, 6, 8, 10, 12],
    },
}


def plot_validation_curves(
    models:    dict,
    X_train:   np.ndarray,
    y_train:   np.ndarray,
    cv:        StratifiedKFold,
    save_path: Path,
    scoring:   str = "roc_auc",
) -> dict:
    """
    Plot validation curves (score vs. key hyperparameter) for each model.

    Shows how model complexity relates to bias-variance tradeoff.
    """
    n_models = len(models)
    n_cols   = min(3, n_models)
    n_rows   = (n_models + n_cols - 1) // n_cols

    fig, axes = plt.subplots(n_rows, n_cols,
                              figsize=(7 * n_cols, 4.5 * n_rows),
                              squeeze=False)
    fig.suptitle(
        "Validation Curves — Hyperparameter Sensitivity\n(Bias–Variance Tradeoff)",
        fontsize=14, fontweight="bold", color=P["text"], y=1.01,
    )

    vc_results = {}

    for idx, (name, model) in enumerate(models.items()):
        ax = axes[idx // n_cols][idx % n_cols]
        vc_cfg = VALIDATION_CURVE_PARAMS.get(name)

        if not vc_cfg:
            ax.text(0.5, 0.5, "No curve config", ha="center", va="center",
                    color=P["text"], fontsize=9, transform=ax.transAxes)
            _apply_dark(fig, [ax])
            continue

        try:
            tr_sc, val_sc = validation_curve(
                model, X_train, y_train,
                param_name=vc_cfg["param_name"],
                param_range=vc_cfg["param_range"],
                cv=cv,
                scoring=scoring,
                n_jobs=-1,
                error_score=0.0,
            )
        except Exception as e:
            logger.warning("Validation curve failed for %s: %s", name, e)
            ax.text(0.5, 0.5, f"Failed:\n{e}", ha="center", va="center",
                    color=P["text"], fontsize=8, transform=ax.transAxes, wrap=True)
            _apply_dark(fig, [ax])
            continue

        xvals    = vc_cfg["param_range"]
        tr_mean  = tr_sc.mean(axis=1)
        tr_std   = tr_sc.std(axis=1)
        val_mean = val_sc.mean(axis=1)
        val_std  = val_sc.std(axis=1)

        ax.plot(xvals, tr_mean,  color=P["train_c"], lw=2, marker="o", ms=5,
                label=f"Train ({scoring})")
        ax.fill_between(xvals, tr_mean - tr_std, tr_mean + tr_std,
                        alpha=0.15, color=P["train_c"])
        ax.plot(xvals, val_mean, color=P["val_c"], lw=2, marker="s", ms=5,
                label=f"Val ({scoring})")
        ax.fill_between(xvals, val_mean - val_std, val_mean + val_std,
                        alpha=0.15, color=P["val_c"])

        # Mark best val point
        best_idx  = int(np.argmax(val_mean))
        best_x    = xvals[best_idx]
        best_val  = val_mean[best_idx]
        ax.axvline(best_x, color=P["green"], linestyle="--", lw=1.2, alpha=0.8)
        ax.scatter([best_x], [best_val], color=P["green"], s=80, zorder=5)
        ax.text(best_x, best_val + 0.01,
                f"Best={best_x}\n({best_val:.3f})",
                fontsize=7.5, ha="center", color=P["green"])

        ax.set_title(name, fontsize=11, fontweight="bold")
        ax.set_xlabel(vc_cfg["param_name"], fontsize=9)
        ax.set_ylabel(scoring.replace("_", " ").upper(), fontsize=9)
        ax.legend(fontsize=8, facecolor=P["surface"],
                  labelcolor=P["text"], edgecolor=P["grid"])

        vc_results[name] = {
            "param_name":  vc_cfg["param_name"],
            "best_value":  best_x,
            "best_val_score": round(float(best_val), 4),
        }

    for i in range(n_models, n_rows * n_cols):
        axes[i // n_cols][i % n_cols].set_visible(False)

    _apply_dark(fig, [ax for row in axes for ax in row])
    fig.tight_layout(rect=[0, 0, 1, 0.98])
    fig.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=P["bg"])
    plt.close(fig)
    logger.info("Saved validation curves: %s", save_path)
    return vc_results


# ─────────────────────────────────────────────────────────────────────────────
# 5. Performance Comparison Plot
# ─────────────────────────────────────────────────────────────────────────────

def plot_performance_comparison(
    baseline_df: pd.DataFrame,
    pruned_df:   pd.DataFrame,
    save_path:   Path,
) -> None:
    """Grouped bar chart: baseline vs. pruned performance per model × metric."""
    metrics      = ["test_accuracy", "test_precision", "test_recall",
                    "test_f1", "test_roc_auc"]
    metric_labels = ["Accuracy", "Precision", "Recall", "F1", "ROC-AUC"]
    models_common = list(
        set(baseline_df["model_name"]) & set(pruned_df["model_name"])
    )
    models_common = sorted(models_common)

    n_metrics = len(metrics)
    fig, axes = plt.subplots(1, n_metrics, figsize=(4.5 * n_metrics, 5.5))
    fig.suptitle("Baseline vs. Pruned Feature Set — Performance Comparison",
                 fontsize=13, fontweight="bold", color=P["text"], y=1.02)

    for i, (metric, label) in enumerate(zip(metrics, metric_labels)):
        ax = axes[i]
        x  = np.arange(len(models_common))
        w  = 0.35

        base_vals   = [
            baseline_df.loc[baseline_df["model_name"] == m, metric].values[0]
            if m in baseline_df["model_name"].values else 0
            for m in models_common
        ]
        pruned_vals = [
            pruned_df.loc[pruned_df["model_name"] == m, metric].values[0]
            if m in pruned_df["model_name"].values else 0
            for m in models_common
        ]

        bars1 = ax.bar(x - w/2, base_vals,   w, label="Baseline", color=P["blue"],
                       alpha=0.8, edgecolor="none")
        bars2 = ax.bar(x + w/2, pruned_vals, w, label="Pruned",   color=P["green"],
                       alpha=0.8, edgecolor="none")

        # Delta annotations
        for j, (b, p) in enumerate(zip(base_vals, pruned_vals)):
            delta = p - b
            color = P["green"] if delta >= 0 else P["red"]
            ax.text(j + w/2, p + 0.005, f"{delta:+.3f}",
                    ha="center", fontsize=6.5, color=color, fontweight="bold")

        ax.set_title(label, fontsize=10, fontweight="bold")
        ax.set_xticks(x)
        ax.set_xticklabels([m.replace(" ", "\n") for m in models_common],
                           fontsize=7.5)
        ax.set_ylim(0, 1.05)
        if i == 0:
            ax.legend(fontsize=8, facecolor=P["surface"],
                      labelcolor=P["text"], edgecolor=P["grid"])
        _apply_dark(fig, [ax])

    fig.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=P["bg"])
    plt.close(fig)
    logger.info("Saved comparison plot: %s", save_path)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Final Model Selection
# ─────────────────────────────────────────────────────────────────────────────

def select_final_model(
    pruned_df:     pd.DataFrame,
    lc_results:    dict,
    vc_results:    dict,
    weights:       Optional[dict] = None,
) -> tuple[str, pd.DataFrame]:
    """
    Score each model on a weighted combination of test metrics + bias-variance health.

    Default weights: ROC-AUC=35%, F1=30%, Recall=20%, Precision=10%, Accuracy=5%
    Penalty: -0.05 if diagnosis is "Overfit" or "High Variance"

    Returns
    -------
    winner      : model name
    scores_df   : DataFrame with composite scores
    """
    if weights is None:
        weights = {
            "test_roc_auc":   0.35,
            "test_f1":        0.30,
            "test_recall":    0.20,
            "test_precision": 0.10,
            "test_accuracy":  0.05,
        }

    rows = []
    for _, row in pruned_df.iterrows():
        name  = row["model_name"]
        score = sum(row.get(m, 0) * w for m, w in weights.items())

        # Bias-variance penalty
        lc = lc_results.get(name, {})
        diag = lc.get("diagnosis", "")
        penalty = -0.04 if diag in ("Overfit", "High Variance") else 0.0
        if diag == "Underfit":
            penalty -= 0.02

        final_score = round(score + penalty, 6)
        rows.append({
            "model_name":   name,
            "weighted_score": round(score, 6),
            "bv_penalty":   penalty,
            "final_score":  final_score,
            "bv_diagnosis": diag if diag else "N/A",
            "test_roc_auc": row.get("test_roc_auc", 0),
            "test_f1":      row.get("test_f1",      0),
            "test_recall":  row.get("test_recall",  0),
            "test_precision":row.get("test_precision",0),
        })

    scores_df = pd.DataFrame(rows).sort_values("final_score", ascending=False).reset_index(drop=True)
    scores_df.insert(0, "rank", range(1, len(scores_df) + 1))
    winner = scores_df.iloc[0]["model_name"]
    logger.info("Final model selected: %s (score=%.4f)", winner, scores_df.iloc[0]["final_score"])
    return winner, scores_df
