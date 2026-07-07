import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:5174";

const pilotAreas = [
  {
    id: "parramatta",
    name: "Parramatta, NSW",
    catchment: "Parramatta River",
    nearestStationDistanceKm: 0,
    riskScore: 11,
  },
  {
    id: "north-parramatta",
    name: "North Parramatta, NSW",
    catchment: "Darling Mills Creek / Parramatta River",
    nearestStationDistanceKm: 0.2,
    riskScore: 13,
  },
  {
    id: "toongabbie",
    name: "Toongabbie, NSW",
    catchment: "Toongabbie Creek",
    nearestStationDistanceKm: 0.6,
    riskScore: 17,
  },
];

function areaById(areaId) {
  return pilotAreas.find((area) => area.id === areaId) ?? pilotAreas[0];
}

function buildRainfallPoints() {
  return [
    ["2026-06-28T00:00:00Z", 5.2],
    ["2026-06-29T00:00:00Z", 3.1],
    ["2026-06-30T00:00:00Z", 0.8],
    ["2026-07-01T00:00:00Z", 0.0],
    ["2026-07-02T00:00:00Z", 0.0],
    ["2026-07-03T00:00:00Z", 0.0],
    ["2026-07-04T00:00:00Z", 0.0],
  ].map(([time, rainfallMm]) => ({ time, rainfallMm }));
}

