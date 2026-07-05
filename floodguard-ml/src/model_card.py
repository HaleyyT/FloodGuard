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
    label_audit_path = REPORTS_DIR / "label_audit.json"
    label_audit = (
        json.loads(label_audit_path.read_text(encoding="utf-8"))
        if label_audit_path.exists()
        else {}
    )
    backlog_summary = label_audit.get("backlogSummary", {})
    labels_summary = label_audit.get("labelsSummary", {})

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
        f"- Real export selected training target: `{real_result['targetSelection']['selectedTargetColumn']}` ({real_result['targetSelection']['selectedTargetKind']})",
        f"- Real export supervision grade: `{real_result.get('supervisionQuality', {}).get('grade', 'unknown')}`",
        "- Real export independent-label layer: `targetEventElevated` when a curated label window overlaps the row",
        f"- Scenario label source: {', '.join(scenario_result['summary']['labelSourceCounts'].keys())}",
        f"- Scenario selected training target: `{scenario_result['targetSelection']['selectedTargetColumn']}` ({scenario_result['targetSelection']['selectedTargetKind']})",
        "",
        "## Target Definition",
        "",
        "- `targetRuleElevated = 1` when the rule concern level is `Moderate` or `High`.",
        "- `targetRuleElevated = 0` when the rule concern level is `Low`.",
        "- `targetElevatedConcern` is kept as the current alias for the rule-derived training target.",
        "- `targetEventElevated` is joined from time-window labels when curated event labels are available.",
        "- `rule_derived` labels reflect FloodGuard's own rule engine and are useful mainly for baseline imitation checks.",
        "- `warning_derived` labels are broader official-warning style supervision and should be treated as moderate strength only.",
        "- `event` / curated event-window labels are better than rule-only labels but still need evidence review.",
        "- `impact` labels should represent verified local consequences such as road closures or observed inundation.",
        "- `scenario_generated` labels are for ML plumbing and stress testing only, never real-world validation.",
        f"- Real export target selection reason: {real_result['targetSelection']['reason']}",
        f"- Real export supervision-quality summary: {real_result.get('supervisionQuality', {}).get('summary', 'unavailable')}",
        f"- Scenario target selection reason: {scenario_result['targetSelection']['reason']}",
        "",
        "## Supervision Quality",
        "",
        f"- Real export grade: `{real_result.get('supervisionQuality', {}).get('grade', 'unknown')}`",
        f"- Real export viable for independent supervision: `{real_result.get('supervisionQuality', {}).get('viableForIndependentSupervision', False)}`",
        f"- Real export review-status counts: {real_result['summary'].get('eventLabelReviewStatusCounts', {})}",
        f"- Real export primary limitation: {real_result.get('supervisionQuality', {}).get('primaryLimitation', 'unavailable')}",
        f"- Joined evidence-linked event windows: {labels_summary.get('evidenceLinkedRows', 0)}",
        f"- Joined reviewed event windows: {labels_summary.get('reviewedRows', 0)}",
        f"- Joined reviewed elevated event windows: {labels_summary.get('reviewedPositiveRows', 0)}",
        f"- Backlog evidence-linked rows: {backlog_summary.get('evidenceLinkedRows', 0)}",
        f"- Backlog reviewed rows: {backlog_summary.get('reviewedRows', 0)}",
        f"- Backlog promotion-ready rows: {backlog_summary.get('promotableRows', 0)}",
        "- Validated prediction depends on stronger supervision: independent flood-event labels, expert-calibrated thresholds, and event-holdout validation.",
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
        "## Probability And Uncertainty",
        "",
        f"- Real export best-model preview: {format_prediction_preview(real_result.get('predictionPreview'))}",
        f"- Scenario best-model preview: {format_prediction_preview(scenario_result.get('predictionPreview'))}",
        "- Probability-style outputs are shadow-mode only and are paired with a confidence band and reason.",
        "- Brier score and bucket summaries are reported for prototype calibration review where possible.",
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
            "- Independent event supervision is selected only when coverage and class strength are sufficient.",
            "- Real-export training still falls back to rule-derived supervision when event labels remain weak or sparse.",
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
            f"- Promotion stage: `{real_result.get('promotionPolicy', {}).get('currentStage', 'shadow_mode')}`",
            f"- Next eligible stage: `{real_result.get('promotionPolicy', {}).get('nextEligibleStage') or 'not eligible yet'}`",
            "",
            "## Promotion Policy",
            "",
            "- `shadow_mode`: pipeline works and reports metrics, but ML cannot influence live alerts.",
            "- `review_mode`: requires independent labels, event-holdout testing, and pending expert review.",
            "- `advisory_mode`: would require completed expert review, robust validation, and approved safety policy.",
            "- Never: FloodGuard ML must not be framed as an official emergency authority.",
            "",
            "## Current Promotion Blockers",
            "",
            "",
        ]
    )

    for blocker in real_result.get("promotionPolicy", {}).get("stages", {}).get("review_mode", {}).get("blockers", []):
        lines.append(f"- {blocker}")
    for blocker in real_result.get("promotionPolicy", {}).get("stages", {}).get("advisory_mode", {}).get("blockers", []):
        lines.append(f"- {blocker}")
    lines.append("")

    (REPORTS_DIR / "model_card.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    real = json.loads((REPORTS_DIR / "real_export_metrics.json").read_text(encoding="utf-8"))
    scenario = json.loads(
        (REPORTS_DIR / "scenario_stress_test_metrics.json").read_text(encoding="utf-8")
    )
    write_model_card([real, scenario])
    print(f"Model card written to {REPORTS_DIR / 'model_card.md'}")


def format_prediction_preview(preview: dict | None) -> str:
    """Render a compact one-line preview for the model card."""

    if not preview:
        return "unavailable"

    probability = preview.get("predictedProbability")
    probability_text = "n/a" if probability is None else f"{probability:.3f}"
    return (
        f"{preview.get('predictedLabel')} at {probability_text} "
        f"({preview.get('confidenceBand')}: {preview.get('confidenceReason')})"
    )


if __name__ == "__main__":
    main()
