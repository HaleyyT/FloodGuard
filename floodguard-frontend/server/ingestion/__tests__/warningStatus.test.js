import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOfficialWarnings } from "../normalisers.js";
import { readAreaWarningStatus } from "../aggregators.js";

const area = {
  id: "parramatta",
  name: "Parramatta, NSW",
  catchment: "Parramatta River",
};

function areaSignals(warningSummary, warningSource = {}) {
  return {
    area,
    warningSummary,
    sourceMetadata: [
      {
        label: "NSW SES / HazardWatch warning status",
        type: "warnings",
        status: "ok",
        source: "https://www.hazardwatch.gov.au/",
        freshnessStatus: "current",
        fetchedAt: "2026-07-03T01:00:00Z",
        observedAt: "2026-07-03T00:55:00Z",
        ...warningSource,
      },
    ],
  };
}

test("warning normaliser filters to area-relevant flood and storm warnings", () => {
  const summary = normalizeOfficialWarnings(
    {
      provider: "HazardWatch",
      warnings: [
        {
          id: "1",
          headline: "Flood watch for Parramatta River corridor",
          level: "watch_and_act",
          area: "Parramatta",
        },
        {
          id: "2",
          headline: "Bushfire advice for Blue Mountains",
          level: "advice",
          area: "Blue Mountains",
        },
      ],
    },
    area,
  );

  assert.equal(summary.parseStatus, "parsed");
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.availableWarningCount, 2);
  assert.equal(summary.warnings[0].hazardType, "flood");
  assert.ok(summary.relevance.matchedBy.includes("warning_type"));
});

test("warning status reports parser_error when payload shape is unsafe", () => {
  const warning = readAreaWarningStatus(
    areaSignals(normalizeOfficialWarnings({ unexpected: true }, area)),
  );

  assert.equal(warning.adapterState, "parser_error");
  assert.equal(warning.adapterStatus, "parser_error");
  assert.equal(warning.parseStatus, "parser_error");
  assert.equal(warning.hasWarning, false);
});

test("warning status reports no_relevant_warning for current but empty warning feeds", () => {
  const warning = readAreaWarningStatus(
    areaSignals(normalizeOfficialWarnings({ provider: "HazardWatch", warnings: [] }, area)),
  );

  assert.equal(warning.adapterState, "no_relevant_warning");
  assert.equal(warning.adapterStatus, "no_relevant_warning");
  assert.equal(warning.warningCount, 0);
});
