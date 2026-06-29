import assert from "node:assert/strict";
import test from "node:test";

import { buildNotificationCandidates } from "../notificationRules.js";

function areaSignals(overrides = {}) {
  return {
    area: { id: "parramatta", name: "Parramatta, NSW" },
    ingestedAt: "2026-06-29T03:00:00Z",
    warningSummary: { status: "no_current_warning", statusLabel: "No current warning", observedAt: null },
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        dataMode: "live",
        mode: "remote",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:55:00Z",
      },
      {
        label: "FloodSmart river",
        type: "river",
        dataMode: "live",
        mode: "remote",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:55:00Z",
      },
      {
        label: "NSW SES / HazardWatch warning status",
        type: "warnings",
        dataMode: "missing",
        mode: "not-configured",
        freshnessStatus: "missing",
        sourceStrength: "official_warning",
        fetchedAt: "2026-06-29T03:00:00Z",
      },
    ],
    ingestionHealth: { coreFloodStatus: "pass", overallStatus: "live" },
    riskAssessment: {
      concernLevel: "Low",
      score: 20,
      features: {
        rainfall1hMm: 0,
        rainfall3hMm: 0,
        riverDelta1hM: 0,
        riverDelta3hM: 0,
      },
    },
    freshness: { staleSourceCount: 0 },
    ...overrides,
  };
}

test("emits official warning notification candidates with official wording separated", () => {
  const notifications = buildNotificationCandidates(
    areaSignals({
      warningSummary: {
        status: "watch_and_act",
        statusLabel: "Watch And Act",
        observedAt: "2026-06-29T02:58:00Z",
      },
    }),
    [],
  );

  assert.equal(notifications.candidates[0].type, "official_warning_detected");
  assert.match(notifications.candidates[0].message, /check NSW SES \/ HazardWatch/i);
});

test("suppresses risk escalation when core evidence is degraded by cache or fallback", () => {
  const notifications = buildNotificationCandidates(
    areaSignals({
      ingestionHealth: { coreFloodStatus: "warn", overallStatus: "partial" },
      sourceMetadata: [
        {
          label: "FloodSmart rainfall",
          type: "rainfall",
          dataMode: "cached_recent",
          mode: "cached_recent",
          freshnessStatus: "current",
          sourceStrength: "primary_live_gauge",
          fetchedAt: "2026-06-29T03:00:00Z",
        },
      ],
      riskAssessment: {
        concernLevel: "High",
        score: 78,
        features: {
          rainfall1hMm: 12,
          rainfall3hMm: 22,
          riverDelta1hM: 0,
          riverDelta3hM: 0,
        },
      },
    }),
    [
      {
        ingestedAt: "2026-06-29T01:30:00Z",
        riskLevel: "Low",
        riskFeatures: { rainfall1hMm: 1, rainfall3hMm: 2, riverDelta1hM: 0, riverDelta3hM: 0 },
        sourceFreshness: [{ dataMode: "live", freshnessStatus: "current" }],
        freshness: { staleSourceCount: 0 },
      },
    ],
  );

  assert.equal(
    notifications.candidates.some((candidate) => candidate.type === "risk_level_increased"),
    false,
  );
});

test("emits reliability degraded notification when reliability moves from live to partial", () => {
  const notifications = buildNotificationCandidates(
    areaSignals({
      ingestionHealth: { coreFloodStatus: "warn", overallStatus: "partial" },
      sourceMetadata: [
        {
          label: "FloodSmart rainfall",
          type: "rainfall",
          dataMode: "cached_recent",
          mode: "cached_recent",
          freshnessStatus: "current",
          sourceStrength: "primary_live_gauge",
          fetchedAt: "2026-06-29T03:00:00Z",
        },
      ],
    }),
    [
      {
        ingestedAt: "2026-06-29T01:00:00Z",
        riskLevel: "Low",
        sourceFreshness: [{ dataMode: "live", freshnessStatus: "current" }],
        freshness: { staleSourceCount: 0 },
      },
    ],
  );

  assert.equal(notifications.candidates.at(-1).type, "data_reliability_degraded");
});
