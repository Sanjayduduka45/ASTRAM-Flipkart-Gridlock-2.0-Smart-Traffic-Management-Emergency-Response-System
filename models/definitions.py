"""
models/definitions.py
======================
Model zoo: all 8 classifiers with production-ready hyperparameters,
class-weight compensation, and consistent random seeds.

Models
------
1. Logistic Regression     — strong linear baseline; l2 regularised; class_weight
2. Decision Tree           — interpretable single tree; class_weight
3. Random Forest           — bagged trees; class_weight; n_jobs=-1
4. Extra Trees             — extremely randomised; faster than RF; class_weight
5. XGBoost                 — gradient boosting; scale_pos_weight for imbalance
6. LightGBM                — fast histogram boosting; class_weight via is_unbalance
7. CatBoost                — categorical-aware boosting; auto_class_weights
8. Gradient Boosting       — sklearn GBM; subsample for stochastic boosting

Hyperparameter rationale
-------------------------
- All tree-based models: depth limited to prevent overfitting on 6.5k samples.
- LR: max_iter=1000 to ensure convergence on the scaled feature set.
- Boosting: n_estimators=300-500 with early stopping in the trainer.
- class_weight / scale_pos_weight / is_unbalance: set to handle 12.35:1 imbalance.
"""

from __future__ import annotations

from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import (
    RandomForestClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
)
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

from models.config import RANDOM_STATE, SCALE_POS_WEIGHT


def get_model_zoo() -> dict:
    """
    Return an ordered dict of {name: (model_instance, supports_predict_proba)}.

    All models are configured for:
      - Binary classification (requires_road_closure)
      - Class imbalance compensation (ratio ≈ 12.35:1)
      - Reproducibility (fixed random_state)
      - CPU parallelism where available (n_jobs=-1)
    """
    return {
        "Logistic Regression": LogisticRegression(
            C=1.0,
            max_iter=1000,
            class_weight="balanced",
            solver="lbfgs",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),

        "Decision Tree": DecisionTreeClassifier(
            max_depth=8,
            min_samples_leaf=10,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),

        "Random Forest": RandomForestClassifier(
            n_estimators=300,
            max_depth=10,
            min_samples_leaf=5,
            max_features="sqrt",
            class_weight="balanced",
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),

        "Extra Trees": ExtraTreesClassifier(
            n_estimators=300,
            max_depth=10,
            min_samples_leaf=5,
            max_features="sqrt",
            class_weight="balanced",
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),

        "XGBoost": XGBClassifier(
            n_estimators=400,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=5,
            scale_pos_weight=SCALE_POS_WEIGHT,   # compensates 12.35:1 imbalance
            eval_metric="auc",
            use_label_encoder=False,
            tree_method="hist",
            n_jobs=-1,
            random_state=RANDOM_STATE,
            verbosity=0,
        ),

        "LightGBM": LGBMClassifier(
            n_estimators=400,
            max_depth=7,
            learning_rate=0.05,
            num_leaves=63,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_samples=20,
            is_unbalance=True,                   # compensates class imbalance
            n_jobs=-1,
            random_state=RANDOM_STATE,
            verbose=-1,
        ),

        "CatBoost": CatBoostClassifier(
            iterations=400,
            depth=7,
            learning_rate=0.05,
            l2_leaf_reg=3,
            auto_class_weights="Balanced",       # compensates class imbalance
            eval_metric="AUC",
            random_seed=RANDOM_STATE,
            verbose=0,
        ),

        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=10,
            random_state=RANDOM_STATE,
        ),
    }
