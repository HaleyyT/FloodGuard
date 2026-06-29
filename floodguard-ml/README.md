# FloodGuard ML

This workspace is reserved for future Python-based ML training and evaluation.

Current intent:
- keep the live FloodGuard product system in Node/React
- use Python for offline dataset building, training, evaluation, and model-card generation
- keep ML in shadow mode until there are enough reliable historical observations and independent labels

Recommended workflow:
1. Export structured feature rows from the Node backend.
2. Build a clean tabular dataset in Python.
3. Train baseline models offline.
4. Compare models against the rule engine.
5. Only promote a model when it clearly improves performance and reliability.

Suggested backend endpoint:
- `GET /api/ml/readiness`
- `GET /api/features?area=...`

Suggested next Python tasks:
- `src/build_dataset.py`
- `src/train_baseline.py`
- `src/evaluate.py`
- `src/model_card.py`

This folder is intentionally scaffold-only for now.
