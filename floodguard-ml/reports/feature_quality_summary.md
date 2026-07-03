# FloodGuard ML Feature Quality Summary

This report checks whether the exported predictors are usable enough for shadow-mode modelling.

## Real Export

- Time range: 2026-06-24T16:28:13.485000+00:00 to 2026-06-30T06:56:47.412000+00:00
- Selected training features: 17
- High-missing features: 0
- Critical-missing features: 6
- Constant features: 4

Recommended actions:
- Prioritise source or feature fixes for heavily missing rainfall/river/reliability predictors before treating ML metrics as stable.
- Add stronger independent event labels because the current target still teaches ML to imitate the rule engine.
- Collect more elevated examples before trusting ranking or probability behaviour on real exports.
- Review constant features because they add no information and may reflect export or pilot-area limits.

## Scenario Stress Test

- Time range: 2026-07-01T00:00:00+00:00 to 2026-07-06T11:00:00+00:00
- Selected training features: 18
- High-missing features: 0
- Critical-missing features: 0
- Constant features: 0

## Interpretation

- Feature quality is part of ML readiness, not just data plumbing.
- High missingness, weak labels, and low positive coverage should reduce confidence in model comparisons.

