import { notificationPolicy, floodFeatureThresholds } from "./config.js";

const riskRank = {
  Low: 1,
  Moderate: 2,
  High: 3,
};

function severityForRiskLevel(level) {
  if (level === "High") return "urgent";
  if (level === "Moderate") return "watch";
  return "info";
}

function notificationTypeForCandidate(type, severity = null) {
  if (type === "official_warning_detected") return "official_warning";
  if (["data_reliability_degraded", "data_reliability_restored"].includes(type)) {
    return "data_quality_notice";
  }
  if (type === "risk_level_increased") return severity === "watch" ? "awareness_notice" : "risk_escalation";
  if (["rapid_rainfall_increase", "rapid_river_rise"].includes(type)) return "awareness_notice";
  return "none";
}

function hasOfficialWarning(warningSummary = {}) {
  return !["no_current_warning", "unknown"].includes(warningSummary.status ?? "unknown");
}

function evidenceFromSources(areaSignals, types = []) {
  return (areaSignals.sourceMetadata ?? [])
    .filter((source) => types.length === 0 || types.includes(source.type))
    .map((source, index) => ({
      sourceId: `${areaSignals.area.id}-${source.type}-${index}`,
      sourceName: source.label,
      sourceUrl: source.source ?? null,
      sourceStrength: source.sourceStrength ?? "unknown",
      signalType: source.type === "warnings" ? "warning" : source.type,
      area: areaSignals.area.id,
      stationId:
        source.type === "rainfall" && Array.isArray(source.areaRelevance) && source.areaRelevance.length === 1
          ? String(source.areaRelevance[0])
          : null,
      stationName:
        source.type === "river" && Array.isArray(source.areaRelevance) && source.areaRelevance.length === 1
          ? source.areaRelevance[0]
          : null,
      observedAt: source.observedAt ?? null,
      fetchedAt: source.fetchedAt,
      ageMinutes: source.ageMinutes ?? null,
      freshnessStatus: source.freshnessStatus ?? "unknown",
      dataMode: source.dataMode ?? source.mode ?? "unknown",
      qualityNotes: [source.note].filter(Boolean),
    }));
}

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function previousRecord(history = [], currentIngestedAt) {
  // History can arrive in mixed order, so sort it here before dedupe/cooldown decisions.
  const chronological = [...history].sort((a, b) => toTimestamp(a.ingestedAt) - toTimestamp(b.ingestedAt));
  if (chronological.length === 0) return null;
  const last = chronological.at(-1);
  if (last?.ingestedAt === currentIngestedAt) return chronological.at(-2) ?? null;
  return last;
}

function withinCooldown(previous, currentIngestedAt) {
  if (!previous?.ingestedAt) return false;
  const minutes = (toTimestamp(currentIngestedAt) - toTimestamp(previous.ingestedAt)) / (60 * 1000);
  return minutes >= 0 && minutes < notificationPolicy.cooldownMinutes;
}

function reliabilityState(recordLike) {
  // Notifications use a coarse reliability state because history snapshots only persist the fields needed to replay past alert decisions.
  const sourceFreshness = recordLike?.sourceFreshness ?? [];
  if (sourceFreshness.some((source) => ["local_demo_fallback", "cached_stale"].includes(source.dataMode ?? source.mode))) {
    return "blocked";
  }
  if (sourceFreshness.some((source) => (source.dataMode ?? source.mode) === "cached_recent")) {
    return "partial";
  }
  if (recordLike?.freshness?.staleSourceCount > 0 || sourceFreshness.some((source) => source.freshnessStatus === "stale")) {
    return "partial";
  }
  return "live";
}

function candidate({ areaSignals, type, severity, title, message, evidence, riskSnapshot = null, dedupeKey }) {
  return {
    id: `${areaSignals.area.id}-${type}-${dedupeKey}`,
    area: areaSignals.area.id,
    type,
    notificationType: notificationTypeForCandidate(type, severity),
    severity,
    title,
    message,
    evidence,
    riskSnapshot,
    createdAt: areaSignals.ingestedAt,
    dedupeKey,
  };
}

