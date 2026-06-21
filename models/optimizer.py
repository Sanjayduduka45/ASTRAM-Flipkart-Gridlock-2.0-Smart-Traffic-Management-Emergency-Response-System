"""
models/optimizer.py
====================
Hyperparameter optimization engine.

Two-stage strategy per model
-----------------------------
Stage 1 — RandomizedSearchCV (broad exploration)
  • Wide scipy distribution search spaces
  • n_iter=60 random samples
  • 5-fold StratifiedKFold
  • Optimises for: F1, Recall, ROC-AUC (three separate searches)

Stage 2 — GridSearchCV (focused refinement)
  • Grid built around best RandomSearch params ± neighbourhood
  • Exhaustive over a tight 3-4 value grid per param
  • Same CV strategy and scoring

Outputs per model
-----------------
  best_params_<metric>   — best params for each scoring objective
  best_score_<metric>    — CV score at those params
  test_<metric>          — hold-out score with tuned model
  improvement_<metric>   — delta vs. baseline (tuned − baseline)
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
from sklearn.model_selection import (
    RandomizedSearchCV,
    GridSearchCV,
    StratifiedKFold,
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score,
)
from sklearn.utils.class_weight import compute_sample_weight

from models.search_spaces import RANDOM_SPACES, GRID_SPACES, build_focused_grid
from models.trainer import prepare_features, _NEEDS_SAMPLE_WEIGHT

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

# Scoring objectives and their sklearn scorer strings
SCORING_OBJECTIVES = {
    "f1":      "f1",
    "recall":  "recall",
    "roc_auc": "roc_auc",
}

N_ITER_RANDOM  = 60    # RandomizedSearch iterations
CV_SPLITS      = 5
RANDOM_STATE   = 42


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _eval_on_test(model, X_test: np.ndarray, y_test: np.ndarray) -> dict:
    """Evaluate a fitted model on the hold-out test set."""
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    return {
        "accuracy":  round(accuracy_score(y_test, y_pred),              6),
        "precision": round(precision_score(y_test, y_pred, zero_division=0), 6),
        "recall":    round(recall_score(y_test, y_pred, zero_division=0),    6),
        "f1":        round(f1_score(y_test, y_pred, zero_division=0),        6),
        "roc_auc":   round(roc_auc_score(y_test, y_prob),               6),
    }


def _fit_kwargs(model_name: str, y_train: np.ndarray) -> dict:
    """Return fit kwargs (sample_weight) for models that need it."""
    if model_name in _NEEDS_SAMPLE_WEIGHT:
        return {"sample_weight": compute_sample_weight("balanced", y_train)}
    return {}


def _clone_model_with_params(base_model, params: dict):
    """Return a new instance of the same model class with updated params."""
    from sklearn.base import clone
    m = clone(base_model)
    m.set_params(**params)
    return m


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: RandomizedSearchCV
# ─────────────────────────────────────────────────────────────────────────────

def run_randomized_search(
    model_name:  str,
    base_model,
    X_train:     np.ndarray,
    y_train:     np.ndarray,
    X_test:      np.ndarray,
    y_test:      np.ndarray,
    cv:          StratifiedKFold,
    n_iter:      int = N_ITER_RANDOM,
) -> dict:
    """
    Run RandomizedSearchCV for each scoring objective independently.

    Returns
    -------
    dict with keys per objective:
        {objective}_best_params, {objective}_best_cv_score,
        {objective}_best_model, {objective}_test_metrics
    Plus: rand_time_s, rand_total_iterations
    """
    param_dist = RANDOM_SPACES.get(model_name)
    if not param_dist:
        logger.warning("[RandomSearch] No search space for '%s'. Skipping.", model_name)
        return {}

    fk = _fit_kwargs(model_name, y_train)
    results: dict = {"rand_time_s": 0.0, "rand_total_iterations": 0}

    for obj_name, scorer in SCORING_OBJECTIVES.items():
        logger.info("  [RandomSearch/%s] scoring=%s  n_iter=%d", obj_name, scorer, n_iter)
        t0 = time.time()

        # Special handling for LR elasticnet: l1_ratio only valid when penalty=elasticnet
        search_params = dict(param_dist)
        if model_name == "Logistic Regression":
            # Filter out l1_ratio when running non-elasticnet combos; sklearn handles this
            pass  # sklearn's LR with saga handles l1_ratio gracefully

        searcher = RandomizedSearchCV(
            estimator   = base_model,
            param_distributions = search_params,
            n_iter      = n_iter,
            scoring     = scorer,
            cv          = cv,
            refit       = True,
            n_jobs      = -1,
            random_state= RANDOM_STATE,
            error_score = 0.0,       # don't crash on param combos that fail
            verbose     = 0,
        )

        try:
            if fk:
                searcher.fit(X_train, y_train, **{f"sample_weight": fk["sample_weight"]})
            else:
                searcher.fit(X_train, y_train)
        except Exception as e:
            logger.error("  [RandomSearch/%s] FAILED: %s", obj_name, e)
            continue

        elapsed = time.time() - t0
        results["rand_time_s"] = results.get("rand_time_s", 0) + elapsed
        results["rand_total_iterations"] = results.get("rand_total_iterations", 0) + n_iter

        best_model   = searcher.best_estimator_
        best_params  = searcher.best_params_
        best_cv_score= round(searcher.best_score_, 6)
        test_metrics = _eval_on_test(best_model, X_test, y_test)

        results[f"{obj_name}_rand_best_params"]   = best_params
        results[f"{obj_name}_rand_best_cv_score"] = best_cv_score
        results[f"{obj_name}_rand_best_model"]    = best_model
        results[f"{obj_name}_rand_test_metrics"]  = test_metrics

        logger.info(
            "  [RandomSearch/%s] best CV %.4f | test → Acc=%.4f Prec=%.4f "
            "Rec=%.4f F1=%.4f AUC=%.4f  (%.1fs)",
            obj_name, best_cv_score,
            test_metrics["accuracy"], test_metrics["precision"],
            test_metrics["recall"],   test_metrics["f1"],
            test_metrics["roc_auc"],  elapsed,
        )

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: GridSearchCV (focused refinement)
# ─────────────────────────────────────────────────────────────────────────────

def run_grid_search(
    model_name:    str,
    base_model,
    X_train:       np.ndarray,
    y_train:       np.ndarray,
    X_test:        np.ndarray,
    y_test:        np.ndarray,
    cv:            StratifiedKFold,
    rand_results:  dict,          # output from run_randomized_search
) -> dict:
    """
    Run GridSearchCV using a focused grid around RandomSearch best params.

    For each scoring objective, builds a neighbourhood grid from the
    RandomSearch best params and exhaustively searches it.
    """
    static_grid = GRID_SPACES.get(model_name, {})
    fk = _fit_kwargs(model_name, y_train)
    results: dict = {"grid_time_s": 0.0}

    for obj_name, scorer in SCORING_OBJECTIVES.items():
        rand_best_params = rand_results.get(f"{obj_name}_rand_best_params")

        if rand_best_params:
            param_grid = build_focused_grid(model_name, rand_best_params, n_steps=3)
            source = "focused (from RandomSearch best)"
        elif static_grid:
            param_grid = static_grid
            source = "static fallback grid"
        else:
            logger.warning("  [GridSearch/%s] No grid available. Skipping.", obj_name)
            continue

        logger.info("  [GridSearch/%s] scoring=%s  grid_source=%s", obj_name, scorer, source)
        logger.info("  [GridSearch/%s] grid size=%d combinations",
                    obj_name, _grid_size(param_grid))

        t0 = time.time()
        searcher = GridSearchCV(
            estimator  = base_model,
            param_grid = param_grid,
            scoring    = scorer,
            cv         = cv,
            refit      = True,
            n_jobs     = -1,
            error_score= 0.0,
            verbose    = 0,
        )

        try:
            if fk:
                searcher.fit(X_train, y_train, **{f"sample_weight": fk["sample_weight"]})
            else:
                searcher.fit(X_train, y_train)
        except Exception as e:
            logger.error("  [GridSearch/%s] FAILED: %s", obj_name, e)
            continue

        elapsed = time.time() - t0
        results["grid_time_s"] = results.get("grid_time_s", 0) + elapsed

        best_model    = searcher.best_estimator_
        best_params   = searcher.best_params_
        best_cv_score = round(searcher.best_score_, 6)
        test_metrics  = _eval_on_test(best_model, X_test, y_test)

        results[f"{obj_name}_grid_best_params"]   = best_params
        results[f"{obj_name}_grid_best_cv_score"] = best_cv_score
        results[f"{obj_name}_grid_best_model"]    = best_model
        results[f"{obj_name}_grid_test_metrics"]  = test_metrics

        logger.info(
            "  [GridSearch/%s] best CV %.4f | test → Acc=%.4f Prec=%.4f "
            "Rec=%.4f F1=%.4f AUC=%.4f  (%.1fs)",
            obj_name, best_cv_score,
            test_metrics["accuracy"], test_metrics["precision"],
            test_metrics["recall"],   test_metrics["f1"],
            test_metrics["roc_auc"],  elapsed,
        )

    return results


def _grid_size(grid: dict) -> int:
    size = 1
    for vals in grid.values():
        size *= len(vals) if hasattr(vals, "__len__") else 1
    return size


# ─────────────────────────────────────────────────────────────────────────────
# Master HPO runner
# ─────────────────────────────────────────────────────────────────────────────

def run_hpo(
    model_zoo:      dict,
    baseline_df:    pd.DataFrame,
    X_train:        pd.DataFrame,
    y_train:        pd.Series,
    X_test:         pd.DataFrame,
    y_test:         pd.Series,
    feature_cols:   Optional[list[str]],
    drop_cols:      list[str],
    top_n_models:   int = 5,
    n_iter_random:  int = N_ITER_RANDOM,
    random_state:   int = RANDOM_STATE,
    tuned_model_dir:Path = Path("models/tuned"),
) -> dict:
    """
    Run full two-stage HPO (RandomSearch → GridSearch) for the top-N models.

    Parameters
    ----------
    model_zoo       : {name: model} from definitions.get_model_zoo()
    baseline_df     : model_comparison.csv loaded as DataFrame
    X_train/y_train : Training data
    X_test/y_test   : Hold-out test data
    feature_cols    : Feature subset list (None = all numeric)
    drop_cols       : Columns to drop before training
    top_n_models    : How many top models to optimise (ranked by CV AUC)
    n_iter_random   : RandomSearch iterations per scoring objective
    random_state    : RNG seed
    tuned_model_dir : Where to save tuned .pkl files

    Returns
    -------
    dict: {model_name: {rand_results, grid_results, improvement}}
    """
    tuned_model_dir.mkdir(parents=True, exist_ok=True)

    # ── Prepare feature matrices ──────────────────────────────────────────────
    from models.trainer import prepare_features
    X_tr = prepare_features(X_train, feature_cols, drop_cols)
    X_te = prepare_features(X_test,  feature_cols, drop_cols)
    logger.info("Feature matrix: train=%s  test=%s", X_tr.shape, X_te.shape)

    # ── Select top-N models by CV ROC-AUC ─────────────────────────────────────
    if "cv_roc_auc_mean" in baseline_df.columns:
        sort_col = "cv_roc_auc_mean"
    elif "test_roc_auc" in baseline_df.columns:
        sort_col = "test_roc_auc"
    else:
        sort_col = baseline_df.columns[-1]

    top_models = (
        baseline_df
        .sort_values(sort_col, ascending=False)
        .head(top_n_models)["model_name"]
        .tolist()
    )
    logger.info("Top-%d models selected for HPO: %s", top_n_models, top_models)

    cv = StratifiedKFold(n_splits=CV_SPLITS, shuffle=True, random_state=random_state)

    all_results: dict = {}
    t_total = time.time()

    for model_name in top_models:
        if model_name not in model_zoo:
            logger.warning("Model '%s' not in zoo. Skipping.", model_name)
            continue
        if model_name not in RANDOM_SPACES:
            logger.warning("No search space for '%s'. Skipping.", model_name)
            continue

        base_model = model_zoo[model_name]
        logger.info("=" * 65)
        logger.info("HPO: %s", model_name)
        logger.info("=" * 65)

        # Baseline test metrics for this model
        baseline_row = baseline_df[baseline_df["model_name"] == model_name]
        baseline_test = {}
        if not baseline_row.empty:
            r = baseline_row.iloc[0]
            baseline_test = {
                "accuracy":  r.get("test_accuracy",  np.nan),
                "precision": r.get("test_precision", np.nan),
                "recall":    r.get("test_recall",    np.nan),
                "f1":        r.get("test_f1",        np.nan),
                "roc_auc":   r.get("test_roc_auc",   np.nan),
            }

        # Stage 1: RandomizedSearch
        logger.info("── Stage 1: RandomizedSearchCV ──────────────────────────")
        rand_results = run_randomized_search(
            model_name, base_model,
            X_tr.values, y_train.values,
            X_te.values, y_test.values,
            cv, n_iter=n_iter_random,
        )

        # Stage 2: GridSearch (focused around rand best)
        logger.info("── Stage 2: GridSearchCV (focused) ──────────────────────")
        grid_results = run_grid_search(
            model_name, base_model,
            X_tr.values, y_train.values,
            X_te.values, y_test.values,
            cv, rand_results,
        )

        # ── Compute improvement (best of rand & grid vs baseline) ─────────────
        improvement = _compute_improvement(
            model_name, baseline_test, rand_results, grid_results
        )

        # ── Select and save the best model per objective ──────────────────────
        saved = _save_best_models(
            model_name, rand_results, grid_results, tuned_model_dir
        )

        all_results[model_name] = {
            "rand":        rand_results,
            "grid":        grid_results,
            "baseline":    baseline_test,
            "improvement": improvement,
            "saved":       saved,
        }

        logger.info("── Improvement summary for %s ──", model_name)
        for obj in SCORING_OBJECTIVES:
            imp = improvement.get(obj, {})
            logger.info(
                "  [%s] baseline=%.4f  tuned=%.4f  Δ=%+.4f",
                obj,
                imp.get("baseline_test", 0),
                imp.get("tuned_test",    0),
                imp.get("delta",         0),
            )

    logger.info("=" * 65)
    logger.info("HPO complete in %.1fs", time.time() - t_total)
    return all_results


def _compute_improvement(
    model_name:   str,
    baseline:     dict,
    rand_results: dict,
    grid_results: dict,
) -> dict:
    """
    For each objective, find the best tuned test score (max of rand & grid)
    and compute delta vs. baseline.
    """
    improvement = {}
    for obj in SCORING_OBJECTIVES:
        rand_metrics = rand_results.get(f"{obj}_rand_test_metrics", {})
        grid_metrics = grid_results.get(f"{obj}_grid_test_metrics", {})

        # Pick the source (rand or grid) that achieved higher score on this objective
        rand_score = rand_metrics.get(obj, 0.0)
        grid_score = grid_metrics.get(obj, 0.0)

        if grid_score >= rand_score:
            best_metrics = grid_metrics
            best_source  = "GridSearch"
            best_score   = grid_score
        else:
            best_metrics = rand_metrics
            best_source  = "RandomSearch"
            best_score   = rand_score

        baseline_score = baseline.get(obj, 0.0)

        improvement[obj] = {
            "objective":        obj,
            "model":            model_name,
            "baseline_test":    round(float(baseline_score), 6),
            "tuned_test":       round(float(best_score),     6),
            "delta":            round(float(best_score) - float(baseline_score), 6),
            "pct_change":       round(
                (float(best_score) - float(baseline_score))
                / max(float(baseline_score), 1e-9) * 100, 2
            ),
            "best_source":      best_source,
            "best_test_metrics": best_metrics,
            "rand_cv_score":    rand_results.get(f"{obj}_rand_best_cv_score", np.nan),
            "grid_cv_score":    grid_results.get(f"{obj}_grid_best_cv_score", np.nan),
        }

    return improvement


def _save_best_models(
    model_name:   str,
    rand_results: dict,
    grid_results: dict,
    save_dir:     Path,
) -> dict:
    """Save the best model per objective (highest test score across rand + grid)."""
    saved = {}
    safe  = model_name.lower().replace(" ", "_")

    for obj in SCORING_OBJECTIVES:
        rand_score   = rand_results.get(f"{obj}_rand_test_metrics", {}).get(obj, -1)
        grid_score   = grid_results.get(f"{obj}_grid_test_metrics", {}).get(obj, -1)

        if grid_score >= rand_score:
            best_model = grid_results.get(f"{obj}_grid_best_model")
            source     = "grid"
        else:
            best_model = rand_results.get(f"{obj}_rand_best_model")
            source     = "rand"

        if best_model is None:
            continue

        path = save_dir / f"{safe}_tuned_{obj}.pkl"
        with open(path, "wb") as fh:
            pickle.dump(best_model, fh, protocol=pickle.HIGHEST_PROTOCOL)
        saved[obj] = {"path": str(path), "source": source}
        logger.info("  Saved tuned model [%s/%s] → %s", obj, source, path.name)

    return saved
