import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import { readMlReport } from "../mlReport.js";

test("readMlReport degrades safely when report files are missing", async () => {
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-report-missing-"));

  try {
    const report = await readMlReport(reportsDir);
    assert.equal(report.mode, "shadow");
    assert.equal(report.liveScoringEnabled, false);
    assert.equal(report.readyForValidatedML, false);
    assert.equal(report.reviewedEventWindows, 0);
    assert.equal(report.reviewedElevatedEventWindows, 0);
    assert.equal(report.eventHoldoutViable, false);
    assert.equal(report.placeholderEvidenceCount, 0);
    assert.equal(report.reviewQueueCount, 0);
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
        supervisionQuality: {
          grade: "weak",
          summary: "Independent supervision remains scaffold-level only.",
          viableForIndependentSupervision: false,
          primaryLimitation: "Labels are placeholders rather than verified flood outcomes.",
          eventLabelCoverage: 1,
          eventPositiveCount: 0,
          reviewedRowCount: 0,
          strongOrModerateLabelCount: 0,
          eventLabelStrengthCounts: { weak: 3000 },
          eventLabelReviewStatusCounts: { scaffold_only: 3000 },
        },
        warnings: ["Real export metrics remain illustrative only."],
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(reportsDir, "label_audit.json"),
      `${JSON.stringify({
        backlogSummary: {
          evidenceLinkedRows: 2,
          placeholderEvidenceRows: 2,
          placeholderEvidencePositiveRows: 2,
          reviewedRows: 1,
          promotableRows: 1,
          independentPositiveRows: 2,
          reviewableRows: 2,
          reviewablePositiveRows: 2,
        },
        supervisionQuality: {
          grade: "developing",
          summary: "Backlog evidence is improving, but joined supervision is still too weak for validated ML claims.",
          viableForIndependentSupervision: false,
          primaryLimitation:
            "Backlog candidates exist, but they have not yet been promoted into reviewed joined event labels.",
          backlogEvidenceLinkedRows: 2,
          backlogPlaceholderEvidenceRows: 2,
          backlogPromotableRows: 1,
          backlogIndependentPositiveRows: 2,
          evidenceLinkedRowCount: 2,
          evidenceLinkedPositiveRowCount: 2,
          eligibleIndependentRowCount: 2,
          eligibleIndependentPositiveCount: 2,
          reviewedPositiveRowCount: 0,
        },
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(reportsDir, "calibration_summary.md"),
      "# Calibration Summary\n\nPrototype calibration summary is available.\n",
      "utf8",
    );
    await writeFile(
      path.join(reportsDir, "history_replay_summary.json"),
      `${JSON.stringify({
        available: true,
        rowCount: 998,
        windowCount: 3,
        shadowPredictionCount: 998,
        summary:
          "Historical replay is available for rule, warning, source-state, decision-audit, and shadow-ML comparison.",
        windows: [
          {
            areaId: "parramatta",
            degradedRows: 627,
            agreementRate: 0.611,
          },
          {
            areaId: "north-parramatta",
            degradedRows: 0,
            agreementRate: null,
          },
          {
            areaId: "toongabbie",
            degradedRows: 0,
            agreementRate: null,
          },
        ],
      })}\n`,
      "utf8",
    );
    await mkdir(path.join(reportsDir, "..", "data"), { recursive: true });
    await writeFile(
      path.join(reportsDir, "../data/event_evidence_review_queue.csv"),
      "area,event_name,start_time,end_time,label,label_source,label_strength,review_status,evidence_link,evidence_is_placeholder,required_evidence_missing,review_priority,recommended_next_action\nparramatta,Candidate warning,2026-06-29T00:00:00Z,2026-06-29T12:00:00Z,1,warning_derived,moderate,candidate_review,https://example.test/link,true,true,high,Replace placeholder link.\n",
      "utf8",
    );

    const report = await readMlReport(reportsDir);
    assert.equal(report.mode, "shadow");
    assert.equal(report.liveDecisionAuthority, "rule_engine");
    assert.equal(report.bestPrototypeModel, "random_forest");
    assert.equal(report.validationLevel, "prototype");
    assert.equal(report.modelAgreementWithRuleEngine, "unavailable");
    assert.equal(report.labelStrength, "rule_derived_or_weak");
    assert.equal(report.labelAudit.available, true);
    assert.equal(report.labelAudit.evidenceLinkedRows, 2);
    assert.equal(report.labelAudit.placeholderEvidenceRows, 2);
    assert.equal(report.labelAudit.reviewedRows, 1);
    assert.equal(report.labelAudit.promotableRows, 1);
    assert.equal(report.labelAudit.independentPositiveRows, 2);
    assert.equal(report.labelAudit.reviewableRows, 2);
    assert.equal(report.labelAudit.reviewablePositiveRows, 2);
    assert.equal(report.supervisionQuality.grade, "developing");
    assert.equal(report.supervisionQuality.viableForIndependentSupervision, false);
    assert.equal(report.supervisionQuality.backlogEvidenceLinkedRows, 2);
    assert.equal(report.supervisionQuality.backlogPlaceholderEvidenceRows, 2);
    assert.equal(report.supervisionQuality.backlogPromotableRows, 1);
    assert.equal(report.supervisionQuality.backlogIndependentPositiveRows, 2);
    assert.equal(report.supervisionQuality.evidenceLinkedRowCount, 2);
    assert.equal(report.supervisionQuality.evidenceLinkedPositiveRowCount, 2);
    assert.equal(report.supervisionQuality.eligibleIndependentRowCount, 2);
    assert.equal(report.supervisionQuality.eligibleIndependentPositiveCount, 2);
    assert.equal(report.supervisionQuality.reviewedPositiveRowCount, 0);
    assert.match(report.supervisionQuality.primaryLimitation, /promoted into reviewed joined event labels/i);
    assert.equal(report.eventSupervision.viable, false);
    assert.equal(report.eventSupervision.blocked, true);
    assert.equal(report.eventSupervision.evidenceLinkedRows, 2);
    assert.equal(report.eventSupervision.reviewablePositiveRows, 2);
    assert.match(report.eventSupervision.reason, /reviewed joined event labels/i);
    assert.equal(report.reviewedEventWindows, 0);
    assert.equal(report.reviewedElevatedEventWindows, 0);
    assert.equal(report.eventHoldoutViable, false);
    assert.equal(report.placeholderEvidenceCount, 2);
    assert.equal(report.reviewQueueCount, 1);
    assert.match(report.mlPromotionBlockedReason, /reviewed joined event labels/i);
    assert.equal(report.realExport.available, true);
    assert.equal(report.realExport.rows, 3000);
    assert.equal(report.realExport.elevatedRows, 18);
    assert.equal(report.realExport.eventLabelRows, 3000);
    assert.equal(report.realExport.eventPositiveCount, 0);
    assert.equal(report.realExport.eventLabelCoverage, 1);
    assert.equal(report.realExport.hasHighExamples, false);
    assert.equal(report.predictionPreview.predictedProbability, 0.78);
    assert.equal(report.calibrationSummary.available, true);
    assert.equal(report.historicalReplay.available, true);
    assert.equal(report.historicalReplay.rowCount, 998);
    assert.equal(report.historicalReplay.windowCount, 3);
    assert.equal(report.historicalReplay.degradedRows, 627);
    assert.equal(report.historicalReplay.highestAgreementRate, 0.611);
    assert.deepEqual(report.historicalReplay.areasCovered, [
      "parramatta",
      "north-parramatta",
      "toongabbie",
    ]);
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
    assert.equal(report.reportAvailability.labelAudit, true);
    assert.equal(report.reportAvailability.historyReplaySummary, true);
    assert.equal(report.reportAvailability.targetSelectionSummary, false);
    assert.ok(Array.isArray(report.limitations));
    assert.match(report.realExport.summary, /pipeline validation/i);
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
});

test("readMlReport degrades safely when a metrics file is malformed JSON", async () => {
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-report-malformed-"));

  try {
    await writeFile(path.join(reportsDir, "real_export_metrics.json"), "{not-valid-json", "utf8");

    const report = await readMlReport(reportsDir);

    assert.equal(report.mode, "shadow");
    assert.equal(report.liveDecisionAuthority, "rule_engine");
    assert.equal(report.realExport.available, false);
    assert.equal(report.scenarioStressTest.available, false);
    assert.match(report.realExport.warnings[0], /degraded safely/i);
    assert.match(report.realExport.warnings[0], /unexpected token|expected property name/i);
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
});
