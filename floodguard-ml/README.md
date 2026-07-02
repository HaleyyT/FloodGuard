# FloodGuard ML

This workspace now contains FloodGuard's prototype Python ML pipeline.

Current intent:
- keep the live FloodGuard product system in Node/React
- use Python for offline dataset building, training, evaluation, and model-card generation
- keep ML in shadow mode until there are enough reliable historical observations and independent labels

Current workflow:
1. Export structured feature rows from the Node backend with `npm run export:ml-dataset`.
2. Build a label-joined training dataset plus scenario stress-test dataset with `python3.12 floodguard-ml/src/build_dataset.py`.
3. Run the full prototype pipeline with `python3.12 floodguard-ml/src/evaluate.py`.
4. Review outputs in `floodguard-ml/reports/` and `floodguard-ml/models/`.

Suggested backend endpoint:
- `GET /api/ml/readiness`
- `GET /api/ml/dataset?area=...`

Implemented Python scripts:
- `src/build_dataset.py`
- `src/train_baseline.py`
- `src/train_tree_models.py`
- `src/evaluate.py`
- `src/model_card.py`
- `src/utils.py`

Important limitations:
- the real export is still heavily imbalanced;
- the live training target is still `rule_derived`;
- joined event labels are currently a preparation layer, not validated flood outcomes;
- metrics are illustrative only;
- ML must remain shadow-mode.

Environment note:
- the vendored ML dependency bundle in `floodguard-ml/.vendor` currently targets Python 3.12, so use `python3.12` for local ML commands.