function buildSignalFixture(areaId, { degraded = false, warningUnavailable = false } = {}) {
  const area = areaById(areaId);
  const coreFreshnessStatus = degraded ? "stale" : "current";
  const rainfallMode = degraded ? "cached_stale" : "remote";
  const riverMode = degraded ? "cached_stale" : "remote";
  const overallStatus = degraded ? "partial" : "live";
  const evidenceConfidence = degraded ? "partial" : "high";
  const reliabilityScore = degraded ? 61 : 99;

  return {
    area: {
      id: area.id,
      name: area.name,
    },
    location: {
      name: area.name,
      region: "Greater Sydney",
      lat: -33.815,
      lon: 151.001,
    },
    ingestedAt: "2026-07-04T03:30:00Z",
    refreshMetadata: {
      servedAt: "2026-07-04T03:30:30Z",
      status: degraded ? "cached" : "refreshed",
    },
    weatherObservations: {
      stationName: `${area.name.replace(", NSW", "")} weather station`,
      observedAt: degraded ? "2026-07-03T21:00:00Z" : "2026-07-04T03:20:00Z",
      rainfallTraceMm: 0,
      cloud: "Clear",
      visibilityKm: 20,
      windDirection: "WNW",
      windSpeedKmh: 4,
      cloudOktas: 1,
    },
    rainfallSeries: {
      latestValidRainfallMm: 0,
      sourceLabel: `${area.name.replace(", NSW", "")} rainfall gauge`,
      points: buildRainfallPoints(),
    },
    riverContext: {
      issuedDate: "2026-07-04T03:25:00Z",
      stationCount: 3,
      primaryStation: {
        stationName: "Parramatta River at Riverside Theatre",
        heightM: 0.97,
        tendency: degraded ? "steady" : "steady",
      },
      stations: [
        {
          stationName: "Parramatta River at Riverside Theatre",
          heightM: 0.97,
          tendency: "steady",
        },
        {
          stationName: "Duck River",
          heightM: 0.61,
          tendency: "steady",
        },
        {
          stationName: "Toongabbie Creek",
          heightM: 0.42,
          tendency: "steady",
        },
      ],
    },
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: rainfallMode,
        dataMode: rainfallMode,
        freshnessStatus: coreFreshnessStatus,
        sourceStrength: "primary_live_gauge",
        observedAt: degraded ? "2026-07-03T18:30:00Z" : "2026-07-04T03:20:00Z",
        fetchedAt: "2026-07-04T03:30:00Z",
        note: degraded
          ? "Rainfall source is older cached evidence and cannot support live claims."
          : "Current rainfall gauge reading is available.",
        areaRelevance: ["67111"],
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: riverMode,
        dataMode: riverMode,
        freshnessStatus: coreFreshnessStatus,
        sourceStrength: "primary_live_gauge",
        observedAt: degraded ? "2026-07-03T18:10:00Z" : "2026-07-04T03:25:00Z",
        fetchedAt: "2026-07-04T03:30:00Z",
        note: degraded
          ? "River source is older cached evidence and cannot support live claims."
          : "Current river gauge reading is available.",
        areaRelevance: ["Parramatta River at Riverside Theatre"],
      },
      {
        label: "Parramatta weather observations",
        type: "weather",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "official_backup",
        observedAt: "2026-07-04T03:20:00Z",
        fetchedAt: "2026-07-04T03:30:00Z",
        note: "Current weather context is available.",
        areaRelevance: ["Parramatta North"],
      },
      {
        label: "NSW SES / HazardWatch",
        type: "warnings",
        mode: warningUnavailable ? "remote" : "not-configured",
        dataMode: warningUnavailable ? "remote" : "not-configured",
        freshnessStatus: warningUnavailable ? "missing" : "not-connected",
        status: warningUnavailable ? "failed" : "not-connected",
        sourceStrength: "official_warning_feed",
        observedAt: null,
        fetchedAt: warningUnavailable ? "2026-07-04T03:30:00Z" : null,
        note: warningUnavailable
          ? "Official warning source could not be fetched safely."
          : "Official warning feed is not connected yet.",
        failureCategory: warningUnavailable ? "source_unavailable" : null,
        areaRelevance: [area.name.replace(", NSW", "")],
      },
    ],
    freshness: {
      staleSourceCount: degraded ? 2 : 0,
      fallbackSourceCount: 0,
      failedSourceCount: 0,
    },
    dataQuality: {
      missing: degraded ? ["fresh rainfall", "fresh river"] : [],
      coverageScore: degraded ? 72 : 100,
    },
    areaRelevance: {
      status: "complete",
      score: 100,
      notes: [`Signal mapping is configured for ${area.name.replace(", NSW", "")}.`],
    },
    spatialRelevance: {
      coverageRadiusKm: 1.2,
      nearestStationDistanceKm: area.nearestStationDistanceKm,
      notes: ["Nearest configured gauge remains inside the local pilot area."],
    },
    publicSignalSummary: {
      recentReports: 3,
      actionableReports: 1,
      imageEvidenceReports: 0,
      imageReviewQueueCount: 0,
      urgentImageReviewCount: 0,
      elevatedImageReviewCount: 0,
      publicSignalPressure: 5,
      note: "Recent public signals remain low severity.",
    },
    warningSummary: {
      status: "no_current_warning",
      statusLabel: "No current official warning",
      warningCount: 0,
      warnings: [],
    },
    ingestionHealth: {
      overallStatus,
      coreFloodStatus: degraded ? "warn" : "pass",
      contextStatus: "pass",
      warningStatus: warningUnavailable ? "source_unavailable" : "missing",
      summary: degraded
        ? "Core gauges are degraded, so FloodGuard labels the current view conservatively."
        : "Core flood gauges are current for this prototype snapshot.",
    },
    riskAssessment: {
      concernLevel: "Low",
      score: area.riskScore,
      summary: `FloodGuard currently indicates low immediate flood concern for ${area.name.replace(", NSW", "")} while continuing to monitor rainfall and river conditions.`,
      reasons: [
        "Rainfall remains below the stronger concern windows.",
        "River trend remains steady across the current stations.",
      ],
      signals: {
        rainfallPressure: 0,
        riverPressure: 27,
        wetnessPressure: 0,
        publicSignalPressure: 6,
        confidence: degraded ? 61 : 99,
      },
      decisionAudit: {
        hazardPressure: {
          rainfall: "low",
          river: "stable",
          wetness: "low",
        },
        evidenceConfidence,
        officialWarningContext: "not_configured",
        recommendationType: "monitor_and_check_official_sources",
        whatIncreasedConcern: ["Rainfall remains below the stronger concern windows."],
        whatReducedConcern: ["River trend is stable, which lowers concern."],
        excludedEvidence: degraded
          ? ["Older cached rainfall and river readings are excluded from live claims."]
          : [],
        sourceLimitations: degraded
          ? ["Core rainfall and river evidence is older cached data, so FloodGuard avoids presenting it as live."]
          : ["Official warning feed is not connected yet, so FloodGuard cannot verify warning context automatically."],
        checkNext: [
          "Check official NSW SES and BoM advice.",
          "Monitor local rainfall and river trends.",
          "Prepare to act according to official emergency advice.",
        ],
        reliability: {
          score: reliabilityScore,
          level: degraded ? "Moderate" : "High",
        },
      },
    },
  };
}

