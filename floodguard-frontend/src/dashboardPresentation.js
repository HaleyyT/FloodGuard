function sourceReliabilityKind(source) {
  const mode = source.dataMode ?? source.mode;
  if (source.freshnessStatus === "not-connected" || source.freshnessStatus === "missing") {
    return "not-connected";
  }
  if (["local-fallback", "local_demo_fallback"].includes(mode)) return "fallback";
  if (source.type === "weather" && source.freshnessStatus === "stale") return "stale-context";
  if (
    ["rainfall", "river"].includes(source.type) &&
    source.sourceStrength === "primary_live_gauge" &&
    source.freshnessStatus === "current"
  ) {
    return "live-gauge";
  }
  if (source.freshnessStatus === "current") return "current-context";
  if (source.freshnessStatus === "stale") return "stale";
  return "unknown";
}

function sourceReliabilityLabel(kind) {
  if (kind === "live-gauge") return "Live gauge";
  if (kind === "current-context") return "Current context";
  if (kind === "stale-context") return "Stale context";
  if (kind === "fallback") return "Demo/Fallback";
  if (kind === "not-connected") return "Not connected";
  if (kind === "stale") return "Stale";
  return "Unknown";
}

function sourceTypeLabel(type) {
  if (type === "rainfall") return "Rainfall";
  if (type === "river") return "River";
  if (type === "weather") return "Weather";
  return "Warnings";
}

export function buildDataEvidenceRows(sources = []) {
  return sources.map((source) => {
    const statusKind = sourceReliabilityKind(source);

    return {
      key: `${source.type}-${source.label}`,
      label: sourceTypeLabel(source.type),
      sourceName: source.label,
      stationReference:
        source.type === "rainfall" && Array.isArray(source.areaRelevance) && source.areaRelevance.length === 1
          ? String(source.areaRelevance[0])
          : source.type === "river" && Array.isArray(source.areaRelevance) && source.areaRelevance.length === 1
            ? source.areaRelevance[0]
            : null,
      statusLabel: sourceReliabilityLabel(statusKind),
      statusKind,
      observedAt: source.observedAt ?? null,
      note: source.note || `${source.type} source is ${source.freshnessStatus ?? "unknown"}.`,
    };
  });
}

export function buildRiskSummaryModel(dashboardData) {
  const audit = dashboardData?.decisionAudit ?? null;
  const reliability = audit?.reliability ?? null;

  return {
    riskLevel: dashboardData?.riskLevel ?? "Unknown",
    summary: dashboardData?.summary ?? "No current risk summary is available.",
    hazardPressure: audit?.hazardPressure ?? null,
    evidenceConfidence: audit?.evidenceConfidence ?? "unknown",
    recommendationType: audit?.recommendationType ?? "unknown",
    checkNext: audit?.checkNext ?? [],
    confidenceLabel:
      reliability?.score !== undefined && reliability?.score !== null
        ? `${reliability.score}% ${reliability.level}`
        : "Confidence unavailable",
    warnings: [...(reliability?.blockers ?? []), ...(reliability?.warnings ?? [])],
  };
}

export function buildNotificationBannerModel(notifications = { candidates: [], suppressed: [] }) {
  const candidates = notifications.candidates ?? [];
  const officialWarnings = candidates.filter((candidate) => candidate.notificationType === "official_warning");
  const appRiskNotices = candidates.filter((candidate) =>
    ["risk_escalation", "awareness_notice"].includes(candidate.notificationType),
  );
  const dataQualityNotices = candidates.filter(
    (candidate) => candidate.notificationType === "data_quality_notice",
  );

  return {
    officialWarnings,
    appRiskNotices,
    dataQualityNotices,
    suppressed: notifications.suppressed ?? [],
    primary:
      officialWarnings[0] ??
      appRiskNotices[0] ??
      dataQualityNotices[0] ??
      null,
  };
}
