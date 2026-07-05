"""Promote evidence-backed backlog rows into joined label windows without overstating review quality."""

from __future__ import annotations

from pathlib import Path

from audit_labels import EVENT_BACKLOG_DATASET, load_event_backlog, write_label_audit_artifacts
from build_dataset import build_training_dataset, load_label_windows
from calibrate_thresholds import run_calibration
from evaluate import run_evaluation
from model_card import write_model_card
from utils import (
    DEFAULT_DATASET,
    LABELS_DATASET,
    REPORTS_DIR,
    ensure_runtime_dirs,
    explicit_shadow_review_status,
    expert_review_fields_complete,
    independent_event_source,
    real_evidence_link_present,
    reviewed_event_status,
)

import pandas as pd


LABEL_COLUMNS = [
    "area",
    "start_time",
    "end_time",
    "label",
    "label_source",
    "label_strength",
    "review_status",
    "evidence_link",
    "review_notes",
    "reviewer",
    "reviewed_at",
    "notes",
]


def backlog_promotion_mask(backlog: pd.DataFrame) -> pd.Series:
    """Allow only independently sourced rows with real evidence or explicit review states."""

    if backlog.empty:
        return pd.Series(dtype="bool")

    real_evidence_mask = real_evidence_link_present(
        backlog.get("evidence_link", pd.Series(index=backlog.index, dtype="object"))
    )
    explicit_review_mask = explicit_shadow_review_status(
        backlog.get("review_status", pd.Series(index=backlog.index, dtype="object"))
    )
    expert_validated_mask = backlog.get("review_status", pd.Series(index=backlog.index, dtype="object")).fillna(
        "unknown"
    ).astype(str).eq("expert_validated")
    expert_metadata_mask = expert_review_fields_complete(
        backlog.get("reviewer", pd.Series(index=backlog.index, dtype="object")),
        backlog.get("reviewed_at", pd.Series(index=backlog.index, dtype="object")),
        backlog.get("review_notes", pd.Series(index=backlog.index, dtype="object")),
    )
    reviewed_mask = reviewed_event_status(
        backlog.get("review_status", pd.Series(index=backlog.index, dtype="object"))
    ) & (~expert_validated_mask | expert_metadata_mask)
    independent_mask = independent_event_source(
        backlog.get("label_source", pd.Series(index=backlog.index, dtype="object"))
    )
    join_status = backlog.get("join_status", pd.Series(index=backlog.index, dtype="object"))
    joinable_mask = ~join_status.fillna("backlog_only").astype(str).eq("joined_to_labels")
    label_class_present = pd.to_numeric(
        backlog.get("label_class", pd.Series(index=backlog.index, dtype="float64")),
        errors="coerce",
    ).notna()
    return independent_mask & joinable_mask & label_class_present & (
        real_evidence_mask | (explicit_review_mask & reviewed_mask)
    )


def backlog_rows_to_labels(backlog_rows: pd.DataFrame) -> pd.DataFrame:
    """Map backlog review rows into the joined label schema while keeping provenance fields intact."""

    if backlog_rows.empty:
        return pd.DataFrame(columns=LABEL_COLUMNS)

    promoted = pd.DataFrame(
        {
            "area": backlog_rows["area"].astype(str),
            "start_time": backlog_rows["start_time"],
            "end_time": backlog_rows["end_time"],
            "label": pd.to_numeric(backlog_rows["label_class"], errors="coerce").fillna(0).astype(int),
            "label_source": backlog_rows["label_source"].astype(str),
            "label_strength": backlog_rows["label_strength"].fillna("unknown").astype(str),
            "review_status": backlog_rows["review_status"].fillna("candidate_review").astype(str),
            "evidence_link": backlog_rows.get("evidence_link", "").fillna("").astype(str),
            "review_notes": backlog_rows.get("review_notes", "").fillna("").astype(str),
            "reviewer": backlog_rows.get("reviewer", "").fillna("").astype(str),
            "reviewed_at": backlog_rows.get("reviewed_at", "").fillna("").astype(str),
            "notes": backlog_rows.get("notes", "").fillna("").astype(str),
        }
    )
    return promoted[LABEL_COLUMNS]


