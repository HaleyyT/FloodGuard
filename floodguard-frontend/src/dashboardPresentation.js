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
  const riskScore = dashboardData?.riskScore ?? null;

  let scoreNote = "This score blends rainfall, river, wetness, and evidence confidence.";
  if (typeof riskScore === "number") {
    if (riskScore >= 70) scoreNote = "Higher scores mean stronger local flood pressure in the current prototype.";
    else if (riskScore >= 40) scoreNote = "This mid-range score suggests some local pressure, but not the strongest concern band.";
    else scoreNote = "This lower score suggests the current local signals remain relatively calm.";
  }

  return {
    riskLevel: dashboardData?.riskLevel ?? "Unknown",
    riskScore,
    scoreNote,
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

function humanizeHazardPressureLevel(level, signalLabel) {
  if (!level) return `${signalLabel} status is unavailable`;
  if (level === "stable") {
    return signalLabel.endsWith("conditions")
      ? `${signalLabel} are stable`
      : `${signalLabel} is stable`;
  }
  if (level === "low") return `${signalLabel} remains low`;
  if (level === "watch") return `${signalLabel} is elevated enough to watch`;
  if (level === "moderate") return `${signalLabel} is moderately elevated`;
  if (level === "elevated") return `${signalLabel} is elevated`;
  if (level === "high") return `${signalLabel} is high`;
  return `${signalLabel} is ${level}`;
}

function humanizeWarningContext(context) {
  if (context === "not_configured" || context === "not-connected") {
    return "official warning feed is not connected yet";
  }
  if (context === "no_current_warning" || context === "no_relevant_warning") {
    return "no current official warning is affecting this area";
  }
  if (context === "warning_active") {
    return "an official warning is active and should be checked directly";
  }
  if (!context || context === "unknown") {
    return "official warning context is limited";
  }
  return `official warning context is ${context.replaceAll("_", " ")}`;
}

function buildDecisionOutlook(audit, dashboardData) {
  const rainfall = humanizeHazardPressureLevel(audit?.hazardPressure?.rainfall, "Rainfall");
  const river = humanizeHazardPressureLevel(audit?.hazardPressure?.river, "River conditions");
  const warningContext = humanizeWarningContext(audit?.officialWarningContext);
  const concern = dashboardData?.riskLevel ?? "Unknown";

  if (concern === "Low") {
    return `${rainfall}, ${river.toLowerCase()}, and ${warningContext}.`;
  }

  return `${rainfall}, ${river.toLowerCase()}, and FloodGuard is keeping ${concern.toLowerCase()} concern under review while ${warningContext}.`;
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
    concernTitle: "Current concern level",
    trustTitle: "Evidence reliability",
    driversTitle: "Key concern drivers",
    nextTitle: "What should I check next?",
    currentConcern: dashboardData?.riskLevel ?? "Unknown",
    concernSummary: dashboardData?.summary ?? "No current local concern summary is available.",
    decisionOutlook: buildDecisionOutlook(audit, dashboardData),
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
    ].filter(Boolean),
    whyAssignedEmptyState:
      dashboardData?.riskLevel === "Low"
        ? "Core signals remain calm and there are no strong local flood drivers right now."
        : "FloodGuard has not surfaced a stronger explanation yet. Continue reviewing local signals and official advice.",
    whatNext: (audit?.checkNext ?? []).slice(0, 3).filter(Boolean),
    nextStepEmptyState:
      dashboardData?.riskLevel === "Low"
        ? "All clear. No immediate actions are required for this risk level."
        : "No extra guidance is available yet. Continue monitoring official advice and local conditions.",
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

function buildScenarioRainfallTrend() {
  const baseDate = new Date("2026-03-26T00:00:00Z");
  const totals = [10.8, 5.1, 0.2, 0, 0, 0, 0];

  return totals.map((rainfall, index, points) => {
    const day = new Date(baseDate);
    day.setUTCDate(baseDate.getUTCDate() + index);

    return {
      dayKey: day.toISOString().slice(0, 10),
      time: day.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      timestamp: day.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      rainfall,
      change:
        index === 0 ? null : Number((rainfall - Number(points[index - 1])).toFixed(1)),
    };
  });
}

function buildScenarioSourceHealth(areaName, primaryStationName) {
  return [
    {
      label: "Simulated rainfall surge",
      type: "rainfall",
      dataMode: "local_demo_fallback",
      mode: "local_demo_fallback",
      freshnessStatus: "current",
      sourceStrength: "scenario_demo",
      observedAt: "2026-03-31T09:00:00Z",
      areaRelevance: [areaName.replace(", NSW", "")],
      note: "Simulated rainfall stress-test signal for demo only; this is not a live gauge feed.",
    },
    {
      label: "Simulated river rise",
      type: "river",
      dataMode: "local_demo_fallback",
      mode: "local_demo_fallback",
      freshnessStatus: "current",
      sourceStrength: "scenario_demo",
      observedAt: "2026-03-31T09:00:00Z",
      areaRelevance: [primaryStationName],
      note: "Simulated river-rise signal for demo only; this does not represent a current official reading.",
    },
    {
      label: "Simulated weather context",
      type: "weather",
      dataMode: "local_demo_fallback",
      mode: "local_demo_fallback",
      freshnessStatus: "current",
      sourceStrength: "scenario_demo",
      observedAt: "2026-03-31T09:00:00Z",
      areaRelevance: [areaName.replace(", NSW", "")],
      note: "Simulated wetness and storm context used to explain the scenario stress-test view.",
    },
    {
      label: "Simulated official warning context",
      type: "warnings",
      dataMode: "local_demo_fallback",
      mode: "local_demo_fallback",
      freshnessStatus: "current",
      sourceStrength: "scenario_demo",
      observedAt: "2026-03-31T09:00:00Z",
      areaRelevance: [areaName.replace(", NSW", "")],
      note: "Simulated warning context for demo only; always confirm live NSW SES / BoM advice separately.",
    },
  ];
}

function buildScenarioReports(areaName) {
  const shortAreaName = areaName.replace(", NSW", "");

  return [
    {
      id: `${shortAreaName}-scenario-rainfall`,
      title: `${shortAreaName} heavy rainfall scenario`,
      time: "Simulated replay window",
      severity: "High",
      description:
        "Synthetic scenario where short-window rainfall climbs rapidly and keeps local flood pressure elevated.",
    },
    {
      id: `${shortAreaName}-scenario-river`,
      title: `${shortAreaName} river-rise scenario`,
      time: "Simulated river response",
      severity: "High",
      description:
        "Synthetic scenario where the primary river station rises quickly enough to support stronger concern review.",
    },
    {
      id: `${shortAreaName}-scenario-warning`,
      title: `${shortAreaName} warning-context scenario`,
      time: "Simulated official context",
      severity: "Moderate",
      description:
        "Synthetic scenario showing how FloodGuard keeps local concern explanation separate from official emergency advice.",
    },
  ];
}

export function buildOverviewModeState(dashboardData, overviewMode = "live") {
  const defaultState = {
    data: dashboardData,
    notifications: null,
    meta: {
      id: "live",
      label: "Current source state",
      chip: "Live/degraded evidence",
      description:
        "This view uses the current area snapshot and preserves FloodGuard's live-vs-degraded source honesty.",
      simulated: false,
    },
  };

  if (!dashboardData || overviewMode === "live") {
    return defaultState;
  }

  const areaName = dashboardData.areaName;
  const primaryStationName = dashboardData.riverSummary?.primaryStationName ?? "Configured river station";

  const scenarioData = {
    ...dashboardData,
    riskLevel: "High",
    riskScore: 74,
    summary:
      `Simulated stress-test for ${areaName.replace(", NSW", "")}: heavy recent rainfall, a rising river, and warning context combine into high local concern.`,
    sourceHealth: buildScenarioSourceHealth(areaName, primaryStationName),
    officialSignals: {
      ...dashboardData.officialSignals,
      warningLevel: "Watch and Act (simulated)",
      sourceFreshness: "Simulated current",
      rainfall24h: "47 mm",
      waterTrend: `rising at ${primaryStationName}`,
      areaSignalFit: "Scenario mapped",
    },
    riverSummary: {
      ...dashboardData.riverSummary,
      primaryHeight: "1.22",
      primaryTendency: "rising",
      stationCount: Math.max(dashboardData.riverSummary?.stationCount ?? 0, 3),
    },
    rainfallTrend: buildScenarioRainfallTrend(),
    riskSignals: [
      { name: "Rainfall", value: 86 },
      { name: "River", value: 79 },
      { name: "Wetness", value: 68 },
      { name: "Public", value: 52 },
      { name: "Confidence", value: 91 },
    ],
    recommendedActions: [
      "Check live NSW SES and BoM advice immediately before travelling or changing plans.",
      "Avoid flood-prone crossings, creek paths, and low-lying routes in this simulated high-pressure scenario.",
      "Use this mode to inspect FloodGuard's explanation flow, not to interpret current live conditions.",
    ],
    reports: buildScenarioReports(areaName),
    decisionAudit: {
      ...dashboardData.decisionAudit,
      hazardPressure: {
        rainfall: "elevated",
        river: "elevated",
        wetness: "moderate",
      },
      evidenceConfidence: "high",
      officialWarningContext: "warning_active",
      recommendationType: "prepare_to_act_and_check_official_sources",
      whatIncreasedConcern: [
        "Simulated 24h rainfall has accumulated into a stronger flood-pressure window.",
        "Simulated river rise at the primary station suggests faster catchment response.",
        "Simulated warning context is active and should be checked beside FloodGuard's own explanation.",
      ],
      whatReducedConcern: [
        "This mode is clearly marked as simulated, so it cannot be mistaken for a live operational alert.",
      ],
      excludedEvidence: [
        "Live operational decisions are excluded from this scenario view because the inputs are synthetic.",
      ],
      sourceLimitations: [
        "Scenario stress-test view is simulated for demos, posters, and explanation walkthroughs only.",
      ],
      checkNext: [
        "Check official NSW SES and BoM advice for real conditions.",
        "Review how rainfall, river pressure, and warning context changed the explanation.",
        "Return to Current source state before interpreting live local conditions.",
      ],
      reliability: {
        score: 91,
        level: "High",
        warnings: [
          "Scenario mode is simulated and must not be interpreted as a live operational warning.",
        ],
        blockers: [],
      },
    },
  };

  return {
    data: scenarioData,
    notifications: {
      candidates: [
        {
          id: `${areaName}-scenario-banner`,
          notificationType: "awareness_notice",
          title: `Scenario stress-test view for ${areaName}`,
          message:
            "This is a simulated high-pressure flood scenario for demo and explanation only; it does not reflect the current live area state.",
          severity: "High",
        },
      ],
      suppressed: [],
    },
    meta: {
      id: "scenario-stress",
      label: "Scenario stress-test view",
      chip: "Simulated demo mode",
      description:
        "Synthetic high-pressure scenario showing how FloodGuard explains stronger flood concern without claiming the view is live.",
      simulated: true,
    },
  };
}
