"""Train FloodGuard's tree-based prototype models."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from utils import (
    build_prediction_preview,
    build_probability_bucket_summary,
    build_preprocessor,
    compute_classification_metrics,
    extract_feature_importance,
    feature_columns_for_training,
    prepare_xy,
    serialise_model_artifact,
)

from sklearn.ensemble import RandomForestClassifier
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.pipeline import Pipeline


def train_random_forest(train_df, test_df, model_path: Path, dataset_summary) -> dict[str, Any]:
    """Train and evaluate the balanced random-forest baseline."""

    feature_columns, dropped_features, blocked_features = feature_columns_for_training(train_df)
    x_train, y_train = prepare_xy(train_df, feature_columns)
    x_test, y_test = prepare_xy(test_df, feature_columns)

    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(feature_columns)),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=8,
                    min_samples_leaf=2,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    probabilities = pipeline.predict_proba(x_test)[:, 1]
    feature_importance = extract_feature_importance(pipeline, "random_forest")

    serialise_model_artifact(
        model_path,
        {
            "modelName": "random_forest",
            "notes": "Balanced random forest for prototype comparison only.",
            "pipeline": pipeline,
            "featureColumns": feature_columns,
        },
    )

    return {
        "modelName": "random_forest",
        "status": "trained",
        "metrics": compute_classification_metrics(y_test, predictions, probabilities),
        "predictionPreview": build_prediction_preview(
            test_df, predictions, probabilities, dataset_summary
        ),
        "probabilityBuckets": build_probability_bucket_summary(y_test, probabilities),
        "classWeight": "balanced",
        "warnings": [
            "Random-forest importance is useful for prototype interpretation, not production flood causality claims."
        ]
        + (
            [f"Blocked leakage-prone feature columns: {', '.join(blocked_features)}."]
            if blocked_features
            else []
        )
        + (
            [f"Skipped always-missing feature columns: {', '.join(dropped_features)}."]
            if dropped_features
            else []
        ),
        "featureColumns": feature_columns,
        "featureImportance": feature_importance,
    }


def train_extra_trees(train_df, test_df, model_path: Path, dataset_summary) -> dict[str, Any]:
    """Train and evaluate a balanced extra-trees baseline for broader ensemble comparison."""

    feature_columns, dropped_features, blocked_features = feature_columns_for_training(train_df)
    x_train, y_train = prepare_xy(train_df, feature_columns)
    x_test, y_test = prepare_xy(test_df, feature_columns)

    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(feature_columns)),
            (
                "model",
                ExtraTreesClassifier(
                    n_estimators=400,
                    max_depth=10,
                    min_samples_leaf=2,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    probabilities = pipeline.predict_proba(x_test)[:, 1]
    feature_importance = extract_feature_importance(pipeline, "extra_trees")

    serialise_model_artifact(
        model_path,
        {
            "modelName": "extra_trees",
            "notes": "Balanced extra trees for prototype comparison only.",
            "pipeline": pipeline,
            "featureColumns": feature_columns,
        },
    )

    return {
        "modelName": "extra_trees",
        "status": "trained",
        "metrics": compute_classification_metrics(y_test, predictions, probabilities),
        "predictionPreview": build_prediction_preview(
            test_df, predictions, probabilities, dataset_summary
        ),
        "probabilityBuckets": build_probability_bucket_summary(y_test, probabilities),
        "classWeight": "balanced",
        "warnings": [
            "Extra-trees importance is useful for prototype comparison, not causal flood interpretation."
        ]
        + (
            [f"Blocked leakage-prone feature columns: {', '.join(blocked_features)}."]
            if blocked_features
            else []
        )
        + (
            [f"Skipped always-missing feature columns: {', '.join(dropped_features)}."]
            if dropped_features
            else []
        ),
        "featureColumns": feature_columns,
        "featureImportance": feature_importance,
    }


def main() -> None:
    print("Use evaluate.py to run the full training and reporting workflow.")


if __name__ == "__main__":
    main()
