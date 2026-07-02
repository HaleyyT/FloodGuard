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
        summary: {
          rowCount: 3000,
          targetCounts: { 1: 18 },
          ruleConcernLevelCounts: { Low: 2982, Moderate: 18 },
          labelSourceCounts: { rule_derived: 3000 },
          eventLabelRowCount: 3000,
          eventPositiveCount: 0,
          eventLabelCoverage: 1,
        },
        bestPrototypeModel: "random_forest",
        warnings: ["Real export metrics remain illustrative only."],
      })}\n`,
      "utf8",
    );

    const report = await readMlReport(reportsDir);
    assert.equal(report.mode, "shadow");
    assert.equal(report.liveDecisionAuthority, "rule_engine");
    assert.equal(report.realExport.available, true);
    assert.equal(report.realExport.rows, 3000);
    assert.equal(report.realExport.elevatedRows, 18);
    assert.equal(report.realExport.eventLabelRows, 3000);
    assert.equal(report.realExport.eventPositiveCount, 0);
    assert.equal(report.realExport.eventLabelCoverage, 1);
    assert.equal(report.realExport.hasHighExamples, false);
    assert.match(report.realExport.summary, /pipeline validation/i);
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
});
