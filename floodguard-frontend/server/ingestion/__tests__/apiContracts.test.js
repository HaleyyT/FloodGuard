import assert from "node:assert/strict";
import test from "node:test";

import { routeRequest } from "../../server.js";

function mockRegionalSignals() {
  const areaSignals = {
    area: { id: "parramatta", name: "Parramatta, NSW" },
    ingestedAt: "2026-06-29T03:00:00Z",
    weatherObservations: {
      stationName: "Parramatta North",
      observedAt: "2026-06-29T02:50:00Z",
      rainfallTraceMm: 0.2,
    },
    rainfallSeries: {
      latestValidRainfallMm: 5,
      sourceLabel: "FloodSmart rainfall",
      points: [{ time: "2026-06-29T02:55:00Z", rainfallMm: 5 }],
    },
    riverContext: {
      stationCount: 1,
      primaryStation: { stationName: "Parramatta River at Riverside Theatre", heightM: 1.2 },
      stations: [{ stationName: "Parramatta River at Riverside Theatre", heightM: 1.2 }],
    },
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: "remote",
        dataMode: "live_summary_fallback",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:55:00Z",
        source: "https://example.test/rainfall",
        note: "Rainfall source current.",
        areaRelevance: ["67111"],
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: "cached_recent",
        dataMode: "cached_recent",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:40:00Z",
        source: "https://example.test/river",
        note: "River source using recent cache.",
        areaRelevance: ["Parramatta River at Riverside Theatre"],
      },
      {
        label: "Parramatta weather observations",
        type: "weather",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "official_backup",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:50:00Z",
        source: "https://example.test/weather",
        note: "Current weather context.",
        areaRelevance: ["Parramatta North"],
      },
    ],
    freshness: { staleSourceCount: 0, fallbackSourceCount: 0, failedSourceCount: 0 },
    dataQuality: { missing: [], coverageScore: 100 },
    riskAssessment: {
      contractVersion: "risk-intelligence-v2",
      concernLevel: "Moderate",
      score: 52,
      hazardPressure: { rainfall: "watch", river: "stable", wetness: "low" },
      evidenceConfidence: "high",
      officialWarningContext: "not_configured",
      recommendationType: "monitor_and_check_official_sources",
      decisionSummary: {
        primaryConcernDriver: "Short-window rainfall is elevated at 5 mm in the last hour.",
        primaryReliabilityMessage:
          "Official warning feed is not connected yet, so FloodGuard cannot verify warning context automatically.",
        recommendedUserFocus: "Check official NSW SES and BoM advice.",
        whyThisMatters:
          "FloodGuard sees conditions worth monitoring closely, especially alongside official updates.",
      },
      decisionRecommendation: {
        recommendationType: "monitor_and_check_official_sources",
        nextSteps: [
          "Check official NSW SES and BoM advice.",
          "Avoid floodwater and low-lying routes if conditions worsen.",
          "Prepare to act according to official emergency advice.",
        ],
      },
      features: {
        rainfall1hMm: 5,
        rainfall3hMm: 8,
        riverDelta1hM: 0.11,
        riverDelta3hM: 0.21,
      },
      pressureScores: {
        rainfallPressure: 0.52,
        riverPressure: 0.44,
        wetnessPressure: 0.33,
        trendPressure: 0.21,
        confidence: 0.82,
      },
      excludedSignals: [],
      decisionAudit: {
        contractVersion: "risk-intelligence-v2",
        hazardPressure: { rainfall: "watch", river: "stable", wetness: "low" },
        evidenceConfidence: "high",
        officialWarningContext: "not_configured",
        recommendationType: "monitor_and_check_official_sources",
        decisionSummary: {
          primaryConcernDriver: "Short-window rainfall is elevated at 5 mm in the last hour.",
          primaryReliabilityMessage:
            "Official warning feed is not connected yet, so FloodGuard cannot verify warning context automatically.",
          recommendedUserFocus: "Check official NSW SES and BoM advice.",
          whyThisMatters:
            "FloodGuard sees conditions worth monitoring closely, especially alongside official updates.",
        },
        decisionRecommendation: {
          recommendationType: "monitor_and_check_official_sources",
          nextSteps: [
            "Check official NSW SES and BoM advice.",
            "Avoid floodwater and low-lying routes if conditions worsen.",
            "Prepare to act according to official emergency advice.",
          ],
        },
        whatIncreasedConcern: ["Short-window rainfall is elevated at 5 mm in the last hour."],
        whatReducedConcern: ["River trend is stable, which lowers immediate local concern."],
        excludedEvidence: [],
        sourceLimitations: ["Official warning feed is not connected yet, so FloodGuard cannot verify warning context automatically."],
        checkNext: [
          "Check official NSW SES and BoM advice.",
          "Avoid floodwater and low-lying routes if conditions worsen.",
          "Prepare to act according to official emergency advice.",
        ],
        reliability: { score: 82, level: "High" },
      },
      notificationEligibility: {
        notificationType: "awareness_notice",
        strongAppAlertEligible: false,
      },
    },
    ingestionHealth: {
      overallStatus: "partial",
      coreFloodStatus: "warn",
      contextStatus: "pass",
      warningStatus: "missing",
    },
  };

  return {
    defaultAreaId: "parramatta",
    ingestedAt: "2026-06-29T03:00:00Z",
    refreshMetadata: { status: "refreshed", servedAt: "2026-06-29T03:00:01Z" },
    areaList: [{ id: "parramatta", name: "Parramatta, NSW" }],
    areas: { parramatta: areaSignals },
  };
}

