import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultReportsDir = path.join(projectRoot, "floodguard-ml", "reports");

function defaultReport() {
  return {
    mode: "shadow",
    liveScoringEnabled: false,
    operationalUse: "disabled",
    labelSource: "rule_derived",
    readyForValidatedML: false,
    bestPrototypeModel: null,
    validationLevel: "prototype",
    predictionPreview: null,
    modelAgreementWithRuleEngine: "unavailable",
    labelStrength: "rule_derived_or_weak",
    eventHoldout: {
      available: false,
      viable: false,
      strategy: "event_holdout_unavailable",
      reason: "Event-holdout validation summary is unavailable.",
      trainRows: 0,
      testRows: 0,
      trainPositiveCount: 0,
      testPositiveCount: 0,
      reviewedEventWindows: 0,
      reviewedElevatedEventWindows: 0,
      comparisonWindows: 0,
      independentLabelRows: 0,
    },
    acceptanceGates: {
      passedAll: false,
      bestNonBaselineModel: null,
      gates: [],
    },
    promotionPolicy: {
      currentStage: "shadow_mode",
      nextEligibleStage: null,
      stages: {
        shadow_mode: { status: "active", requirements: ["pipeline works", "metrics reported"] },
        review_mode: { status: "blocked", requirements: [], blockers: [] },
        advisory_mode: { status: "blocked", requirements: [], blockers: [] },
      },
      never: ["official emergency authority"],
      summary: "ML promotion policy is unavailable, so FloodGuard stays in shadow mode.",
    },
    limitations: ["ML reports are unavailable right now."],
    models: [],
    liveDecisionAuthority: "rule_engine",
    summary:
      "FloodGuard ML reports are unavailable right now. The live app remains rule-based and explainable.",
    reviewedEventWindows: 0,
    reviewedElevatedEventWindows: 0,
    eventHoldoutViable: false,
    mlPromotionBlockedReason:
      "Independent event supervision is unavailable, so ML remains shadow mode.",
    placeholderEvidenceCount: 0,
    reviewQueueCount: 0,
    reportAvailability: {
      metrics: false,
      realExportMetrics: false,
      scenarioStressTestMetrics: false,
      modelCard: false,
      calibrationSummary: false,
      historyReplaySummary: false,
      targetSelectionSummary: false,
    },
    realExport: {
      available: false,
      rows: 0,
      elevatedRows: 0,
      eventLabelRows: 0,
      eventPositiveCount: 0,
      eventLabelCoverage: 0,
      hasHighExamples: false,
      bestPrototypeModel: null,
      summary: "Real export report is unavailable, so ML evidence is limited to live rule-engine outputs.",
      limitation: "Historical ML evaluation is unavailable.",
      warnings: ["Real export metrics file is missing."],
    },
    scenarioStressTest: {
      available: false,
      summary: "Scenario stress-test report is unavailable.",
      limitation: "Synthetic ML plumbing report is unavailable.",
      warnings: ["Scenario stress-test metrics file is missing."],
    },
    modelCard: {
      available: false,
      summary: "Model card is unavailable.",
    },
    labelAudit: {
      available: false,
      summary: "Label-audit report is unavailable.",
      evidenceLinkedRows: 0,
      evidenceLinkedPositiveRows: 0,
      placeholderEvidenceRows: 0,
      placeholderEvidencePositiveRows: 0,
      reviewedRows: 0,
      reviewedPositiveRows: 0,
      promotableRows: 0,
      independentPositiveRows: 0,
      reviewableRows: 0,
      reviewablePositiveRows: 0,
    },
    calibrationSummary: {
      available: false,
      summary: "Calibration summary is unavailable.",
      calibrationMode: "prototype_only",
    },
    historicalReplay: {
      available: false,
      rowCount: 0,
      windowCount: 0,
      areasCovered: [],
      degradedRows: 0,
      highestAgreementRate: null,
      summary: "Historical replay summary is unavailable.",
      limitation: "Replay artifacts are unavailable.",
    },
    supervisionQuality: {
      grade: "weak",
      summary: "Independent supervision is still too weak for validated ML claims.",
      viableForIndependentSupervision: false,
      primaryLimitation: "Independent event labels are unavailable or too weak.",
      eventLabelCoverage: 0,
      eventPositiveCount: 0,
      reviewedRowCount: 0,
      strongOrModerateLabelCount: 0,
      eventLabelStrengthCounts: {},
      eventLabelReviewStatusCounts: {},
      evidenceLinkedRowCount: 0,
      evidenceLinkedPositiveRowCount: 0,
      eligibleIndependentRowCount: 0,
      eligibleIndependentPositiveCount: 0,
      eventHoldoutCurrentlyViable: false,
      reviewedPositiveRowCount: 0,
    },
    targetSelection: {
      available: false,
      selectedTargetKind: "rule",
      selectedTargetColumn: "targetRuleElevated",
      readyForIndependentSupervision: false,
      reason: "Target-selection summary is unavailable.",
      eventCandidate: null,
    },
    eventSupervision: {
      viable: false,
      blocked: true,
      reason: "Independent event supervision summary is unavailable.",
      evidenceLinkedRows: 0,
      reviewedRows: 0,
      reviewableRows: 0,
      reviewablePositiveRows: 0,
    },
  };
}

