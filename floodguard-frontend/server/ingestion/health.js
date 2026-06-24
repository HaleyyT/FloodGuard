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

export function buildAreaIngestionHealth(areaSignals) {
  const issues = [];
  const warnings = [];
  const sources = areaSignals.sourceMetadata ?? [];
  const areaRelevance = areaSignals.areaRelevance ?? {};
  const missingLayers = areaSignals.dataQuality?.missing ?? [];
  const missingRiverStations = areaRelevance.missingRiverStations ?? [];

  for (const source of sources) {
    const modeIssue = sourceModeIssue(source);
    const strengthIssue = sourceStrengthIssue(source);
    const freshnessIssue = sourceFreshnessIssue(source);
    const warning = sourceWarning(source);

    if (modeIssue) issues.push(modeIssue);
    if (strengthIssue) issues.push(strengthIssue);
    if (freshnessIssue) issues.push(freshnessIssue);
    if (warning) warnings.push(warning);
  }

  if (missingLayers.length > 0) {
    issues.push(`Missing signal layer(s): ${missingLayers.join(", ")}.`);
  }

  if ((areaRelevance.score ?? 0) < 100) {
    issues.push(
      `Area relevance is ${areaRelevance.score ?? 0}% (${areaRelevance.matchedSignals ?? 0}/${
        areaRelevance.expectedSignals ?? 0
      } configured signals matched).`,
    );
  }

  for (const station of missingRiverStations) {
    issues.push(`${station} is configured but missing from the current river feed.`);
  }

  return {
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    status: issues.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    ready: issues.length === 0,
    issueCount: issues.length,
    warningCount: warnings.length,
    issues,
    warnings,
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
  const blockedAreas = areas.filter((area) => area.status === "blocked");
  const warningAreas = areas.filter((area) => area.status === "warning");

  return {
    status:
      blockedAreas.length > 0 ? "blocked" : warningAreas.length > 0 ? "warning" : "ready",
    ready: blockedAreas.length === 0,
    checkedAt: new Date().toISOString(),
    areaCount: areas.length,
    blockedAreaCount: blockedAreas.length,
    warningAreaCount: warningAreas.length,
    areas,
  };
}