async function requestJson(path, deps) {
  const responseState = { statusCode: null, headers: null, body: "" };
  const request = {
    method: "GET",
    url: path,
    headers: { host: "127.0.0.1:5174" },
    socket: { remoteAddress: "127.0.0.1" },
    on() {},
  };
  const response = {
    writeHead(statusCode, headers) {
      responseState.statusCode = statusCode;
      responseState.headers = headers;
    },
    end(body) {
      responseState.body = body;
    },
  };

  await routeRequest(request, response, deps);
  return {
    statusCode: responseState.statusCode,
    headers: responseState.headers,
    body: JSON.parse(responseState.body),
  };
}

async function requestText(path, deps) {
  const responseState = { statusCode: null, headers: null, body: "" };
  const request = {
    method: "GET",
    url: path,
    headers: { host: "127.0.0.1:5174" },
    socket: { remoteAddress: "127.0.0.1" },
    on() {},
  };
  const response = {
    writeHead(statusCode, headers) {
      responseState.statusCode = statusCode;
      responseState.headers = headers;
    },
    end(body) {
      responseState.body = body;
    },
  };

  await routeRequest(request, response, deps);
  return {
    statusCode: responseState.statusCode,
    headers: responseState.headers,
    body: responseState.body,
  };
}

function dependencies() {
  const regionalSignals = mockRegionalSignals();
  return {
    readGaugeMetadata: async () => ({ generatedAt: regionalSignals.ingestedAt }),
    readOrRefreshRegionalSignals: async () => regionalSignals,
    runRegionalIngestion: async () => regionalSignals,
    selectAreaSignals: (signals, areaId) => signals.areas[areaId] ?? null,
    getSourceRegistry: () => ({
      generatedAt: regionalSignals.ingestedAt,
      areas: [
        {
          area: "parramatta",
          areaName: "Parramatta, NSW",
          sources: [
            {
              sourceName: "FloodSmart rainfall",
              sourceUrl: "https://example.test/rainfall",
              sourceOwner: "City of Parramatta",
              sourceStrength: "primary_live_gauge",
              sourceType: "rainfall",
              isOfficial: false,
              isQualityControlled: true,
              limitations: [],
              lastFetchedAt: "2026-06-29T03:00:00Z",
              latestObservedAt: "2026-06-29T02:55:00Z",
              freshnessStatus: "current",
              dataMode: "live",
              qualityNotes: ["Rainfall source current."],
            },
            {
              sourceName: "FloodSmart river",
              sourceUrl: "https://example.test/river",
              sourceOwner: "City of Parramatta",
              sourceStrength: "primary_live_gauge",
              sourceType: "river",
              isOfficial: false,
              isQualityControlled: true,
              limitations: ["Latest reading is recent cache rather than a fresh live fetch."],
              lastFetchedAt: "2026-06-29T03:00:00Z",
              latestObservedAt: "2026-06-29T02:40:00Z",
              freshnessStatus: "current",
              dataMode: "cached_recent",
              qualityNotes: ["River source using recent cache."],
            },
          ],
        },
      ],
    }),
    buildRegionalIngestionHealth: () => ({
      status: "warning",
      overallStatus: "partial",
      coreFloodStatus: "warn",
      contextStatus: "pass",
      warningStatus: "missing",
      ready: true,
      blockedAreaCount: 0,
      warningAreaCount: 1,
      summary: "Core flood awareness is running on degraded but usable evidence.",
      areas: [
        {
          areaId: "parramatta",
          areaName: "Parramatta, NSW",
          overallStatus: "partial",
          coreFloodStatus: "warn",
          contextStatus: "pass",
          warningStatus: "missing",
          areaRelevance: {
            status: "complete",
            score: 100,
            matchedSignals: 5,
            expectedSignals: 5,
            missingRiverStations: [],
          },
          sources: regionalSignals.areas.parramatta.sourceMetadata,
        },
      ],
    }),
    readAreaNotifications: async () => ({
      areaId: "parramatta",
      generatedAt: regionalSignals.ingestedAt,
      candidates: [
        {
          id: "parramatta-data_reliability_degraded",
          type: "data_reliability_degraded",
          notificationType: "data_quality_notice",
          severity: "info",
        },
      ],
      suppressed: [],
    }),
    readAreaWarningStatus: () => ({
      area: "Parramatta, NSW",
      source: "HazardWatch / NSW SES",
      contractVersion: "warning-adapter-v2",
      status: "not_configured",
      statusReason: "No live official warning source is configured for this area yet.",
      hasWarning: false,
      sourceName: "NSW SES HazardWatch",
      sourceUrl: "https://www.hazardwatch.gov.au/",
      relevanceMethod: "area-name-catchment-and-warning-type",
      sourceMode: "missing",
      freshnessMinutes: null,
      failureCategory: null,
      limitations: ["Official warning source is not currently connected."],
      adapterStatus: "not_configured",
      officialText: "Official warning source is not currently connected.",
    }),
    readAreaMlReadiness: async () => ({
      areaId: "parramatta",
      rows: 24,
      areas: ["Parramatta, NSW"],
      labelSource: "rule_derived",
      hasIndependentLabels: false,
      classBalance: { low: 18, elevated: 6 },
      readyForPrototypeTraining: false,
      readyForValidatedML: false,
      readyForTraining: false,
      reason: "Insufficient reliable history for training or comparison.",
    }),
    readAreaMlDataset: async () => ({
      areaId: "parramatta",
      areaName: "Parramatta, NSW",
      labelSource: "rule_derived",
      fields: [
        "areaId",
        "areaName",
        "observedAt",
        "rainfall1hMm",
        "riverDelta1hM",
        "targetElevatedConcern",
      ],
      generatedAt: "2026-06-29T03:00:00Z",
      rows: [
        {
          areaId: "parramatta",
          areaName: "Parramatta, NSW",
          observedAt: "2026-06-29T03:00:00Z",
          rainfall1hMm: 5,
          riverDelta1hM: 0.11,
          targetElevatedConcern: 1,
          labelSource: "rule_derived",
          warningActive: 0,
        },
      ],
      readiness: {
        rows: 1,
        labelSource: "rule_derived",
      },
    }),
    readAreaModelExperiment: async () => ({
      areaId: "parramatta",
      modelFamily: "tabular flood-signal baseline",
      status: "comparison-ready",
      candidates: [
        {
          name: "logistic tabular baseline",
          latestProbability: 0.72,
          latestLabel: "Elevated concern",
        },
      ],
    }),
    mlDatasetRowsToCsv: (rows) =>
      [
        "areaId,areaName,observedAt,rainfall1hMm,riverDelta1hM,targetElevatedConcern,labelSource,warningActive",
        `${rows[0].areaId},${rows[0].areaName},${rows[0].observedAt},${rows[0].rainfall1hMm},${rows[0].riverDelta1hM},${rows[0].targetElevatedConcern},${rows[0].labelSource},${rows[0].warningActive}`,
      ].join("\n"),
    readMlReport: async () => ({
      mode: "shadow",
      liveScoringEnabled: false,
      operationalUse: "disabled",
      labelSource: "rule_derived",
      readyForValidatedML: false,
      bestPrototypeModel: "random_forest",
      validationLevel: "prototype",
      predictionPreview: {
        predictedLabel: "Elevated concern",
        predictedProbability: 0.72,
        confidenceBand: "limited",
        confidenceReason: "Prototype labels remain sparse.",
        actualLabel: "Elevated concern",
      },
      modelAgreementWithRuleEngine: "agreeing",
      labelStrength: "rule_derived_or_weak",
      models: ["majority_baseline", "logistic_regression", "random_forest"],
      liveDecisionAuthority: "rule_engine",
      summary: "FloodGuard ML is implemented as a prototype shadow-mode comparison layer.",
      realExport: {
        available: true,
        rows: 3000,
        elevatedRows: 18,
        hasHighExamples: false,
        summary: "Real export is useful for pipeline validation but not meaningful predictive claims.",
        limitation: "Rule-derived labels and severe class imbalance limit interpretation.",
      },
      scenarioStressTest: {
        available: true,
        summary: "Synthetic scenario dataset validates ML plumbing only.",
        limitation: "Scenario metrics are not real-world validation.",
      },
      calibrationSummary: {
        available: true,
        summary: "Prototype calibration summary is available.",
      },
      historicalReplay: {
        available: true,
        rowCount: 998,
        windowCount: 3,
        areasCovered: ["parramatta", "north-parramatta", "toongabbie"],
        degradedRows: 627,
        highestAgreementRate: 0.611,
        summary: "Historical replay is available for rule, warning, source-state, decision-audit, and shadow-ML comparison.",
        limitation: "Replay supports review more strongly than validated event-level claims.",
      },
      targetSelection: {
        available: true,
        selectedTargetKind: "rule",
        selectedTargetColumn: "targetRuleElevated",
        readyForIndependentSupervision: false,
        reason: "Fallback to rule-derived target because event-labelled rows contain only 0 elevated example(s).",
        eventCandidate: {
          eligibleRowCount: 3000,
          positiveCount: 0,
          strengthCounts: { weak: 3000 },
        },
      },
      eventHoldout: {
        available: true,
        viable: false,
        strategy: "event_holdout_unavailable",
        reason: "No independent elevated event labels exist yet.",
        trainRows: 0,
        testRows: 0,
        trainPositiveCount: 0,
        testPositiveCount: 0,
      },
      acceptanceGates: {
        passedAll: false,
        bestNonBaselineModel: "random_forest",
        gates: [
          {
            name: "beats_majority_balanced_accuracy",
            passed: true,
            detail: "random_forest=0.805; majority_baseline=0.500",
          },
          {
            name: "non_zero_recall_on_elevated_events",
            passed: false,
            detail: "Event-holdout validation is not yet viable, so non-zero event recall cannot be claimed.",
          },
        ],
      },
      promotionPolicy: {
        currentStage: "shadow_mode",
        nextEligibleStage: null,
        stages: {
          shadow_mode: { status: "active", requirements: ["pipeline works", "metrics reported"] },
          review_mode: {
            status: "blocked",
            requirements: ["independent labels exist", "event-holdout tested", "expert review pending"],
            blockers: ["Event-holdout validation is not yet viable."],
          },
          advisory_mode: {
            status: "blocked",
            requirements: ["expert review completed", "validation robust", "safety policy approved"],
            blockers: ["Domain expert review is still pending."],
          },
        },
        never: ["official emergency authority"],
        summary: "ML remains in shadow_mode because supervision and validation are not yet strong enough for promotion.",
      },
      limitations: [
        "Rule-derived labels and severe class imbalance limit interpretation.",
        "Scenario metrics are not real-world validation.",
      ],
      reportAvailability: {
        historyReplaySummary: true,
      },
    }),
    readHistoricalSignals: async (_areaId, options = 24) => {
      const limit = typeof options === "number" ? options : (options.limit ?? 24);
      const baseRecord = {
        areaId: "parramatta",
        riskLevel: "Moderate",
        riskScore: 52,
        decisionReliability: { score: 82, level: "High" },
        decisionAuditSnapshot: { officialWarningContext: "not_configured" },
        sourceFreshness: [{ label: "FloodSmart rainfall", freshnessStatus: "current", mode: "live" }],
      };
      const records = [
        {
          ...baseRecord,
          ingestedAt: "2026-06-29T03:00:00.000Z",
        },
        {
          ...baseRecord,
          ingestedAt: "2026-06-29T02:00:00.000Z",
          riskLevel: "Low",
          riskScore: 18,
          decisionAuditSnapshot: { officialWarningContext: "warning_source_unavailable" },
          sourceFreshness: [{ label: "FloodSmart river", freshnessStatus: "stale", mode: "cached_stale" }],
          sourceReadings: [{ dataMode: "cached_stale" }],
        },
      ];
      return records.slice(0, limit);
    },
  };
}

