function sourceModeIssue(source) {
  if (source.status === "failed") return `${source.label} failed during ingestion.`;
  if (source.mode === "unavailable") return `${source.label} is unavailable.`;
  if (["local-fallback", "local_demo_fallback"].includes(source.mode) || source.dataMode === "local_demo_fallback") {
    return `${source.label} is using local demo fallback data.`;
  }
  return null;
}

function sourceStrengthLabel(sourceStrength) {
  return (sourceStrength || "unknown").replaceAll("_", " ");
}

function isAcceptedLiveStrength(source) {
  return ["primary_live_gauge", "official_backup"].includes(source.sourceStrength);
}

function sourceStrengthIssue(source) {
  if (source.type === "river" && !isAcceptedLiveStrength(source)) {
    return `${source.label} is ${sourceStrengthLabel(
      source.sourceStrength,
    )}; river needs a primary live gauge or official backup source.`;
  }

  if (
    source.type === "rainfall" &&
    ["local_fallback", "historical_context", "unavailable", "weather_proxy"].includes(
      source.sourceStrength,
    )
  ) {
    return `${source.label} is ${sourceStrengthLabel(
      source.sourceStrength,
    )}; rainfall needs a live gauge or official backup source for live core flood status.`;
  }

  return null;
}

function sourceFreshnessIssue(source) {
  if (source.freshnessStatus === "stale") {
    return `${source.label} is stale (${source.ageHours}h old, expected within ${source.staleAfterHours}h).`;
  }

  if (source.freshnessStatus === "missing") {
    return `${source.label} is missing a usable observation timestamp or reading.`;
  }

  if (source.freshnessStatus === "unknown") {
    return `${source.label} does not expose a usable observation timestamp.`;
  }

  return null;
}

function sourceWarning(source) {
  if (source.sourceStrength === "weather_proxy") {
    return `${source.label} is a weather proxy and is shown as supporting context only.`;
  }

  return null;
}

function isCoreFloodSource(source) {
  return ["rainfall", "river"].includes(source.type);
}

function isContextSource(source) {
  return !isCoreFloodSource(source);
}

function sourceIssue(source) {
  if (source.type === "warnings" && source.status === "not-connected") return null;
  return sourceModeIssue(source) || sourceStrengthIssue(source) || sourceFreshnessIssue(source);
}

function warningHealth(sources) {
  const warningSource = sources.find((source) => source.type === "warnings");

  if (!warningSource || warningSource.status === "not-connected") {
    return {
      status: "missing",
      warning: "Official NSW SES/HazardWatch warning integration is not connected yet.",
    };
  }

  if (warningSource.status === "failed" || warningSource.mode === "unavailable") {
    return {
      status: "warn",
      warning: "Official warning source is configured but unavailable.",
    };
  }

  if (["stale", "unknown"].includes(warningSource.freshnessStatus)) {
    return {
      status: "warn",
      warning: "Official warning source is configured but does not have a fresh timestamp.",
    };
  }

  return {
    status: "pass",
    warning: null,
  };
}

