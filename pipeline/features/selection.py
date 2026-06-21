"""
pipeline/features/selection.py
================================
Comprehensive Feature Selection Analysis for the Astram Traffic Event dataset.

Six complementary methods are compared:
  1. Correlation Analysis  — Pearson / point-biserial |r| with target
  2. Mutual Information    — Model-agnostic information-theoretic score
  3. Chi-Square            — χ² test for independence (non-negative int features)
  4. ANOVA F-test          — Univariate F-statistic per feature
  5. Random Forest         — Mean Decrease Impurity (MDI) from fitted RF
  6. Permutation Importance— Model-agnostic, corrects for high-cardinality bias

Outputs
-------
  feature_selection_report.csv  — Full ranked table (all methods + ensemble)
  top10_features.csv            — Top-10 consensus features
  top20_features.csv            — Top-20 consensus features
  top30_features.csv            — Top-30 consensus features
  redundant_features.csv        — Detected redundant / highly correlated pairs
  feature_selection_summary.txt — Human-readable report

Usage
-----
    python -m pipeline.features.selection
    # or
    from pipeline.features.selection import run_feature_selection
    results = run_feature_selection(X_train, y_train)
"""

from __future__ import annotations

import logging
import sys
import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy.stats import pointbiserialr
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import (
    chi2,
    f_classif,
    mutual_info_classif,
)
from sklearn.inspection import permutation_importance
from sklearn.preprocessing import MinMaxScaler

warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=UserWarning)

logger = logging.getLogger(__name__)

# ── Feature Category Map (prefix-based lookup) ─────────────────────────────
_FEATURE_CATEGORIES = {
    "hour": "Temporal", "dow": "Temporal", "month": "Temporal",
    "is_weekend": "Temporal", "is_morning_peak": "Temporal", "is_night_peak": "Temporal",
    "is_daytime_ban": "Temporal", "is_transition": "Temporal", "is_pre_dawn": "Temporal",
    "hour_bin": "Temporal", "hour_quadrant": "Temporal", "quarter": "Temporal",
    "days_since": "Temporal", "time_since_midnight": "Temporal",
    "sin_hour_fine": "Temporal", "cos_hour_fine": "Temporal",
    "cause": "Event", "event_type": "Event", "veh_type": "Event",
    "is_planned": "Event", "is_heavy": "Event", "is_public": "Event",
    "is_infrastructure": "Event", "is_obstruction": "Event", "is_vehicle": "Event",
    "is_social": "Event", "is_environmental": "Event", "is_high_closure": "Event",
    "corridor": "Congestion", "is_arterial": "Congestion", "is_non_corridor": "Congestion",
    "is_cbd": "Congestion", "is_peak_congestion": "Congestion",
    "hour_corridor": "Congestion", "hour_bin_system": "Congestion",
    "vehicles_per": "Congestion", "police_station": "Congestion",
    "zone": "Zone", "gba": "Zone", "is_high_risk_zone": "Zone", "is_unknown_zone": "Zone",
    "junction": "Junction",
    "closure_risk": "RoadClosure", "hour_closure": "RoadClosure",
    "lat": "Geospatial", "lon": "Geospatial", "dist_to": "Geospatial",
    "radial_band": "Geospatial", "lat_lon": "Geospatial",
    "spatial_grid": "Geospatial", "coord_out": "Geospatial",
    "is_radial": "Route", "is_orbital": "Route",
    "corridor_cluster": "Route", "corridor_length": "Route",
    "cause_x": "Interaction", "heavy_x": "Interaction",
    "obstruction_x": "Interaction", "social_x": "Interaction",
    "zone_risk_x": "Interaction", "dist_centre_x": "Interaction",
    "corridor_x": "Interaction", "junction_x": "Interaction",
    "corridor_zone": "GroupStat", "hour_cause": "GroupStat",
    "zone_cause": "GroupStat", "police_hour": "GroupStat",
    "rolling": "Rolling", "events_same": "Rolling",
    "description": "Text", "address": "Text",
    "if_anomaly": "Anomaly", "authenticated": "Other",
    "start_dt_parse": "Other", "veh_type_was": "Missing",
    "zone_was": "Missing", "junction_was": "Missing",
    "corridor_was": "Missing", "gba_identifier_was": "Missing",
}


