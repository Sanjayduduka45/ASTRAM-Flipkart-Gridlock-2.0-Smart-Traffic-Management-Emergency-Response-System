"""
pipeline/pipeline.py
====================
Master AstramPreprocessor — assembles all pipeline stages into a single,
serialisable sklearn-compatible object.

Architecture
------------
The pipeline executes in this order:

  [RAW DATA]
      │
      ▼
  ① CLEANING  (stateless; run before fit/transform split)
      │  drop_irrelevant_columns
      │  remove_duplicates
      │  validate_coordinates  → adds `coord_out_of_bounds`
      │  fix_timestamp_anomalies → adds `start_dt_parse_failed`
      │
      ▼
  ② IMPUTATION
      │  NumericalImputer   (median + was_missing flags)
      │  CategoricalImputer (constant / mode + was_missing flags)
      │  TextImputer        (empty-string + keyword features + PIN extraction)
      │
      ▼
  ③ FEATURE ENGINEERING
      │  DatetimeFeatureExtractor (hour/dow/month cyclical + flags + lag)
      │  GeoFeatureTransformer    (Haversine distances to top-10 junctions)
      │
      ▼
  ④ OUTLIER TREATMENT
      │  IQRFencer                (clip + per-column outlier flags)
      │  IsolationForestAnomalyFlagger (multivariate; adds if_anomaly cols)
      │
      ▼
  ⑤ ENCODING
      │  Categorical columns encoded with the user-selected strategy
      │  (label / frequency / target)
      │
      ▼
  [FEATURE MATRIX X_processed + target vector y]

Serialisation
-------------
  The fitted pipeline can be saved via pipeline.save() to a .pkl file using
  Python's pickle module.
  Reload with AstramPreprocessor.load(path).

Usage
-----
  from pipeline.pipeline import AstramPreprocessor

  pipe = AstramPreprocessor(target="requires_road_closure",
                            encoding_strategy="frequency")
  X_train, y_train = pipe.fit_transform(df_train)

  # Later, on new data:
  X_test, y_test = pipe.transform(df_test)

  pipe.save("models/preprocessor.pkl")
  pipe2 = AstramPreprocessor.load("models/preprocessor.pkl")
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from pipeline.cleaning import run_cleaning
from pipeline.config import (
    CATEGORICAL_FEATURES,
    DEFAULT_TARGET,
    NUMERIC_FEATURES,
    TARGET_COLUMNS,
    TEXT_FEATURES,
)
from pipeline.datetime_feats import DatetimeFeatureExtractor
from pipeline.encoding import (
    FrequencyEncoderTransformer,
    LabelEncoderTransformer,
    TargetEncoderTransformer,
)
from pipeline.geo_feats import GeoFeatureTransformer
from pipeline.missing import CategoricalImputer, NumericalImputer, TextImputer
from pipeline.outliers import IQRFencer, IsolationForestAnomalyFlagger

logger = logging.getLogger(__name__)


class AstramPreprocessor:
    """
    End-to-end preprocessing pipeline for the Astram traffic event dataset.

    Parameters
    ----------
    target : str
        Target column name. Must be one of the keys in config.TARGET_COLUMNS.
        Default: "requires_road_closure".
    encoding_strategy : str
        Categorical encoding strategy: "label", "frequency", or "target".
        "target" requires y to be passed during fit.
        Default: "frequency" — best balance between interpretability and
                 performance for tree-based models.
    run_isolation_forest : bool
        Whether to include the Isolation Forest anomaly step.
        Can be disabled for speed during rapid prototyping.
    scale_numerics : bool
        If True, apply StandardScaler to all final numeric features.
        Recommended for linear models (Logistic Regression, SVM).
        Not needed for tree-based models (XGBoost, LightGBM, RandomForest).
    extra_drops : list of str, optional
        Additional column names to drop during cleaning.
    """

    VALID_TARGETS = set(TARGET_COLUMNS.keys())
    VALID_ENCODINGS = {"label", "frequency", "target"}

    def __init__(
        self,
        target: str = DEFAULT_TARGET,
        encoding_strategy: str = "frequency",
        run_isolation_forest: bool = True,
        scale_numerics: bool = False,
        extra_drops: Optional[list[str]] = None,
    ):
        if target not in self.VALID_TARGETS:
            raise ValueError(
                f"Invalid target '{target}'. Choose from: {self.VALID_TARGETS}"
            )
        if encoding_strategy not in self.VALID_ENCODINGS:
            raise ValueError(
                f"Invalid encoding_strategy '{encoding_strategy}'. "
                f"Choose from: {self.VALID_ENCODINGS}"
            )

        self.target = target
        self.encoding_strategy = encoding_strategy
        self.run_isolation_forest = run_isolation_forest
        self.scale_numerics = scale_numerics
        self.extra_drops = extra_drops or []

        # These are set during fit
        self._is_fitted: bool = False
        self._feature_names_out: Optional[list[str]] = None

        # Stage transformers (set during fit)
        self._num_imputer:    Optional[NumericalImputer]   = None
        self._cat_imputer:    Optional[CategoricalImputer] = None
        self._text_imputer:   Optional[TextImputer]        = None
        self._dt_extractor:   Optional[DatetimeFeatureExtractor] = None
        self._geo_transformer:Optional[GeoFeatureTransformer]    = None
        self._iqr_fencer:     Optional[IQRFencer]          = None
        self._if_flagger:     Optional[IsolationForestAnomalyFlagger] = None
        self._encoder:        Optional[object]             = None
        self._scaler:         Optional[StandardScaler]     = None

    # ---------------------------------------------------------------------- #
    # Internal helpers
    # ---------------------------------------------------------------------- #

    def _extract_target(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, Optional[pd.Series]]:
        """Separate X and y. y may be absent in inference-only DataFrames."""
        y = None
        if self.target in df.columns:
            y = df[self.target].copy()
            # Normalise boolean target to int
            if y.dtype == bool:
                y = y.astype(int)
            elif self.target == "priority":
                y = y.map({"High": 1, "Low": 0})
        df = df.drop(columns=[c for c in TARGET_COLUMNS if c in df.columns])
        return df, y

    def _build_encoder(self) -> object:
        """Instantiate the chosen encoding transformer."""
        if self.encoding_strategy == "label":
            return LabelEncoderTransformer()
        elif self.encoding_strategy == "frequency":
            return FrequencyEncoderTransformer()
        else:  # target
            return TargetEncoderTransformer(smoothing=10.0)

    def _get_numeric_output_cols(self, df: pd.DataFrame) -> list[str]:
        """Return all numeric columns in df (for IQR and scaler)."""
        return list(df.select_dtypes(include=[np.number]).columns)

    def _get_categorical_output_cols(self, df: pd.DataFrame) -> list[str]:
        """Return all remaining string/object columns (for encoding)."""
        return list(df.select_dtypes(include=["object", "category"]).columns)

    # ---------------------------------------------------------------------- #
    # Public API
    # ---------------------------------------------------------------------- #

    def fit_transform(
        self,
        df: pd.DataFrame,
        y: Optional[pd.Series] = None,
    ) -> Tuple[pd.DataFrame, Optional[pd.Series]]:
        """
        Fit all transformers on df and return transformed (X, y).

        IMPORTANT: Only call this on TRAINING data. Fitting on the full
        dataset causes data leakage into the outlier and encoding steps.

        Parameters
        ----------
        df : pd.DataFrame
            Raw training DataFrame (may include the target column).
        y : pd.Series, optional
            Explicit target override. If None, extracted from df.

        Returns
        -------
        (X_processed, y) : (pd.DataFrame, pd.Series or None)
        """
        logger.info("=== AstramPreprocessor.fit_transform ===")

        # ① Cleaning (stateless)
        df = run_cleaning(df, extra_drops=self.extra_drops)

        # Separate X and y
        df, y_extracted = self._extract_target(df)
        if y is None:
            y = y_extracted

        # ② Imputation — fit on training data
        self._num_imputer = NumericalImputer(
            columns=NUMERIC_FEATURES, add_indicator=True
        ).fit(df)
        df = self._num_imputer.transform(df)

        self._cat_imputer = CategoricalImputer(
            columns=CATEGORICAL_FEATURES, add_indicator=True
        ).fit(df)
        df = self._cat_imputer.transform(df)

        self._text_imputer = TextImputer(columns=TEXT_FEATURES).fit(df)
        df = self._text_imputer.transform(df)

        # ③ Feature engineering
        self._dt_extractor = DatetimeFeatureExtractor(drop_source=True).fit(df)
        df = self._dt_extractor.transform(df)

        self._geo_transformer = GeoFeatureTransformer().fit(df)
        df = self._geo_transformer.transform(df)

        # ④ Outlier treatment
        num_cols_after_fe = self._get_numeric_output_cols(df)
        self._iqr_fencer = IQRFencer(
            columns=num_cols_after_fe, add_flag=True, clip=True
        ).fit(df)
        df = self._iqr_fencer.transform(df)

        if self.run_isolation_forest:
            # Use only original numeric feature cols for IF (not flags)
            if_cols = [c for c in num_cols_after_fe if not c.endswith(("_outlier", "_flag"))]
            self._if_flagger = IsolationForestAnomalyFlagger(
                columns=if_cols
            ).fit(df)
            df = self._if_flagger.transform(df)

        # ⑤ Encoding — fit on training data only
        cat_cols_to_encode = self._get_categorical_output_cols(df)
        self._encoder = self._build_encoder()
        if self.encoding_strategy == "target":
            if y is None:
                raise ValueError(
                    "encoding_strategy='target' requires y during fit_transform."
                )
            self._encoder.columns = cat_cols_to_encode
            self._encoder.fit(df, y=y)
        else:
            self._encoder.columns = cat_cols_to_encode
            self._encoder.fit(df)
        df = self._encoder.transform(df)

        # ⑥ Optional numeric scaling
        if self.scale_numerics:
            final_num_cols = self._get_numeric_output_cols(df)
            self._scaler = StandardScaler()
            df[final_num_cols] = self._scaler.fit_transform(df[final_num_cols])

        self._is_fitted = True
        self._feature_names_out = list(df.columns)

        logger.info(
            "fit_transform complete. Output shape: %s | Target: %s",
            df.shape, self.target,
        )
        return df, y

    def transform(
        self,
        df: pd.DataFrame,
    ) -> Tuple[pd.DataFrame, Optional[pd.Series]]:
        """
        Apply the fitted pipeline to new (test/production) data.

        Parameters
        ----------
        df : pd.DataFrame
            Raw input DataFrame (may or may not contain the target column).

        Returns
        -------
        (X_processed, y) : (pd.DataFrame, pd.Series or None)
        """
        if not self._is_fitted:
            raise RuntimeError(
                "Pipeline is not fitted. Call fit_transform() on training data first."
            )

        logger.info("=== AstramPreprocessor.transform ===")

        # ① Cleaning
        df = run_cleaning(df, extra_drops=self.extra_drops)

        # Separate X and y (y may be None if predicting on unlabelled data)
        df, y = self._extract_target(df)

        # ② Imputation (transform only — no fit)
        df = self._num_imputer.transform(df)
        df = self._cat_imputer.transform(df)
        df = self._text_imputer.transform(df)

        # ③ Feature engineering
        df = self._dt_extractor.transform(df)
        df = self._geo_transformer.transform(df)

        # ④ Outlier treatment
        df = self._iqr_fencer.transform(df)
        if self.run_isolation_forest and self._if_flagger is not None:
            df = self._if_flagger.transform(df)

        # ⑤ Encoding
        df = self._encoder.transform(df)

        # ⑥ Scaling
        if self.scale_numerics and self._scaler is not None:
            final_num_cols = self._get_numeric_output_cols(df)
            df[final_num_cols] = self._scaler.transform(df[final_num_cols])

        logger.info(
            "transform complete. Output shape: %s", df.shape
        )
        return df, y

    def get_feature_names_out(self) -> list[str]:
        """Return list of output feature column names after fit_transform."""
        if not self._is_fitted:
            raise RuntimeError("Call fit_transform() first.")
        return self._feature_names_out

    # ---------------------------------------------------------------------- #
    # Serialisation
    # ---------------------------------------------------------------------- #

    def save(self, path: str | Path) -> None:
        """
        Serialise the fitted pipeline to disk using pickle.

        Parameters
        ----------
        path : str or Path
            File path for the .pkl file.
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Pipeline saved to: %s", path.resolve())

    @classmethod
    def load(cls, path: str | Path) -> "AstramPreprocessor":
        """
        Load a previously saved AstramPreprocessor from disk.

        Parameters
        ----------
        path : str or Path
            Path to the .pkl file.

        Returns
        -------
        AstramPreprocessor (fitted)
        """
        with open(path, "rb") as f:
            obj = pickle.load(f)
        if not isinstance(obj, cls):
            raise TypeError(f"Loaded object is not AstramPreprocessor: {type(obj)}")
        logger.info("Pipeline loaded from: %s", Path(path).resolve())
        return obj
