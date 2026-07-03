# FloodGuard Prototype ML Model Card

## Purpose

FloodGuard's Python ML pipeline is a shadow-mode comparison layer.
It is intended to validate data plumbing, training safeguards, reporting, and model comparison workflows.
It is not used for live alerting or official warning decisions.

## Training Data

- Real export rows: 3000
- Real export positives: 18
- Real export joined event-label rows: 3000
- Real export joined event positives: 0
- Scenario stress-test rows: 84
- Real export label source: rule_derived
- Real export training target: `targetElevatedConcern` / `targetRuleElevated`
- Real export independent-label layer: `targetEventElevated` when a curated label window overlaps the row
- Scenario label source: scenario_generated

## Target Definition

- `targetRuleElevated = 1` when the rule concern level is `Moderate` or `High`.
- `targetRuleElevated = 0` when the rule concern level is `Low`.
- `targetElevatedConcern` is kept as the current alias for the rule-derived training target.
- `targetEventElevated` is joined from time-window labels when curated event labels are available.
- Current real-export training still relies on rule-derived labels, not independent flood outcomes.

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

- Real export blocked leakage-prone fields: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelNotes, eventLabelAvailable
- Scenario blocked leakage-prone fields: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelNotes, eventLabelAvailable
- Columns such as `riskScore`, `ruleConcernLevel`, and label/provenance fields are treated as reference-only and excluded from training.

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

## Key Warnings

- Dataset has severe class imbalance in the real export.
- Labels are rule-derived, not independent flood outcomes.
- Joined event labels exist to prepare better supervision, but coverage and strength must be inspected before treating them as validation evidence.
- No real `High` examples are present in the current historical export.
- Metrics are illustrative and should not be interpreted as validated flood prediction performance.
- Time-based validation is implemented, but real independent event holdout is still weak because joined event labels are placeholders rather than verified flood outcomes.
- ML must remain shadow-mode.

## Real Export Interpretation

- Useful for validating the Python training and reporting pipeline.
- Not suitable for serious predictive claims because the positive class is extremely sparse and labels are rule-derived.

## Scenario Stress-Test Interpretation

- Useful for checking that the pipeline can train, compare models, and produce feature-importance outputs under clearer class separation.
- Not real-world validation and must not be presented as such.

## Live Usage Status

- Mode: `shadow`
- Live scoring enabled: `false`
- Rule engine remains the live authority.

