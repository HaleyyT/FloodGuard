"""Train FloodGuard's majority and logistic-regression baseline models."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from utils import (
    build_preprocessor,
    compute_classification_metrics,
    extract_feature_importance,
    feature_columns_for_training,
    prepare_xy,
    serialise_model_artifact,
)

from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


def train_majority_baseline(train_df, test_df, model_path: Path) -> dict[str, Any]:
    """Train and evaluate the always-majority baseline."""

    feature_columns, dropped_features, blocked_features = feature_columns_for_training(train_df)
    x_train, y_train = prepare_xy(train_df, feature_columns)
    x_test, y_test = prepare_xy(test_df, feature_columns)
    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(feature_columns)),
            ("model", DummyClassifier(strategy="most_frequent")),
        ]
    )
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    probabilities = pipeline.predict_proba(x_test)[:, 1]

    serialise_model_artifact(
        model_path,
        {
            "modelName": "majority_baseline",
            "notes": "Always predicts the majority class. This is the minimum bar for the prototype models.",
            "pipeline": pipeline,
        },
    )

    return {
        "modelName": "majority_baseline",
        "status": "trained",
        "metrics": compute_classification_metrics(y_test, predictions, probabilities),
        "classWeight": None,
        "warnings": [
            "This baseline is expected to look strong on plain accuracy because elevated cases are rare."
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
        "featureImportance": None,
    }


def train_logistic_regression(train_df, test_df, model_path: Path) -> dict[str, Any]:
    """Train and evaluate the balanced logistic-regression baseline."""

    feature_columns, dropped_features, blocked_features = feature_columns_for_training(train_df)
    x_train, y_train = prepare_xy(train_df, feature_columns)
    x_test, y_test = prepare_xy(test_df, feature_columns)

    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(feature_columns)),
            (
                "model",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=2000,
                    random_state=42,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    probabilities = pipeline.predict_proba(x_test)[:, 1]
    feature_importance = extract_feature_importance(pipeline, "logistic_regression")

    serialise_model_artifact(
        model_path,
        {
            "modelName": "logistic_regression",
            "notes": "Balanced logistic regression for shadow-mode comparison only.",
            "pipeline": pipeline,
            "featureColumns": feature_columns,
        },
    )

    return {
        "modelName": "logistic_regression",
        "status": "trained",
        "metrics": compute_classification_metrics(y_test, predictions, probabilities),
        "classWeight": "balanced",
        "warnings": [
            "Logistic regression is still trained on rule-derived labels and should remain shadow-only."
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
