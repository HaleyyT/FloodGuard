import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { defaultAreaId, getAreaConfig } from "./areaConfig.js";
import { storageDir } from "./config.js";

const reportsPath = path.join(storageDir, "community-reports.jsonl");
const recentWindowMs = 24 * 60 * 60 * 1000;
const severityLevels = new Set(["low", "moderate", "high"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
const blockedImageHosts = new Set(["localhost", "localhost.localdomain"]);
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

function isPrivateImageHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(host);

  if (blockedImageHosts.has(host) || host.endsWith(".local")) return true;

  if (ipVersion === 4) {
    const [first, second] = host.split(".").map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254) ||
      first === 0
    );
  }

  if (ipVersion === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  }

  return false;
}

function safeImageHost(imageEvidence) {
  if (imageEvidence.host) return imageEvidence.host;

  try {
    return new URL(imageEvidence.url).hostname.toLowerCase();
  } catch {
    return "unknown-host";
  }
}

function normaliseImageEvidence(input = {}) {
  const rawUrl = cleanText(input.imageUrl, 500);
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw validationError("Image evidence must be a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw validationError("Image evidence must use a secure https URL.");
  }

  if (url.username || url.password) {
    throw validationError("Image evidence URL must not contain credentials.");
  }

  if (isPrivateImageHost(url.hostname)) {
    throw validationError("Image evidence must not use localhost or private network hosts.");
  }

  const extension = url.pathname.split(".").at(-1)?.toLowerCase();
  if (!allowedImageExtensions.has(extension)) {
    throw validationError("Image evidence must link to a jpg, jpeg, png, webp, or heic file.");
  }

  return {
    url: url.toString(),
    caption: cleanText(input.imageCaption, 120),
    host: url.hostname.toLowerCase(),
    mediaType: extension,
    status: "metadata-only",
    verification: "unreviewed",
    submittedAt: new Date().toISOString(),
  };
}

function imageSeverityHint(report) {
  const text = `${report.description} ${report.imageEvidence?.caption ?? ""}`.toLowerCase();
  const severeTerms = ["car", "vehicle", "waist", "rescue", "fast", "torrent", "evacu", "deep"];
  const moderateTerms = ["road", "crossing", "blocked", "creek", "overflow", "knee", "pooling"];
  const shallowTerms = ["puddle", "footpath", "gutter", "minor", "shallow"];

  if (severeTerms.some((term) => text.includes(term))) {
    return {
      class: "possible-severe-flooding",
      confidence: 72,
      rationale: "Text around the image mentions severe flood indicators.",
    };
  }

  if (moderateTerms.some((term) => text.includes(term))) {
    return {
      class: "possible-moderate-flooding",
      confidence: 62,
      rationale: "Text around the image mentions roads, crossings, creek overflow, or blocked access.",
    };
  }

  if (shallowTerms.some((term) => text.includes(term))) {
    return {
      class: "possible-shallow-flooding",
      confidence: 52,
      rationale: "Text around the image suggests shallow or localised water.",
    };
  }

  return {
    class: "unclassified",
    confidence: 35,
    rationale: "Image URL is valid, but the text does not provide enough visual context.",
  };
}

function buildImageValidation(report) {
  if (!report.imageEvidence) {
    return {
      status: "no-image",
      severityHint: null,
      reviewRequired: false,
      safeguards: [],
    };
  }

  const severityHint = imageSeverityHint(report);
  const reviewRequired =
    report.severity === "high" ||
    severityHint.class !== "unclassified" ||
    report.validation?.flags?.length > 0;

  return {
    status: "metadata-validated",
    severityHint,
    reviewRequired,
    reviewReason: reviewRequired
      ? "Image evidence can support severity, but still needs human review before influencing the official decision."
      : "Image evidence is stored as supplementary context only.",
    safeguards: [
      "Only HTTPS image URLs are accepted.",
      "Localhost and private-network image hosts are blocked.",
      "Raw image URLs stay in report storage; the queue exposes host and metadata only.",
    ],
  };
}

