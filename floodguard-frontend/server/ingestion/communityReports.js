import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultAreaId, getAreaConfig } from "./areaConfig.js";
import { storageDir } from "./config.js";

const reportsPath = path.join(storageDir, "community-reports.jsonl");
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

  return {
    area,
    report: {
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
    },
  };
}

export async function createCommunityReport(input = {}) {
  const { report } = validateCommunityReport(input);
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
