# FloodGuard Prototype ML Model Card

## Purpose

FloodGuard's Python ML pipeline is a shadow-mode comparison layer.
It is intended to validate data plumbing, training safeguards, reporting, and model comparison workflows.
It is not used for live alerting or official warning decisions.
FloodGuard is not an official emergency-warning system, and this ML layer must remain shadow mode until stronger independent supervision and event-holdout validation exist.

## Training Data

- Real export rows: 3000
- Real export positives: 18
- Real export joined event-label rows: 3000
- Real export joined event positives: 0
- Scenario stress-test rows: 84
- Real export label source: rule_derived
- Real export selected training target: `targetRuleElevated` (rule)
- Real export supervision grade: `weak`
- Real export independent-label layer: `targetEventElevated` when a curated label window overlaps the row
- Scenario label source: scenario_generated
- Scenario selected training target: `targetRuleElevated` (rule)

## Target Definition

- `targetRuleElevated = 1` when the rule concern level is `Moderate` or `High`.
- `targetRuleElevated = 0` when the rule concern level is `Low`.
- `targetElevatedConcern` is kept as the current alias for the rule-derived training target.
- `targetEventElevated` is joined from time-window labels when curated event labels are available.
- `rule_derived` labels reflect FloodGuard's own rule engine and are useful mainly for baseline imitation checks.
- `warning_derived` labels are broader official-warning style supervision and should be treated as moderate strength only.
- `event` / curated event-window labels are better than rule-only labels but still need evidence review.
- `impact` labels should represent verified local consequences such as road closures or observed inundation.
- `scenario_generated` labels are for ML plumbing and stress testing only, never real-world validation.
- Real export target selection reason: Fallback to rule-derived target because event-labelled rows contain only 0 elevated example(s).
- Real export supervision-quality summary: FloodGuard's current independent supervision remains weak; event labels mainly support plumbing, tracking, and future calibration preparation.
- Scenario target selection reason: Fallback to rule-derived target because no event-labelled rows are evidence-linked or explicitly reviewed enough to count as independent supervision.
- Threshold state: prototype-calibration pending until reviewed event evidence and expert review exist.

## Supervision Quality

- Real export grade: `weak`
- Real export viable for independent supervision: `False`
- Real export review-status counts: {'scaffold_only': 3000}
- Real export primary limitation: Labels are mostly scaffold or candidate-review placeholders rather than evidence-backed reviewed flood outcomes.
- Joined evidence-linked event windows: 2
- Joined placeholder-evidence event windows: 2
- Joined reviewed event windows: 0
- Joined reviewed elevated event windows: 0
- Backlog evidence-linked rows: 2
- Backlog placeholder-evidence rows: 2
- Backlog reviewed rows: 0
- Backlog promotion-ready rows: 0
- Validated prediction depends on stronger supervision: independent flood-event labels, expert-calibrated thresholds, and event-holdout validation.

## Features Used

- rainfall windows and antecedent wetness
- river height and short-window change features
- freshness and source-coverage context
- warning/activity and area-relevance context where available

## Split Strategy

- Real export: area_holdout_north-parramatta
- Scenario stress test: area_holdout_north-parramatta
- Time-aware validation is preferred when chronological class coverage survives the split.
- Stratified random split is treated as a fallback reference only, not the ideal flood-validation design.

## Leakage Controls

- Real export blocked leakage-prone fields: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelReviewStatus, eventLabelEvidenceLink, eventLabelNotes, eventLabelAvailable
- Scenario blocked leakage-prone fields: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelNotes, eventLabelAvailable
- Columns such as `riskScore`, `ruleConcernLevel`, and label/provenance fields are treated as reference-only and excluded from training.

## Probability And Uncertainty

- Real export best-model preview: Low concern at 0.009 (limited: Training data has very few elevated examples, so probability should be treated cautiously.)
- Scenario best-model preview: Low concern at 0.000 (higher: Probability is far from the decision boundary, but still shadow-mode only.)
- Probability-style outputs are shadow-mode only and are paired with a confidence band and reason.
- Brier score and bucket summaries are reported for prototype calibration review where possible.

## Evaluated Models

### Real Export

- `majority_baseline`
  Balanced accuracy: 0.500
  Precision: 0.000
  Recall: 0.000
  F1: 0.000
  PR-AUC: 0.008
- `logistic_regression`
  Balanced accuracy: 0.625
  Precision: 1.000
  Recall: 0.250
  F1: 0.400
  PR-AUC: 0.261
- `random_forest`
  Balanced accuracy: 0.805
  Precision: 0.020
  Recall: 1.000
  F1: 0.040
  PR-AUC: 0.265
- `extra_trees`
  Balanced accuracy: 0.625
  Precision: 1.000
  Recall: 0.250
  F1: 0.400
  PR-AUC: 0.265

### Scenario Stress Test

- `majority_baseline`
  Balanced accuracy: 0.500
  Precision: 0.571
  Recall: 1.000
  F1: 0.727
  PR-AUC: 0.571
- `logistic_regression`
  Balanced accuracy: 1.000
  Precision: 1.000
  Recall: 1.000
  F1: 1.000
  PR-AUC: 1.000
- `random_forest`
  Balanced accuracy: 1.000
  Precision: 1.000
  Recall: 1.000
  F1: 1.000
  PR-AUC: 1.000
- `extra_trees`
  Balanced accuracy: 1.000
  Precision: 1.000
  Recall: 1.000
  F1: 1.000
  PR-AUC: 1.000

## Key Warnings

- Dataset has severe class imbalance in the real export.
- Independent event supervision is selected only when coverage and class strength are sufficient.
- Real-export training still falls back to rule-derived supervision when event labels remain weak or sparse.
- Joined event labels exist to prepare better supervision, but coverage and strength must be inspected before treating them as validation evidence.
- Placeholder evidence links do not count as defensible event supervision and must be replaced before review promotion.
- No real `High` examples are present in the current historical export.
- Metrics are illustrative and should not be interpreted as validated flood prediction performance.
- Time-based validation is implemented, but real independent event holdout is still weak because joined event labels are placeholders rather than verified flood outcomes.
- ML must remain shadow-mode.

## Real Export Interpretation

- Useful for validating the Python training and reporting pipeline.
- Not suitable for serious predictive claims because the positive class is extremely sparse and labels are rule-derived.
- Event holdout remains blocked because reviewed elevated event windows are still zero and the current candidate links are placeholder evidence only.

## Scenario Stress-Test Interpretation

- Useful for checking that the pipeline can train, compare models, and produce feature-importance outputs under clearer class separation.
- Not real-world validation and must not be presented as such.

## Live Usage Status

- Mode: `shadow`
- Live scoring enabled: `false`
- Rule engine remains the live authority.
- Promotion stage: `shadow_mode`
- Next eligible stage: `not eligible yet`

## Promotion Policy

- `shadow_mode`: pipeline works and reports metrics, but ML cannot influence live alerts.
- `review_mode`: requires independent labels, event-holdout testing, and pending expert review.
- `advisory_mode`: would require completed expert review, robust validation, and approved safety policy.
- Never: FloodGuard ML must not be framed as an official emergency authority.

## Current Promotion Blockers


- Independent event supervision is not yet strong enough.
- Event-holdout validation is not yet viable.
- Acceptance gates still failing: non_zero_recall_on_elevated_events.
- Domain expert review is still pending.
- Validation remains prototype-grade and not robust enough for advisory use.
- FloodGuard has not approved ML for automated safety advice.
