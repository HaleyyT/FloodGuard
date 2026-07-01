# FloodGuard ML Scope

_Updated: 2026-07-01_

## Scope statement

FloodGuard ML scope for Coding Fest:

- export structured historical feature rows;
- train Python baseline models;
- compare ML outputs against rule-derived concern labels;
- generate metrics and a model card;
- keep ML in shadow mode unless independent labels exist;
- do not use ML to override official warnings or live rule-based safety checks.

## Current foundation already in the repo

Node/React side already provides:

- historical snapshot storage through `/api/history`;
- feature dataset export through `/api/features`;
- dataset-quality reporting through `/api/dataset-quality`;
- baseline prediction and model-card style endpoints through `/api/baseline-prediction` and `/api/model-card`;
- model experiment and readiness reporting through `/api/model-experiment` and `/api/ml/readiness`.

Python workspace already exists in [floodguard-ml](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/README.md:1) with starter files for:

- `src/build_dataset.py`
- `src/train_baseline.py`
- `src/evaluate.py`
- `src/model_card.py`

## What counts as “ML implemented” for this sprint

The sprint should only claim ML as implemented when all of these are true:

1. Python can pull or load exported FloodGuard feature rows reproducibly.
2. A baseline tabular model is trained offline in Python.
3. Evaluation metrics are generated on a defensible split.
4. A model card is produced with limitations and shadow-mode wording.
5. The app surfaces those results without presenting them as operational alerting.

## What does not count

These should not be described as completed ML:

- rule-derived labels alone being shown in the UI;
- backend readiness endpoints without Python training;
- a baseline score that has not been trained on a real exported dataset;
- any result described as validated flood prediction without independent outcome labels.

## Operating rules for the ML layer

- Node remains the live product system for ingestion, source trust, rule scoring, and notifications.
- Python remains the offline experimentation layer for dataset building, training, evaluation, and reporting.
- ML stays shadow-only unless there is reliable historical coverage and stronger validation.
- Official warnings always remain separate from FloodGuard-generated ML or rule outputs.
- If ML and the rule engine disagree, the system should present that as comparison evidence, not silent override behavior.

## Immediate next implementation target

The next ML step after Day 1 should be:

1. finalise the export contract from `/api/features`;
2. build a reproducible Python dataset loader;
3. train one honest baseline model such as logistic regression or random forest;
4. evaluate it against rule-derived concern labels with explicit caveats;
5. write a model card that states the dataset size, label source, split method, limitations, and shadow-mode status.

## Honest final wording

Use:

> FloodGuard includes a Python-based prototype ML pipeline that exports historical feature rows, trains baseline tabular models, and compares their outputs with the explainable rule engine. The current ML layer is used for shadow-mode evaluation rather than operational alerting, because independent flood outcome labels and broader event validation are still required.

Avoid:

> FloodGuard uses validated ML to predict floods.

Avoid:

> FloodGuard is an official ML flood warning system.
