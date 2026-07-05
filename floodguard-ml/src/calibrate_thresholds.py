"""Calibrate FloodGuard's prototype thresholds with explicit safety and evidence limits."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import numpy as np

from build_dataset import build_training_dataset
from utils import (
    DEFAULT_DATASET,
    EVENT_LABEL_AVAILABLE_COLUMN,
    GROUP_TIMESTAMP_COLUMN,
    LABEL_COLUMN,
    REPORTS_DIR,
    build_dataset_summary,
    build_supervision_quality_summary,
    choose_training_target,
    ensure_runtime_dirs,
    load_dataset,
    write_json,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
THRESHOLD_CONFIG_PATH = REPO_ROOT / "floodguard-frontend/server/config/risk-thresholds.json"
SWEEP_PATH = REPORTS_DIR / "threshold_sweep.csv"
REPORT_PATH = REPORTS_DIR / "threshold_calibration_report.md"
SUMMARY_PATH = REPORTS_DIR / "calibration_summary.md"
SUMMARY_JSON_PATH = REPORTS_DIR / "threshold_calibration_summary.json"


def load_threshold_config(path: Path = THRESHOLD_CONFIG_PATH) -> dict[str, Any]:
    """Load the live threshold config that the rule engine currently exposes."""

    return json.loads(path.read_text(encoding="utf-8"))


def candidate_values(base: float, step: float, floor: float = 0.0) -> list[float]:
    """Generate a small, reviewable candidate set around the current value."""

    values = sorted(
        {
            round(max(floor, base - step), 3),
            round(base, 3),
            round(max(floor, base + step), 3),
        }
    )
    return values


def build_threshold_grid(config: dict[str, Any]) -> list[dict[str, float]]:
    """Keep the sweep broad enough to learn something but small enough to review manually."""

    defaults = config["defaults"]
    rainfall = defaults["rainfall"]
    river = defaults["river"]
    confidence = defaults["confidence"]

    candidates = []
    for rain_1h in candidate_values(float(rainfall["oneHourConcernMm"]), 2.0):
        for rain_3h in candidate_values(float(rainfall["threeHourConcernMm"]), 4.0):
            for rain_24h in candidate_values(float(rainfall["twentyFourHourConcernMm"]), 10.0):
                for wetness_72h in candidate_values(float(rainfall["seventyTwoHourWetnessMm"]), 15.0):
                    for river_1h in candidate_values(float(river["rapidRiseOneHourM"]), 0.03):
                        for river_3h in candidate_values(float(river["rapidRiseThreeHourM"]), 0.06):
                            for min_coverage in candidate_values(
                                float(confidence["minimumCoreCoverage"]), 0.1
                            ):
                                candidates.append(
                                    {
                                        "rainfall1hMm": rain_1h,
                                        "rainfall3hMm": rain_3h,
                                        "rainfall24hMm": rain_24h,
                                        "rainfall72hMm": wetness_72h,
                                        "riverRise1hM": river_1h,
                                        "riverRise3hM": river_3h,
                                        "minimumCoreCoverage": round(
                                            min(max(min_coverage, 0.3), 0.95), 3
                                        ),
                                    }
                                )
    return candidates


def row_trigger_state(row, thresholds: dict[str, float]) -> dict[str, Any]:
    """Apply a simplified threshold rule for review without overwriting the live rule engine."""

    rainfall_trigger = (
        float(row.get("rainfall1hMm", 0) or 0) >= thresholds["rainfall1hMm"]
        or float(row.get("rainfall3hMm", 0) or 0) >= thresholds["rainfall3hMm"]
        or float(row.get("rainfall24hMm", 0) or 0) >= thresholds["rainfall24hMm"]
        or float(row.get("rainfall72hMm", 0) or 0) >= thresholds["rainfall72hMm"]
    )
    river_trigger = (
        float(row.get("riverDelta1hM", 0) or 0) >= thresholds["riverRise1hM"]
        or float(row.get("riverDelta3hM", 0) or 0) >= thresholds["riverRise3hM"]
    )
    degraded_source = (
        float(row.get("sourceCoverage", 0) or 0) < thresholds["minimumCoreCoverage"]
        or float(row.get("dataFreshnessScore", 0) or 0) < 60
    )
    raw_trigger = rainfall_trigger or river_trigger
    final_trigger = int(raw_trigger and not degraded_source)

    return {
        "predictedElevated": final_trigger,
        "rawTriggered": raw_trigger,
        "degradedSource": degraded_source,
        "suppressedByDegradedSource": raw_trigger and degraded_source,
    }


def target_metadata(dataframe) -> dict[str, Any]:
    """Choose the most honest calibration target available and explain its limitations."""

    selection = choose_training_target(dataframe)
    summary = build_dataset_summary(dataframe, "calibration_reference")
    supervision_quality = build_supervision_quality_summary(summary, selection)
    return {
        "column": selection["selectedTargetColumn"],
        "kind": selection["selectedTargetKind"],
        "positiveRows": int(selection["positiveCount"]),
        "reason": selection["reason"],
        "supervisionQuality": supervision_quality,
        "eventTargetCandidate": selection.get("eventTargetCandidate"),
    }


def positive_windows(dataframe, target_column: str) -> list[dict[str, Any]]:
    """Collapse elevated rows into replay-style contiguous windows per area."""

    if dataframe.empty:
        return []

    elevated = dataframe[dataframe[target_column].fillna(0).astype(int) == 1].copy()
    if elevated.empty:
        return []

    windows = []
    for area_id, area_rows in elevated.groupby("areaId"):
        ordered = area_rows.sort_values(GROUP_TIMESTAMP_COLUMN)
        current_window = None
        for _, row in ordered.iterrows():
            timestamp = row[GROUP_TIMESTAMP_COLUMN]
            if current_window is None:
                current_window = {"areaId": area_id, "start": timestamp, "end": timestamp}
                continue
            gap_hours = (timestamp - current_window["end"]).total_seconds() / 3600
            if gap_hours <= 3:
                current_window["end"] = timestamp
            else:
                windows.append(current_window)
                current_window = {"areaId": area_id, "start": timestamp, "end": timestamp}
        if current_window is not None:
            windows.append(current_window)
    return windows


def evaluate_threshold_candidate(dataframe, thresholds: dict[str, float], target_column: str) -> dict[str, Any]:
    """Score one candidate threshold set on confusion metrics and event-style behaviour."""

    rainfall_1h = dataframe["rainfall1hMm"].fillna(0).to_numpy()
    rainfall_3h = dataframe["rainfall3hMm"].fillna(0).to_numpy()
    rainfall_24h = dataframe["rainfall24hMm"].fillna(0).to_numpy()
    rainfall_72h = dataframe["rainfall72hMm"].fillna(0).to_numpy()
    river_1h = dataframe["riverDelta1hM"].fillna(0).to_numpy()
    river_3h = dataframe["riverDelta3hM"].fillna(0).to_numpy()
    source_coverage = dataframe["sourceCoverage"].fillna(0).to_numpy()
    freshness = dataframe["dataFreshnessScore"].fillna(0).to_numpy()
    actual = dataframe[target_column].fillna(0).astype(int).to_numpy()

    raw_trigger = (
        (rainfall_1h >= thresholds["rainfall1hMm"])
        | (rainfall_3h >= thresholds["rainfall3hMm"])
        | (rainfall_24h >= thresholds["rainfall24hMm"])
        | (rainfall_72h >= thresholds["rainfall72hMm"])
        | (river_1h >= thresholds["riverRise1hM"])
        | (river_3h >= thresholds["riverRise3hM"])
    )
    degraded_source = (
        (source_coverage < thresholds["minimumCoreCoverage"]) | (freshness < 60)
    )
    predicted = (raw_trigger & ~degraded_source).astype(int)
    suppressed = raw_trigger & degraded_source

    tp = int(np.sum((actual == 1) & (predicted == 1)))
    tn = int(np.sum((actual == 0) & (predicted == 0)))
    fp = int(np.sum((actual == 0) & (predicted == 1)))
    fn = int(np.sum((actual == 1) & (predicted == 0)))
    positives = tp + fn
    negatives = tn + fp
    scored_frame = dataframe[["areaId", GROUP_TIMESTAMP_COLUMN]].copy()
    scored_frame["actual"] = actual
    scored_frame["predictedElevated"] = predicted
    scored_frame["rawTriggered"] = raw_trigger
    scored_frame["degradedSource"] = degraded_source
    scored_frame["suppressedByDegradedSource"] = suppressed

    windows = positive_windows(dataframe, target_column)
    detected_windows = 0
    missed_windows = 0
    detection_hours = []
    for window in windows:
        hits = scored_frame[
            (scored_frame["areaId"] == window["areaId"])
            & (scored_frame[GROUP_TIMESTAMP_COLUMN] >= window["start"])
            & (scored_frame[GROUP_TIMESTAMP_COLUMN] <= window["end"])
            & (scored_frame["predictedElevated"] == 1)
        ]
        if not hits.empty:
            detected_windows += 1
            first_hit = hits[GROUP_TIMESTAMP_COLUMN].min()
            detection_hours.append(
                round((first_hit - window["start"]).total_seconds() / 3600, 3)
            )
        else:
            missed_windows += 1

    suppressed_count = int(np.sum(suppressed))
    raw_triggered_count = int(np.sum(raw_trigger))
    return {
        **thresholds,
        "rows": int(len(scored_frame)),
        "positives": positives,
        "negatives": negatives,
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "recall": None if positives == 0 else round(tp / positives, 4),
        "falsePositiveRate": None if negatives == 0 else round(fp / negatives, 4),
        "balancedAccuracy": None
        if positives == 0 or negatives == 0
        else round(((tp / positives) + (tn / negatives)) / 2, 4),
        "eventWindowCount": len(windows),
        "detectedEventWindows": detected_windows,
        "missedEventWindows": missed_windows,
        "timeToDetectionHours": None if not detection_hours else round(sum(detection_hours) / len(detection_hours), 3),
        "rawTriggeredRows": raw_triggered_count,
        "degradedSourceSuppressedRows": suppressed_count,
        "degradedSourceSuppressionRate": None
        if raw_triggered_count == 0
        else round(suppressed_count / raw_triggered_count, 4),
    }


def rank_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort toward higher recall and lower false positives without hiding unavailable metrics."""

    return sorted(
        candidates,
        key=lambda candidate: (
            -1 if candidate["recall"] is None else candidate["recall"],
            1 if candidate["falsePositiveRate"] is None else -candidate["falsePositiveRate"],
            -1 if candidate["balancedAccuracy"] is None else candidate["balancedAccuracy"],
            -candidate["degradedSourceSuppressedRows"],
        ),
        reverse=True,
    )


