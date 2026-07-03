import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDataEvidenceRows,
  buildNotificationBannerModel,
  buildRiskSummaryModel,
} from "../../../src/dashboardPresentation.js";

test("data evidence rows label live gauges, stale context, and missing warnings clearly", () => {
  const rows = buildDataEvidenceRows([
    {
      label: "FloodSmart rainfall",
      type: "rainfall",
      sourceStrength: "primary_live_gauge",
      freshnessStatus: "current",
      dataMode: "live",
      areaRelevance: ["67111"],
    },
    {
      label: "Parramatta weather observations",
      type: "weather",
      sourceStrength: "official_backup",
      freshnessStatus: "stale",
      dataMode: "live",
    },
    {
      label: "NSW SES / HazardWatch warning status",
      type: "warnings",
      sourceStrength: "official_warning",
      freshnessStatus: "missing",
      dataMode: "missing",
    },
  ]);

  assert.equal(rows[0].statusLabel, "Live gauge");
  assert.equal(rows[0].stationReference, "67111");
  assert.equal(rows[1].statusLabel, "Stale context");
  assert.equal(rows[2].statusLabel, "Not connected");
});

test("risk summary model surfaces confidence and data-quality warnings", () => {
  const summary = buildRiskSummaryModel({
    riskLevel: "Moderate",
    summary: "Moderate local concern is present.",
    decisionAudit: {
      hazardPressure: { rainfall: "elevated", river: "stable", wetness: "moderate" },
      evidenceConfidence: "partial",
      recommendationType: "monitor_and_check_official_sources",
      checkNext: ["Check official NSW SES and BoM advice."],
      reliability: {
        score: 82,
        level: "High",
        blockers: [],
        warnings: ["1 supporting context source is stale"],
      },
    },
  });

  assert.equal(summary.riskLevel, "Moderate");
  assert.match(summary.confidenceLabel, /82% High/);
  assert.match(summary.warnings[0], /stale/i);
  assert.equal(summary.hazardPressure.rainfall, "elevated");
  assert.equal(summary.evidenceConfidence, "partial");
  assert.equal(summary.recommendationType, "monitor_and_check_official_sources");
  assert.match(summary.checkNext[0], /NSW SES|BoM/i);
});

test("notification banner model separates official warnings from app-generated and data-quality notices", () => {
  const model = buildNotificationBannerModel({
    candidates: [
      { id: "1", notificationType: "official_warning", title: "Watch and Act", severity: "urgent" },
      { id: "2", notificationType: "awareness_notice", title: "FloodGuard risk increased", severity: "watch" },
      { id: "3", notificationType: "data_quality_notice", title: "Data reliability degraded", severity: "info" },
    ],
    suppressed: [{ type: "risk_level_increased", reason: "Duplicate suppressed." }],
  });

  assert.equal(model.officialWarnings.length, 1);
  assert.equal(model.appRiskNotices.length, 1);
  assert.equal(model.dataQualityNotices.length, 1);
  assert.equal(model.primary.id, "1");
  assert.match(model.suppressed[0].reason, /suppressed/i);
});