function buildMlReportFixture() {
  return {
    mode: "shadow",
    liveScoringEnabled: false,
    operationalUse: "disabled",
    labelSource: "rule_derived",
    readyForValidatedML: false,
    models: ["majority_baseline", "logistic_regression", "random_forest", "extra_trees"],
    liveDecisionAuthority: "rule_engine",
    summary:
      "FloodGuard ML is implemented as a prototype shadow-mode comparison layer.",
    bestPrototypeModel: "random_forest",
    targetSelection: {
      available: true,
      selectedTargetKind: "rule",
      selectedTargetColumn: "targetRuleElevated",
      readyForIndependentSupervision: false,
      reason: "Independent event labels are still too limited, so ML remains rule-derived.",
      eventCandidate: null,
    },
    realExport: {
      available: true,
      rows: 3000,
      elevatedRows: 18,
      eventLabelRows: 24,
      eventPositiveCount: 2,
      eventLabelCoverage: 0.8,
      hasHighExamples: false,
      bestPrototypeModel: "random_forest",
      summary:
        "Real export is useful for pipeline validation but not meaningful predictive claims.",
      limitation:
        "Rule-derived labels, no independent flood outcomes, and a highly imbalanced elevated class limit real-world interpretation.",
      warnings: ["Only a small number of elevated rows are currently available."],
    },
    scenarioStressTest: {
      available: true,
      summary: "Synthetic scenario dataset validates ML plumbing only.",
      limitation:
        "Scenario stress-test results show model behaviour on synthetic cases, not real-world flood prediction accuracy.",
      warnings: [],
    },
    promotionPolicy: {
      currentStage: "shadow_mode",
      nextEligibleStage: "review_mode",
      summary:
        "FloodGuard keeps ML in shadow mode until stronger labels and expert review exist.",
      stages: {
        shadow_mode: { status: "active", requirements: ["pipeline works", "metrics reported"] },
        review_mode: {
          status: "blocked",
          requirements: ["independent labels exist", "event-holdout tested"],
          blockers: ["Independent elevated labels remain too limited."],
        },
        advisory_mode: {
          status: "blocked",
          requirements: ["expert review completed", "validation robust"],
          blockers: ["Shadow mode is still the only safe operating stage."],
        },
      },
      never: ["official emergency authority"],
    },
  };
}

function buildModelExperimentFixture() {
  return {
    modelFamily: "tabular flood-signal baseline",
    status: "ready",
    rowCount: 3000,
    classBalance: {
      elevatedCount: 18,
      lowCount: 2982,
      status: "imbalanced",
    },
    readiness: {
      readyForComparison: true,
      note: "Prototype comparison models are available for shadow-mode review.",
    },
    candidates: [
      {
        name: "logistic_regression",
        latestProbability: 0.11,
        latestLabel: "Low concern",
      },
      {
        name: "random_forest",
        latestProbability: 0.08,
        latestLabel: "Low concern",
      },
    ],
    safeguards: ["Rule engine remains the live authority."],
  };
}

