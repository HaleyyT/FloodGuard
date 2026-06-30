import assert from "node:assert/strict";
import test from "node:test";

import { areaConfigs } from "../areaConfig.js";
import { readGaugeMetadata } from "../gaugeMetadata.js";

function feature({ stationNumber = null, name, lat, lon, agency = "BoM", state = "NSW" }) {
  return {
    properties: {
      bom_stn_num: stationNumber,
      name,
      basin: "Parramatta",
      agency,
      forecast_site_classification: "local",
      lat,
      long: lon,
      state,
    },
  };
}

function installMetadataFetch() {
  const originalFetch = global.fetch;

  global.fetch = async (url) => ({
    ok: true,
    async json() {
      if (String(url).includes("/4/query")) {
        return {
          features: [
            feature({ stationNumber: "67111", name: "Burnside Homes", lat: -33.7916, lon: 151.0179 }),
            feature({ stationNumber: "567065", name: "Toongabbie Bowling Club", lat: -33.784, lon: 150.9525 }),
          ],
        };
      }

      return {
        features: [
          feature({ name: "Parramatta River at Riverside Theatre", lat: -33.814, lon: 151.004 }),
          feature({ name: "Parramatta River at Marsden Weir", lat: -33.809, lon: 150.999 }),
          feature({ name: "Darling Mills Creek at North Parramatta", lat: -33.788, lon: 151.009 }),
          feature({ name: "Toongabbie Creek at Johnstons Bridge", lat: -33.785, lon: 150.95 }),
          feature({ name: "Toongabbie Creek at Briens Rd", lat: -33.795, lon: 150.963 }),
          feature({ name: "Toongabbie Creek at Redbank Road", lat: -33.804, lon: 150.943 }),
        ],
      };
    },
  });

  return () => {
    global.fetch = originalFetch;
  };
}

test("gauge metadata exposes configured mapping evidence for mapped rainfall and river stations", async () => {
  const restoreFetch = installMetadataFetch();

  try {
    const metadata = await readGaugeMetadata();
    const parramatta = metadata.areas.parramatta;
    const toongabbie = metadata.areas.toongabbie;

    assert.equal(parramatta.mappingStatus, "pass");
    assert.equal(toongabbie.mappingStatus, "pass");
    assert.equal(
      parramatta.configuredSignals.find((signal) => signal.signalType === "rainfall").stationId,
      "67111",
    );
    assert.equal(
      toongabbie.configuredSignals.find((signal) => signal.signalType === "rainfall").stationId,
      "567065",
    );
    assert.ok(
      parramatta.configuredSignals.every((signal) =>
        ["signalType", "stationId", "stationName", "source", "areaRelevanceReason"].every(
          (field) => field in signal,
        ),
      ),
    );
  } finally {
    restoreFetch();
  }
});

test("gauge metadata warns when a configured station cannot be matched to nearby metadata evidence", async () => {
  const restoreFetch = installMetadataFetch();
  const originalRainfall = areaConfigs.parramatta.relevantStations.rainfall;
  areaConfigs.parramatta.relevantStations.rainfall = ["999999"];

  try {
    const metadata = await readGaugeMetadata();
    const parramatta = metadata.areas.parramatta;

    assert.equal(parramatta.mappingStatus, "warn");
    assert.match(parramatta.mappingIssues[0], /not found/i);
  } finally {
    areaConfigs.parramatta.relevantStations.rainfall = originalRainfall;
    restoreFetch();
  }
});
