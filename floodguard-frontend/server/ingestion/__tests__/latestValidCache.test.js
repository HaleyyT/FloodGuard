import assert from "node:assert/strict";
import test from "node:test";

import { loadSource } from "../fetchers.js";

function weatherPayload(localDateTimeFull) {
  return {
    observations: {
      data: [
        {
          local_date_time_full: localDateTimeFull,
          name: "Parramatta",
          rain_trace: "0.2",
        },
      ],
    },
  };
}

function bomTimestampForMinutesAgo(minutesAgo = 0) {
  const timestamp = new Date(Date.now() + 10 * 60 * 60 * 1000 - minutesAgo * 60 * 1000);
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  const hour = String(timestamp.getHours()).padStart(2, "0");
  const minute = String(timestamp.getMinutes()).padStart(2, "0");
  const second = String(timestamp.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}

test("uses cached_recent data when remote weather fetch fails after a recent successful fetch", async () => {
  const originalFetch = global.fetch;
  const source = {
    label: "Test cache weather source",
    envUrl: "FLOODGUARD_TEST_CACHE_WEATHER_URL",
    fallbackFile: "/does/not/exist.json",
    sourceStrength: "official_backup",
  };
  process.env.FLOODGUARD_TEST_CACHE_WEATHER_URL = "https://example.test/weather-cache";

  try {
    global.fetch = async () => ({
      ok: true,
      async json() {
        return weatherPayload(bomTimestampForMinutesAgo(5));
      },
    });

    const fresh = await loadSource(source);
    assert.equal(fresh.metadata.dataMode, "live");

    global.fetch = async () => {
      throw new Error("network down");
    };

    const cached = await loadSource(source);
    assert.equal(cached.metadata.dataMode, "cached_recent");
    assert.equal(cached.metadata.status, "ok");
    assert.match(cached.metadata.note, /recent cached reading/i);
  } finally {
    global.fetch = originalFetch;
    delete process.env.FLOODGUARD_TEST_CACHE_WEATHER_URL;
  }
});

test("marks cached data as stale when the latest successful reading is too old", async () => {
  const originalFetch = global.fetch;
  const source = {
    label: "Test stale cache weather source",
    envUrl: "FLOODGUARD_TEST_STALE_CACHE_WEATHER_URL",
    fallbackFile: "/does/not/exist.json",
    sourceStrength: "official_backup",
  };
  process.env.FLOODGUARD_TEST_STALE_CACHE_WEATHER_URL = "https://example.test/weather-cache-stale";

  try {
    global.fetch = async () => ({
      ok: true,
      async json() {
        return weatherPayload("20200101000000");
      },
    });

    const first = await loadSource(source);
    assert.equal(first.metadata.dataMode, "live");

    global.fetch = async () => {
      throw new Error("network down");
    };

    const cached = await loadSource(source);
    assert.equal(cached.metadata.dataMode, "cached_stale");
    assert.equal(cached.metadata.status, "failed");
    assert.match(cached.metadata.note, /stale cached data/i);
  } finally {
    global.fetch = originalFetch;
    delete process.env.FLOODGUARD_TEST_STALE_CACHE_WEATHER_URL;
  }
});

test("returns unavailable when live fetch fails and no cache exists", async () => {
  const originalFetch = global.fetch;
  const source = {
    label: "Test missing cache weather source",
    envUrl: "FLOODGUARD_TEST_MISSING_CACHE_WEATHER_URL",
    fallbackFile: "/does/not/exist.json",
    sourceStrength: "official_backup",
  };
  process.env.FLOODGUARD_TEST_MISSING_CACHE_WEATHER_URL = "https://example.test/weather-cache-missing";

  try {
    global.fetch = async () => {
      throw new Error("network down");
    };

    const result = await loadSource(source);
    assert.equal(result.metadata.dataMode, "missing");
    assert.equal(result.metadata.status, "failed");
  } finally {
    global.fetch = originalFetch;
    delete process.env.FLOODGUARD_TEST_MISSING_CACHE_WEATHER_URL;
  }
});
