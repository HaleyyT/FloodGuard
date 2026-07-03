"""Run FloodGuard's prototype ML training and evaluation workflow."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from build_dataset import build_scenario_dataset, build_training_dataset
from model_card import write_model_card
from train_baseline import train_logistic_regression, train_majority_baseline
from train_tree_models import train_random_forest
from utils import (
    DATA_DIR,
    DEFAULT_DATASET,
    MODELS_DIR,
    REPORTS_DIR,
    SCENARIO_DATASET,
    assess_leakage_controls,
    build_dataset_summary,
    build_dataset_warnings,
    ensure_runtime_dirs,
    feature_columns_for_training,
    load_dataset,
    save_feature_importance_artifacts,
    split_dataset_for_validation,
    write_json,
)


def evaluate_dataset(dataset_name: str, dataset_path: Path) -> dict[str, Any]:
    """Train prototype models on one dataset and record their metrics."""

    dataframe = load_dataset(dataset_path)
    summary = build_dataset_summary(dataframe, dataset_name)
    warnings = build_dataset_warnings(summary)
    split = split_dataset_for_validation(dataframe)
    split_metadata = {key: value for key, value in split.items() if key not in {"train", "test"}}
    trainable_features, _, _ = feature_columns_for_training(split["train"])
    leakage_controls = assess_leakage_controls(dataframe, trainable_features)
    warnings.extend(split_metadata.pop("validationWarnings", []))
    warnings.extend(leakage_controls["warnings"])
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
            "validation": {
                "primaryStrategy": split["strategy"],
                "candidateStrategies": split_metadata.get("candidateStrategies", []),
                "leakageControls": leakage_controls,
            },
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
            summary,
        ),
        train_logistic_regression(
            split["train"],
            split["test"],
            models_dir / "logistic_regression.joblib",
            summary,
        ),
        train_random_forest(
            split["train"],
            split["test"],
            models_dir / "random_forest.joblib",
            summary,
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
        "validation": {
            "primaryStrategy": split["strategy"],
            "candidateStrategies": split_metadata.get("candidateStrategies", []),
            "leakageControls": leakage_controls,
        },
        "predictionPreview": None if best_model is None else best_model.get("predictionPreview"),
        "calibration": None
        if best_model is None
        else {
            "bestModel": best_model["modelName"],
            "brierScore": best_model["metrics"].get("brierScore"),
            "probabilityBuckets": best_model.get("probabilityBuckets", []),
        },
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

    write_calibration_summary(results)
    write_validation_summary(results)
    write_model_card(results)


def write_calibration_summary(results: list[dict[str, Any]]) -> None:
    """Write a markdown summary for prototype calibration and probability outputs."""

    lines = [
        "# FloodGuard ML Calibration Summary",
        "",
        "FloodGuard reports probability-style outputs in shadow mode only.",
        "",
    ]

    for result in results:
        calibration = result.get("calibration")
        preview = result.get("predictionPreview")
        lines.extend([f"## {result['datasetName'].replace('_', ' ').title()}", ""])
        if calibration is None:
            lines.extend(
                [
                    "- Calibration summary unavailable because no trained prototype model completed.",
                    "",
                ]
            )
            continue

        lines.append(f"- Best model: `{calibration.get('bestModel')}`")
        lines.append(
            f"- Brier score: {calibration.get('brierScore') if calibration.get('brierScore') is not None else 'n/a'}"
        )
        if preview:
            lines.append(
                f"- Latest preview: {preview['predictedLabel']} at probability {preview['predictedProbability']}"
            )
            lines.append(
                f"- Confidence band: {preview['confidenceBand']} ({preview['confidenceReason']})"
            )
        else:
            lines.append("- Latest preview: unavailable")
        lines.append("")

        buckets = calibration.get("probabilityBuckets", [])
        if buckets:
            lines.append("Probability buckets:")
            for bucket in buckets:
                lines.append(
                    f"- {bucket['bucket']}: {bucket['rowCount']} row(s), mean predicted {bucket['meanPredictedProbability']:.3f}, observed positive {bucket['observedPositiveRate']:.3f}"
                )
            lines.append("")
        else:
            lines.append("- Probability buckets: unavailable")
            lines.append("")

    lines.extend(
        [
            "## Interpretation",
            "",
            "- Brier score and bucket summaries are exploratory because the current real labels are still rule-derived or weak.",
            "- Probability outputs are suitable for shadow-mode comparison and future calibration, not operational alerting.",
            "",
        ]
    )

    (REPORTS_DIR / "calibration_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_validation_summary(results: list[dict[str, Any]]) -> None:
    """Write a compact markdown summary of current validation strength and limits."""

    lines = [
        "# FloodGuard ML Validation Summary",
        "",
        "FloodGuard uses shadow-mode validation only. The rule engine remains the live authority.",
        "",
    ]

    for result in results:
        validation = result.get("validation", {})
        leakage = validation.get("leakageControls", {})
        lines.extend(
            [
                f"## {result['datasetName'].replace('_', ' ').title()}",
                "",
                f"- Primary strategy: `{validation.get('primaryStrategy', result.get('split', {}).get('strategy', 'unknown'))}`",
                f"- Candidate strategies reviewed: {len(validation.get('candidateStrategies', []))}",
                f"- Leakage-prone fields present: {', '.join(leakage.get('presentReferenceOnlyColumns', [])) or 'none'}",
                f"- Leakage-prone fields blocked from training: {', '.join(leakage.get('blockedFromTraining', [])) or 'none'}",
                "",
            ]
        )
        if result.get("warnings"):
            lines.append("Warnings:")
            for warning in result["warnings"]:
                lines.append(f"- {warning}")
            lines.append("")

    lines.extend(
        [
            "## Interpretation",
            "",
            "- Time-aware validation is implemented and preferred when the dataset preserves both classes chronologically.",
            "- Random stratified split remains a secondary fallback and can overestimate performance.",
            "- Area holdout and event holdout are checked, but may be unviable when class coverage or independent event labels are too weak.",
            "- FloodGuard still requires stronger independent labels before ML results can be treated as real flood prediction validation.",
            "",
        ]
    )

    (REPORTS_DIR / "validation_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ensure_runtime_dirs()
    build_training_dataset()
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