test("health endpoint exposes layered statuses and core data modes", async () => {
  const { body } = await requestJson("/api/health", dependencies());
  assert.equal(body.ingestionHealth.overallStatus, "partial");
  assert.equal(body.ingestionHealth.coreFloodStatus, "warn");
  assert.equal(body.ingestionHealth.coreDataModes.parramatta[0].dataMode, "live_summary_fallback");
});

test("ingestion observability endpoint explains degraded source status explicitly", async () => {
  const { body } = await requestJson("/api/ingestion-observability", dependencies());
  assert.equal(body.refreshStatus, "refreshed");
  assert.ok(Array.isArray(body.failureTaxonomy));
  assert.match(body.debugLine, /degraded honestly|live/i);
  assert.ok(Array.isArray(body.areas));
  assert.equal(body.areas[0].sources[0].contractVersion, "ingestion-observability-v2");
});

test("risk endpoint returns features, pressure scores, and excluded signals contract", async () => {
  const { body } = await requestJson("/api/risk/parramatta", dependencies());
  assert.equal(body.concernLevel, "Moderate");
  assert.equal(body.contractVersion, "risk-intelligence-v2");
  assert.equal(typeof body.features.rainfall1hMm, "number");
  assert.equal(typeof body.pressureScores.rainfallPressure, "number");
  assert.ok(Array.isArray(body.excludedSignals));
  assert.equal(body.notificationEligibility.notificationType, "awareness_notice");
  assert.equal(body.hazardPressure.rainfall, "watch");
  assert.equal(body.evidenceConfidence, "high");
  assert.equal(body.officialWarningContext, "not_configured");
  assert.equal(body.recommendationType, "monitor_and_check_official_sources");
  assert.ok(body.decisionSummary.primaryConcernDriver.length > 0);
  assert.ok(body.decisionSummary.primaryReliabilityMessage.length > 0);
  assert.ok(body.decisionSummary.recommendedUserFocus.includes("NSW SES"));
  assert.ok(Array.isArray(body.decisionRecommendation.nextSteps));
  assert.equal(body.decisionAudit.contractVersion, "risk-intelligence-v2");
  assert.equal(body.decisionAudit.hazardPressure.rainfall, "watch");
  assert.equal(body.decisionAudit.evidenceConfidence, "high");
  assert.equal(body.decisionAudit.officialWarningContext, "not_configured");
  assert.equal(body.decisionAudit.recommendationType, "monitor_and_check_official_sources");
  assert.ok(Array.isArray(body.decisionAudit.whatIncreasedConcern));
  assert.ok(Array.isArray(body.decisionAudit.whatReducedConcern));
  assert.ok(Array.isArray(body.decisionAudit.checkNext));
});

