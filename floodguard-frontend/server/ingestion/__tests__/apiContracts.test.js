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
      concernLevel: "Moderate",
      score: 52,
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
      hasWarning: false,
      sourceName: "NSW SES HazardWatch",
      sourceUrl: "https://www.hazardwatch.gov.au/",
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
      limitations: [
        "Rule-derived labels and severe class imbalance limit interpretation.",
        "Scenario metrics are not real-world validation.",
      ],
    }),
  };
}

test("health endpoint exposes layered statuses and core data modes", async () => {
  const { body } = await requestJson("/api/health", dependencies());
  assert.equal(body.ingestionHealth.overallStatus, "partial");
  assert.equal(body.ingestionHealth.coreFloodStatus, "warn");
  assert.equal(body.ingestionHealth.coreDataModes.parramatta[0].dataMode, "live_summary_fallback");
});

test("risk endpoint returns features, pressure scores, and excluded signals contract", async () => {
  const { body } = await requestJson("/api/risk/parramatta", dependencies());
  assert.equal(body.concernLevel, "Moderate");
  assert.equal(typeof body.features.rainfall1hMm, "number");
  assert.equal(typeof body.pressureScores.rainfallPressure, "number");
  assert.ok(Array.isArray(body.excludedSignals));
  assert.equal(body.notificationEligibility.notificationType, "awareness_notice");
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
  assert.equal(body.adapterStatus, "not_configured");
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
  assert.equal(body.targetSelection.selectedTargetKind, "rule");
  assert.equal(body.targetSelection.selectedTargetColumn, "targetRuleElevated");
  assert.equal(body.targetSelection.readyForIndependentSupervision, false);
  assert.match(body.targetSelection.reason, /rule-derived target/i);
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
