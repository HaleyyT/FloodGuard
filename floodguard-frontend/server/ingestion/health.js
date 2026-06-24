function sourceModeIssue(source) {
  if (source.status === "failed") return `${source.label} failed during ingestion.`;
  if (source.mode === "unavailable") return `${source.label} is unavailable.`;
  if (source.mode === "local-fallback") return `${source.label} is using local fallback data.`;
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
    ["local_fallback", "historical_context", "unavailable"].includes(source.sourceStrength)
  ) {
    return `${source.label} is ${sourceStrengthLabel(
      source.sourceStrength,
    )}; rainfall needs a live gauge, official backup, or clearly labelled weather proxy.`;
  }

  return null;
}

function sourceFreshnessIssue(source) {
  if (source.freshnessStatus === "stale") {
    return `${source.label} is stale (${source.ageHours}h old, expected within ${source.staleAfterHours}h).`;
  }

  if (source.freshnessStatus === "unknown") {
    return `${source.label} does not expose a usable observation timestamp.`;
  }

  return null;
}

function sourceWarning(source) {
  if (source.sourceStrength === "weather_proxy") {
    return `${source.label} is a weather proxy; connect FLOODGUARD_RAINFALL_URL for a primary rainfall gauge or official rainfall bulletin.`;
  }

  if (source.sourceStrength === "official_warning") {
    return `${source.label} is warning context, not a gauge measurement.`;
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
  return sourceModeIssue(source) || sourceStrengthIssue(source) || sourceFreshnessIssue(source);
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
  const warningStatus = "not_connected";
  const overallStatus =
    coreFloodStatus === "blocked"
      ? "blocked"
      : contextStatus === "warn" || warningStatus === "not_connected"
        ? "warn"
        : "pass";

  return {
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    status: overallStatus === "pass" ? "ready" : overallStatus === "warn" ? "warning" : "blocked",
    overallStatus,
    coreFloodStatus,
    contextStatus,
    warningStatus,
    ready: coreFloodStatus === "pass",
    issueCount: coreIssues.length,
    warningCount: contextIssues.length + warnings.length + 1,
    issues: coreIssues,
    warnings: [
      ...contextIssues,
      ...warnings,
      "Official NSW SES/HazardWatch warning integration is planned but not connected yet.",
    ],
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
  const warningAreas = areas.filter((area) => area.overallStatus === "warn");
  const coreBlockedAreas = areas.filter((area) => area.coreFloodStatus === "blocked");
  const contextWarningAreas = areas.filter((area) => area.contextStatus === "warn");
  const coreFloodStatus = coreBlockedAreas.length > 0 ? "blocked" : "pass";
  const contextStatus = contextWarningAreas.length > 0 ? "warn" : "pass";
  const warningStatus = "not_connected";
  const overallStatus =
    coreFloodStatus === "blocked"
      ? "blocked"
      : contextStatus === "warn" || warningStatus === "not_connected"
        ? "warn"
        : "pass";

  return {
    status: overallStatus === "pass" ? "ready" : overallStatus === "warn" ? "warning" : "blocked",
    overallStatus,
    coreFloodStatus,
    contextStatus,
    warningStatus,
    ready: coreFloodStatus === "pass",
    checkedAt: new Date().toISOString(),
    areaCount: areas.length,
    blockedAreaCount: blockedAreas.length,
    warningAreaCount: warningAreas.length,
    coreBlockedAreaCount: coreBlockedAreas.length,
    contextWarningAreaCount: contextWarningAreas.length,
    summary:
      overallStatus === "blocked"
        ? "Core live flood gauge data is blocked by stale, fallback, missing, or mismatched sources."
        : overallStatus === "warn"
          ? "Core live flood gauges are working. Some supporting context sources are stale or not yet connected."
          : "Core flood gauges and supporting context sources are live.",
    areas,
  };
}