export function buildAreaIngestionHealth(areaSignals) {
  const coreIssues = [];
  const contextIssues = [];
  const warnings = [];
  const sources = areaSignals.sourceMetadata ?? [];
  const areaRelevance = areaSignals.areaRelevance ?? {};
  const missingLayers = areaSignals.dataQuality?.missing ?? [];
  const missingRiverStations = areaRelevance.missingRiverStations ?? [];

  for (const source of sources) {
    const issue = sourceIssue(source);
    const warning = sourceWarning(source);

    if (issue && isCoreFloodSource(source)) coreIssues.push(issue);
    if (issue && isContextSource(source)) contextIssues.push(issue);
    if (warning) warnings.push(warning);
  }

  const missingCoreLayers = missingLayers.filter((layer) => ["rainfall", "river"].includes(layer));
  const missingContextLayers = missingLayers.filter((layer) => !["rainfall", "river"].includes(layer));

  if (missingCoreLayers.length > 0) {
    coreIssues.push(`Missing core flood layer(s): ${missingCoreLayers.join(", ")}.`);
  }

  if (missingContextLayers.length > 0) {
    contextIssues.push(`Missing supporting context layer(s): ${missingContextLayers.join(", ")}.`);
  }

  if ((areaRelevance.score ?? 0) < 100) {
    coreIssues.push(
      `Area relevance is ${areaRelevance.score ?? 0}% (${areaRelevance.matchedSignals ?? 0}/${
        areaRelevance.expectedSignals ?? 0
      } configured signals matched).`,
    );
  }

  for (const station of missingRiverStations) {
    coreIssues.push(`${station} is configured but missing from the current river feed.`);
  }

  const coreFloodStatus = coreIssues.length > 0 ? "blocked" : "pass";
  const contextStatus = contextIssues.length > 0 ? "warn" : "pass";
  const warningLayer = warningHealth(sources);
  const warningStatus = warningLayer.status;
  const overallStatus =
    coreFloodStatus === "blocked"
      ? "blocked"
      : contextStatus === "warn" || warningStatus !== "pass"
        ? "partial"
        : "live";
  const blockers = [...coreIssues];
  const mergedWarnings = [...contextIssues, ...warnings, warningLayer.warning].filter(Boolean);
  const reasons = [...blockers, ...mergedWarnings];

  return {
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    status:
      overallStatus === "live"
        ? "ready"
        : overallStatus === "partial"
          ? "warning"
          : "blocked",
    overallStatus,
    coreFloodStatus,
    contextStatus,
    warningStatus,
    ready: coreFloodStatus === "pass",
    generatedAt: new Date().toISOString(),
    issueCount: coreIssues.length,
    warningCount: mergedWarnings.length,
    issues: coreIssues,
    reasons,
    blockers,
    warnings: mergedWarnings,
    coreIssues,
    contextIssues,
    freshness: areaSignals.freshness,
    dataQuality: areaSignals.dataQuality,
    areaRelevance: {
      status: areaRelevance.status ?? "unknown",
      score: areaRelevance.score ?? 0,
      matchedSignals: areaRelevance.matchedSignals ?? 0,
      expectedSignals: areaRelevance.expectedSignals ?? 0,
      missingRiverStations,
    },
    sources: sources.map((source) => ({
      label: source.label,
      type: source.type,
      mode: source.mode,
      sourceStrength: source.sourceStrength ?? "unknown",
      status: source.status,
      dataMode: source.dataMode ?? source.mode ?? "unknown",
      freshnessStatus: source.freshnessStatus,
      observedAt: source.observedAt,
      ageHours: source.ageHours,
      staleAfterHours: source.staleAfterHours,
      source: source.source,
    })),
  };
}

export function buildRegionalIngestionHealth(regionalSignals) {
  const areas = Object.values(regionalSignals.areas ?? {}).map(buildAreaIngestionHealth);
  const blockedAreas = areas.filter((area) => area.overallStatus === "blocked");
  const warningAreas = areas.filter((area) => area.overallStatus === "partial");
  const coreBlockedAreas = areas.filter((area) => area.coreFloodStatus === "blocked");
  const contextWarningAreas = areas.filter((area) => area.contextStatus === "warn");
  const coreFloodStatus = coreBlockedAreas.length > 0 ? "blocked" : "pass";
  const contextStatus = contextWarningAreas.length > 0 ? "warn" : "pass";
  const warningStatuses = areas.map((area) => area.warningStatus);
  const warningStatus = warningStatuses.includes("warn")
    ? "warn"
    : warningStatuses.includes("missing")
      ? "missing"
      : "pass";
  const overallStatus =
    coreFloodStatus === "blocked"
      ? "blocked"
      : contextStatus === "warn" || warningStatus !== "pass"
        ? "partial"
        : "live";
  const blockers = coreBlockedAreas.flatMap((area) => area.blockers ?? []);
  const warnings = warningAreas.flatMap((area) => area.warnings ?? []);
  const reasons = [...blockers, ...warnings];

  return {
    status:
      overallStatus === "live"
        ? "ready"
        : overallStatus === "partial"
          ? "warning"
          : "blocked",
    overallStatus,
    coreFloodStatus,
    contextStatus,
    warningStatus,
    ready: coreFloodStatus === "pass",
    checkedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    areaCount: areas.length,
    blockedAreaCount: blockedAreas.length,
    warningAreaCount: warningAreas.length,
    coreBlockedAreaCount: coreBlockedAreas.length,
    contextWarningAreaCount: contextWarningAreas.length,
    reasons,
    blockers,
    warnings,
    summary:
      overallStatus === "blocked"
        ? "Core live flood gauge data is blocked by stale, fallback, missing, or mismatched sources."
        : overallStatus === "partial"
          ? "Core live flood gauges are current. Some supporting context or official warning layers are stale or missing."
          : "Core flood gauges, supporting context, and official warning sources are live.",
    areas,
  };
}
