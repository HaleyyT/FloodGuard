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

export function humanizeSourceMode(mode) {
  if (mode === "derived_proxy" || mode === "remote-derived") return "Derived proxy";
  if (mode === "remote") return "Live source";
  if (mode === "live") return "Live source";
  if (mode === "live_summary_fallback") return "Summary fallback";
  if (mode === "cached_recent") return "Recent cached reading";
  if (mode === "cached_stale") return "Older cached reading";
  if (mode === "local-fallback" || mode === "local_demo_fallback") return "Demo fallback";
  if (mode === "not-configured") return "Not connected yet";
  if (mode === "missing") return "Unavailable";
  if (mode === "planned") return "Not connected yet";
  return mode || "Unknown";
}

export function humanizeMlMode(mode) {
  if (mode === "shadow") return "ML comparison only";
  return mode || "Unknown";
}

export function humanizeTrainingTarget(kind) {
  if (kind === "event") return "Event-based target";
  return "Rule-derived ML target";
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

export function buildResidentOverviewModel(dashboardData) {
  const audit = dashboardData?.decisionAudit ?? null;
  const reliability = audit?.reliability ?? null;
  const sourceHealth = dashboardData?.sourceHealth ?? [];
  const staleWeather = sourceHealth.some(
    (source) => source.type === "weather" && source.freshnessStatus === "stale",
  );
  const whyThisMatters = [];

  if (audit?.hazardPressure?.river === "stable") {
    whyThisMatters.push("River trend is stable, which lowers concern.");
  }
  if (["watch", "elevated"].includes(audit?.hazardPressure?.rainfall)) {
    whyThisMatters.push("Rainfall is elevated, which increases concern.");
  }
  if (staleWeather) {
    whyThisMatters.push("Weather context is stale, so it is not used as core evidence.");
  }

  return {
    currentConcern: dashboardData?.riskLevel ?? "Unknown",
    concernSummary: dashboardData?.summary ?? "No current local concern summary is available.",
    trustLabel:
      audit?.evidenceConfidence === "high"
        ? "Yes, core evidence is strong"
        : audit?.evidenceConfidence === "partial"
          ? "Partly, some evidence is limited"
          : "Use extra caution, evidence is limited",
    trustNote:
      reliability?.score !== undefined && reliability?.score !== null
        ? `${reliability.score}% confidence with ${reliability.level.toLowerCase()} evidence reliability.`
        : "Evidence reliability is unavailable.",
    whyAssigned: [
      ...(audit?.whatIncreasedConcern ?? []).slice(0, 2),
      ...(audit?.whatReducedConcern ?? []).slice(0, 1),
    ],
    whatNext: (audit?.checkNext ?? []).slice(0, 3),
    whyThisMatters,
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
