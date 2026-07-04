function deriveFailureReason(source, areaSignals) {
  if (source.status === "not-connected" || source.mode === "not-configured") return "not_configured";
  if (source.dataMode === "cached_recent") return "cache_recent";
  if (source.dataMode === "cached_stale") return "cache_stale";
  if (source.freshnessStatus === "stale") return "timestamp_stale";
  if (source.status === "failed" || source.mode === "unavailable") {
    const note = String(source.note ?? "").toLowerCase();
    if (note.includes("timeout")) return "network_timeout";
    if (note.includes("json") || note.includes("parse") || note.includes("unexpected")) {
      return "parser_error";
    }
    return "source_unavailable";
  }

  if (source.type === "rainfall" && areaSignals?.rainfallSeries?.areaRelevance?.matched === false) {
    return "station_unmapped";
  }
  if (
    source.type === "river" &&
    (areaSignals?.riverContext?.areaRelevance?.missingStations?.length ?? 0) > 0 &&
    (areaSignals?.riverContext?.stationCount ?? 0) === 0
  ) {
    return "station_unmapped";
  }

  return null;
}

function buildSourceObservabilityRow(areaSignals, source) {
  const failureReason = deriveFailureReason(source, areaSignals);
  const cacheMode =
    source.dataMode === "cached_recent" || source.dataMode === "cached_stale" ? source.dataMode : "none";
  const lastSuccessfulLiveFetchAt =
    source.lastSuccessfulLiveFetchAt ??
    source.lastLiveFetchAt ??
    (source.mode === "remote" || source.dataMode === "live" || source.dataMode === "live_summary_fallback"
      ? source.fetchedAt ?? null
      : null);
  const lastSuccessfulLiveAgeMinutes =
    lastSuccessfulLiveFetchAt && source.fetchedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(source.fetchedAt).getTime() - new Date(lastSuccessfulLiveFetchAt).getTime()) /
              (60 * 1000),
          ),
        )
      : null;
  const coreFloodRole = ["rainfall", "river"].includes(source.type) ? "core" : "supporting";
  const liveClaimEligible =
    coreFloodRole === "core" &&
    !failureReason &&
    source.freshnessStatus === "current" &&
    ["remote", "live"].includes(source.mode ?? source.dataMode ?? "unknown");

  return {
    contractVersion: "ingestion-observability-v2",
    source: source.label,
    sourceType: source.type,
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    coreFloodRole,
    liveClaimEligible,
    lastFetchedAt: source.fetchedAt ?? null,
    lastObservedAt: source.observedAt ?? null,
    freshnessMinutes: source.ageMinutes ?? null,
    freshnessStatus: source.freshnessStatus ?? "unknown",
    sourceMode: source.mode ?? "unknown",
    cacheMode,
    sourceStrength: source.sourceStrength ?? "unknown",
    failureReason,
    lastSuccessfulLiveFetchAt,
    lastSuccessfulLiveAgeMinutes,
    limitation: source.note ?? null,
  };
}

function buildDebugLine(regionalSignals) {
  const health = regionalSignals.ingestionHealth;
  if (health?.overallStatus === "live") {
    return "Source status: live — current rainfall and river evidence supports live claims.";
  }

  const degradedCore = Object.values(regionalSignals.areas ?? {}).some((areaSignals) =>
    (areaSignals.sourceMetadata ?? []).some(
      (source) =>
        ["rainfall", "river"].includes(source.type) &&
        ["cached_recent", "cached_stale", "local_demo_fallback", "missing"].includes(
          source.dataMode ?? source.mode ?? "unknown",
        ),
    ),
  );

  if (degradedCore) {
    return "Source status: degraded honestly — cached rainfall/river evidence is blocked from live claims.";
  }

  return "Source status: partial — supporting context or warning layers are degraded, but FloodGuard labels that state honestly.";
}

export function buildIngestionObservabilityReport(regionalSignals) {
  const areas = Object.values(regionalSignals.areas ?? {}).map((areaSignals) => ({
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    overallStatus: areaSignals.ingestionHealth?.overallStatus ?? "unknown",
    sources: (areaSignals.sourceMetadata ?? []).map((source) =>
      buildSourceObservabilityRow(areaSignals, source),
    ),
  }));

  const allSources = areas.flatMap((area) => area.sources);
  const degradedSources = allSources.filter((source) => source.failureReason !== null);

  return {
    generatedAt: regionalSignals.refreshMetadata?.servedAt ?? regionalSignals.ingestedAt,
    refreshStatus: regionalSignals.refreshMetadata?.status ?? "unknown",
    debugLine: buildDebugLine(regionalSignals),
    failureTaxonomy: [
      "network_timeout",
      "source_unavailable",
      "parser_error",
      "timestamp_stale",
      "station_unmapped",
      "cache_recent",
      "cache_stale",
      "not_configured",
    ],
    degradedSourceCount: degradedSources.length,
    degradedSources,
    areas,
  };
}