test("source registry endpoint exposes source evidence and data modes per area", async () => {
  const { body } = await requestJson("/api/source-registry", dependencies());
  assert.equal(body.areas[0].area, "parramatta");
  assert.equal(body.areas[0].sources[1].dataMode, "cached_recent");
  assert.equal(body.areas[0].sources[0].sourceOwner, "City of Parramatta");
  assert.equal(body.areas[0].sources[0].sourceType, "rainfall");
});

test("notifications endpoint returns current notification candidates", async () => {
  const { body } = await requestJson("/api/notifications/parramatta", dependencies());
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.candidates[0].type, "data_reliability_degraded");
  assert.equal(body.candidates[0].notificationType, "data_quality_notice");
});

test("notifications preview endpoint returns the same stable contract", async () => {
  const { body } = await requestJson("/api/notifications/preview/parramatta", dependencies());
  assert.equal(body.areaId, "parramatta");
  assert.ok(Array.isArray(body.suppressed));
});

test("warnings endpoint returns separate official warning status", async () => {
  const { body } = await requestJson("/api/warnings/parramatta", dependencies());
  assert.equal(body.area, "Parramatta, NSW");
  assert.equal(body.source, "HazardWatch / NSW SES");
  assert.equal(body.status, "not_configured");
  assert.equal(body.adapterStatus, "not_configured");
  assert.equal(body.contractVersion, "warning-adapter-v2");
  assert.equal(body.relevanceMethod, "area-name-catchment-and-warning-type");
  assert.equal(body.sourceMode, "missing");
  assert.equal(body.failureCategory, null);
  assert.equal(body.freshnessMinutes, null);
  assert.match(body.statusReason, /configured/i);
  assert.ok(Array.isArray(body.limitations));
  assert.equal(body.sourceName, "NSW SES HazardWatch");
});

