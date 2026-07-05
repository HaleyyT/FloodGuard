# FloodGuard ML Promotion Policy

FloodGuard keeps ML under explicit promotion control: shadow_mode -> review_mode -> advisory_mode.
The rule engine remains the live authority regardless of ML status.

## Real Export

- Current stage: `shadow_mode`
- Next eligible stage: `not eligible yet`
- Event holdout viable: `False` (Event holdout is unavailable because reviewedEventWindows < 2; reviewedElevatedEventWindows < 1; comparison non-event or lower-concern windows are missing; labels are still only rule/demo/scenario-derived.)
- Acceptance gates passed: `False`
- Best non-baseline model: `random_forest`

Acceptance gate review:
- `beats_majority_balanced_accuracy`: pass; random_forest=0.805; majority_baseline=0.500
- `non_zero_recall_on_elevated_events`: block; Event-holdout validation is not yet viable, so non-zero event recall cannot be claimed.
- `no_leakage_prone_features`: pass; Unsafe selected columns: none
- `uncertainty_reported`: pass; Prediction preview and calibration summaries are reported.
- `remains_shadow_mode_until_validated`: pass; Live scoring stays disabled and the rule engine remains the authority.

Promotion blockers:
- Review mode blocker: Independent event supervision is not yet strong enough.
- Review mode blocker: Event-holdout validation is not yet viable.
- Review mode blocker: Acceptance gates still failing: non_zero_recall_on_elevated_events.
- Advisory mode blocker: Domain expert review is still pending.
- Advisory mode blocker: Validation remains prototype-grade and not robust enough for advisory use.
- Advisory mode blocker: FloodGuard has not approved ML for automated safety advice.

## Scenario Stress Test

- Current stage: `shadow_mode`
- Next eligible stage: `not eligible yet`
- Event holdout viable: `False` (Event holdout is unavailable because reviewedEventWindows < 2; reviewedElevatedEventWindows < 1; comparison non-event or lower-concern windows are missing; labels are still only rule/demo/scenario-derived.)
- Acceptance gates passed: `False`
- Best non-baseline model: `logistic_regression`

Acceptance gate review:
- `beats_majority_balanced_accuracy`: pass; logistic_regression=1.000; majority_baseline=0.500
- `non_zero_recall_on_elevated_events`: block; Event-holdout validation is not yet viable, so non-zero event recall cannot be claimed.
- `no_leakage_prone_features`: pass; Unsafe selected columns: none
- `uncertainty_reported`: pass; Prediction preview and calibration summaries are reported.
- `remains_shadow_mode_until_validated`: pass; Live scoring stays disabled and the rule engine remains the authority.

Promotion blockers:
- Review mode blocker: Independent event supervision is not yet strong enough.
- Review mode blocker: Event-holdout validation is not yet viable.
- Review mode blocker: Acceptance gates still failing: non_zero_recall_on_elevated_events.
- Advisory mode blocker: Domain expert review is still pending.
- Advisory mode blocker: Validation remains prototype-grade and not robust enough for advisory use.
- Advisory mode blocker: FloodGuard has not approved ML for automated safety advice.

## Interpretation

- `shadow_mode` means the pipeline works and reports metrics, but ML cannot influence live alerts.
- `review_mode` requires stronger independent labels and event-holdout evidence before even supervised review can begin.
- `advisory_mode` would still not make FloodGuard an official emergency authority.

