import assert from "node:assert/strict";
import test from "node:test";

import { validateCommunityReport } from "../communityReports.js";

test("community reports store an opt-in map location at approximate precision", () => {
  const { report } = validateCommunityReport({
    areaId: "parramatta",
    description: "Road pooling near the creek crossing after heavy rain.",
    latitude: "-33.801842",
    longitude: "151.003719",
    severity: "moderate",
  });

  assert.deepEqual(report.location, {
    lat: -33.802,
    lon: 151.004,
    precision: "approximate-100m",
  });
});

test("community reports reject incomplete map locations", () => {
  assert.throws(
    () =>
      validateCommunityReport({
        areaId: "parramatta",
        description: "Road pooling near the creek crossing after heavy rain.",
        latitude: "-33.801842",
        severity: "moderate",
      }),
    /valid latitude and longitude/i,
  );
});
