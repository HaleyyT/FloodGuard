const liveCoreModes = new Set(["remote", "live", "live_summary_fallback"]);
const degradedCoreModes = new Set([
  "cached_recent",
  "cached_stale",
  "local-fallback",
  "local_demo_fallback",
  "unavailable",
  "missing",
]);
const acceptedCoreStrengths = new Set(["primary_live_gauge", "official_backup"]);

function isObject(value) {
  return value !== null && typeof value === "object";
}

function coreSourceMode(source) {
  return source.dataMode ?? source.mode ?? "unknown";
}

function isCoreSource(source) {
  return source.type === "rainfall" || source.type === "river";
}

function isFreshLiveCoreSource(source) {
  return (
    isCoreSource(source) &&
    source.freshnessStatus === "current" &&
    acceptedCoreStrengths.has(source.sourceStrength) &&
    liveCoreModes.has(coreSourceMode(source))
  );
}

function isDegradedCoreSource(source) {
  return (
    isCoreSource(source) &&
    (!acceptedCoreStrengths.has(source.sourceStrength) ||
      ["stale", "missing", "unknown"].includes(source.freshnessStatus) ||
      degradedCoreModes.has(coreSourceMode(source)))
  );
}

function validateHealthContract(health) {
  const failures = [];

  if (!isObject(health)) {
    return ["Ingestion health is missing or invalid."];
  }

  const requiredTopLevel = [
    "overallStatus",
    "coreFloodStatus",
    "contextStatus",
    "warningStatus",
    "summary",
    "areas",
  ];

  for (const field of requiredTopLevel) {
    if (!(field in health)) failures.push(`Ingestion health is missing '${field}'.`);
  }

  if (!Array.isArray(health.areas)) {
    failures.push("Ingestion health areas list is missing.");
    return failures;
  }

  for (const area of health.areas) {
    if (!isObject(area)) {
      failures.push("Area ingestion health entry is invalid.");
      continue;
    }

    const requiredAreaFields = [
      "areaId",
      "areaName",
      "overallStatus",
      "coreFloodStatus",
      "contextStatus",
      "warningStatus",
      "sources",
      "areaRelevance",
    ];

    for (const field of requiredAreaFields) {
      if (!(field in area)) failures.push(`${area.areaName ?? "Unknown area"} is missing '${field}'.`);
    }

    if (!Array.isArray(area.sources)) {
      failures.push(`${area.areaName ?? "Unknown area"} is missing source rows.`);
      continue;
    }

    for (const source of area.sources) {
      if (!isObject(source)) {
        failures.push(`${area.areaName ?? "Unknown area"} has an invalid source row.`);
        continue;
      }

      const requiredSourceFields = [
        "label",
        "type",
        "mode",
        "dataMode",
        "sourceStrength",
        "freshnessStatus",
      ];

      for (const field of requiredSourceFields) {
        if (!(field in source)) {
          failures.push(
            `${area.areaName ?? "Unknown area"} source '${source.label ?? "unknown"}' is missing '${field}'.`,
          );
        }
      }
    }
  }

  return failures;
}

function validateSourceRegistryContract(registry, areaCount) {
  const failures = [];

  if (!isObject(registry)) return ["Source registry is missing or invalid."];
  if (!Array.isArray(registry.areas)) return ["Source registry areas list is missing."];
  if (typeof areaCount === "number" && registry.areas.length < areaCount) {
    failures.push("Source registry does not cover every monitored area.");
  }

  for (const area of registry.areas) {
    if (!isObject(area)) {
      failures.push("Source registry area row is invalid.");
      continue;
    }

    if (!Array.isArray(area.sources)) {
      failures.push(`${area.areaName ?? area.area ?? "Unknown area"} source registry row is missing sources.`);
      continue;
    }
  }

  return failures;
}

function findMisleadingStates(health) {
  const failures = [];

  for (const area of health.areas ?? []) {
    const degradedCoreSources = area.sources.filter(isDegradedCoreSource);
    const freshLiveCoreSources = area.sources.filter(isFreshLiveCoreSource);

    if (degradedCoreSources.length > 0 && area.coreFloodStatus === "pass") {
      failures.push(
        `${area.areaName} marks core flood status as pass even though degraded core sources are present.`,
      );
    }

    if (degradedCoreSources.length > 0 && area.overallStatus === "live") {
      failures.push(
        `${area.areaName} is presented as live even though degraded core sources are present.`,
      );
    }

    if (freshLiveCoreSources.length === 0 && area.coreFloodStatus === "pass") {
      failures.push(
        `${area.areaName} marks core flood status as pass without any fresh live rainfall or river source.`,
      );
    }
  }

  return failures;
}

function summarizeSubmissionResult(result) {
  if (result === "pass") {
    return "Core rainfall and river sources are fresh live readings and the ingestion contracts are healthy.";
  }

  if (result === "pass_with_degraded_external_source") {
    return "External sources are degraded or stale, but FloodGuard labels that state honestly and blocks live claims correctly.";
  }

  return "Ingestion readiness failed because required contracts are broken or degraded data is being misrepresented.";
}

function summarizeLiveResult(result, health) {
  if (result === "pass") {
    return "Strict live-source readiness passed with fresh live rainfall and river readings across the monitored areas.";
  }

  return (
    health?.summary ??
    "Strict live-source readiness failed because fresh live rainfall and river readings are not currently available."
  );
}

export function assessIngestionReadiness({ health, sourceRegistry, mode = "submission" }) {
  const contractFailures = [
    ...validateHealthContract(health),
    ...validateSourceRegistryContract(sourceRegistry, health?.areas?.length),
  ];
  const misleadingFailures = contractFailures.length > 0 ? [] : findMisleadingStates(health);
  const failures = [...contractFailures, ...misleadingFailures];
  const hasDegradedExternalSource =
    health?.overallStatus !== "live" ||
    (health?.areas ?? []).some((area) => area.overallStatus !== "live");
  const liveOperationalReady =
    health?.overallStatus === "live" &&
    (health?.areas ?? []).length > 0 &&
    (health?.areas ?? []).every(
      (area) =>
        area.overallStatus === "live" &&
        area.coreFloodStatus === "pass" &&
        area.sources.filter(isCoreSource).every(isFreshLiveCoreSource),
    );

  let result = "fail";
  let submissionBlocking = true;

  if (failures.length === 0) {
    if (mode === "live") {
      result = liveOperationalReady ? "pass" : "fail";
      submissionBlocking = result === "fail";
    } else if (hasDegradedExternalSource) {
      result = "pass_with_degraded_external_source";
      submissionBlocking = false;
    } else {
      result = "pass";
      submissionBlocking = false;
    }
  }

  return {
    checkName: mode === "live" ? "ingestion-readiness-live" : "ingestion-readiness",
    mode,
    result,
    submissionBlocking,
    liveOperationalReady,
    checkedAt: new Date().toISOString(),
    summary:
      mode === "live"
        ? summarizeLiveResult(result, health)
        : summarizeSubmissionResult(result),
    statuses: health
      ? {
          overallStatus: health.overallStatus,
          coreFloodStatus: health.coreFloodStatus,
          contextStatus: health.contextStatus,
          warningStatus: health.warningStatus,
        }
      : null,
    failures,
    reasons: health?.reasons ?? [],
    areas:
      health?.areas?.map((area) => ({
        areaId: area.areaId,
        areaName: area.areaName,
        overallStatus: area.overallStatus,
        coreFloodStatus: area.coreFloodStatus,
        contextStatus: area.contextStatus,
        warningStatus: area.warningStatus,
      })) ?? [],
  };
}
