"""Central model registry for FloodGuard's prototype shadow-mode model suite."""

from __future__ import annotations

from train_baseline import train_logistic_regression, train_majority_baseline
from train_tree_models import train_extra_trees, train_random_forest


MODEL_REGISTRY = [
    {
        "modelName": "majority_baseline",
        "family": "baseline",
        "trainer": train_majority_baseline,
        "description": "Always predicts the majority class to expose how misleading plain accuracy can be.",
    },
    {
        "modelName": "logistic_regression",
        "family": "linear",
        "trainer": train_logistic_regression,
        "description": "Balanced logistic regression for interpretable shadow-mode comparison.",
    },
    {
        "modelName": "random_forest",
        "family": "tree_ensemble",
        "trainer": train_random_forest,
        "description": "Balanced random forest for non-linear prototype comparison.",
    },
    {
        "modelName": "extra_trees",
        "family": "tree_ensemble",
        "trainer": train_extra_trees,
        "description": "Balanced extra-trees ensemble to widen the tree-based prototype model suite.",
    },
]
