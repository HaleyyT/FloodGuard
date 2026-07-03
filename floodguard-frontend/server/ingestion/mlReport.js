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
    limitations: ["ML reports are unavailable right now."],
    models: [],
    liveDecisionAuthority: "rule_engine",
    summary:
      "FloodGuard ML reports are unavailable right now. The live app remains rule-based and explainable.",
    reportAvailability: {
      metrics: false,
      realExportMetrics: false,
      scenarioStressTestMetrics: false,
      modelCard: false,
      calibrationSummary: false,
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
    calibrationSummary: {
      available: false,
      summary: "Calibration summary is unavailable.",
    },
    targetSelection: {
      available: false,
      selectedTargetKind: "rule",
      selectedTargetColumn: "targetRuleElevated",
      readyForIndependentSupervision: false,
      reason: "Target-selection summary is unavailable.",
      eventCandidate: null,
    },
  };
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

function buildLimitations(realExport, scenario) {
  const limitations = [
    realExport?.limitation,
    scenario?.limitation,
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

function buildCalibrationSummary(markdown) {
  if (!markdown) {
    return defaultReport().calibrationSummary;
  }

  const firstMeaningfulLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  return {
    available: true,
    summary: firstMeaningfulLine ?? "Prototype calibration summary is available.",
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

export async function readMlReport(reportsDir = defaultReportsDir) {
  try {
    const [metrics, realExportMetrics, scenarioMetrics, modelCard, calibrationSummary, targetSelectionSummary] =
      await Promise.all([
      readJsonIfPresent(path.join(reportsDir, "metrics.json")),
      readJsonIfPresent(path.join(reportsDir, "real_export_metrics.json")),
      readJsonIfPresent(path.join(reportsDir, "scenario_stress_test_metrics.json")),
      readTextIfPresent(path.join(reportsDir, "model_card.md")),
      readTextIfPresent(path.join(reportsDir, "calibration_summary.md")),
      readTextIfPresent(path.join(reportsDir, "target_selection_summary.md")),
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
        calibrationSummary: Boolean(calibrationSummary),
        targetSelectionSummary: Boolean(targetSelectionSummary),
      },
      realExport: buildRealExportSummary(realExportMetrics),
      scenarioStressTest: buildScenarioSummary(scenarioMetrics),
      modelCard: buildModelCardSummary(modelCard),
      calibrationSummary: buildCalibrationSummary(calibrationSummary),
      targetSelection: buildTargetSelectionSummary(realExportMetrics),
      bestPrototypeModel:
        realExportMetrics?.bestPrototypeModel ??
        scenarioMetrics?.bestPrototypeModel ??
        null,
      validationLevel: "prototype",
      predictionPreview: realExportMetrics?.predictionPreview ?? null,
      modelAgreementWithRuleEngine: deriveModelAgreement(realExportMetrics),
      labelStrength: deriveLabelStrength(realExportMetrics),
    };
    report.limitations = buildLimitations(report.realExport, report.scenarioStressTest);

    if (!realExportMetrics && !scenarioMetrics && !modelCard && !calibrationSummary && !targetSelectionSummary) {
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
