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
        f"- Scenario stress-test rows: {scenario_result['summary']['rowCount']}",
        f"- Real export label source: {', '.join(real_result['summary']['labelSourceCounts'].keys())}",
        f"- Scenario label source: {', '.join(scenario_result['summary']['labelSourceCounts'].keys())}",
        "",
        "## Target Definition",
        "",
        "- `targetElevatedConcern = 1` when the rule concern level is `Moderate` or `High`.",
        "- `targetElevatedConcern = 0` when the rule concern level is `Low`.",
        "- Current real-export labels are rule-derived, not independent flood outcomes.",
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
            "- No real `High` examples are present in the current historical export.",
            "- Metrics are illustrative and should not be interpreted as validated flood prediction performance.",
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
