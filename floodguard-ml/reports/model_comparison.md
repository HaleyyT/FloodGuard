# FloodGuard ML Model Comparison

FloodGuard compares a small registry of shadow-mode tabular models. The rule engine remains the live authority.

## Real Export

| Model | Family | Balanced accuracy | F1 | PR-AUC | Notes |
| --- | --- | --- | --- | --- | --- |
| `majority_baseline` | baseline | 0.5 | 0.0 | 0.008 | This baseline is expected to look strong on plain accuracy because elevated cases are rare. |
| `logistic_regression` | linear | 0.625 | 0.4 | 0.260752688172043 | Logistic regression is still trained on rule-derived labels and should remain shadow-only. |
| `random_forest` | tree_ensemble | 0.8049395161290323 | 0.03970223325062035 | 0.2651898734177215 | Random-forest importance is useful for prototype interpretation, not production flood causality claims. |
| `extra_trees` | tree_ensemble | 0.625 | 0.4 | 0.26518987341772154 | Extra-trees importance is useful for prototype comparison, not causal flood interpretation. |

## Scenario Stress Test

| Model | Family | Balanced accuracy | F1 | PR-AUC | Notes |
| --- | --- | --- | --- | --- | --- |
| `majority_baseline` | baseline | 0.5 | 0.7272727272727273 | 0.5714285714285714 | This baseline is expected to look strong on plain accuracy because elevated cases are rare. |
| `logistic_regression` | linear | 1.0 | 1.0 | 1.0 | Logistic regression is still trained on rule-derived labels and should remain shadow-only. |
| `random_forest` | tree_ensemble | 1.0 | 1.0 | 1.0 | Random-forest importance is useful for prototype interpretation, not production flood causality claims. |
| `extra_trees` | tree_ensemble | 1.0 | 1.0 | 1.0 | Extra-trees importance is useful for prototype comparison, not causal flood interpretation. |

## Interpretation

- The registry widens the comparison set, but stronger labels still matter more than adding more algorithms.
- Better model scores on rule-derived labels do not equal validated flood prediction quality.