def write_sweep_csv(rows: list[dict[str, Any]], path: Path = SWEEP_PATH) -> Path:
    """Persist the full sweep for review, poster evidence, and future expert calibration sessions."""

    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return path

    headers = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
    return path


def calibration_report_text(
    config: dict[str, Any],
    target: dict[str, Any],
    ranked_rows: list[dict[str, Any]],
    selected_row: dict[str, Any],
) -> str:
    """Explain the sweep honestly, including when the current data is too weak to promote changes."""

    top_rows = ranked_rows[:5]
    lines = [
        "# FloodGuard Threshold Calibration Report",
        "",
        "FloodGuard calibrates thresholds in a reviewable shadow workflow and does not auto-promote threshold changes into operational claims.",
        "",
        f"- Threshold version under review: `{config.get('version')}`",
        f"- Review status: `{config.get('reviewStatus')}`",
        f"- Calibration target kind: `{target['kind']}`",
        f"- Calibration target reason: {target['reason']}",
        f"- Positive rows available for this target: `{target['positiveRows']}`",
        f"- Candidate threshold sets evaluated: `{len(ranked_rows)}`",
        "",
    ]

    limitations = config.get("limitations", [])
    if limitations:
        lines.append("## Known limitations")
        lines.append("")
        for limitation in limitations:
            lines.append(f"- {limitation}")
        lines.append("")

    supervision_quality = target.get("supervisionQuality", {})
    lines.extend(
        [
            "## Supervision quality",
            "",
            f"- Grade: `{supervision_quality.get('grade', 'unknown')}`",
            f"- Viable for independent supervision: `{supervision_quality.get('viableForIndependentSupervision', False)}`",
            f"- Summary: {supervision_quality.get('summary', 'unavailable')}",
            f"- Primary limitation: {supervision_quality.get('primaryLimitation', 'unavailable')}",
            f"- Evidence-backed or reviewed event rows: `{supervision_quality.get('eligibleIndependentRowCount', 0)}`",
            f"- Evidence-backed or reviewed elevated event rows: `{supervision_quality.get('eligibleIndependentPositiveCount', 0)}`",
            "",
        ]
    )

    if target.get("eventTargetCandidate"):
        candidate = target["eventTargetCandidate"]
        lines.extend(
            [
                "## Event-label candidate review",
                "",
                f"- Candidate rows: `{candidate.get('eligibleRowCount', 0)}`",
                f"- Candidate elevated examples: `{candidate.get('positiveCount', 0)}`",
                f"- Strength counts: `{candidate.get('strengthCounts', {})}`",
                f"- Review status counts: `{candidate.get('reviewStatusCounts', {})}`",
                f"- Evidence-linked rows: `{candidate.get('evidenceLinkedRowCount', 0)}`",
                f"- Reviewed rows: `{candidate.get('reviewedRowCount', 0)}`",
                f"- Eligible independent rows: `{candidate.get('eligibleIndependentRowCount', 0)}`",
                f"- Eligible independent positives: `{candidate.get('eligibleIndependentPositiveCount', 0)}`",
                "",
            ]
        )

    lines.extend(
        [
            "## Current candidate recommendation",
            "",
            f"- Recommended action: `keep current thresholds for live prototype use; use sweep outputs for expert review`",
            f"- Best-ranked review candidate recall: `{selected_row['recall']}`",
            f"- Best-ranked review candidate false positive rate: `{selected_row['falsePositiveRate']}`",
            f"- Best-ranked review candidate event windows detected: `{selected_row['detectedEventWindows']}/{selected_row['eventWindowCount']}`",
            f"- Best-ranked review candidate degraded-source suppressed rows: `{selected_row['degradedSourceSuppressedRows']}`",
        ]
    )

    if all((row["recall"] or 0) == 0 for row in ranked_rows):
        lines.extend(
            [
                "## Calibration finding",
                "",
                "Every swept candidate currently has zero recall against the selected reference target.",
                "This means the exported elevated reference rows are not being recreated by the simple rainfall/river threshold family alone, which is a useful warning for future expert review.",
                "In practice, FloodGuard should keep the current conservative thresholds, improve event labels, and inspect whether elevated rule concern is being driven more by freshness, coverage, public-signal, or other logic outside this calibration scaffold.",
                "",
            ]
        )

    lines.extend(["## Top sweep rows", ""])

    for index, row in enumerate(top_rows, start=1):
        lines.extend(
            [
                f"### Candidate {index}",
                "",
                f"- Rainfall thresholds: 1h `{row['rainfall1hMm']}` mm, 3h `{row['rainfall3hMm']}` mm, 24h `{row['rainfall24hMm']}` mm, 72h `{row['rainfall72hMm']}` mm",
                f"- River thresholds: 1h `{row['riverRise1hM']}` m, 3h `{row['riverRise3hM']}` m",
                f"- Minimum core coverage: `{row['minimumCoreCoverage']}`",
                f"- Recall: `{row['recall']}`",
                f"- False positive rate: `{row['falsePositiveRate']}`",
                f"- Time to detection (hours): `{row['timeToDetectionHours']}`",
                f"- Missed event windows: `{row['missedEventWindows']}`",
                f"- Raw triggered rows: `{row['rawTriggeredRows']}`",
                f"- Degraded-source suppression rate: `{row['degradedSourceSuppressionRate']}`",
                "",
            ]
        )

    if target["kind"] != "event":
        lines.extend(
            [
                "## Interpretation warning",
                "",
                "This sweep currently ranks threshold sets against rule-derived reference targets because no elevated independent event windows are joined yet.",
                "That means the workbench is valuable for replay plumbing, degraded-source review, and expert discussion, but it is not evidence that a new threshold set is validated.",
                "Until FloodGuard has evidence-backed reviewed event windows, calibration should be described as prototype-only rather than evidence-backed.",
                "",
            ]
        )

    return "\n".join(lines)


