import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultAreaId, getAreaConfig } from "./areaConfig.js";
import { storageDir } from "./config.js";

const reportsPath = path.join(storageDir, "community-reports.jsonl");
const recentWindowMs = 24 * 60 * 60 * 1000;
const severityLevels = new Set(["low", "moderate", "high"]);
const signalTypes = new Set([
  "road pooling",
  "creek level",
  "blocked drain",
  "walkway flooding",
  "local observation",
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normaliseSeverity(value) {
  const severity = cleanText(value || "low", 20).toLowerCase();
  return severityLevels.has(severity) ? severity : "low";
}

function normaliseSignalType(value) {
  const signalType = cleanText(value || "local observation", 40).toLowerCase();
  return signalTypes.has(signalType) ? signalType : "local observation";
}

function reportConfidence(severity) {
  if (severity === "high") return 70;
  if (severity === "moderate") return 55;
  return 40;
}

function normaliseDuplicateKey(report) {
  return `${report.areaId}:${report.signalType}:${report.description.toLowerCase()}`;
}

function buildValidation(report) {
  const flags = [];
  const hasLocationDetail = /\b(near|at|on|beside|outside|under|around|crossing|creek|road|street|drain)\b/i.test(
    report.description,
  );

  if (report.description.length < 25) flags.push("short-description");
  if (!hasLocationDetail) flags.push("needs-location-detail");
  if (report.severity === "high") flags.push("high-severity-unverified");

  const qualityScore = Math.max(20, Math.min(100, report.confidence + (hasLocationDetail ? 15 : 0) - flags.length * 5));

  return {
    qualityScore,
    flags,
    actionable: qualityScore >= 55,
  };
}

async function isDuplicateReport(report) {
  const recentReports = await readCommunityReports(report.areaId, 50);
  const duplicateWindowMs = 15 * 60 * 1000;
  const reportKey = normaliseDuplicateKey(report);
  const now = new Date(report.createdAt).getTime();

  return recentReports.some((recentReport) => {
    const recentTime = new Date(recentReport.createdAt).getTime();
    if (Number.isNaN(recentTime) || now - recentTime > duplicateWindowMs) return false;
    return normaliseDuplicateKey(recentReport) === reportKey;
  });
}

export function validateCommunityReport(input = {}) {
  const areaId = cleanText(input.areaId || defaultAreaId, 80);
  const area = getAreaConfig(areaId);

  if (!area) {
    throw validationError(`Unknown area: ${areaId}`);
  }

  const description = cleanText(input.description, 320);
  if (description.length < 10) {
    throw validationError("Description must be at least 10 characters.");
  }

  const severity = normaliseSeverity(input.severity);
  const signalType = normaliseSignalType(input.signalType);
  const title =
    cleanText(input.title, 80) ||
    `${signalType.replace(/^\w/, (letter) => letter.toUpperCase())} report`;

  const report = {
    id: randomUUID(),
    areaId: area.id,
    areaName: area.name,
    catchment: area.catchment,
    title,
    description,
    severity,
    signalType,
    status: "unverified",
    source: "community",
    confidence: reportConfidence(severity),
    createdAt: new Date().toISOString(),
  };

  return {
    area,
    report: {
      ...report,
      validation: buildValidation(report),
    },
  };
}

export async function createCommunityReport(input = {}) {
  const { report } = validateCommunityReport(input);

  if (await isDuplicateReport(report)) {
    const error = validationError("Duplicate report received recently for this area.");
    error.statusCode = 409;
    throw error;
  }

  await mkdir(storageDir, { recursive: true });
  await appendFile(reportsPath, `${JSON.stringify(report)}\n`, "utf8");
  return report;
}

export async function readCommunityReports(areaId = defaultAreaId, limit = 20) {
  const area = getAreaConfig(areaId);
  if (!area) {
    throw validationError(`Unknown area: ${areaId}`);
  }

  try {
    const content = await readFile(reportsPath, "utf8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((report) => report.areaId === area.id)
      .slice(-limit)
      .reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function summariseCommunityReports(reports = [], referenceTime = new Date().toISOString()) {
  const referenceTimestamp = new Date(referenceTime).getTime();
  const recentReports = reports.filter((report) => {
    const createdAt = new Date(report.createdAt).getTime();
    if (Number.isNaN(createdAt) || Number.isNaN(referenceTimestamp)) return false;
    return referenceTimestamp - createdAt <= recentWindowMs;
  });
  const actionableReports = recentReports.filter((report) => report.validation?.actionable);
  const highSeverityReports = recentReports.filter((report) => report.severity === "high");
  const moderateSeverityReports = recentReports.filter((report) => report.severity === "moderate");
  const averageQuality =
    recentReports.length > 0
      ? Math.round(
          recentReports.reduce(
            (total, report) => total + (report.validation?.qualityScore ?? report.confidence ?? 0),
            0,
          ) / recentReports.length,
        )
      : 0;
  const publicSignalPressure = Math.min(
    100,
    Math.round(
      actionableReports.length * 15 +
        highSeverityReports.length * 20 +
        moderateSeverityReports.length * 10 +
        averageQuality * 0.2,
    ),
  );

  return {
    totalReports: reports.length,
    recentReports: recentReports.length,
    actionableReports: actionableReports.length,
    highSeverityReports: highSeverityReports.length,
    moderateSeverityReports: moderateSeverityReports.length,
    averageQuality,
    publicSignalPressure,
    status:
      recentReports.length === 0
        ? "no-recent-reports"
        : actionableReports.length > 0
          ? "supplementary-evidence"
          : "unverified-context",
    note:
      recentReports.length === 0
        ? "No recent community reports are stored for this area."
        : `${recentReports.length} recent unverified community report(s), ${actionableReports.length} actionable after quality checks.`,
  };
}
