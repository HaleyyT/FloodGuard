"""Run FloodGuard's prototype ML training and evaluation workflow."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from audit_labels import write_label_audit_artifacts
from build_dataset import build_scenario_dataset, build_training_dataset
from model_registry import MODEL_REGISTRY
from model_card import write_model_card
from utils import (
    DATA_DIR,
    DEFAULT_DATASET,
    MODELS_DIR,
    REPORTS_DIR,
    SCENARIO_DATASET,
    apply_training_target_selection,
    assess_leakage_controls,
    build_feature_quality_report,
    build_dataset_summary,
    build_supervision_quality_summary,
    build_dataset_warnings,
    choose_training_target,
    ensure_runtime_dirs,
    feature_columns_for_training,
    load_dataset,
    save_feature_importance_artifacts,
    split_dataset_for_validation,
    write_json,
)


def build_event_holdout_summary(result: dict[str, Any]) -> dict[str, Any]:
    """Extract the event-holdout status into a stable report-friendly contract."""

    candidate_strategies = result.get("validation", {}).get("candidateStrategies", [])
    event_candidate = next(
        (
            candidate
            for candidate in candidate_strategies
            if str(candidate.get("strategy", "")).startswith("event_")
        ),
        None,
    )
    if event_candidate is None:
        return {
            "available": False,
            "viable": False,
            "strategy": "event_holdout_unavailable",
            "reason": "Event holdout was not reported.",
            "trainRows": 0,
            "testRows": 0,
            "trainPositiveCount": 0,
            "testPositiveCount": 0,
            "reviewedEventWindows": 0,
            "reviewedElevatedEventWindows": 0,
            "comparisonWindows": 0,
            "independentLabelRows": 0,
        }

    return {
        "available": True,
        "viable": bool(event_candidate.get("viable")),
        "strategy": event_candidate.get("strategy", "event_holdout_unavailable"),
        "reason": event_candidate.get("reason", "Event holdout was reviewed."),
        "trainRows": event_candidate.get("trainRows", 0),
        "testRows": event_candidate.get("testRows", 0),
        "trainPositiveCount": event_candidate.get("trainPositiveCount", 0),
        "testPositiveCount": event_candidate.get("testPositiveCount", 0),
        "reviewedEventWindows": event_candidate.get("reviewedEventWindows", 0),
        "reviewedElevatedEventWindows": event_candidate.get("reviewedElevatedEventWindows", 0),
        "comparisonWindows": event_candidate.get("comparisonWindows", 0),
        "independentLabelRows": event_candidate.get("independentLabelRows", 0),
    }


def build_acceptance_gates(
    result: dict[str, Any], event_holdout: dict[str, Any]
) -> dict[str, Any]:
    """Summarise whether the current ML layer satisfies the roadmap acceptance gates."""

    models = result.get("models", [])
    majority = next((model for model in models if model.get("modelName") == "majority_baseline"), None)
    trained_non_baselines = [
        model
        for model in models
        if model.get("modelName") != "majority_baseline" and model.get("status") == "trained"
    ]
    best_non_baseline = max(
        trained_non_baselines,
        key=lambda model: (
            model.get("metrics", {}).get("balancedAccuracy", 0),
            model.get("metrics", {}).get("f1", 0),
        ),
        default=None,
    )
    leakage_controls = result.get("validation", {}).get("leakageControls", {})
    leakage_pass = len(leakage_controls.get("unsafeSelectedColumns", [])) == 0
    uncertainty_pass = bool(result.get("predictionPreview")) and bool(result.get("calibration"))
    recall_metric = None if best_non_baseline is None else best_non_baseline["metrics"].get("recall")
    event_target_selected = result.get("targetSelection", {}).get("selectedTargetKind") == "event"

    gates = [
        {
            "name": "beats_majority_balanced_accuracy",
            "passed": bool(
                best_non_baseline
                and majority
                and best_non_baseline["metrics"].get("balancedAccuracy", 0)
                > majority["metrics"].get("balancedAccuracy", 0)
            ),
            "detail": None
            if best_non_baseline is None or majority is None
            else (
                f"{best_non_baseline['modelName']}={best_non_baseline['metrics'].get('balancedAccuracy', 0):.3f}; "
                f"majority_baseline={majority['metrics'].get('balancedAccuracy', 0):.3f}"
            ),
        },
        {
            "name": "non_zero_recall_on_elevated_events",
            "passed": bool(event_target_selected and event_holdout.get("viable") and (recall_metric or 0) > 0),
            "detail":
                "Event-holdout validation is not yet viable, so non-zero event recall cannot be claimed."
                if not event_holdout.get("viable")
                else f"Best non-baseline recall={0 if recall_metric is None else recall_metric:.3f}",
        },
        {
            "name": "no_leakage_prone_features",
            "passed": leakage_pass,
            "detail": "Unsafe selected columns: "
            + (
                ", ".join(leakage_controls.get("unsafeSelectedColumns", []))
                if leakage_controls.get("unsafeSelectedColumns")
                else "none"
            ),
        },
        {
            "name": "uncertainty_reported",
            "passed": uncertainty_pass,
            "detail": "Prediction preview and calibration summaries are reported."
            if uncertainty_pass
            else "Prediction preview or calibration summaries are missing.",
        },
        {
            "name": "remains_shadow_mode_until_validated",
            "passed": result.get("mode") == "shadow" and result.get("liveScoringEnabled") is False,
            "detail": "Live scoring stays disabled and the rule engine remains the authority.",
        },
    ]
    return {
        "passedAll": all(gate["passed"] for gate in gates),
        "bestNonBaselineModel": None if best_non_baseline is None else best_non_baseline["modelName"],
        "gates": gates,
    }


def build_promotion_policy(
    result: dict[str, Any],
    event_holdout: dict[str, Any],
    acceptance_gates: dict[str, Any],
) -> dict[str, Any]:
    """Record the current promotion stage and what blocks the next one."""

    target_selection = result.get("targetSelection", {})
    review_blockers = []
    advisory_blockers = []

    if not target_selection.get("readyForIndependentSupervision"):
        review_blockers.append("Independent event supervision is not yet strong enough.")
    if not event_holdout.get("viable"):
        review_blockers.append("Event-holdout validation is not yet viable.")
    if not acceptance_gates["passedAll"]:
        failed = [gate["name"] for gate in acceptance_gates["gates"] if not gate["passed"]]
        review_blockers.append("Acceptance gates still failing: " + ", ".join(failed) + ".")

    advisory_blockers.extend(
        [
            "Domain expert review is still pending.",
            "Validation remains prototype-grade and not robust enough for advisory use.",
            "FloodGuard has not approved ML for automated safety advice.",
        ]
    )

    return {
        "currentStage": "shadow_mode",
        "nextEligibleStage": None if review_blockers else "review_mode",
        "stages": {
            "shadow_mode": {
                "status": "active",
                "requirements": ["pipeline works", "metrics reported"],
            },
            "review_mode": {
                "status": "blocked" if review_blockers else "eligible",
                "requirements": [
                    "independent labels exist",
                    "event-holdout tested",
                    "expert review pending",
                ],
                "blockers": review_blockers,
            },
            "advisory_mode": {
                "status": "blocked",
                "requirements": [
                    "expert review completed",
                    "validation robust",
                    "safety policy approved",
                ],
                "blockers": advisory_blockers,
            },
        },
        "never": ["official emergency authority"],
        "summary": "ML remains in shadow_mode because supervision and validation are not yet strong enough for promotion.",
    }


def evaluate_dataset(dataset_name: str, dataset_path: Path) -> dict[str, Any]:
    """Train prototype models on one dataset and record their metrics."""

    raw_dataframe = load_dataset(dataset_path)
    target_selection = choose_training_target(raw_dataframe)
    dataframe = apply_training_target_selection(raw_dataframe, target_selection)
    summary = build_dataset_summary(dataframe, dataset_name)
    warnings = build_dataset_warnings(summary)
    supervision_quality = build_supervision_quality_summary(summary, target_selection)
    split = split_dataset_for_validation(dataframe)
    split_metadata = {key: value for key, value in split.items() if key not in {"train", "test"}}
    trainable_features, _, _ = feature_columns_for_training(split["train"])
    leakage_controls = assess_leakage_controls(dataframe, trainable_features)
    feature_quality = build_feature_quality_report(dataframe, dataset_name)
    warnings.extend(split_metadata.pop("validationWarnings", []))
    warnings.extend(leakage_controls["warnings"])
    warnings.extend(
        f"Feature quality: {action}" for action in feature_quality.get("recommendedActions", [])
    )
    warnings.append(f"Training target selection: {target_selection['reason']}")
    event_holdout = build_event_holdout_summary(
        {
            "validation": {
                "candidateStrategies": split_metadata.get("candidateStrategies", []),
            }
        }
    )
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
            "targetSelection": target_selection,
            "supervisionQuality": supervision_quality,
            "split": split_metadata,
            "validation": {
                "primaryStrategy": split["strategy"],
                "candidateStrategies": split_metadata.get("candidateStrategies", []),
                "leakageControls": leakage_controls,
            },
            "eventHoldout": event_holdout,
            "featureQuality": feature_quality,
            "models": [],
            "bestPrototypeModel": None,
            "status": "skipped",
        }
        payload["acceptanceGates"] = build_acceptance_gates(payload, event_holdout)
        payload["promotionPolicy"] = build_promotion_policy(
            payload, event_holdout, payload["acceptanceGates"]
        )
        write_json(REPORTS_DIR / f"{dataset_name}_metrics.json", payload)
        return payload

    model_results = [
        entry["trainer"](
            split["train"],
            split["test"],
            models_dir / f"{entry['modelName']}.joblib",
            summary,
        )
        for entry in MODEL_REGISTRY
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
        "targetSelection": target_selection,
        "supervisionQuality": supervision_quality,
        "split": split_metadata,
        "validation": {
            "primaryStrategy": split["strategy"],
            "candidateStrategies": split_metadata.get("candidateStrategies", []),
            "leakageControls": leakage_controls,
        },
        "eventHoldout": event_holdout,
        "featureQuality": feature_quality,
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
    payload["acceptanceGates"] = build_acceptance_gates(payload, event_holdout)
    payload["promotionPolicy"] = build_promotion_policy(
        payload, event_holdout, payload["acceptanceGates"]
    )
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
                "targetSelection": result["targetSelection"],
                "supervisionQuality": result["supervisionQuality"],
                "eventHoldout": result["eventHoldout"],
                "acceptanceGates": result["acceptanceGates"],
                "promotionPolicy": result["promotionPolicy"],
                "featureQuality": {
                    "highMissingFeatureCount": result["featureQuality"]["highMissingFeatureCount"],
                    "criticalMissingFeatureCount": result["featureQuality"]["criticalMissingFeatureCount"],
                    "recommendedActions": result["featureQuality"]["recommendedActions"],
                },
            }
            for result in results
        },
        "modelRegistry": [
            {
                "modelName": entry["modelName"],
                "family": entry["family"],
                "description": entry["description"],
            }
            for entry in MODEL_REGISTRY
        ],
        "promotionPolicy": next(
            (
                result["promotionPolicy"]
                for result in results
                if result["datasetName"] == "real_export"
            ),
            None,
        ),
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
    write_feature_quality_summary(results)
    write_target_selection_summary(results)
    write_promotion_policy_summary(results)
    write_model_comparison_report(results)
    write_label_audit_artifacts()
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


def write_feature_quality_summary(results: list[dict[str, Any]]) -> None:
    """Write a markdown report describing feature coverage and label readiness."""

    lines = [
        "# FloodGuard ML Feature Quality Summary",
        "",
        "This report checks whether the exported predictors are usable enough for shadow-mode modelling.",
        "",
    ]

    for result in results:
        quality = result["featureQuality"]
        lines.extend(
            [
                f"## {result['datasetName'].replace('_', ' ').title()}",
                "",
                f"- Time range: {quality['timeRange']['start'] or 'n/a'} to {quality['timeRange']['end'] or 'n/a'}",
                f"- Selected training features: {quality['selectedFeatureCount']}",
                f"- High-missing features: {quality['highMissingFeatureCount']}",
                f"- Critical-missing features: {quality['criticalMissingFeatureCount']}",
                f"- Constant features: {quality['constantFeatureCount']}",
                "",
            ]
        )
        if quality["recommendedActions"]:
            lines.append("Recommended actions:")
            for action in quality["recommendedActions"]:
                lines.append(f"- {action}")
            lines.append("")

    lines.extend(
        [
            "## Interpretation",
            "",
            "- Feature quality is part of ML readiness, not just data plumbing.",
            "- High missingness, weak labels, and low positive coverage should reduce confidence in model comparisons.",
            "",
        ]
    )

    (REPORTS_DIR / "feature_quality_summary.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def write_target_selection_summary(results: list[dict[str, Any]]) -> None:
    """Write a markdown summary of which supervision target was selected and why."""

    lines = [
        "# FloodGuard ML Target Selection Summary",
        "",
        "FloodGuard now chooses the strongest viable supervision target it can justify for each dataset.",
        "",
    ]

    for result in results:
        selection = result["targetSelection"]
        lines.extend(
            [
                f"## {result['datasetName'].replace('_', ' ').title()}",
                "",
                f"- Selected target kind: `{selection['selectedTargetKind']}`",
                f"- Selected target column: `{selection['selectedTargetColumn']}`",
                f"- Eligible rows for selected target: {selection['eligibleRowCount']}",
                f"- Elevated examples in selected target: {selection['positiveCount']}",
                f"- Ready for independent supervision: `{selection['readyForIndependentSupervision']}`",
                f"- Reason: {selection['reason']}",
                "",
            ]
        )
        if selection.get("eventTargetCandidate"):
            candidate = selection["eventTargetCandidate"]
            lines.append("Event-target candidate review:")
            lines.append(f"- Labelled rows: {candidate['eligibleRowCount']}")
            lines.append(f"- Elevated examples: {candidate['positiveCount']}")
            lines.append(f"- Strength counts: {candidate.get('strengthCounts', {})}")
            lines.append(f"- Review-status counts: {candidate.get('reviewStatusCounts', {})}")
            lines.append(f"- Evidence-linked joined rows: {selection.get('evidenceLinkedRowCount', 0)}")
            lines.append(f"- Evidence-linked joined elevated rows: {selection.get('evidenceLinkedPositiveCount', 0)}")
            lines.append(f"- Reviewed joined rows: {selection.get('reviewedRowCount', 0)}")
            lines.append(f"- Reviewed joined elevated rows: {selection.get('reviewedPositiveCount', 0)}")
            lines.append("")

    lines.extend(
        [
            "## Interpretation",
            "",
            "- FloodGuard should prefer event-style targets only when coverage, class balance, and label strength are strong enough.",
            "- Falling back to rule-derived targets is honest when independent labels exist only as scaffolding.",
            "",
        ]
    )

    (REPORTS_DIR / "target_selection_summary.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def write_promotion_policy_summary(results: list[dict[str, Any]]) -> None:
    """Write a markdown summary of ML acceptance gates and promotion blockers."""

    lines = [
        "# FloodGuard ML Promotion Policy",
        "",
        "FloodGuard keeps ML under explicit promotion control: shadow_mode -> review_mode -> advisory_mode.",
        "The rule engine remains the live authority regardless of ML status.",
        "",
    ]

    for result in results:
        policy = result["promotionPolicy"]
        gates = result["acceptanceGates"]
        event_holdout = result["eventHoldout"]
        lines.extend(
            [
                f"## {result['datasetName'].replace('_', ' ').title()}",
                "",
                f"- Current stage: `{policy['currentStage']}`",
                f"- Next eligible stage: `{policy['nextEligibleStage'] or 'not eligible yet'}`",
                f"- Event holdout viable: `{event_holdout['viable']}` ({event_holdout['reason']})",
                f"- Acceptance gates passed: `{gates['passedAll']}`",
                f"- Best non-baseline model: `{gates['bestNonBaselineModel'] or 'unavailable'}`",
                "",
                "Acceptance gate review:",
            ]
        )
        for gate in gates["gates"]:
            lines.append(
                f"- `{gate['name']}`: {'pass' if gate['passed'] else 'block'}; {gate['detail']}"
            )
        lines.append("")

        review_stage = policy["stages"]["review_mode"]
        advisory_stage = policy["stages"]["advisory_mode"]
        lines.append("Promotion blockers:")
        for blocker in review_stage.get("blockers", []):
            lines.append(f"- Review mode blocker: {blocker}")
        for blocker in advisory_stage.get("blockers", []):
            lines.append(f"- Advisory mode blocker: {blocker}")
        lines.append("")

    lines.extend(
        [
            "## Interpretation",
            "",
            "- `shadow_mode` means the pipeline works and reports metrics, but ML cannot influence live alerts.",
            "- `review_mode` requires stronger independent labels and event-holdout evidence before even supervised review can begin.",
            "- `advisory_mode` would still not make FloodGuard an official emergency authority.",
            "",
        ]
    )

    (REPORTS_DIR / "promotion_policy_summary.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def write_model_comparison_report(results: list[dict[str, Any]]) -> None:
    """Write a compact comparison report across the registered prototype models."""

    lines = [
        "# FloodGuard ML Model Comparison",
        "",
        "FloodGuard compares a small registry of shadow-mode tabular models. The rule engine remains the live authority.",
        "",
    ]

    for result in results:
        lines.extend([f"## {result['datasetName'].replace('_', ' ').title()}", ""])
        if not result["models"]:
            lines.extend(
                [
                    "- Model comparisons were skipped because the validation split could not preserve both classes.",
                    "",
                ]
            )
            continue

        lines.append("| Model | Family | Balanced accuracy | F1 | PR-AUC | Notes |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        families = {entry["modelName"]: entry["family"] for entry in MODEL_REGISTRY}
        for model in result["models"]:
            lines.append(
                f"| `{model['modelName']}` | {families.get(model['modelName'], 'unknown')} | "
                f"{model['metrics'].get('balancedAccuracy', 'n/a')} | {model['metrics'].get('f1', 'n/a')} | "
                f"{model['metrics'].get('prAuc', 'n/a')} | {model['warnings'][0] if model.get('warnings') else 'n/a'} |"
            )
        lines.append("")

    lines.extend(
        [
            "## Interpretation",
            "",
            "- The registry widens the comparison set, but stronger labels still matter more than adding more algorithms.",
            "- Better model scores on rule-derived labels do not equal validated flood prediction quality.",
            "",
        ]
    )

    (REPORTS_DIR / "model_comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_evaluation() -> list[dict[str, Any]]:
    """Rebuild the datasets and reports for the current shadow-mode evaluation state."""

    ensure_runtime_dirs()
    build_training_dataset()
    build_scenario_dataset(SCENARIO_DATASET)
    dataset_results = [
        evaluate_dataset("real_export", DEFAULT_DATASET),
        evaluate_dataset("scenario_stress_test", SCENARIO_DATASET),
    ]
    write_combined_reports(dataset_results)
    return dataset_results


def main() -> None:
    dataset_results = run_evaluation()
    print("FloodGuard Day 3 ML pipeline complete.")
    print(f"Reports: {REPORTS_DIR}")
    print(f"Models: {MODELS_DIR}")


if __name__ == "__main__":
    main()