def calibration_summary_text(
    config: dict[str, Any], target: dict[str, Any], selected_row: dict[str, Any]
) -> str:
    """Write a concise calibration summary for the dashboard/backend report reader."""

    supervision_quality = target.get("supervisionQuality", {})
    return "\n".join(
        [
            "# FloodGuard Threshold Calibration Summary",
            "",
            f"Threshold version `{config.get('version')}` remains review-only.",
            f"Calibration target kind: `{target['kind']}`.",
            f"Supervision grade: `{supervision_quality.get('grade', 'unknown')}`.",
            f"Evidence-backed reviewed event rows: `{supervision_quality.get('eligibleIndependentRowCount', 0)}`; elevated: `{supervision_quality.get('eligibleIndependentPositiveCount', 0)}`.",
            f"Recommended action: keep current thresholds for live prototype use while using sweep results for expert review.",
            f"Best review candidate recall: `{selected_row['recall']}`; false positive rate: `{selected_row['falsePositiveRate']}`.",
            "",
        ]
    )


def run_calibration(
    dataset_path: Path = DEFAULT_DATASET,
    config_path: Path = THRESHOLD_CONFIG_PATH,
    sweep_path: Path = SWEEP_PATH,
    report_path: Path = REPORT_PATH,
    summary_path: Path = SUMMARY_PATH,
    summary_json_path: Path = SUMMARY_JSON_PATH,
) -> dict[str, Any]:
    """Execute the full threshold sweep and write the report artifacts."""

    ensure_runtime_dirs()
    if not dataset_path.exists():
        build_training_dataset()
    dataframe = load_dataset(dataset_path)
    config = load_threshold_config(config_path)
    target = target_metadata(dataframe)
    target_column = target["column"]
    grid = build_threshold_grid(config)
    scored_rows = [
        evaluate_threshold_candidate(dataframe, candidate, target_column) for candidate in grid
    ]
    ranked_rows = rank_candidates(scored_rows)
    selected_row = ranked_rows[0]
    write_sweep_csv(ranked_rows, sweep_path)
    report_path.write_text(
        f"{calibration_report_text(config, target, ranked_rows, selected_row)}\n",
        encoding="utf-8",
    )
    summary_path.write_text(
        f"{calibration_summary_text(config, target, selected_row)}\n",
        encoding="utf-8",
    )
    write_json(
        summary_json_path,
        {
            "thresholdVersion": config.get("version"),
            "reviewStatus": config.get("reviewStatus"),
            "target": target,
            "selectedCandidate": selected_row,
        },
    )
    return {
        "targetKind": target["kind"],
        "candidateCount": len(ranked_rows),
        "selectedCandidate": selected_row,
        "sweepPath": str(sweep_path),
        "reportPath": str(report_path),
        "summaryPath": str(summary_path),
        "summaryJsonPath": str(summary_json_path),
    }


def main() -> None:
    """Run the calibration workbench with project-default paths."""

    result = run_calibration()
    print(f"Evaluated {result['candidateCount']} threshold candidate(s).")
    print(f"Sweep: {result['sweepPath']}")
    print(f"Report: {result['reportPath']}")
    print(f"Summary: {result['summaryPath']}")


if __name__ == "__main__":
    main()