test("ml readiness endpoint reports honest training readiness state", async () => {
  const { body } = await requestJson("/api/ml/readiness/parramatta", dependencies());
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.labelSource, "rule_derived");
  assert.equal(body.hasIndependentLabels, false);
  assert.equal(body.readyForPrototypeTraining, false);
  assert.equal(body.readyForValidatedML, false);
  assert.equal(body.readyForTraining, false);
});

test("ml dataset endpoint returns required rows and explicit label source", async () => {
  const { body } = await requestJson("/api/ml/dataset/parramatta", dependencies());
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.labelSource, "rule_derived");
  assert.ok(Array.isArray(body.rows));
  assert.equal(body.rows[0].targetElevatedConcern, 1);
  assert.equal(body.rows[0].labelSource, "rule_derived");
  assert.equal(typeof body.rows[0].rainfall1hMm, "number");
});

test("ml dataset endpoint exports csv rows without crashing", async () => {
  const { statusCode, headers, body } = await requestText(
    "/api/ml/dataset/parramatta?format=csv",
    dependencies(),
  );
  assert.equal(statusCode, 200);
  assert.match(headers["content-type"], /text\/csv/i);
  assert.match(body, /areaId,areaName,observedAt/);
  assert.match(body, /rule_derived/);
});

test("ml report endpoint returns stable shadow-mode contract", async () => {
  const { statusCode, body } = await requestJson("/api/ml/report", dependencies());
  assert.equal(statusCode, 200);
  assert.equal(body.mode, "shadow");
  assert.equal(body.liveScoringEnabled, false);
  assert.equal(body.readyForValidatedML, false);
  assert.equal(body.liveDecisionAuthority, "rule_engine");
  assert.equal(body.bestPrototypeModel, "random_forest");
  assert.equal(body.validationLevel, "prototype");
  assert.equal(body.modelAgreementWithRuleEngine, "agreeing");
  assert.equal(body.labelStrength, "rule_derived_or_weak");
  assert.ok(Array.isArray(body.models));
  assert.equal(body.predictionPreview.predictedLabel, "Elevated concern");
  assert.equal(body.historicalReplay.available, true);
  assert.equal(body.historicalReplay.windowCount, 3);
  assert.equal(body.historicalReplay.degradedRows, 627);
  assert.equal(body.reportAvailability.historyReplaySummary, true);
  assert.equal(body.targetSelection.selectedTargetKind, "rule");
  assert.equal(body.targetSelection.selectedTargetColumn, "targetRuleElevated");
  assert.equal(body.targetSelection.readyForIndependentSupervision, false);
  assert.match(body.targetSelection.reason, /rule-derived target/i);
  assert.equal(body.eventHoldout.available, true);
  assert.equal(body.eventHoldout.viable, false);
  assert.match(body.eventHoldout.reason, /event labels|event holdout|independent/i);
  assert.equal(body.acceptanceGates.passedAll, false);
  assert.ok(Array.isArray(body.acceptanceGates.gates));
  assert.equal(body.promotionPolicy.currentStage, "shadow_mode");
  assert.equal(body.promotionPolicy.nextEligibleStage, null);
  assert.match(body.promotionPolicy.summary, /shadow/i);
  assert.ok(Array.isArray(body.limitations));
  assert.match(body.realExport.limitation, /Rule-derived|imbalance/i);
  assert.match(body.scenarioStressTest.limitation, /not real-world validation|synthetic/i);
});

