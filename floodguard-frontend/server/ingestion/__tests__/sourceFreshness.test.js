import assert from "node:assert/strict";
import test from "node:test";

import { buildAreaSourceFreshness } from "../aggregators.js";

const area = {
  id: "parramatta",
  name: "Parramatta, NSW",
  catchment: "Parramatta River",
  relevantStations: {
    weather: ["Parramatta"],
    rainfall: ["67111"],
    river: ["Parramatta River at Riverside Theatre"],
  },
};

const ingestedAt = "2026-06-29T01:00:00Z";

test("marks fresh live gauges as current and stale weather as stale context", () => {
  const sourceMetadata = [
    {
      label: "Parramatta weather observations",
      type: "weather",
      mode: "remote",
      dataMode: "live",
      status: "ok",
      fetchedAt: ingestedAt,
      sourceStrength: "official_backup",
    },
    {
      label: "City of Parramatta FloodSmart rainfall gauges",
      type: "rainfall",
      mode: "remote",
      dataMode: "live",
      status: "ok",
      fetchedAt: ingestedAt,
      sourceStrength: "primary_live_gauge",
    },
    {
      label: "City of Parramatta FloodSmart river gauges",
      type: "river",
      mode: "remote",
      dataMode: "live",
      status: "ok",
      fetchedAt: ingestedAt,
      sourceStrength: "primary_live_gauge",
    },
  ];

  const signals = {
    weatherObservations: { stationName: "Parramatta", observedAt: "2026-06-28T10:00:00Z" },
    rainfallSeries: { points: [{ time: "2026-06-29T00:40:00Z", rainfallMm: 1.2 }] },
    riverContext: {
      issuedDate: "2026-06-29T00:45:00Z",
      stations: [{ stationName: "Parramatta River at Riverside Theatre", heightM: 1.9 }],
    },
  };

  const freshness = buildAreaSourceFreshness(area, sourceMetadata, signals, ingestedAt);
  const weather = freshness.find((source) => source.type === "weather");
  const rainfall = freshness.find((source) => source.type === "rainfall");
  const river = freshness.find((source) => source.type === "river");

  assert.equal(weather.freshnessStatus, "stale");
  assert.equal(rainfall.freshnessStatus, "current");
  assert.equal(river.freshnessStatus, "current");
});

test("marks failed or timestamp-less sources as missing or unknown instead of current", () => {
  const sourceMetadata = [
    {
      label: "City of Parramatta FloodSmart rainfall gauges",
      type: "rainfall",
      mode: "local_demo_fallback",
      dataMode: "local_demo_fallback",
      status: "ok",
      fetchedAt: ingestedAt,
      sourceStrength: "local_fallback",
    },
    {
      label: "City of Parramatta FloodSmart river gauges",
      type: "river",
      mode: "remote",
      dataMode: "live",
      status: "failed",
      fetchedAt: ingestedAt,
      sourceStrength: "primary_live_gauge",
    },
  ];

  const signals = {
    weatherObservations: {},
    rainfallSeries: { points: [] },
    riverContext: { issuedDate: null, stations: [] },
  };

  const freshness = buildAreaSourceFreshness(area, sourceMetadata, signals, ingestedAt);
  const rainfall = freshness.find((source) => source.type === "rainfall");
  const river = freshness.find((source) => source.type === "river");

  assert.equal(rainfall.freshnessStatus, "unknown");
  assert.equal(river.freshnessStatus, "missing");
});
