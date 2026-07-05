"""Refresh automation-backed shadow reports without promoting ML or labels."""

from __future__ import annotations

from pathlib import Path

from audit_labels import write_label_audit_artifacts
from build_candidate_event_backlog import build_candidate_event_backlog
from calibrate_thresholds import run_calibration
from evaluate import run_evaluation
from utils import DEFAULT_DATASET, FEATURE_EXPORT_DATASET


def refresh_shadow_pipeline() -> dict:
    """Rebuild candidate queues and shadow reports while keeping ML non-operational."""

    backlog = build_candidate_event_backlog()
    label_audit = write_label_audit_artifacts()

    evaluation = None
    calibration = None
    if FEATURE_EXPORT_DATASET.exists() or DEFAULT_DATASET.exists():
        evaluation = run_evaluation()
        calibration = run_calibration()

    return {
        "backlogRows": len(backlog),
        "labelAuditPath": label_audit["markdownPath"],
        "evaluationRan": evaluation is not None,
        "calibrationRan": calibration is not None,
    }


def main() -> None:
    summary = refresh_shadow_pipeline()
    print(
        "Shadow refresh complete: "
        f"backlogRows={summary['backlogRows']}, "
        f"evaluationRan={summary['evaluationRan']}, "
        f"calibrationRan={summary['calibrationRan']}"
    )


if __name__ == "__main__":
    main()
