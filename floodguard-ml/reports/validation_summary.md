# FloodGuard ML Validation Summary

FloodGuard uses shadow-mode validation only. The rule engine remains the live authority.

## Real Export

- Primary strategy: `area_holdout_north-parramatta`
- Candidate strategies reviewed: 4
- Leakage-prone fields present: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelReviewStatus, eventLabelEvidenceLink, eventLabelNotes, eventLabelAvailable
- Leakage-prone fields blocked from training: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelReviewStatus, eventLabelEvidenceLink, eventLabelNotes, eventLabelAvailable

Warnings:
- Dataset has severe class imbalance: 18 elevated row(s) out of 3000.
- Positive rate is only 0.6%; plain accuracy would be misleading.
- Labels are rule-derived, not independent flood outcomes, so metrics are illustrative only.
- Joined event labels currently contain no elevated positives, so they are useful for plumbing but not event validation.
- Current joined event labels are all weak-strength placeholders and must not be treated as validated outcomes.
- Current joined event labels are still scaffold or candidate-review rows and are not yet reviewed enough for independent ML validation.
- No High class examples are available in this dataset.
- Some predictors are heavily missing and will rely on imputation: antecedentRainfallIndex, rateOfRiseMPerHour, riverDelta1hM, riverDelta3hM, riverTrendCode, warningActive.
- Primary evaluation fell back from time-based validation to `area_holdout_north-parramatta`.
- Event-holdout validation is not yet viable because independent elevated event labels are missing or too sparse.
- Leakage-prone columns are present in the dataset but excluded from training: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelReviewStatus, eventLabelEvidenceLink, eventLabelNotes, eventLabelAvailable.
- Feature quality: Prioritise source or feature fixes for heavily missing rainfall/river/reliability predictors before treating ML metrics as stable.
- Feature quality: Add stronger independent event labels because the current target still teaches ML to imitate the rule engine.
- Feature quality: Collect more elevated examples before trusting ranking or probability behaviour on real exports.
- Feature quality: Review constant features because they add no information and may reflect export or pilot-area limits.
- Training target selection: Fallback to rule-derived target because event-labelled rows contain only 0 elevated example(s).

## Scenario Stress Test

- Primary strategy: `area_holdout_north-parramatta`
- Candidate strategies reviewed: 4
- Leakage-prone fields present: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelNotes, eventLabelAvailable
- Leakage-prone fields blocked from training: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelNotes, eventLabelAvailable

Warnings:
- 12 row(s) were excluded from training due to eligibility gates.
- Primary evaluation fell back from time-based validation to `area_holdout_north-parramatta`.
- Event-holdout validation is not yet viable because independent elevated event labels are missing or too sparse.
- Leakage-prone columns are present in the dataset but excluded from training: riskScore, ruleConcernLevel, targetElevatedConcern, targetRuleElevated, targetEventElevated, labelSource, ruleLabelSource, eventLabelSource, eventLabelStrength, eventLabelNotes, eventLabelAvailable.
- Training target selection: Fallback to rule-derived target because event-labelled rows are still scaffold-only or candidate-review supervision.

## Interpretation

- Time-aware validation is implemented and preferred when the dataset preserves both classes chronologically.
- Random stratified split remains a secondary fallback and can overestimate performance.
- Area holdout and event holdout are checked, but may be unviable when class coverage or independent event labels are too weak.
- FloodGuard still requires stronger independent labels before ML results can be treated as real flood prediction validation.

