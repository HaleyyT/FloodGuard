import assert from "node:assert/strict";
import test from "node:test";

import { loadFloodSmartGaugeSource } from "../floodsmartAdapter.js";

function installFetchMock(responses) {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const key = String(url);
    const response = responses[key];

    if (response instanceof Error) throw response;
    if (!response) {
      throw new Error(`Unexpected fetch: ${key}`);
    }

    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      statusText: response.statusText ?? "OK",
      async json() {
        return response.json;
      },
    };
  };

  return () => {
    global.fetch = originalFetch;
  };
}

test("parses FloodSmart rainfall from detailed event rows as live gauge data", async () => {
  const measuringStationsUrl = "https://example.test/stations";
  const timeseriesUrl = "https://example.test/timeseries/rainfall-67111/";
  const eventUrl =
    "https://example.test/timeseries/rainfall-67111/events/?format=json&ordering=-time&page_size=24";
  const restoreFetch = installFetchMock({
    [measuringStationsUrl]: {
      json: {
        results: [
          {
            code: "67111",
            name: "Burnside Homes",
            category: "Rainfall",
            geometry: { coordinates: [151.0, -33.8] },
            timeseries: [timeseriesUrl],
          },
        ],
      },
    },
    [timeseriesUrl]: {
      json: {
        url: timeseriesUrl,
        observation_type: { parameter: "Precipitation", unit: "mm" },
        end: "2026-06-29T00:10:00Z",
        last_value: 1.4,
      },
    },
    [eventUrl]: {
      json: {
        results: [
          {
            time: "2026-06-29T00:10:00Z",
            value: 1.4,
            validation_code: "G",
            last_modified: "2026-06-29T00:11:00Z",
          },
        ],
      },
    },
  });

  try {
    const payload = await loadFloodSmartGaugeSource(
      {
        adapter: "floodsmart-rainfall",
        stationCodes: ["67111"],
      },
      measuringStationsUrl,
    );

    assert.equal(payload.metric, "rainfall");
    assert.equal(payload.stationCount, 1);
    assert.equal(payload.stations[0].observedAt, "2026-06-29T00:10:00Z");
    assert.equal(payload.stations[0].latestValue, 1.4);
    assert.equal(payload.stations[0].dataMode, "live");
    assert.equal(payload.stations[0].eventStatus, "ok");
    assert.deepEqual(payload.stations[0].qualityNotes, ["Detailed live event rows were used."]);
  } finally {
    restoreFetch();
  }
});

test("falls back to FloodSmart timeseries summary when river event rows time out", async () => {
  const measuringStationsUrl = "https://example.test/stations";
  const timeseriesUrl = "https://example.test/timeseries/river-567107/";
  const eventUrl =
    "https://example.test/timeseries/river-567107/events/?format=json&ordering=-time&page_size=24";
  const restoreFetch = installFetchMock({
    [measuringStationsUrl]: {
      json: {
        results: [
          {
            code: "567107",
            name: "Marsden Weir",
            category: "River",
            geometry: { coordinates: [151.01, -33.81] },
            timeseries: [timeseriesUrl],
          },
        ],
      },
    },
    [timeseriesUrl]: {
      json: {
        url: timeseriesUrl,
        observation_type: { parameter: "Water level", unit: "m" },
        end: "2026-06-29T01:00:00Z",
        last_value: 2.75,
      },
    },
    [eventUrl]: new Error("Fetch failed with 504 Gateway Time-out"),
  });

  try {
    const payload = await loadFloodSmartGaugeSource(
      {
        adapter: "floodsmart-river",
        stationCodes: ["567107"],
      },
      measuringStationsUrl,
    );

    assert.equal(payload.metric, "river");
    assert.equal(payload.stations[0].observedAt, "2026-06-29T01:00:00Z");
    assert.equal(payload.stations[0].latestValue, 2.75);
    assert.equal(payload.stations[0].dataMode, "live_summary_fallback");
    assert.equal(payload.stations[0].eventStatus, "fallback-to-timeseries-summary");
    assert.match(payload.stations[0].qualityNotes[0], /Detailed event rows were unavailable/);
  } finally {
    restoreFetch();
  }
});
