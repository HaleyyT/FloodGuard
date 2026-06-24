function sourceModeIssue(source) {
  if (source.status === "failed") return `${source.label} failed during ingestion.`;
  if (source.mode === "unavailable") return `${source.label} is unavailable.`;
  if (source.mode === "local-fallback") return `${source.label} is using local fallback data.`;
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
  if (source.mode === "remote-derived") {
    return `${source.label} is live-derived from another feed; connect the mapped gauge URL for full source fidelity.`;
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
    const freshnessIssue = sourceFreshnessIssue(source);
    const warning = sourceWarning(source);

    if (modeIssue) issues.push(modeIssue);
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
