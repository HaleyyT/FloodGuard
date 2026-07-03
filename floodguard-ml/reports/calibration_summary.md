# FloodGuard ML Calibration Summary

FloodGuard reports probability-style outputs in shadow mode only.

## Real Export

- Best model: `random_forest`
- Brier score: 0.1018905352598646
- Latest preview: Low concern at probability 0.0094
- Confidence band: limited (Training data has very few elevated examples, so probability should be treated cautiously.)

Probability buckets:
- 0.0-0.2: 604 row(s), mean predicted 0.047, observed positive 0.000
- 0.4-0.6: 394 row(s), mean predicted 0.501, observed positive 0.015
- 0.8-1.0: 2 row(s), mean predicted 0.985, observed positive 1.000

## Scenario Stress Test

- Best model: `logistic_regression`
- Brier score: 1.9282988848934555e-07
- Latest preview: Low concern at probability 0.0004
- Confidence band: higher (Probability is far from the decision boundary, but still shadow-mode only.)

Probability buckets:
- 0.0-0.2: 12 row(s), mean predicted 0.000, observed positive 0.000
- 0.8-1.0: 16 row(s), mean predicted 1.000, observed positive 1.000

## Interpretation

- Brier score and bucket summaries are exploratory because the current real labels are still rule-derived or weak.
- Probability outputs are suitable for shadow-mode comparison and future calibration, not operational alerting.