test("ml prediction preview endpoint returns safe shadow-mode comparison for an area", async () => {
  const { statusCode, body } = await requestJson("/api/ml/prediction-preview/parramatta", dependencies());
  assert.equal(statusCode, 200);
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.ruleConcern, "Moderate");
  assert.equal(body.mlPrediction, "Elevated concern");
  assert.equal(body.mlProbability, 0.72);
  assert.equal(body.agreement, true);
  assert.equal(body.authority, "rule_engine");
  assert.equal(body.mode, "shadow");
  assert.equal(body.previewSource, "local_shadow_baseline");
});

test("ingestion readiness endpoint separates submission readiness from strict live readiness", async () => {
  const submission = await requestJson("/api/ingestion-readiness", dependencies());
  const live = await requestJson("/api/ingestion-readiness?mode=live", dependencies());

  assert.equal(submission.statusCode, 200);
  assert.equal(submission.body.checkName, "ingestion-readiness");
  assert.equal(submission.body.result, "pass_with_degraded_external_source");
  assert.equal(submission.body.submissionBlocking, false);

  assert.equal(live.statusCode, 200);
  assert.equal(live.body.checkName, "ingestion-readiness-live");
  assert.equal(live.body.result, "fail");
  assert.equal(live.body.liveOperationalReady, false);
});