async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installMockFloodguardApi(
  page,
  { degradedAreaIds = [], warningUnavailableAreaIds = [], mlReportUnavailable = false } = {},
) {
  await page.route(`${apiBaseUrl}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const areaId = url.searchParams.get("area") ?? "parramatta";
    const isDegraded = degradedAreaIds.includes(areaId);
    const warningUnavailable = warningUnavailableAreaIds.includes(areaId);

    if (url.pathname === "/api/areas") {
      await fulfillJson(route, pilotAreas);
      return;
    }

    if (url.pathname === "/api/signals") {
      await fulfillJson(route, buildSignalFixture(areaId, { degraded: isDegraded, warningUnavailable }));
      return;
    }

    if (url.pathname === "/api/history") {
      await fulfillJson(route, [
        {
          observedAt: "2026-07-04T03:20:00Z",
          ingestedAt: "2026-07-04T03:20:00Z",
          riskScore: 11,
          rainfall: {
            latestValidRainfallMm: 0,
            sourceLabel: "FloodSmart rainfall",
          },
          river: {
            primaryHeightM: 0.97,
            primaryStationName: "Parramatta River at Riverside Theatre",
          },
        },
        {
          observedAt: "2026-07-03T03:20:00Z",
          ingestedAt: "2026-07-03T03:20:00Z",
          riskScore: 13,
          rainfall: {
            latestValidRainfallMm: 0,
            sourceLabel: "FloodSmart rainfall",
          },
          river: {
            primaryHeightM: 0.99,
            primaryStationName: "Parramatta River at Riverside Theatre",
          },
        },
      ]);
      return;
    }

    if (url.pathname === "/api/community-reports") {
      if (route.request().method() === "POST") {
        await fulfillJson(route, { id: "demo-report", status: "received" });
        return;
      }
      await fulfillJson(route, []);
      return;
    }

    if (url.pathname === "/api/evidence-review") {
      await fulfillJson(route, {
        itemCount: 0,
        urgentCount: 0,
        elevatedCount: 0,
        routineCount: 0,
        privacyNote: "No queued image evidence needs manual review right now.",
        items: [],
      });
      return;
    }

    if (url.pathname === "/api/features") {
      await fulfillJson(route, {
        rows: [],
        summary: {
          rowCount: 14,
          elevatedCount: 1,
          readyForTraining: true,
          readinessNote: "Feature history is available for prototype comparison.",
        },
      });
      return;
    }

    if (url.pathname === "/api/notifications") {
      await fulfillJson(route, {
        candidates: [
          {
            id: `notice-${areaId}`,
            notificationType: "awareness_notice",
            title: `FloodGuard data reliability restored for ${areaById(areaId).name}`,
            message:
              "Evidence quality improved from blocked to live. Live core gauges are available again.",
            severity: "Low",
          },
        ],
        suppressed: [],
      });
      return;
    }

    if (url.pathname === "/api/dataset-quality") {
      await fulfillJson(route, {
        rowCount: 3000,
        elevatedCount: 18,
        lowCount: 2982,
        readyForModelComparison: true,
        classBalanceStatus: "severely_imbalanced",
        averageReliabilityScore: 82,
        gates: [],
        warnings: ["Dataset is still too imbalanced for validated ML claims."],
      });
      return;
    }

    if (url.pathname === "/api/baseline-prediction") {
      await fulfillJson(route, {
        modelName: "transparent feature baseline",
        status: "ready",
        prediction: { label: "Low concern", probability: 0.1 },
        evaluation: {
          sampleSize: 3000,
          accuracy: 0.994,
          truePositive: 8,
          trueNegative: 2974,
          falsePositive: 8,
          falseNegative: 10,
        },
        readiness: {
          readyForExperiment: true,
          rowCount: 3000,
          elevatedExamples: 18,
          note: "Baseline comparison is available.",
        },
      });
      return;
    }

    if (url.pathname === "/api/model-experiment") {
      await fulfillJson(route, buildModelExperimentFixture());
      return;
    }

    if (url.pathname === "/api/model-card") {
      await fulfillJson(route, {
        modelName: "FloodGuard shadow comparison",
        modelType: "tabular ensemble prototype",
        status: "ready",
        target: "Rule-derived ML target",
        scoreFormula: "Prototype only",
        readiness: {
          readyForExperiment: true,
          rowCount: 3000,
          elevatedExamples: 18,
          note: "Model card is available for review.",
        },
        limitations: ["Model stays in shadow mode until stronger labels exist."],
        nextModelCandidates: ["random_forest", "extra_trees"],
      });
      return;
    }

    if (url.pathname === "/api/ml/report") {
      if (mlReportUnavailable) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "ML report temporarily unavailable" }),
        });
        return;
      }
      await fulfillJson(route, buildMlReportFixture());
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `Unhandled test route for ${url.pathname}` }),
    });
  });
}

test("resident-facing overview renders key FloodGuard cards", async ({ page }) => {
  await installMockFloodguardApi(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "FloodGuard", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parramatta, NSW", exact: true })).toBeVisible();
  await expect(page.getByText("Current concern level", { exact: true })).toBeVisible();
  await expect(page.getByText("Evidence reliability", { exact: true })).toBeVisible();
  await expect(page.getByText("Key concern drivers", { exact: true })).toBeVisible();
  await expect(page.getByText("What should I check next?")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent rainfall trend" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Risk signal breakdown" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent public signals" })).toBeVisible();
  await expect(page.getByText("ML prototype layer")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source status at a glance" })).toBeVisible();
});

test("area switcher updates the monitored region content for each pilot suburb", async ({ page }) => {
  await installMockFloodguardApi(page);

  await page.goto("/");

  await page.getByRole("button", { name: "North Parramatta" }).click();
  await expect(
    page.getByRole("heading", { name: "North Parramatta, NSW", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Toongabbie" }).click();
  await expect(page.getByRole("heading", { name: "Toongabbie, NSW", exact: true })).toBeVisible();
});

test("degraded source fixture keeps stale evidence visible without presenting it as live", async ({
  page,
}) => {
  await installMockFloodguardApi(page, { degradedAreaIds: ["parramatta"] });

  await page.goto("/");

  await expect(page.getByText("Partly, some evidence is limited")).toBeVisible();
  await expect(page.getByText("2 stale source")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source status at a glance" })).toBeVisible();
  await expect(page.getByText("Stale").first()).toBeVisible();
  await expect(page.getByText("Live gauge")).toHaveCount(0);
});

test("official warning source unavailable is visible and does not crash dashboard", async ({
  page,
}) => {
  await installMockFloodguardApi(page, { warningUnavailableAreaIds: ["parramatta"] });

  await page.goto("/");

  await expect(page.getByText("Official warning source could not be fetched safely.")).toBeVisible();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Current concern level", { exact: true })).toBeVisible();
  await expect(page.getByText("ML prototype layer")).toBeVisible();
});

test("missing ML report falls back to shadow-only copy without crashing", async ({ page }) => {
  await installMockFloodguardApi(page, { mlReportUnavailable: true });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Shadow-mode snapshot" })).toBeVisible();
  await page.getByRole("button", { name: "Model" }).click();
  await expect(page.getByRole("heading", { name: "Shadow-mode comparison" })).toBeVisible();
  await expect(page.getByText("Historical ML evaluation is unavailable.")).toBeVisible();
  await expect(page.getByText("Scenario stress-test report is unavailable.")).toBeVisible();
  await expect(page.getByText("ML is shown for comparison only and does not trigger alerts.")).toBeVisible();
});

test("scenario stress-test mode is clearly labelled as simulated and does not look live", async ({
  page,
}) => {
  await installMockFloodguardApi(page);

  await page.goto("/");

  await page.getByLabel("View mode").selectOption("scenario-stress");

  await expect(page.getByLabel("View mode")).toHaveValue("scenario-stress");
  await expect(page.getByText("Simulated demo mode", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Simulated scenario rows are shown for explanation and demo only."),
  ).toBeVisible();
  await expect(page.getByText("Watch and Act (simulated)")).toBeVisible();
  await expect(page.getByText("Demo/Fallback").first()).toBeVisible();
  await expect(page.getByText("Simulated stress-test for Parramatta")).toBeVisible();
});
