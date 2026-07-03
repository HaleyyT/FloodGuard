import assert from "node:assert/strict";
import test from "node:test";

import { floodFeatureThresholds, riskThresholdConfig } from "../config.js";

test("risk threshold config exposes review status and conservative defaults", () => {
  assert.equal(riskThresholdConfig.reviewStatus, "needs_domain_expert_review");
  assert.equal(riskThresholdConfig.version, "0.2-prototype");
  assert.equal(riskThresholdConfig.calibratedOn, "event_label_backlog_v1");
  assert.ok(Array.isArray(riskThresholdConfig.limitations));
  assert.ok(riskThresholdConfig.limitations.includes("limited independent labels"));
  assert.ok(Array.isArray(riskThresholdConfig.reviewNeeded));
  assert.ok(riskThresholdConfig.reviewNeeded.includes("hydrologist"));

  assert.equal(floodFeatureThresholds.rainfall.oneHourConcernMm, 10);
  assert.equal(floodFeatureThresholds.rainfall.threeHourConcernMm, 20);
  assert.equal(floodFeatureThresholds.river.rapidRiseOneHourM, 0.15);
  assert.equal(floodFeatureThresholds.river.rapidRiseThreeHourM, 0.3);
  assert.equal(floodFeatureThresholds.river.steadyDeltaM, 0.02);
});
