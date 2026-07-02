import assert from "node:assert/strict";
import test from "node:test";

import { floodFeatureThresholds, riskThresholdConfig } from "../config.js";

test("risk threshold config exposes review status and conservative defaults", () => {
  assert.equal(riskThresholdConfig.reviewStatus, "not_expert_validated");
  assert.equal(riskThresholdConfig.version, "prototype-v1");
  assert.ok(Array.isArray(riskThresholdConfig.reviewNeeded));
  assert.ok(riskThresholdConfig.reviewNeeded.includes("hydrologist"));

  assert.equal(floodFeatureThresholds.rainfall.oneHourConcernMm, 10);
  assert.equal(floodFeatureThresholds.rainfall.threeHourConcernMm, 20);
  assert.equal(floodFeatureThresholds.river.rapidRiseOneHourM, 0.15);
  assert.equal(floodFeatureThresholds.river.rapidRiseThreeHourM, 0.3);
  assert.equal(floodFeatureThresholds.river.steadyDeltaM, 0.02);
});