export function buildNotificationCandidates(areaSignals, history = []) {
  // This is the "should FloodGuard tell someone?" layer, keeping official alerts separate from gauge-derived alerts and recording suppressed reasons for auditability.
  const candidates = [];
  const suppressed = [];
  const currentRisk = areaSignals.riskAssessment ?? {};
  const currentLevel = currentRisk.concernLevel ?? "Low";
  const previous = previousRecord(history, areaSignals.ingestedAt);
  const previousLevel = previous?.riskLevel ?? "Low";
  const currentReliability = areaSignals.ingestionHealth?.overallStatus ?? reliabilityState(areaSignals);
  const previousReliability = previous ? reliabilityState(previous) : null;
  const rainfallSource = (areaSignals.sourceMetadata ?? []).find((source) => source.type === "rainfall");
  const riverSource = (areaSignals.sourceMetadata ?? []).find((source) => source.type === "river");
  const coreLive =
    areaSignals.ingestionHealth?.coreFloodStatus === "pass" &&
    (rainfallSource?.freshnessStatus ?? "unknown") === "current" &&
    (riverSource?.freshnessStatus ?? "unknown") === "current";

  if (hasOfficialWarning(areaSignals.warningSummary)) {
    // Official warning text keeps NSW SES/HazardWatch severity separate from FloodGuard's own wording.
    candidates.push(
      candidate({
        areaSignals,
        type: "official_warning_detected",
        severity: "urgent",
        title: `${areaSignals.warningSummary.statusLabel} for ${areaSignals.area.name}`,
        message: `Official warning information is available. Check NSW SES / HazardWatch for exact wording and actions. Source freshness: ${areaSignals.warningSummary.observedAt ?? "unknown"}.`,
        evidence: evidenceFromSources(areaSignals, ["warnings"]),
        riskSnapshot: currentRisk,
        dedupeKey: `official-${areaSignals.warningSummary.status}`,
      }),
    );
  }

  if (
    riskRank[currentLevel] > riskRank[previousLevel] &&
    coreLive &&
    !withinCooldown(previous, areaSignals.ingestedAt)
  ) {
    // App-generated escalation is only allowed when both core gauges are live and current.
    candidates.push(
      candidate({
        areaSignals,
        type: "risk_level_increased",
        severity: severityForRiskLevel(currentLevel),
        title: `FloodGuard risk increased to ${currentLevel}`,
        message: `Local flood awareness signals have increased from ${previousLevel} to ${currentLevel}. Check official warnings before travelling during severe weather.`,
        evidence: evidenceFromSources(areaSignals, ["rainfall", "river"]),
        riskSnapshot: currentRisk,
        dedupeKey: `risk-${currentLevel}`,
      }),
    );
  } else if (riskRank[currentLevel] > riskRank[previousLevel] && !coreLive) {
    suppressed.push({
      type: "risk_level_increased",
      reason: "Core live gauge evidence is degraded, so strong app-generated escalation was suppressed.",
      previousLevel,
      currentLevel,
    });
  } else if (currentLevel === "High" && previousLevel === "High") {
    suppressed.push({
      type: "risk_level_increased",
      reason: "High-risk alert was unchanged and was suppressed to avoid duplicate spam.",
      previousLevel,
      currentLevel,
    });
  } else if (riskRank[currentLevel] > riskRank[previousLevel] && withinCooldown(previous, areaSignals.ingestedAt)) {
    suppressed.push({
      type: "risk_level_increased",
      reason: "Escalation is within the configured cooldown window.",
      previousLevel,
      currentLevel,
    });
  }

  const rainfall1h = currentRisk.features?.rainfall1hMm ?? 0;
  const rainfall3h = currentRisk.features?.rainfall3hMm ?? 0;
  const rainfallThresholdCrossed =
    rainfall1h >= floodFeatureThresholds.rainfall.oneHourConcernMm ||
    rainfall3h >= floodFeatureThresholds.rainfall.threeHourConcernMm;
  const previousRainfallThresholdCrossed =
    (previous?.riskFeatures?.rainfall1hMm ?? 0) >= floodFeatureThresholds.rainfall.oneHourConcernMm ||
    (previous?.riskFeatures?.rainfall3hMm ?? 0) >= floodFeatureThresholds.rainfall.threeHourConcernMm;

  if (rainfallThresholdCrossed && !previousRainfallThresholdCrossed && coreLive) {
    candidates.push(
      candidate({
        areaSignals,
        type: "rapid_rainfall_increase",
        severity: "watch",
        title: `Rapid rainfall increase near ${areaSignals.area.name}`,
        message: `Recent rainfall crossed the configured concern threshold (${rainfall1h} mm in 1h, ${rainfall3h} mm in 3h). Check official warnings for confirmation.`,
        evidence: evidenceFromSources(areaSignals, ["rainfall"]),
        riskSnapshot: currentRisk,
        dedupeKey: "rainfall-threshold-cross",
      }),
    );
  }

  const riverDelta1h = currentRisk.features?.riverDelta1hM ?? null;
  const riverDelta3h = currentRisk.features?.riverDelta3hM ?? null;
  const riverRapidRise =
    (typeof riverDelta1h === "number" && riverDelta1h >= floodFeatureThresholds.river.rapidRiseOneHourM) ||
    (typeof riverDelta3h === "number" && riverDelta3h >= floodFeatureThresholds.river.rapidRiseThreeHourM);
  const previousRiverRapidRise =
    (previous?.riskFeatures?.riverDelta1hM ?? 0) >= floodFeatureThresholds.river.rapidRiseOneHourM ||
    (previous?.riskFeatures?.riverDelta3hM ?? 0) >= floodFeatureThresholds.river.rapidRiseThreeHourM;

  if (riverRapidRise && !previousRiverRapidRise && coreLive) {
    candidates.push(
      candidate({
        areaSignals,
        type: "rapid_river_rise",
        severity: "watch",
        title: `Rapid river rise detected near ${areaSignals.area.name}`,
        message: `River levels rose by ${riverDelta1h ?? "unknown"} m over 1h and ${riverDelta3h ?? "unknown"} m over 3h. Check official warnings and local updates.`,
        evidence: evidenceFromSources(areaSignals, ["river"]),
        riskSnapshot: currentRisk,
        dedupeKey: "river-rapid-rise",
      }),
    );
  }

  if (previousReliability && previousReliability !== currentReliability) {
    // Reliability changes matter even when risk does not, because the UI should surface when evidence quality got worse or better.
    const degraded = ["partial", "blocked"].includes(currentReliability) && currentReliability !== previousReliability;
    const restored = currentReliability === "live" && previousReliability !== "live";
    if (degraded || restored) {
      candidates.push(
        candidate({
          areaSignals,
          type: degraded ? "data_reliability_degraded" : "data_reliability_restored",
          severity: degraded ? "info" : "watch",
          title: degraded
            ? `FloodGuard data reliability degraded for ${areaSignals.area.name}`
            : `FloodGuard data reliability restored for ${areaSignals.area.name}`,
          message: degraded
            ? `Evidence quality changed from ${previousReliability} to ${currentReliability}. FloodGuard is still checking source freshness and fallback status.`
            : `Evidence quality improved from ${previousReliability} to ${currentReliability}. Live core gauges are available again.`,
          evidence: evidenceFromSources(areaSignals),
          riskSnapshot: currentRisk,
          dedupeKey: degraded ? "reliability-degraded" : "reliability-restored",
        }),
      );
    }
  }

  return {
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    generatedAt: areaSignals.ingestedAt,
    candidates,
    suppressed,
  };
}