function countQueueRows(csvText) {
  if (!csvText) return 0;
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return Math.max(0, lines.length - 1);
}

async function readJsonIfPresent(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function collectModelNames(...reports) {
  return [...new Set(reports.flatMap((report) => report?.models?.map((model) => model.modelName) ?? []))];
}

function buildRealExportSummary(report) {
  if (!report) {
    return defaultReport().realExport;
  }

  const elevatedRows = report.summary?.targetCounts?.["1"] ?? 0;
  const hasHighExamples = (report.summary?.ruleConcernLevelCounts?.High ?? 0) > 0;
  const eventLabelRows = report.summary?.eventLabelRowCount ?? 0;
  const eventPositiveCount = report.summary?.eventPositiveCount ?? 0;
  const eventLabelCoverage = report.summary?.eventLabelCoverage ?? 0;

  return {
    available: true,
    rows: report.summary?.rowCount ?? 0,
    elevatedRows,
    eventLabelRows,
    eventPositiveCount,
    eventLabelCoverage,
    hasHighExamples,
    bestPrototypeModel: report.bestPrototypeModel ?? null,
    summary:
      "Real export is useful for pipeline validation but not meaningful predictive claims.",
    limitation:
      "Rule-derived labels, no independent flood outcomes, and a highly imbalanced elevated class limit real-world interpretation.",
    warnings: report.warnings ?? [],
  };
}

function buildScenarioSummary(report) {
  if (!report) {
    return defaultReport().scenarioStressTest;
  }

  return {
    available: true,
    summary: "Synthetic scenario dataset validates ML plumbing only.",
    limitation:
      "Scenario stress-test results show model behaviour on synthetic cases, not real-world flood prediction accuracy.",
    bestPrototypeModel: report.bestPrototypeModel ?? null,
    warnings: report.warnings ?? [],
  };
}

function deriveLabelStrength(report) {
  const strengths = report?.summary?.eventLabelStrengthCounts ?? {};
  if (strengths.strong || strengths.moderate) return "mixed_or_stronger";
  return "rule_derived_or_weak";
}

function deriveModelAgreement(report) {
  const preview = report?.predictionPreview;
  if (!preview?.predictedLabel || !preview?.actualLabel) return "unavailable";
  return preview.predictedLabel === preview.actualLabel ? "agreeing" : "disagreeing";
}

function buildLimitations(realExport, scenario, historicalReplay) {
  const limitations = [
    realExport?.limitation,
    scenario?.limitation,
    historicalReplay?.limitation,
    ...(realExport?.warnings ?? []),
  ].filter(Boolean);
  return [...new Set(limitations)];
}

function buildModelCardSummary(markdown) {
  if (!markdown) {
    return defaultReport().modelCard;
  }

  const firstHeading = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  return {
    available: true,
    summary: firstHeading ?? "Prototype model card is available.",
  };
}

function buildCalibrationSummary(markdown, summaryJson) {
  if (!markdown && !summaryJson) {
    return defaultReport().calibrationSummary;
  }

  const firstMeaningfulLine = markdown
    ? markdown
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#"))
    : null;

  return {
    available: true,
    summary:
      summaryJson?.calibrationEvidenceStatement ??
      firstMeaningfulLine ??
      "Prototype calibration summary is available.",
    calibrationMode: summaryJson?.calibrationMode ?? "prototype_only",
  };
}

function buildHistoricalReplaySummary(replayJson) {
  if (!replayJson) {
    return defaultReport().historicalReplay;
  }

  const windows = Array.isArray(replayJson.windows) ? replayJson.windows : [];
  const areasCovered = [...new Set(windows.map((window) => window.areaId).filter(Boolean))];
  const degradedRows = windows.reduce(
    (sum, window) => sum + (typeof window.degradedRows === "number" ? window.degradedRows : 0),
    0,
  );
  const agreementRates = windows
    .map((window) => window.agreementRate)
    .filter((value) => typeof value === "number");

  return {
    available: true,
    rowCount: replayJson.rowCount ?? 0,
    windowCount: replayJson.windowCount ?? windows.length,
    areasCovered,
    degradedRows,
    highestAgreementRate: agreementRates.length > 0 ? Math.max(...agreementRates) : null,
    summary:
      replayJson.summary ??
      "Historical replay is available for rule, warning, source-state, and shadow-ML comparison.",
    limitation:
      "Replay reflects the current stored history and label backlog, so it supports review more strongly than validated event-level claims.",
  };
}

function buildLabelAuditSummary(markdown, auditJson) {
  if (!markdown && !auditJson) {
    return defaultReport().labelAudit;
  }

  const summary =
    auditJson?.supervisionQuality?.summary ??
    markdown
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#")) ??
    "Label-audit report is available.";

    return {
      available: true,
      summary,
      evidenceLinkedRows: auditJson?.backlogSummary?.evidenceLinkedRows ?? 0,
      evidenceLinkedPositiveRows: auditJson?.backlogSummary?.evidenceLinkedPositiveRows ?? 0,
      placeholderEvidenceRows: auditJson?.backlogSummary?.placeholderEvidenceRows ?? 0,
      placeholderEvidencePositiveRows: auditJson?.backlogSummary?.placeholderEvidencePositiveRows ?? 0,
      reviewedRows: auditJson?.backlogSummary?.reviewedRows ?? 0,
      reviewedPositiveRows: auditJson?.backlogSummary?.reviewedPositiveRows ?? 0,
      promotableRows: auditJson?.backlogSummary?.promotableRows ?? 0,
      independentPositiveRows: auditJson?.backlogSummary?.independentPositiveRows ?? 0,
      reviewableRows: auditJson?.backlogSummary?.reviewableRows ?? 0,
    reviewablePositiveRows: auditJson?.backlogSummary?.reviewablePositiveRows ?? 0,
  };
}

function buildTargetSelectionSummary(report) {
  if (!report?.targetSelection) {
    return defaultReport().targetSelection;
  }

  return {
    available: true,
    selectedTargetKind: report.targetSelection.selectedTargetKind ?? "rule",
    selectedTargetColumn: report.targetSelection.selectedTargetColumn ?? "targetRuleElevated",
    readyForIndependentSupervision:
      report.targetSelection.readyForIndependentSupervision ?? false,
    reason: report.targetSelection.reason ?? "Training target selection was reported.",
    eventCandidate: report.targetSelection.eventTargetCandidate ?? null,
  };
}

function buildSupervisionQuality(report, auditJson) {
  if (!report?.supervisionQuality && !auditJson?.supervisionQuality) {
    return defaultReport().supervisionQuality;
  }

  const gradeRank = { weak: 0, developing: 1, reviewable: 2 };
  const reportSource = report?.supervisionQuality ?? {};
  const auditSource = auditJson?.supervisionQuality ?? {};
  const source =
    (gradeRank[auditSource.grade] ?? -1) > (gradeRank[reportSource.grade] ?? -1)
      ? { ...reportSource, ...auditSource }
      : { ...auditSource, ...reportSource };
  return {
    grade: source.grade ?? "weak",
    summary:
      source.summary ??
      "Independent supervision is still too weak for validated ML claims.",
    viableForIndependentSupervision:
      source.viableForIndependentSupervision ?? false,
    primaryLimitation:
      source.primaryLimitation ??
      "Independent event labels are unavailable or too weak.",
    eventLabelCoverage: source.eventLabelCoverage ?? 0,
    eventPositiveCount: source.eventPositiveCount ?? 0,
    reviewedRowCount: source.reviewedRowCount ?? 0,
    strongOrModerateLabelCount: source.strongOrModerateLabelCount ?? 0,
    eventLabelStrengthCounts: source.eventLabelStrengthCounts ?? {},
    eventLabelReviewStatusCounts: source.eventLabelReviewStatusCounts ?? {},
    evidenceLinkedRowCount: source.evidenceLinkedRowCount ?? 0,
    evidenceLinkedPositiveRowCount: source.evidenceLinkedPositiveRowCount ?? 0,
    eligibleIndependentRowCount: source.eligibleIndependentRowCount ?? 0,
    eligibleIndependentPositiveCount: source.eligibleIndependentPositiveCount ?? 0,
    reviewedPositiveRowCount: source.reviewedPositiveRowCount ?? 0,
    backlogEvidenceLinkedRows: source.backlogEvidenceLinkedRows ?? 0,
    backlogPlaceholderEvidenceRows: source.backlogPlaceholderEvidenceRows ?? 0,
    backlogPromotableRows: source.backlogPromotableRows ?? 0,
    backlogIndependentPositiveRows: source.backlogIndependentPositiveRows ?? 0,
    eventHoldoutCurrentlyViable: Boolean(
      source.viableForIndependentSupervision && (source.eligibleIndependentPositiveCount ?? 0) > 0,
    ),
  };
}

function buildEventSupervisionSummary(supervisionQuality, labelAudit, eventHoldout, promotionPolicy) {
  const viable = Boolean(supervisionQuality?.viableForIndependentSupervision);
  const reviewablePositiveRows =
    supervisionQuality?.eligibleIndependentPositiveCount ??
    labelAudit?.reviewablePositiveRows ??
    0;
  const blockedReason = viable
    ? "Independent event supervision is strong enough for shadow-mode review, but ML promotion remains blocked until broader validation and expert review are complete."
    : supervisionQuality?.primaryLimitation ??
      eventHoldout?.reason ??
      promotionPolicy?.summary ??
      "Independent event supervision is not yet viable.";

  return {
    viable,
    blocked: !viable,
    reason: blockedReason,
    evidenceLinkedRows:
      supervisionQuality?.evidenceLinkedRowCount ?? labelAudit?.evidenceLinkedRows ?? 0,
    reviewedRows:
      supervisionQuality?.reviewedRowCount ?? labelAudit?.reviewedRows ?? 0,
    reviewableRows:
      supervisionQuality?.eligibleIndependentRowCount ?? labelAudit?.reviewableRows ?? 0,
    reviewablePositiveRows,
  };
}

function buildEventHoldoutSummary(report) {
  if (!report?.eventHoldout) {
    return defaultReport().eventHoldout;
  }

  return {
    available: true,
    viable: report.eventHoldout.viable ?? false,
    strategy: report.eventHoldout.strategy ?? "event_holdout_unavailable",
    reason: report.eventHoldout.reason ?? "Event holdout was reviewed.",
    trainRows: report.eventHoldout.trainRows ?? 0,
    testRows: report.eventHoldout.testRows ?? 0,
    trainPositiveCount: report.eventHoldout.trainPositiveCount ?? 0,
    testPositiveCount: report.eventHoldout.testPositiveCount ?? 0,
    reviewedEventWindows: report.eventHoldout.reviewedEventWindows ?? 0,
    reviewedElevatedEventWindows: report.eventHoldout.reviewedElevatedEventWindows ?? 0,
    comparisonWindows: report.eventHoldout.comparisonWindows ?? 0,
    independentLabelRows: report.eventHoldout.independentLabelRows ?? 0,
  };
}

function buildAcceptanceGates(report) {
  if (!report?.acceptanceGates) {
    return defaultReport().acceptanceGates;
  }
  return {
    passedAll: report.acceptanceGates.passedAll ?? false,
    bestNonBaselineModel: report.acceptanceGates.bestNonBaselineModel ?? null,
    gates: report.acceptanceGates.gates ?? [],
  };
}

function buildPromotionPolicy(report) {
  if (!report?.promotionPolicy) {
    return defaultReport().promotionPolicy;
  }
  return {
    currentStage: report.promotionPolicy.currentStage ?? "shadow_mode",
    nextEligibleStage: report.promotionPolicy.nextEligibleStage ?? null,
    stages: report.promotionPolicy.stages ?? defaultReport().promotionPolicy.stages,
    never: report.promotionPolicy.never ?? ["official emergency authority"],
    summary:
      report.promotionPolicy.summary ??
      "ML remains in shadow mode because promotion evidence is incomplete.",
  };
}

export async function readMlReport(reportsDir = defaultReportsDir) {
  try {
    const [metrics, realExportMetrics, scenarioMetrics, modelCard, labelAuditMarkdown, labelAuditJson, calibrationSummary, calibrationSummaryJson, replaySummary, targetSelectionSummary, reviewQueueCsv] =
      await Promise.all([
      readJsonIfPresent(path.join(reportsDir, "metrics.json")),
      readJsonIfPresent(path.join(reportsDir, "real_export_metrics.json")),
      readJsonIfPresent(path.join(reportsDir, "scenario_stress_test_metrics.json")),
      readTextIfPresent(path.join(reportsDir, "model_card.md")),
      readTextIfPresent(path.join(reportsDir, "label_audit.md")),
      readJsonIfPresent(path.join(reportsDir, "label_audit.json")),
      readTextIfPresent(path.join(reportsDir, "calibration_summary.md")),
      readJsonIfPresent(path.join(reportsDir, "threshold_calibration_summary.json")),
      readJsonIfPresent(path.join(reportsDir, "history_replay_summary.json")),
      readTextIfPresent(path.join(reportsDir, "target_selection_summary.md")),
      readTextIfPresent(
        path.join(path.resolve(reportsDir, ".."), "data", "event_evidence_review_queue.csv"),
      ),
    ]);

    const fallback = defaultReport();
    const report = {
      ...fallback,
      mode: metrics?.mode ?? fallback.mode,
      liveScoringEnabled: metrics?.liveScoringEnabled ?? fallback.liveScoringEnabled,
      operationalUse: "disabled",
      labelSource:
        realExportMetrics?.summary?.labelSourceCounts
          ? Object.keys(realExportMetrics.summary.labelSourceCounts)[0]
          : fallback.labelSource,
      readyForValidatedML: metrics?.readyForValidatedML ?? fallback.readyForValidatedML,
      models: collectModelNames(realExportMetrics, scenarioMetrics),
      liveDecisionAuthority: "rule_engine",
      summary:
        "FloodGuard ML is implemented as a prototype shadow-mode comparison layer.",
      reportAvailability: {
        metrics: Boolean(metrics),
        realExportMetrics: Boolean(realExportMetrics),
        scenarioStressTestMetrics: Boolean(scenarioMetrics),
        modelCard: Boolean(modelCard),
        labelAudit: Boolean(labelAuditMarkdown || labelAuditJson),
        calibrationSummary: Boolean(calibrationSummary || calibrationSummaryJson),
        historyReplaySummary: Boolean(replaySummary),
        targetSelectionSummary: Boolean(targetSelectionSummary),
      },
      realExport: buildRealExportSummary(realExportMetrics),
      scenarioStressTest: buildScenarioSummary(scenarioMetrics),
      modelCard: buildModelCardSummary(modelCard),
      labelAudit: buildLabelAuditSummary(labelAuditMarkdown, labelAuditJson),
      calibrationSummary: buildCalibrationSummary(calibrationSummary, calibrationSummaryJson),
      historicalReplay: buildHistoricalReplaySummary(replaySummary),
      supervisionQuality: buildSupervisionQuality(realExportMetrics, labelAuditJson),
      targetSelection: buildTargetSelectionSummary(realExportMetrics),
      eventHoldout: buildEventHoldoutSummary(realExportMetrics),
      acceptanceGates: buildAcceptanceGates(realExportMetrics),
      promotionPolicy: buildPromotionPolicy(realExportMetrics),
      bestPrototypeModel:
        realExportMetrics?.bestPrototypeModel ??
        scenarioMetrics?.bestPrototypeModel ??
        null,
      validationLevel: "prototype",
      predictionPreview: realExportMetrics?.predictionPreview ?? null,
      modelAgreementWithRuleEngine: deriveModelAgreement(realExportMetrics),
      labelStrength: deriveLabelStrength(realExportMetrics),
    };
    report.eventSupervision = buildEventSupervisionSummary(
      report.supervisionQuality,
      report.labelAudit,
      report.eventHoldout,
      report.promotionPolicy,
    );
    report.reviewedEventWindows =
      report.supervisionQuality.reviewedRowCount ?? report.labelAudit.reviewedRows ?? 0;
    report.reviewedElevatedEventWindows =
      report.supervisionQuality.reviewedPositiveRowCount ?? report.labelAudit.reviewedPositiveRows ?? 0;
    report.eventHoldoutViable =
      report.eventHoldout.viable ?? report.supervisionQuality.eventHoldoutCurrentlyViable ?? false;
    report.mlPromotionBlockedReason = report.eventSupervision.reason;
    report.placeholderEvidenceCount =
      report.supervisionQuality.backlogPlaceholderEvidenceRows ?? report.labelAudit.placeholderEvidenceRows ?? 0;
    report.reviewQueueCount = countQueueRows(reviewQueueCsv);
    report.limitations = buildLimitations(
      report.realExport,
      report.scenarioStressTest,
      report.historicalReplay,
    );

    if (!realExportMetrics && !scenarioMetrics && !modelCard && !labelAuditMarkdown && !labelAuditJson && !calibrationSummary && !calibrationSummaryJson && !replaySummary && !targetSelectionSummary) {
      return fallback;
    }

    return report;
  } catch (error) {
    return {
      ...defaultReport(),
      realExport: {
        ...defaultReport().realExport,
        warnings: [`ML report reader degraded safely: ${error.message}`],
      },
      scenarioStressTest: {
        ...defaultReport().scenarioStressTest,
        warnings: [`ML report reader degraded safely: ${error.message}`],
      },
    };
  }
}
