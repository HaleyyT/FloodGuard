# FloodGuard ML

This workspace now contains FloodGuard's prototype Python ML pipeline.

Current intent:
- keep the live FloodGuard product system in Node/React
- use Python for offline dataset building, training, evaluation, and model-card generation
- keep ML in shadow mode until there are enough reliable historical observations and independent labels

Current workflow:
1. Export structured feature rows from the Node backend with `npm run export:ml-dataset`.
2. Build a label-joined training dataset plus scenario stress-test dataset with `python3.12 floodguard-ml/src/build_dataset.py`.
3. Audit label strength and backlog coverage with `python3.12 floodguard-ml/src/audit_labels.py`.
4. Run the full prototype pipeline with `python3.12 floodguard-ml/src/evaluate.py`.
5. Review outputs in `floodguard-ml/reports/` and `floodguard-ml/models/`, especially `label_audit_report.md`, `feature_quality_summary.md`, `target_selection_summary.md`, `model_comparison.md`, `validation_summary.md`, `calibration_summary.md`, `model_card.md`, and the dataset-specific metrics files.

Suggested backend endpoint:
- `GET /api/ml/readiness`
- `GET /api/ml/dataset?area=...`

Implemented Python scripts:
- `src/build_dataset.py`
- `src/audit_labels.py`
- `src/model_registry.py`
- `src/train_baseline.py`
- `src/train_tree_models.py`
- `src/evaluate.py`
- `src/model_card.py`
- `src/utils.py`

Important limitations:
- the real export is still heavily imbalanced;
- the real export may still fall back to a `rule_derived` training target when event labels are too sparse or weak;
- joined event labels are currently a preparation layer, not validated flood outcomes;
- time-aware validation is now implemented, but real independent event holdout remains weak because stronger labels are still missing;
- probability outputs and calibration summaries are informative shadow-mode artifacts, not operational confidence guarantees;
- metrics are illustrative only;
- ML must remain shadow-mode.

Environment note:
- the vendored ML dependency bundle in `floodguard-ml/.vendor` currently targets Python 3.12, so use `python3.12` for local ML commands.
