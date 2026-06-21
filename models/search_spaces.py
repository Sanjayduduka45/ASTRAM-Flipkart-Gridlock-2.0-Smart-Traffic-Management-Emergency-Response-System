"""
models/search_spaces.py
========================
Hyperparameter search spaces for RandomizedSearchCV and GridSearchCV.

Design principles
-----------------
- RandomizedSearch spaces: wide and continuous — explore the full landscape
  with scipy distributions (loguniform, randint, uniform).
- GridSearch spaces: narrow, focused grids around the best RandomSearch point.
  Typically 2-4 values per parameter, so the grid stays tractable.

The top-4 models from the baseline comparison are targeted:
  • XGBoost
  • LightGBM
  • Random Forest
  • Extra Trees
  (CatBoost handled separately via its own internal CV due to categorical support)
"""

from __future__ import annotations

from scipy.stats import loguniform, randint, uniform


# ─────────────────────────────────────────────────────────────────────────────
# RANDOMIZED SEARCH SPACES (broad exploration)
# ─────────────────────────────────────────────────────────────────────────────

RANDOM_SPACES: dict[str, dict] = {

    "XGBoost": {
        "n_estimators":        randint(200, 800),
        "max_depth":           randint(3, 10),
        "learning_rate":       loguniform(0.01, 0.3),
        "subsample":           uniform(0.5, 0.5),          # [0.5, 1.0]
        "colsample_bytree":    uniform(0.5, 0.5),          # [0.5, 1.0]
        "colsample_bylevel":   uniform(0.5, 0.5),          # [0.5, 1.0]
        "min_child_weight":    randint(1, 15),
        "gamma":               loguniform(1e-4, 1.0),
        "reg_alpha":           loguniform(1e-4, 10.0),     # L1
        "reg_lambda":          loguniform(1e-4, 10.0),     # L2
        "scale_pos_weight":    uniform(8.0, 8.0),          # [8, 16]
    },

    "LightGBM": {
        "n_estimators":        randint(200, 800),
        "max_depth":           randint(4, 12),
        "num_leaves":          randint(20, 150),
        "learning_rate":       loguniform(0.01, 0.2),
        "subsample":           uniform(0.5, 0.5),
        "colsample_bytree":    uniform(0.5, 0.5),
        "min_child_samples":   randint(5, 50),
        "reg_alpha":           loguniform(1e-4, 10.0),
        "reg_lambda":          loguniform(1e-4, 10.0),
        "min_split_gain":      uniform(0.0, 0.5),
    },

    "Random Forest": {
        "n_estimators":        randint(100, 600),
        "max_depth":           randint(5, 20),
        "min_samples_split":   randint(2, 20),
        "min_samples_leaf":    randint(1, 15),
        "max_features":        ["sqrt", "log2", 0.3, 0.5, 0.7],
        "max_samples":         uniform(0.6, 0.4),          # [0.6, 1.0] — bootstrap fraction
        "min_impurity_decrease": uniform(0.0, 0.01),
    },

    "Extra Trees": {
        "n_estimators":        randint(100, 600),
        "max_depth":           randint(5, 20),
        "min_samples_split":   randint(2, 20),
        "min_samples_leaf":    randint(1, 15),
        "max_features":        ["sqrt", "log2", 0.3, 0.5, 0.7],
        "min_impurity_decrease": uniform(0.0, 0.01),
    },

    "Gradient Boosting": {
        "n_estimators":        randint(100, 500),
        "max_depth":           randint(3, 8),
        "learning_rate":       loguniform(0.01, 0.2),
        "subsample":           uniform(0.5, 0.5),
        "min_samples_leaf":    randint(5, 30),
        "max_features":        ["sqrt", "log2", 0.5, 0.7, None],
        "min_impurity_decrease": uniform(0.0, 0.005),
    },

    "Logistic Regression": {
        "C":                   loguniform(1e-3, 100),
        "penalty":             ["l1", "l2", "elasticnet"],
        "solver":              ["saga"],                   # only solver that supports all penalties
        "l1_ratio":            uniform(0.0, 1.0),          # for elasticnet only
        "max_iter":            randint(500, 2000),
        "class_weight":        ["balanced"],
    },

    "Decision Tree": {
        "max_depth":           randint(3, 20),
        "min_samples_split":   randint(2, 30),
        "min_samples_leaf":    randint(1, 20),
        "max_features":        ["sqrt", "log2", None, 0.5, 0.7],
        "criterion":           ["gini", "entropy"],
        "min_impurity_decrease": uniform(0.0, 0.01),
        "class_weight":        ["balanced"],
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# GRID SEARCH SPACES (fine-tuning around best RandomSearch point)
# These are populated dynamically after RandomSearch completes.
# The static grids below serve as fallbacks / independent GridSearch runs.
# ─────────────────────────────────────────────────────────────────────────────

GRID_SPACES: dict[str, dict] = {

    "XGBoost": {
        "n_estimators":     [300, 400, 500],
        "max_depth":        [4, 5, 6, 7],
        "learning_rate":    [0.03, 0.05, 0.08],
        "subsample":        [0.7, 0.8, 0.9],
        "colsample_bytree": [0.7, 0.8, 0.9],
        "min_child_weight": [3, 5, 8],
        "scale_pos_weight": [10.0, 12.35, 15.0],
    },

    "LightGBM": {
        "n_estimators":      [300, 400, 500],
        "num_leaves":        [31, 63, 95],
        "learning_rate":     [0.03, 0.05, 0.08],
        "subsample":         [0.7, 0.8, 0.9],
        "colsample_bytree":  [0.7, 0.8, 0.9],
        "min_child_samples": [10, 20, 30],
    },

    "Random Forest": {
        "n_estimators":    [200, 300, 400],
        "max_depth":       [8, 10, 12, None],
        "min_samples_leaf":[3, 5, 8],
        "max_features":    ["sqrt", "log2", 0.5],
    },

    "Extra Trees": {
        "n_estimators":    [200, 300, 400],
        "max_depth":       [8, 10, 12, None],
        "min_samples_leaf":[3, 5, 8],
        "max_features":    ["sqrt", "log2", 0.5],
    },

    "Gradient Boosting": {
        "n_estimators":    [200, 300, 400],
        "max_depth":       [3, 4, 5],
        "learning_rate":   [0.03, 0.05, 0.08],
        "subsample":       [0.7, 0.8, 0.9],
        "min_samples_leaf":[5, 10, 15],
    },

    "Logistic Regression": {
        "C":      [0.01, 0.1, 1.0, 10.0],
        "penalty":["l2"],
        "solver": ["lbfgs"],
    },

    "Decision Tree": {
        "max_depth":        [5, 8, 10, 12],
        "min_samples_leaf": [5, 10, 15],
        "max_features":     ["sqrt", "log2", None],
        "criterion":        ["gini", "entropy"],
    },
}


def build_focused_grid(model_name: str, best_params: dict, n_steps: int = 3) -> dict:
    """
    Build a focused GridSearch grid centred around best_params from RandomSearch.

    For numeric params: generates a small neighbourhood around the best value.
    For categorical params: uses the best value ± neighbours.

    Parameters
    ----------
    model_name  : Name key matching GRID_SPACES.
    best_params : Best params dict from RandomizedSearchCV.
    n_steps     : Number of values per numeric param in focused grid (odd preferred).
    """
    import numpy as np

    focused: dict[str, list] = {}
    static_grid = GRID_SPACES.get(model_name, {})

    for param, best_val in best_params.items():
        if param not in static_grid:
            # Use only the best value
            focused[param] = [best_val]
            continue

        static_vals = static_grid[param]

        if isinstance(best_val, bool):
            focused[param] = [best_val]

        elif isinstance(best_val, float):
            # Generate neighbourhood: ±25% around best value, clipped to [min(static), max(static)]
            lo = min(v for v in static_vals if isinstance(v, (int, float)))
            hi = max(v for v in static_vals if isinstance(v, (int, float)))
            delta = (hi - lo) * 0.25
            candidates = np.linspace(
                max(lo, best_val - delta),
                min(hi, best_val + delta),
                n_steps,
            )
            focused[param] = sorted(set(round(float(v), 6) for v in candidates))

        elif isinstance(best_val, int):
            lo = min(v for v in static_vals if isinstance(v, int))
            hi = max(v for v in static_vals if isinstance(v, int))
            step = max(1, (hi - lo) // (n_steps * 2))
            candidates = range(
                max(lo, best_val - step * (n_steps // 2)),
                min(hi + 1, best_val + step * (n_steps // 2) + 1),
                step,
            )
            focused[param] = sorted(set(int(v) for v in candidates))
            if not focused[param]:
                focused[param] = [best_val]

        else:
            # Categorical — use the best value; include 1-2 neighbours from static if available
            focused[param] = [best_val]
            if isinstance(static_vals, list):
                idx = static_vals.index(best_val) if best_val in static_vals else -1
                if idx > 0:
                    focused[param].insert(0, static_vals[idx - 1])
                if idx >= 0 and idx < len(static_vals) - 1:
                    focused[param].append(static_vals[idx + 1])

    return focused
