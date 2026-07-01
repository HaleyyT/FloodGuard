"""Run FloodGuard's prototype ML training and evaluation workflow."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from build_dataset import build_scenario_dataset
from model_card import write_model_card
from train_baseline import train_logistic_regression, train_majority_baseline
from train_tree_models import train_random_forest
from utils import (
    DATA_DIR,
    DEFAULT_DATASET,
    MODELS_DIR,
    REPORTS_DIR,
    SCENARIO_DATASET,
    build_dataset_summary,
    build_dataset_warnings,
    ensure_runtime_dirs,
    load_dataset,
    save_feature_importance_artifacts,
    split_dataset_for_time_order,
    write_json,
)


def evaluate_dataset(dataset_name: str, dataset_path: Path) -> dict[str, Any]:
    """Train prototype models on one dataset and record their metrics."""

    dataframe = load_dataset(dataset_path)
    summary = build_dataset_summary(dataframe, dataset_name)
    warnings = build_dataset_warnings(summary)
    split = split_dataset_for_time_order(dataframe)
    split_metadata = {key: value for key, value in split.items() if key not in {"train", "test"}}
    models_dir = MODELS_DIR / dataset_name
    models_dir.mkdir(parents=True, exist_ok=True)

    if split["trainPositiveCount"] == 0 or split["testPositiveCount"] == 0:
        warnings.append(
            "Train/test split does not preserve both classes, so ML comparisons are skipped for this dataset."
        )
        payload = {
            "datasetName": dataset_name,
            "datasetPath": str(dataset_path),
            "mode": "shadow",
            "liveScoringEnabled": False,
            "summary": summary,
            "warnings": warnings,
            "split": split_metadata,
            "models": [],
            "bestPrototypeModel": None,
            "status": "skipped",
        }
        write_json(REPORTS_DIR / f"{dataset_name}_metrics.json", payload)
        return payload

    model_results = [
        train_majority_baseline(
            split["train"],
            split["test"],
            models_dir / "majority_baseline.joblib",
        ),
        train_logistic_regression(
            split["train"],
            split["test"],
            models_dir / "logistic_regression.joblib",
        ),
        train_random_forest(
            split["train"],
            split["test"],
            models_dir / "random_forest.joblib",
        ),
    ]

    ranked_models = sorted(
        [result for result in model_results if result["status"] == "trained"],
        key=lambda result: (
            result["metrics"]["balancedAccuracy"],
            result["metrics"]["f1"],
        ),
        reverse=True,
    )
    best_model = ranked_models[0] if ranked_models else None

    if best_model is not None and best_model["featureImportance"] is not None:
        dataset_feature_csv = REPORTS_DIR / f"{dataset_name}_feature_importance.csv"
        dataset_feature_png = REPORTS_DIR / f"{dataset_name}_feature_importance.png"
        save_feature_importance_artifacts(
            best_model["featureImportance"], dataset_feature_csv, dataset_feature_png
        )

    payload = {
        "datasetName": dataset_name,
        "datasetPath": str(dataset_path),
        "mode": "shadow",
        "liveScoringEnabled": False,
        "readyForValidatedML": False,
        "summary": summary,
        "warnings": warnings,
        "split": split_metadata,
        "models": [
            {
                key: value
                for key, value in result.items()
                if key != "featureImportance"
            }
            for result in model_results
        ],
        "bestPrototypeModel": None if best_model is None else best_model["modelName"],
        "status": "completed",
    }
    write_json(REPORTS_DIR / f"{dataset_name}_metrics.json", payload)
    return {
        **payload,
        "featureImportance": None if best_model is None else best_model["featureImportance"],
    }


def write_combined_reports(results: list[dict[str, Any]]) -> None:
    """Create the shared report files expected by the roadmap."""

    aggregated = {
        "mode": "shadow",
        "liveScoringEnabled": False,
        "readyForValidatedML": False,
        "datasets": {
            result["datasetName"]: {
                "status": result["status"],
                "bestPrototypeModel": result["bestPrototypeModel"],
                "warnings": result["warnings"],
                "summary": result["summary"],
            }
            for result in results
        },
        "summary": "Prototype model comparison only. Live app remains rule-based.",
    }
    write_json(REPORTS_DIR / "metrics.json", aggregated)

    preferred_feature_source = next(
        (
            result
            for result in results
            if result["datasetName"] == "scenario_stress_test"
            and result.get("featureImportance") is not None
        ),
        None,
    )
    if preferred_feature_source is None:
        preferred_feature_source = next(
            (result for result in results if result.get("featureImportance") is not None),
            None,
        )

    if preferred_feature_source is not None:
        save_feature_importance_artifacts(
            preferred_feature_source["featureImportance"],
            REPORTS_DIR / "feature_importance.csv",
            REPORTS_DIR / "feature_importance.png",
        )

    write_model_card(results)


def main() -> None:
    ensure_runtime_dirs()
    build_scenario_dataset(SCENARIO_DATASET)
    dataset_results = [
        evaluate_dataset("real_export", DEFAULT_DATASET),
        evaluate_dataset("scenario_stress_test", SCENARIO_DATASET),
    ]
    write_combined_reports(dataset_results)
    print("FloodGuard Day 3 ML pipeline complete.")
    print(f"Reports: {REPORTS_DIR}")
    print(f"Models: {MODELS_DIR}")


if __name__ == "__main__":
    main()