def upsert_label_rows(existing_labels: pd.DataFrame, promoted_rows: pd.DataFrame) -> pd.DataFrame:
    """Replace matching label windows by area and time so reruns stay deterministic."""

    labels = existing_labels.copy()
    for column in LABEL_COLUMNS:
        if column not in labels.columns:
            labels[column] = pd.NA
    labels = labels[LABEL_COLUMNS]

    if promoted_rows.empty:
        return labels

    key_columns = ["area", "start_time", "end_time"]
    if labels.empty:
        combined = promoted_rows.copy()
    else:
        existing_keys = set(
            zip(
                promoted_rows["area"].astype(str),
                promoted_rows["start_time"].astype(str),
                promoted_rows["end_time"].astype(str),
            )
        )
        keep_mask = ~labels[key_columns].astype(str).apply(tuple, axis=1).isin(existing_keys)
        combined = pd.concat([labels[keep_mask], promoted_rows], ignore_index=True)

    combined["start_time"] = pd.to_datetime(combined["start_time"], errors="coerce", utc=True)
    combined["end_time"] = pd.to_datetime(combined["end_time"], errors="coerce", utc=True)
    combined = combined.sort_values(["area", "start_time", "end_time"], kind="stable").reset_index(drop=True)
    return combined


def mark_promoted_backlog_rows(backlog: pd.DataFrame, promotion_mask: pd.Series) -> pd.DataFrame:
    """Record which backlog rows are now joined so future audits do not double-count them."""

    updated = backlog.copy()
    if updated.empty:
        return updated

    updated.loc[promotion_mask, "join_status"] = "joined_to_labels"
    updated.loc[promotion_mask, "promotion_ready"] = "promoted"
    return updated


def write_dataframe_csv(frame: pd.DataFrame, path: Path) -> None:
    """Persist CSV output with stable formatting for reviewable diffs."""

    path.write_text(frame.to_csv(index=False), encoding="utf-8")


def promote_reviewed_labels(
    backlog_path: Path = EVENT_BACKLOG_DATASET,
    labels_path: Path = LABELS_DATASET,
    dataset_path: Path = DEFAULT_DATASET,
) -> dict[str, object]:
    """Promote eligible backlog rows and regenerate the shadow-mode supervision artifacts."""

    ensure_runtime_dirs()
    backlog = load_event_backlog(backlog_path)
    promotion_mask = backlog_promotion_mask(backlog)
    promotable_rows = backlog.loc[promotion_mask].copy()
    existing_labels = load_label_windows(labels_path)
    promoted_labels = backlog_rows_to_labels(promotable_rows)
    updated_labels = upsert_label_rows(existing_labels, promoted_labels)
    updated_backlog = mark_promoted_backlog_rows(backlog, promotion_mask)

    write_dataframe_csv(updated_labels, labels_path)
    write_dataframe_csv(updated_backlog, backlog_path)
    build_training_dataset(labels_path=labels_path, output_path=dataset_path)
    label_audit = write_label_audit_artifacts()
    evaluation_results = run_evaluation()
    write_model_card(evaluation_results)
    calibration = run_calibration(dataset_path=dataset_path)

    return {
        "promotedCount": int(len(promotable_rows)),
        "promotedRows": promoted_labels.to_dict(orient="records"),
        "labelsPath": str(labels_path),
        "backlogPath": str(backlog_path),
        "datasetPath": str(dataset_path),
        "labelAuditPath": str(REPORTS_DIR / "label_audit.md"),
        "modelCardPath": str(REPORTS_DIR / "model_card.md"),
        "targetSelectionPath": str(REPORTS_DIR / "target_selection_summary.md"),
        "thresholdCalibrationPath": str(REPORTS_DIR / "threshold_calibration_report.md"),
        "reviewedEventWindows": int(label_audit["labelsSummary"].get("reviewedRows", 0)),
        "reviewedElevatedEventWindows": int(label_audit["labelsSummary"].get("reviewedPositiveRows", 0)),
        "calibrationTargetKind": calibration.get("targetKind")
        or calibration.get("target", {}).get("kind"),
    }


def main() -> None:
    result = promote_reviewed_labels()
    print(f"Promoted {result['promotedCount']} backlog row(s) into labels.csv")


if __name__ == "__main__":
    main()
