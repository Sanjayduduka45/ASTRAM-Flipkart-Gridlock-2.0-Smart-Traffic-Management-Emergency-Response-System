"""
models/trainer.py
==================
Core training engine for the Astram model comparison study.

Pipeline per model
------------------
1. Prepare feature matrix (select subset, drop string cols, fill NaN)
2. Stratified 80/20 train-test split (already done; loads from output/)
3. 5-Fold Stratified Cross-Validation on training set
   - Scores: Accuracy, Precision, Recall, F1, ROC-AUC
4. Final fit on full training set
5. Hold-out test evaluation with the same 5 metrics
6. Save fitted model as .pkl
7. Return structured result dict

Class weight handling
---------------------
- Logistic Regression, DT, RF, ET: sklearn class_weight="balanced"
- XGBoost: scale_pos_weight=12.35
- LightGBM: is_unbalance=True
- CatBoost: auto_class_weights="Balanced"
- Gradient Boosting: no native class weight → sample_weight passed to fit()
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
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
)
from sklearn.utils.class_weight import compute_sample_weight

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

METRICS = ["accuracy", "precision", "recall", "f1", "roc_auc"]
SKLEARN_SCORING = {
    "accuracy":  "accuracy",
    "precision": "precision",
    "recall":    "recall",
    "f1":        "f1",
    "roc_auc":   "roc_auc",
}

# Models that need sample_weight passed to fit() because they have no class_weight API
_NEEDS_SAMPLE_WEIGHT = {"Gradient Boosting"}


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> dict:
    """Compute the 5 evaluation metrics from predictions."""
    return {
        "accuracy":  round(accuracy_score(y_true, y_pred), 6),
        "precision": round(precision_score(y_true, y_pred, zero_division=0), 6),
        "recall":    round(recall_score(y_true, y_pred, zero_division=0), 6),
        "f1":        round(f1_score(y_true, y_pred, zero_division=0), 6),
        "roc_auc":   round(roc_auc_score(y_true, y_prob), 6),
    }


def _cv_metrics(scores: dict) -> dict:
    """Summarise cross_validate output → mean ± std per metric."""
    result = {}
    for metric in METRICS:
        key = f"test_{metric}"
        vals = scores.get(key, np.array([np.nan]))
        result[f"cv_{metric}_mean"] = round(float(np.mean(vals)), 6)
        result[f"cv_{metric}_std"]  = round(float(np.std(vals)),  6)
    return result


def prepare_features(
    X: pd.DataFrame,
    feature_cols: Optional[list[str]],
    drop_cols: list[str],
) -> pd.DataFrame:
    """
    Select the right feature subset, drop string columns, fill NaN → 0.

    Parameters
    ----------
    X            : Raw feature DataFrame (may contain string columns)
    feature_cols : If None → use all numeric columns after drop.
                   If list → select only those columns (intersection with available).
    drop_cols    : Columns to always drop (non-numeric / leaking strings).
    """
    X = X.drop(columns=[c for c in drop_cols if c in X.columns])
    X = X.select_dtypes(include=[np.number])
    X = X.fillna(0)

    if feature_cols is not None:
        available = [c for c in feature_cols if c in X.columns]
        missing   = [c for c in feature_cols if c not in X.columns]
        if missing:
            logger.warning("Feature columns not found and skipped: %s", missing)
        X = X[available]

    return X


def train_single_model(
    name:         str,
    model,
    X_train:      pd.DataFrame,
    y_train:      pd.Series,
    X_test:       pd.DataFrame,
    y_test:       pd.Series,
    cv_strategy:  StratifiedKFold,
    model_dir:    Path,
) -> dict:
    """
    Train one model through the full pipeline:
    cross-validation → full fit → hold-out evaluation → save.

    Returns a result dict with CV metrics, test metrics, timing.
    """
    logger.info("─" * 60)
    logger.info("Training: %s", name)

    # ── Sample weights (only for models without native class_weight) ──────────
    fit_kwargs: dict = {}
    if name in _NEEDS_SAMPLE_WEIGHT:
        sw = compute_sample_weight("balanced", y_train)
        fit_kwargs["sample_weight"] = sw
        cv_fit_params = {"sample_weight": sw}
    else:
        cv_fit_params = {}

    # ── 5-Fold Stratified Cross-Validation ────────────────────────────────────
    logger.info("  [CV] %d-fold stratified cross-validation...", cv_strategy.n_splits)
    t_cv_start = time.time()

    try:
        cv_scores = cross_validate(
            model,
            X_train, y_train,
            cv=cv_strategy,
            scoring=SKLEARN_SCORING,
            return_train_score=False,
            n_jobs=1,           # avoid nested parallelism with internal n_jobs
            params=cv_fit_params if cv_fit_params else None,
        )
        cv_results = _cv_metrics(cv_scores)
    except Exception as e:
        logger.warning("  CV failed for %s: %s — using NaN placeholders.", name, e)
        cv_results = {f"cv_{m}_mean": np.nan for m in METRICS}
        cv_results.update({f"cv_{m}_std": np.nan for m in METRICS})

    cv_time = time.time() - t_cv_start
    logger.info(
        "  [CV] AUC=%.4f±%.4f  F1=%.4f±%.4f  (%.1fs)",
        cv_results.get("cv_roc_auc_mean", 0),
        cv_results.get("cv_roc_auc_std",  0),
        cv_results.get("cv_f1_mean", 0),
        cv_results.get("cv_f1_std",  0),
        cv_time,
    )

    # ── Full fit on training set ──────────────────────────────────────────────
    logger.info("  [FIT] Fitting on full training set...")
    t_fit_start = time.time()
    model.fit(X_train, y_train, **fit_kwargs)
    fit_time = time.time() - t_fit_start
    logger.info("  [FIT] Done in %.1fs", fit_time)

    # ── Hold-out test evaluation ──────────────────────────────────────────────
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    test_metrics = _compute_metrics(y_test.values, y_pred, y_prob)

    logger.info(
        "  [TEST] Acc=%.4f  Prec=%.4f  Rec=%.4f  F1=%.4f  AUC=%.4f",
        test_metrics["accuracy"], test_metrics["precision"],
        test_metrics["recall"],   test_metrics["f1"],
        test_metrics["roc_auc"],
    )

    # ── Confusion matrix ──────────────────────────────────────────────────────
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    # ── Save model ────────────────────────────────────────────────────────────
    safe_name  = name.lower().replace(" ", "_")
    model_path = model_dir / f"{safe_name}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f, protocol=pickle.HIGHEST_PROTOCOL)
    logger.info("  [SAVE] Model saved to %s", model_path)

    # ── Assemble result ───────────────────────────────────────────────────────
    result = {
        "model_name": name,
        "model":      model,
        **cv_results,
        **{f"test_{k}": v for k, v in test_metrics.items()},
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
        "cv_time_s":  round(cv_time, 2),
        "fit_time_s": round(fit_time, 2),
        "total_time_s": round(cv_time + fit_time, 2),
    }
    return result


def train_all_models(
    model_zoo:    dict,
    X_train:      pd.DataFrame,
    y_train:      pd.Series,
    X_test:       pd.DataFrame,
    y_test:       pd.Series,
    feature_cols: Optional[list[str]],
    drop_cols:    list[str],
    n_cv_splits:  int = 5,
    random_state: int = 42,
    model_dir:    Path = Path("models"),
) -> pd.DataFrame:
    """
    Train all models in the zoo and return a comparison DataFrame.

    Returns
    -------
    pd.DataFrame sorted by test_roc_auc descending.
    """
    logger.info("=" * 60)
    logger.info("PREPARING FEATURE MATRIX")
    logger.info("=" * 60)

    X_tr = prepare_features(X_train, feature_cols, drop_cols)
    X_te = prepare_features(X_test,  feature_cols, drop_cols)

    logger.info("Feature matrix: train=%s  test=%s", X_tr.shape, X_te.shape)
    logger.info("Class distribution (train): %s", dict(pd.Series(y_train).value_counts()))

    cv = StratifiedKFold(n_splits=n_cv_splits, shuffle=True, random_state=random_state)
    model_dir.mkdir(parents=True, exist_ok=True)

    results = []
    total_start = time.time()

    for name, model in model_zoo.items():
        try:
            r = train_single_model(
                name=name,
                model=model,
                X_train=X_tr,
                y_train=y_train,
                X_test=X_te,
                y_test=y_test,
                cv_strategy=cv,
                model_dir=model_dir,
            )
            results.append(r)
        except Exception as e:
            logger.error("FAILED: %s — %s", name, e, exc_info=True)

    total_elapsed = time.time() - total_start
    logger.info("=" * 60)
    logger.info("All models trained in %.1fs", total_elapsed)

    # ── Build comparison DataFrame ─────────────────────────────────────────
    summary_cols = [
        "model_name",
        "cv_accuracy_mean", "cv_accuracy_std",
        "cv_precision_mean","cv_precision_std",
        "cv_recall_mean",   "cv_recall_std",
        "cv_f1_mean",       "cv_f1_std",
        "cv_roc_auc_mean",  "cv_roc_auc_std",
        "test_accuracy",    "test_precision",
        "test_recall",      "test_f1",
        "test_roc_auc",
        "tn", "fp", "fn", "tp",
        "cv_time_s", "fit_time_s", "total_time_s",
    ]

    df = pd.DataFrame(results)
    df = df[[c for c in summary_cols if c in df.columns]]
    df = df.sort_values("test_roc_auc", ascending=False).reset_index(drop=True)
    df.insert(0, "rank", range(1, len(df) + 1))

    return df
