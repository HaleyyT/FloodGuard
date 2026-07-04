# FloodGuard ML Target Selection Summary

FloodGuard now chooses the strongest viable supervision target it can justify for each dataset.

## Real Export

- Selected target kind: `rule`
- Selected target column: `targetRuleElevated`
- Eligible rows for selected target: 3000
- Elevated examples in selected target: 18
- Ready for independent supervision: `False`
- Reason: Fallback to rule-derived target because event-labelled rows contain only 0 elevated example(s).

Event-target candidate review:
- Labelled rows: 3000
- Elevated examples: 0
- Strength counts: {'weak': 3000}

## Scenario Stress Test

- Selected target kind: `rule`
- Selected target column: `targetRuleElevated`
- Eligible rows for selected target: 84
- Elevated examples in selected target: 48
- Ready for independent supervision: `False`
- Reason: Fallback to rule-derived target because event-labelled rows are still scaffold-only or candidate-review supervision.

Event-target candidate review:
- Labelled rows: 84
- Elevated examples: 48
- Strength counts: {'synthetic': 84}

## Interpretation

- FloodGuard should prefer event-style targets only when coverage, class balance, and label strength are strong enough.
- Falling back to rule-derived targets is honest when independent labels exist only as scaffolding.

