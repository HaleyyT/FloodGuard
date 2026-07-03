import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import { readMlReport } from "../mlReport.js";

test("readMlReport degrades safely when report files are missing", async () => {
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-report-missing-"));

  try {
    const report = await readMlReport(reportsDir);
    assert.equal(report.mode, "shadow");
    assert.equal(report.liveScoringEnabled, false);
    assert.equal(report.readyForValidatedML, false);
    assert.equal(report.realExport.available, false);
    assert.equal(report.scenarioStressTest.available, false);
    assert.ok(Array.isArray(report.models));
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
});

test("readMlReport reads available files without crashing on partial reports", async () => {
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-report-partial-"));

  try {
    await writeFile(
      path.join(reportsDir, "real_export_metrics.json"),
      `${JSON.stringify({
        bestPrototypeModel: "random_forest",
        targetSelection: {
          selectedTargetKind: "rule",
          selectedTargetColumn: "targetRuleElevated",
          readyForIndependentSupervision: false,
          reason: "Fallback to rule-derived target because event-labelled rows contain only 0 elevated example(s).",
          eventTargetCandidate: {
            eligibleRowCount: 3000,
            positiveCount: 0,
            strengthCounts: { weak: 3000 },
          },
        },
        eventHoldout: {
          viable: false,
          strategy: "event_holdout_unavailable",
          reason: "No independent elevated event labels exist yet.",
          trainRows: 0,
          testRows: 0,
          trainPositiveCount: 0,
          testPositiveCount: 0,
        },
        acceptanceGates: {
          passedAll: false,
          bestNonBaselineModel: "random_forest",
          gates: [
            {
              name: "beats_majority_balanced_accuracy",
              passed: true,
              detail: "random_forest=0.741; majority_baseline=0.500",
            },
          ],
        },
        promotionPolicy: {
          currentStage: "shadow_mode",
          nextEligibleStage: null,
          stages: {
            shadow_mode: { status: "active", requirements: ["pipeline works", "metrics reported"] },
            review_mode: {
              status: "blocked",
              requirements: ["independent labels exist", "event-holdout tested", "expert review pending"],
              blockers: ["Event-holdout validation is not yet viable."],
            },
            advisory_mode: {
              status: "blocked",
              requirements: ["expert review completed", "validation robust", "safety policy approved"],
              blockers: ["Domain expert review is still pending."],
            },
          },
          never: ["official emergency authority"],
          summary: "ML remains in shadow_mode because supervision and validation are not yet strong enough for promotion.",
        },
        predictionPreview: {
          predictedLabel: "Elevated concern",
          predictedProbability: 0.78,
          confidenceBand: "limited",
          confidenceReason: "Training data is still sparse.",
        },
        summary: {
          rowCount: 3000,
          targetCounts: { 1: 18 },
          ruleConcernLevelCounts: { Low: 2982, Moderate: 18 },
          labelSourceCounts: { rule_derived: 3000 },
          eventLabelRowCount: 3000,
          eventPositiveCount: 0,
          eventLabelCoverage: 1,
        },
        warnings: ["Real export metrics remain illustrative only."],
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(reportsDir, "calibration_summary.md"),
      "# Calibration Summary\n\nPrototype calibration summary is available.\n",
      "utf8",
    );

    const report = await readMlReport(reportsDir);
    assert.equal(report.mode, "shadow");
    assert.equal(report.liveDecisionAuthority, "rule_engine");
    assert.equal(report.bestPrototypeModel, "random_forest");
    assert.equal(report.validationLevel, "prototype");
    assert.equal(report.modelAgreementWithRuleEngine, "unavailable");
    assert.equal(report.labelStrength, "rule_derived_or_weak");
    assert.equal(report.realExport.available, true);
    assert.equal(report.realExport.rows, 3000);
    assert.equal(report.realExport.elevatedRows, 18);
    assert.equal(report.realExport.eventLabelRows, 3000);
    assert.equal(report.realExport.eventPositiveCount, 0);
    assert.equal(report.realExport.eventLabelCoverage, 1);
    assert.equal(report.realExport.hasHighExamples, false);
    assert.equal(report.predictionPreview.predictedProbability, 0.78);
    assert.equal(report.calibrationSummary.available, true);
    assert.equal(report.targetSelection.available, true);
    assert.equal(report.targetSelection.selectedTargetKind, "rule");
    assert.equal(report.targetSelection.selectedTargetColumn, "targetRuleElevated");
    assert.equal(report.targetSelection.readyForIndependentSupervision, false);
    assert.match(report.targetSelection.reason, /Fallback to rule-derived target/i);
    assert.equal(report.eventHoldout.available, true);
    assert.equal(report.eventHoldout.viable, false);
    assert.match(report.eventHoldout.reason, /independent elevated event labels/i);
    assert.equal(report.acceptanceGates.passedAll, false);
    assert.equal(report.acceptanceGates.bestNonBaselineModel, "random_forest");
    assert.equal(report.promotionPolicy.currentStage, "shadow_mode");
    assert.equal(report.promotionPolicy.nextEligibleStage, null);
    assert.match(report.promotionPolicy.summary, /shadow_mode/i);
    assert.equal(report.reportAvailability.targetSelectionSummary, false);
    assert.ok(Array.isArray(report.limitations));
    assert.match(report.realExport.summary, /pipeline validation/i);
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
});
