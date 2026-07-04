import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOfficialWarnings } from "../normalisers.js";
import { readAreaWarningStatus } from "../aggregators.js";
import { areaConfigs } from "../areaConfig.js";

const area = {
  id: "parramatta",
  name: "Parramatta, NSW",
  catchment: "Parramatta River",
};

const northParramattaArea = areaConfigs["north-parramatta"];
const toongabbieArea = areaConfigs.toongabbie;

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

test("warning normaliser matches north parramatta through suburb and catchment aliases", () => {
  const summary = normalizeOfficialWarnings(
    {
      provider: "HazardWatch",
      warnings: [
        {
          id: "north-1",
          headline: "Flash flood watch for Darling Mills Creek and North Parramatta",
          level: "watch_and_act",
          area: "North Parramatta",
        },
      ],
    },
    northParramattaArea,
  );

  assert.equal(summary.warningCount, 1);
  assert.ok(summary.relevance.matchedBy.includes("area_name"));
  assert.ok(summary.relevance.matchedBy.includes("catchment"));
});

test("warning normaliser matches toongabbie through creek catchment wording", () => {
  const summary = normalizeOfficialWarnings(
    {
      provider: "HazardWatch",
      warnings: [
        {
          id: "toongabbie-1",
          headline: "Flood advice for Toongabbie Creek crossings",
          level: "advice",
          area: "Western Sydney",
        },
      ],
    },
    toongabbieArea,
  );

  assert.equal(summary.warningCount, 1);
  assert.ok(summary.relevance.matchedBy.includes("catchment"));
  assert.equal(summary.warnings[0].hazardType, "flood");
});

test("warning normaliser rejects unrelated warnings even when the hazard type is relevant", () => {
  const summary = normalizeOfficialWarnings(
    {
      provider: "HazardWatch",
      warnings: [
        {
          id: "unrelated-1",
          headline: "Flood advice for Hawkesbury River near Windsor",
          level: "advice",
          area: "Windsor",
        },
      ],
    },
    toongabbieArea,
  );

  assert.equal(summary.warningCount, 0);
  assert.equal(summary.availableWarningCount, 1);
});

test("warning status exposes the explicit adapter contract and limitations when the source is unavailable", () => {
  const warning = readAreaWarningStatus(
    areaSignals(
      normalizeOfficialWarnings({ provider: "HazardWatch", warnings: [] }, area),
      {
        status: "failed",
        freshnessStatus: "missing",
        note: "Warning source timed out before a live response was available.",
      },
    ),
  );

  assert.equal(warning.source, "HazardWatch");
  assert.equal(warning.status, "source_unavailable");
  assert.equal(warning.relevanceMethod, "area-name-catchment-and-warning-type");
  assert.equal(warning.lastFetchedAt, "2026-07-03T01:00:00Z");
  assert.equal(warning.lastObservedAt, "2026-07-03T00:55:00Z");
  assert.ok(Array.isArray(warning.limitations));
  assert.match(warning.limitations.join(" "), /timed out|unavailable|matched/i);
});
