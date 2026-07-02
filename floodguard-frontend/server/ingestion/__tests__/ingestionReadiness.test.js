import assert from "node:assert/strict";
import test from "node:test";

import { assessIngestionReadiness } from "../readiness.js";

function buildHealth({
  overallStatus = "partial",
  coreFloodStatus = "blocked",
  contextStatus = "warn",
  warningStatus = "missing",
  sourceOverrides = [],
} = {}) {
  return {
    overallStatus,
    coreFloodStatus,
    contextStatus,
    warningStatus,
    summary: "Core live flood gauge data is blocked by stale, fallback, missing, or mismatched sources.",
    reasons: [],
    areas: [
      {
        areaId: "parramatta",
        areaName: "Parramatta, NSW",
        overallStatus,
        coreFloodStatus,
        contextStatus,
        warningStatus,
        areaRelevance: {
          matchedSignals: 5,
          expectedSignals: 5,
          score: 100,
        },
        sources: [
          {
            label: "FloodSmart rainfall",
            type: "rainfall",
            mode: "cached_stale",
            dataMode: "cached_stale",
            sourceStrength: "primary_live_gauge",
            freshnessStatus: "missing",
          },
          {
            label: "FloodSmart river",
            type: "river",
            mode: "cached_stale",
            dataMode: "cached_stale",
            sourceStrength: "primary_live_gauge",
            freshnessStatus: "missing",
          },
          ...sourceOverrides,
        ],
      },
    ],
  };
}

function buildRegistry() {
  return {
    generatedAt: "2026-07-02T04:00:00Z",
    areas: [
      {
        area: "parramatta",
        areaName: "Parramatta, NSW",
        sources: [],
      },
    ],
  };
}

test("submission readiness passes with degraded external source when stale core data is labelled honestly", () => {
  const readiness = assessIngestionReadiness({
    health: buildHealth(),
    mode: "submission",
    sourceRegistry: buildRegistry(),
  });

  assert.equal(readiness.result, "pass_with_degraded_external_source");
  assert.equal(readiness.submissionBlocking, false);
  assert.equal(readiness.liveOperationalReady, false);
});

test("live readiness fails when fresh live rainfall and river readings are unavailable", () => {
  const readiness = assessIngestionReadiness({
    health: buildHealth(),
    mode: "live",
    sourceRegistry: buildRegistry(),
  });

  assert.equal(readiness.result, "fail");
  assert.equal(readiness.submissionBlocking, true);
});

test("readiness fails when degraded core data is incorrectly presented as live", () => {
  const readiness = assessIngestionReadiness({
    health: buildHealth({
      overallStatus: "live",
      coreFloodStatus: "pass",
      contextStatus: "pass",
      warningStatus: "pass",
    }),
    mode: "submission",
    sourceRegistry: buildRegistry(),
  });

  assert.equal(readiness.result, "fail");
  assert.match(readiness.failures[0], /presented as live|core flood status as pass/i);
});

test("live readiness passes only when every core area source is fresh and live", () => {
  const readiness = assessIngestionReadiness({
    health: {
      overallStatus: "live",
      coreFloodStatus: "pass",
      contextStatus: "pass",
      warningStatus: "pass",
      summary: "Core flood gauges, supporting context, and official warning sources are live.",
      reasons: [],
      areas: [
        {
          areaId: "parramatta",
          areaName: "Parramatta, NSW",
          overallStatus: "live",
          coreFloodStatus: "pass",
          contextStatus: "pass",
          warningStatus: "pass",
          areaRelevance: {
            matchedSignals: 5,
            expectedSignals: 5,
            score: 100,
          },
          sources: [
            {
              label: "FloodSmart rainfall",
              type: "rainfall",
              mode: "remote",
              dataMode: "live_summary_fallback",
              sourceStrength: "primary_live_gauge",
              freshnessStatus: "current",
            },
            {
              label: "FloodSmart river",
              type: "river",
              mode: "remote",
              dataMode: "live",
              sourceStrength: "primary_live_gauge",
              freshnessStatus: "current",
            },
          ],
        },
      ],
    },
    mode: "live",
    sourceRegistry: buildRegistry(),
  });

  assert.equal(readiness.result, "pass");
  assert.equal(readiness.liveOperationalReady, true);
});