def _get_category(name: str) -> str:
    for prefix, cat in _FEATURE_CATEGORIES.items():
        if name.lower().startswith(prefix.lower()):
            return cat
    return "Other"


# ──────────────────────────────────────────────────────────────────────────────
# Individual scoring methods
# ──────────────────────────────────────────────────────────────────────────────

def _score_correlation(X: pd.DataFrame, y: pd.Series) -> pd.Series:
    """Pearson / point-biserial |r| between each feature and binary target."""
    y_int = y.astype(int)
    scores = {}
    for col in X.columns:
        try:
            std = X[col].std()
            if std == 0:
                scores[col] = 0.0
            else:
                r, _ = pointbiserialr(y_int, X[col])
                scores[col] = abs(r) if np.isfinite(r) else 0.0
        except Exception:
            scores[col] = 0.0
    return pd.Series(scores)


def _score_mutual_info(X: pd.DataFrame, y: pd.Series, random_state: int = 42) -> pd.Series:
    """Mutual information between each feature and target (model-agnostic)."""
    mi = mutual_info_classif(X, y.astype(int), discrete_features=False,
                              random_state=random_state)
    return pd.Series(mi, index=X.columns)


def _score_chi2(X: pd.DataFrame, y: pd.Series) -> pd.Series:
    """Chi-Square statistic. Features must be non-negative; clip then scale."""
    # MinMax-scale to [0, 1] to satisfy non-negativity requirement
    scaler = MinMaxScaler()
    X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=X.columns)
    chi_stats, _ = chi2(X_scaled, y.astype(int))
    return pd.Series(chi_stats, index=X.columns)


def _score_anova(X: pd.DataFrame, y: pd.Series) -> pd.Series:
    """ANOVA F-statistic for each feature vs the binary target."""
    f_stats, _ = f_classif(X, y.astype(int))
    return pd.Series(np.where(np.isfinite(f_stats), f_stats, 0.0), index=X.columns)


def _score_rf_importance(
    X: pd.DataFrame,
    y: pd.Series,
    n_estimators: int = 200,
    random_state: int = 42,
) -> tuple[pd.Series, RandomForestClassifier]:
    """Random Forest Mean Decrease Impurity (MDI) importances."""
    rf = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=8,
        class_weight="balanced",
        n_jobs=-1,
        random_state=random_state,
    )
    rf.fit(X, y.astype(int))
    return pd.Series(rf.feature_importances_, index=X.columns), rf


def _score_permutation(
    rf: RandomForestClassifier,
    X: pd.DataFrame,
    y: pd.Series,
    n_repeats: int = 10,
    random_state: int = 42,
) -> pd.Series:
    """Permutation importance: mean decrease in model accuracy when feature is shuffled."""
    result = permutation_importance(
        rf, X, y.astype(int),
        n_repeats=n_repeats,
        random_state=random_state,
        n_jobs=-1,
        scoring="roc_auc",
    )
    scores = np.where(result.importances_mean > 0, result.importances_mean, 0.0)
    return pd.Series(scores, index=X.columns)


# ──────────────────────────────────────────────────────────────────────────────
# Redundancy Detection
# ──────────────────────────────────────────────────────────────────────────────