function imageEvidencePriority(report) {
  const severityScore = report.severity === "high" ? 70 : report.severity === "moderate" ? 45 : 20;
  const qualityScore = report.validation?.qualityScore ?? report.confidence ?? 0;
  const imageCaptionScore = report.imageEvidence?.caption ? 10 : 0;
  const imageValidation = report.validation?.imageValidation ?? buildImageValidation(report);
  const hintScore =
    imageValidation.severityHint?.class === "possible-severe-flooding"
      ? 15
      : imageValidation.severityHint?.class === "possible-moderate-flooding"
        ? 10
        : imageValidation.severityHint?.class === "possible-shallow-flooding"
          ? 5
          : 0;
  const score = Math.min(
    100,
    Math.round(severityScore + qualityScore * 0.35 + imageCaptionScore + hintScore),
  );

  return {
    score,
    level: score >= 85 ? "urgent-review" : score >= 60 ? "elevated-review" : "routine-review",
  };
}

export function buildImageEvidenceReviewItem(report) {
  if (!report.imageEvidence) return null;

  const priority = imageEvidencePriority(report);
  const reasons = [
    `${report.severity} severity community report`,
    `quality score ${report.validation?.qualityScore ?? report.confidence ?? "unknown"}`,
  ];

  if (report.validation?.flags?.length > 0) {
    reasons.push(`${report.validation.flags.length} validation flag(s) need review`);
  }

  if (!report.imageEvidence.caption) {
    reasons.push("image note is missing");
  }

  const imageValidation = report.validation?.imageValidation ?? buildImageValidation(report);
  if (imageValidation.severityHint) {
    reasons.push(`${imageValidation.severityHint.class} (${imageValidation.severityHint.confidence}/100)`);
  }

  return {
    id: report.id,
    areaId: report.areaId,
    areaName: report.areaName,
    title: report.title,
    signalType: report.signalType,
    severity: report.severity,
    createdAt: report.createdAt,
    imageHost: safeImageHost(report.imageEvidence),
    imageType: report.imageEvidence.mediaType ?? report.imageEvidence.url.split(".").at(-1)?.toLowerCase(),
    caption: report.imageEvidence.caption || "No image note supplied.",
    verification: report.imageEvidence.verification ?? "unreviewed",
    reviewStatus: "needs-human-review",
    priority,
    imageValidation,
    reasons,
  };
}

export function buildImageEvidenceReviewQueue(reports = [], limit = 20) {
  const items = reports
    .map(buildImageEvidenceReviewItem)
    .filter(Boolean)
    .sort((a, b) => b.priority.score - a.priority.score || new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  return {
    itemCount: items.length,
    urgentCount: items.filter((item) => item.priority.level === "urgent-review").length,
    elevatedCount: items.filter((item) => item.priority.level === "elevated-review").length,
    routineCount: items.filter((item) => item.priority.level === "routine-review").length,
    privacyNote: "Review items expose image host and metadata only; raw image URLs remain inside report storage.",
    items,
  };
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
  const hasImageEvidence = Boolean(report.imageEvidence);
  const hasLocationDetail = /\b(near|at|on|beside|outside|under|around|crossing|creek|road|street|drain)\b/i.test(
    report.description,
  );

  if (report.description.length < 25) flags.push("short-description");
  if (!hasLocationDetail) flags.push("needs-location-detail");
  if (report.severity === "high") flags.push("high-severity-unverified");

  const qualityScore = Math.max(
    20,
    Math.min(
      100,
      report.confidence +
        (hasLocationDetail ? 15 : 0) +
        (hasImageEvidence ? 10 : 0) -
        flags.length * 5,
    ),
  );

  const validation = {
    qualityScore,
    flags,
    actionable: qualityScore >= 55,
    imageEvidence: hasImageEvidence ? "linked-unreviewed" : "none",
  };

  return {
    ...validation,
    imageValidation: buildImageValidation({
      ...report,
      validation,
    }),
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
  const imageEvidence = normaliseImageEvidence(input);
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
    ...(imageEvidence ? { imageEvidence } : {}),
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
  const imageEvidenceReports = recentReports.filter((report) => report.imageEvidence);
  const imageReviewQueue = buildImageEvidenceReviewQueue(imageEvidenceReports);
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
    imageEvidenceReports: imageEvidenceReports.length,
    imageReviewQueueCount: imageReviewQueue.itemCount,
    urgentImageReviewCount: imageReviewQueue.urgentCount,
    elevatedImageReviewCount: imageReviewQueue.elevatedCount,
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
        : `${recentReports.length} recent unverified community report(s), ${actionableReports.length} actionable after quality checks, ${imageEvidenceReports.length} with image evidence.`,
  };
}
