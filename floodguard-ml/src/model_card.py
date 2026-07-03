"""Generate FloodGuard's prototype ML model card."""

from __future__ import annotations

import json

from utils import REPORTS_DIR


def write_model_card(results: list[dict]) -> None:
    """Render a markdown model card from the evaluation results."""

    real_result = next(result for result in results if result["datasetName"] == "real_export")
    scenario_result = next(
        result for result in results if result["datasetName"] == "scenario_stress_test"
    )

    lines = [
        "# FloodGuard Prototype ML Model Card",
        "",
        "## Purpose",
        "",
        "FloodGuard's Python ML pipeline is a shadow-mode comparison layer.",
        "It is intended to validate data plumbing, training safeguards, reporting, and model comparison workflows.",
        "It is not used for live alerting or official warning decisions.",
        "",
        "## Training Data",
        "",
        f"- Real export rows: {real_result['summary']['rowCount']}",
        f"- Real export positives: {real_result['summary']['targetCounts'].get('1', 0)}",
        f"- Real export joined event-label rows: {real_result['summary'].get('eventLabelRowCount', 0)}",
        f"- Real export joined event positives: {real_result['summary'].get('eventPositiveCount', 0)}",
        f"- Scenario stress-test rows: {scenario_result['summary']['rowCount']}",
        f"- Real export label source: {', '.join(real_result['summary']['labelSourceCounts'].keys())}",
        "- Real export training target: `targetElevatedConcern` / `targetRuleElevated`",
        "- Real export independent-label layer: `targetEventElevated` when a curated label window overlaps the row",
        f"- Scenario label source: {', '.join(scenario_result['summary']['labelSourceCounts'].keys())}",
        "",
        "## Target Definition",
        "",
        "- `targetRuleElevated = 1` when the rule concern level is `Moderate` or `High`.",
        "- `targetRuleElevated = 0` when the rule concern level is `Low`.",
        "- `targetElevatedConcern` is kept as the current alias for the rule-derived training target.",
        "- `targetEventElevated` is joined from time-window labels when curated event labels are available.",
        "- Current real-export training still relies on rule-derived labels, not independent flood outcomes.",
        "",
        "## Features Used",
        "",
        "- rainfall windows and antecedent wetness",
        "- river height and short-window change features",
        "- freshness and source-coverage context",
        "- warning/activity and area-relevance context where available",
        "",
        "## Split Strategy",
        "",
        f"- Real export: {real_result['split']['strategy']}",
        f"- Scenario stress test: {scenario_result['split']['strategy']}",
        "- Time-aware validation is preferred when chronological class coverage survives the split.",
        "- Stratified random split is treated as a fallback reference only, not the ideal flood-validation design.",
        "",
        "## Leakage Controls",
        "",
        f"- Real export blocked leakage-prone fields: {', '.join(real_result.get('validation', {}).get('leakageControls', {}).get('blockedFromTraining', [])) or 'none reported'}",
        f"- Scenario blocked leakage-prone fields: {', '.join(scenario_result.get('validation', {}).get('leakageControls', {}).get('blockedFromTraining', [])) or 'none reported'}",
        "- Columns such as `riskScore`, `ruleConcernLevel`, and label/provenance fields are treated as reference-only and excluded from training.",
        "",
        "## Evaluated Models",
        "",
    ]

    for result in results:
        lines.append(f"### {result['datasetName'].replace('_', ' ').title()}")
        lines.append("")
        for model in result["models"]:
            metrics = model["metrics"]
            pr_auc = "n/a" if metrics["prAuc"] is None else f"{metrics['prAuc']:.3f}"
            lines.extend(
                [
                    f"- `{model['modelName']}`",
                    f"  Balanced accuracy: {metrics['balancedAccuracy']:.3f}",
                    f"  Precision: {metrics['precision']:.3f}",
                    f"  Recall: {metrics['recall']:.3f}",
                    f"  F1: {metrics['f1']:.3f}",
                    f"  PR-AUC: {pr_auc}",
                ]
            )
        lines.append("")

    lines.extend(
        [
            "## Key Warnings",
            "",
            "- Dataset has severe class imbalance in the real export.",
            "- Labels are rule-derived, not independent flood outcomes.",
            "- Joined event labels exist to prepare better supervision, but coverage and strength must be inspected before treating them as validation evidence.",
            "- No real `High` examples are present in the current historical export.",
            "- Metrics are illustrative and should not be interpreted as validated flood prediction performance.",
            "- Time-based validation is implemented, but real independent event holdout is still weak because joined event labels are placeholders rather than verified flood outcomes.",
            "- ML must remain shadow-mode.",
            "",
            "## Real Export Interpretation",
            "",
            "- Useful for validating the Python training and reporting pipeline.",
            "- Not suitable for serious predictive claims because the positive class is extremely sparse and labels are rule-derived.",
            "",
            "## Scenario Stress-Test Interpretation",
            "",
            "- Useful for checking that the pipeline can train, compare models, and produce feature-importance outputs under clearer class separation.",
            "- Not real-world validation and must not be presented as such.",
            "",
            "## Live Usage Status",
            "",
            "- Mode: `shadow`",
            "- Live scoring enabled: `false`",
            "- Rule engine remains the live authority.",
            "",
        ]
    )

    (REPORTS_DIR / "model_card.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    real = json.loads((REPORTS_DIR / "real_export_metrics.json").read_text(encoding="utf-8"))
    scenario = json.loads(
        (REPORTS_DIR / "scenario_stress_test_metrics.json").read_text(encoding="utf-8")
    )
    write_model_card([real, scenario])
    print(f"Model card written to {REPORTS_DIR / 'model_card.md'}")


if __name__ == "__main__":
    main()