test("history endpoint keeps the legacy array contract by default", async () => {
  const { statusCode, body } = await requestJson("/api/history?area=parramatta&limit=2", dependencies());
  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2);
  assert.equal(body[0].ingestedAt, "2026-06-29T03:00:00.000Z");
});

test("history endpoint can return a window summary for replay and calibration review", async () => {
  const { statusCode, body } = await requestJson(
    "/api/history?area=parramatta&limit=10&start=2026-06-29T01:00:00Z&end=2026-06-29T03:00:00Z&includeSummary=true",
    dependencies(),
  );
  assert.equal(statusCode, 200);
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.filters.startTime, "2026-06-29T01:00:00.000Z");
  assert.equal(body.filters.endTime, "2026-06-29T03:00:00.000Z");
  assert.equal(body.summary.recordCount, 2);
  assert.equal(body.summary.degradedRecordCount, 1);
  assert.equal(body.summary.riskLevelCounts.Moderate, 1);
  assert.equal(body.summary.warningContextCounts.not_configured, 1);
  assert.ok(Array.isArray(body.records));
});

test("history endpoint rejects invalid time-window filters safely", async () => {
  const { statusCode, body } = await requestJson(
    "/api/history?area=parramatta&start=not-a-time&includeSummary=true",
    dependencies(),
  );
  assert.equal(statusCode, 400);
  assert.match(body.error, /valid ISO timestamp/i);
});

test("signals endpoint returns weather, rainfall, river, and source metadata", async () => {
  const { body } = await requestJson("/api/signals/parramatta", dependencies());
  assert.equal(body.rainfallSeries.latestValidRainfallMm, 5);
  assert.equal(body.riverContext.stationCount, 1);
  assert.equal(body.weatherObservations.stationName, "Parramatta North");
  assert.ok(Array.isArray(body.sourceMetadata));
});

test("unknown area returns 404 instead of leaking default area data", async () => {
  const { statusCode, body } = await requestJson("/api/signals/unknown-area", dependencies());
  assert.equal(statusCode, 404);
  assert.match(body.error, /Unknown area/i);
});