def detect_redundant_features(
    X: pd.DataFrame,
    corr_threshold: float = 0.90,
    top_n_features: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Identify pairs of features with Pearson |r| >= corr_threshold.

    Parameters
    ----------
    X               : Feature matrix (numeric only)
    corr_threshold  : Absolute correlation above which pairs are flagged redundant
    top_n_features  : If provided, only look within this subset of features

    Returns
    -------
    DataFrame with columns: feature_a, feature_b, correlation, recommendation
    """
    if top_n_features:
        X = X[[f for f in top_n_features if f in X.columns]]

    corr = X.corr().abs()
    upper = corr.where(np.triu(np.ones(corr.shape), k=1).astype(bool))

    pairs = []
    for col in upper.columns:
        high = upper[col][upper[col] >= corr_threshold]
        for row, val in high.items():
            pairs.append({
                "feature_a":      row,
                "feature_b":      col,
                "correlation":    round(val, 4),
                "recommendation": (
                    "Drop one; they are near-perfectly correlated"
                    if val >= 0.95
                    else "Evaluate; strong correlation — may be redundant"
                ),
            })

    result = pd.DataFrame(pairs)
    if not result.empty:
        result = result.sort_values("correlation", ascending=False).reset_index(drop=True)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Master Feature Selection Runner
# ──────────────────────────────────────────────────────────────────────────────

def run_feature_selection(
    X: pd.DataFrame,
    y: pd.Series,
    rf_n_estimators: int = 200,
    perm_n_repeats:  int = 10,
    random_state:    int = 42,
    redundancy_threshold: float = 0.90,
) -> dict:
    """
    Run all 6 feature selection methods and compile the consensus report.

    Returns
    -------
    dict with keys:
        full_report      : pd.DataFrame — all features, all scores, ensemble rank
        top10            : pd.DataFrame
        top20            : pd.DataFrame
        top30            : pd.DataFrame
        redundant        : pd.DataFrame — highly correlated pairs
        category_summary : pd.DataFrame — per-category aggregate
    """
    # ── Pre-flight: numeric only, NaN → 0 ────────────────────────────────────
    X_num = X.select_dtypes(include=[np.number]).fillna(0)
    features = list(X_num.columns)
    n = len(features)
    logger.info("Feature selection over %d numeric features, %d samples.", n, len(y))

    # ── 1. Correlation ────────────────────────────────────────────────────────
    logger.info("[1/6] Correlation analysis...")
    corr_scores = _score_correlation(X_num, y)

    # ── 2. Mutual Information ────────────────────────────────────────────────
    logger.info("[2/6] Mutual Information...")
    mi_scores = _score_mutual_info(X_num, y, random_state)

    # ── 3. Chi-Square ─────────────────────────────────────────────────────────
    logger.info("[3/6] Chi-Square...")
    chi_scores = _score_chi2(X_num, y)

    # ── 4. ANOVA F-test ───────────────────────────────────────────────────────
    logger.info("[4/6] ANOVA F-test...")
    anova_scores = _score_anova(X_num, y)

    # ── 5. Random Forest Importance (MDI) ─────────────────────────────────────
    logger.info("[5/6] Random Forest Importance (fitting RF with %d trees)...", rf_n_estimators)
    rf_scores, rf_model = _score_rf_importance(X_num, y, rf_n_estimators, random_state)

    # ── 6. Permutation Importance ─────────────────────────────────────────────
    logger.info("[6/6] Permutation Importance (%d repeats)...", perm_n_repeats)
    perm_scores = _score_permutation(rf_model, X_num, y, perm_n_repeats, random_state)

    # ── Assemble DataFrame ────────────────────────────────────────────────────
    report = pd.DataFrame({
        "feature":           features,
        "correlation":       corr_scores.reindex(features).fillna(0).values,
        "mutual_info":       mi_scores.reindex(features).fillna(0).values,
        "chi2":              chi_scores.reindex(features).fillna(0).values,
        "anova_f":           anova_scores.reindex(features).fillna(0).values,
        "rf_importance":     rf_scores.reindex(features).fillna(0).values,
        "permutation_imp":   perm_scores.reindex(features).fillna(0).values,
    })

    # ── Per-method ranks (rank 1 = most important) ────────────────────────────
    method_cols = ["correlation", "mutual_info", "chi2", "anova_f",
                   "rf_importance", "permutation_imp"]
    for col in method_cols:
        report[f"{col}_rank"] = (
            report[col].rank(ascending=False, method="min").fillna(n).astype(int)
        )

    rank_cols = [f"{c}_rank" for c in method_cols]
    report["mean_rank"]    = report[rank_cols].mean(axis=1).round(3)
    report["ensemble_rank"] = report["mean_rank"].rank(method="min").astype(int)
    report["category"]      = report["feature"].apply(_get_category)

    # Sort by ensemble rank
    report = report.sort_values("ensemble_rank").reset_index(drop=True)

    # Round raw scores for display
    for col in method_cols:
        report[col] = report[col].round(6)

    # ── Top-N subsets ─────────────────────────────────────────────────────────
    top10 = report.head(10).copy()
    top20 = report.head(20).copy()
    top30 = report.head(30).copy()

    # ── Redundancy within Top-30 ──────────────────────────────────────────────
    logger.info("Detecting redundant features (|r| >= %.2f)...", redundancy_threshold)
    top30_features = top30["feature"].tolist()
    redundant = detect_redundant_features(
        X_num,
        corr_threshold=redundancy_threshold,
        top_n_features=top30_features,
    )

    # ── Category summary ──────────────────────────────────────────────────────
    cat_summary = (
        report.groupby("category")
        .agg(
            n_features=("feature", "count"),
            n_top30=("ensemble_rank", lambda s: (s <= 30).sum()),
            best_rank=("ensemble_rank", "min"),
            mean_mi=("mutual_info", "mean"),
            mean_rf=("rf_importance", "mean"),
            mean_perm=("permutation_imp", "mean"),
        )
        .sort_values("best_rank")
        .round(6)
    )

    logger.info("Feature selection complete. Top feature: %s", report["feature"].iloc[0])
    return {
        "full_report":      report,
        "top10":            top10,
        "top20":            top20,
        "top30":            top30,
        "redundant":        redundant,
        "category_summary": cat_summary,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Report Writer
# ──────────────────────────────────────────────────────────────────────────────

def write_report(results: dict, output_dir: Path) -> None:
    """Persist all CSVs and the human-readable summary text file."""
    output_dir.mkdir(parents=True, exist_ok=True)

    report   = results["full_report"]
    top10    = results["top10"]
    top20    = results["top20"]
    top30    = results["top30"]
    redundant= results["redundant"]
    cat_sum  = results["category_summary"]

    # CSV outputs
    report.to_csv(output_dir / "feature_selection_report.csv", index=False)
    top10.to_csv(  output_dir / "top10_features.csv",          index=False)
    top20.to_csv(  output_dir / "top20_features.csv",          index=False)
    top30.to_csv(  output_dir / "top30_features.csv",          index=False)
    redundant.to_csv(output_dir / "redundant_features.csv",    index=False)
    cat_sum.to_csv(  output_dir / "category_summary.csv")

    # Human-readable text report
    line = "=" * 80
    sep  = "-" * 80

    display_cols = [
        "ensemble_rank", "feature", "category",
        "correlation", "mutual_info", "chi2", "anova_f",
        "rf_importance", "permutation_imp", "mean_rank",
    ]

    def _fmt(df: pd.DataFrame, n: int) -> str:
        sub = df[display_cols].head(n).copy()
        sub.columns = [
            "Rank", "Feature", "Category",
            "Corr", "MI", "Chi2", "ANOVA-F",
            "RF-Imp", "Perm-Imp", "MeanRank",
        ]
        return sub.to_string(index=False)

    # Method agreement tables: for each top-N, how many methods agree in their top-N
    def _agreement(top_df: pd.DataFrame, n: int) -> str:
        feats = top_df["feature"].tolist()
        method_top = {
            "Correlation":   report.nsmallest(n, "correlation_rank")["feature"].tolist(),
            "Mutual Info":   report.nsmallest(n, "mutual_info_rank")["feature"].tolist(),
            "Chi2":          report.nsmallest(n, "chi2_rank")["feature"].tolist(),
            "ANOVA-F":       report.nsmallest(n, "anova_f_rank")["feature"].tolist(),
            "RF Importance": report.nsmallest(n, "rf_importance_rank")["feature"].tolist(),
            "Permutation":   report.nsmallest(n, "permutation_imp_rank")["feature"].tolist(),
        }
        rows = []
        for feat in feats:
            votes = sum(1 for lst in method_top.values() if feat in lst)
            rows.append(f"  {feat:<45} {votes}/6 methods")
        return "\n".join(rows)

    with open(output_dir / "feature_selection_summary.txt", "w", encoding="utf-8") as f:
        f.write(f"{line}\n")
        f.write("ASTRAM TRAFFIC EVENT — COMPREHENSIVE FEATURE SELECTION REPORT\n")
        f.write(f"{line}\n\n")
        f.write("Methods compared:\n")
        f.write("  1. Correlation Analysis    (Pearson |r| / point-biserial)\n")
        f.write("  2. Mutual Information      (sklearn mutual_info_classif)\n")
        f.write("  3. Chi-Square              (sklearn chi2, MinMax-scaled features)\n")
        f.write("  4. ANOVA F-test            (sklearn f_classif)\n")
        f.write("  5. Random Forest Importance(MDI, 200 trees, max_depth=8)\n")
        f.write("  6. Permutation Importance  (10 repeats, AUC metric, same RF)\n\n")
        f.write(f"Total features evaluated : {len(report)}\n")
        f.write(f"Target variable          : requires_road_closure (binary)\n\n")

        # ── Top 10 ──────────────────────────────────────────────────────────
        f.write(f"{line}\n TOP-10 FEATURES (Ensemble Consensus)\n{line}\n")
        f.write(_fmt(top10, 10))
        f.write("\n\nMethod Agreement (how many of the 6 methods agree this feature is in top-10):\n")
        f.write(_agreement(top10, 10))
        f.write("\n\n")

        # ── Top 20 ──────────────────────────────────────────────────────────
        f.write(f"{line}\n TOP-20 FEATURES (Ensemble Consensus)\n{line}\n")
        f.write(_fmt(top20, 20))
        f.write("\n\nMethod Agreement (how many of the 6 methods agree this feature is in top-20):\n")
        f.write(_agreement(top20, 20))
        f.write("\n\n")

        # ── Top 30 ──────────────────────────────────────────────────────────
        f.write(f"{line}\n TOP-30 FEATURES (Ensemble Consensus)\n{line}\n")
        f.write(_fmt(top30, 30))
        f.write("\n\nMethod Agreement (how many of the 6 methods agree this feature is in top-30):\n")
        f.write(_agreement(top30, 30))
        f.write("\n\n")

        # ── Redundant Features ───────────────────────────────────────────────
        f.write(f"{line}\n REDUNDANT FEATURES (|r| >= 0.90 within Top-30)\n{line}\n")
        if redundant.empty:
            f.write("  No highly correlated pairs found in top-30 features.\n\n")
        else:
            f.write(redundant.to_string(index=False))
            f.write("\n\n")
            # Identify drop candidates
            drop_candidates = set()
            for _, row in redundant.iterrows():
                a_rank = report.loc[report["feature"] == row["feature_a"], "ensemble_rank"]
                b_rank = report.loc[report["feature"] == row["feature_b"], "ensemble_rank"]
                if not a_rank.empty and not b_rank.empty:
                    drop = row["feature_b"] if a_rank.values[0] < b_rank.values[0] else row["feature_a"]
                    drop_candidates.add(drop)
            f.write("  Suggested drop candidates (lower-ranked of each pair):\n")
            for d in sorted(drop_candidates):
                f.write(f"    - {d}\n")
            f.write("\n")

        # ── Category Summary ─────────────────────────────────────────────────
        f.write(f"{line}\n FEATURE CATEGORY SUMMARY\n{line}\n")
        f.write(cat_sum.to_string())
        f.write("\n\n")

        # ── Per-Method Top-10 Lists ──────────────────────────────────────────
        f.write(f"{line}\n PER-METHOD TOP-10 LISTS\n{line}\n")
        method_rank_cols = {
            "Correlation":    "correlation_rank",
            "Mutual Info":    "mutual_info_rank",
            "Chi-Square":     "chi2_rank",
            "ANOVA F-test":   "anova_f_rank",
            "RF Importance":  "rf_importance_rank",
            "Permutation":    "permutation_imp_rank",
        }
        for method_name, rank_col in method_rank_cols.items():
            top10_method = report.nsmallest(10, rank_col)[["feature", "category", rank_col]].copy()
            top10_method.columns = ["Feature", "Category", "Rank"]
            f.write(f"\n  [{method_name}]\n")
            f.write(top10_method.to_string(index=False))
            f.write("\n")

        f.write(f"\n{line}\n END OF REPORT\n{line}\n")

    logger.info("Report written to: %s", output_dir.resolve())
