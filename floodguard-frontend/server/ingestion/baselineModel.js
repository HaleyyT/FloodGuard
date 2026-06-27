function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function classify(score) {
  return score >= 45 ? 1 : 0;
}

function predictionLabel(value) {
  return value === 1 ? "Elevated concern" : "Low concern";
}

function scoreRow(row) {
  const pressureScore =
    row.rainfallPressure * 0.35 + row.riverPressure * 0.3 + row.wetnessPressure * 0.2;
  const shortRainMomentum = (row.rainfall1hMm ?? 0) * 3 + (row.rainfall3hMm ?? 0) * 2;
  const riverMomentum =
    row.risingRiverStations * 10 + Math.max(row.riverHeightDeltaM ?? 0, 0) * 20;
  const tendencyScore = riverMomentum + Math.max(row.scoreDelta ?? 0, 0) * 1.5;
  const qualityPenalty =
    row.staleSourceCount * 10 + row.fallbackSourceCount * 6 + row.failedSourceCount * 20;
  const reliabilitySupport =
    (row.decisionReliabilityScore ?? 0) * 0.1 + (row.dataFreshnessScore ?? 0) * 0.05;
  const rawScore =
    pressureScore + shortRainMomentum + tendencyScore + reliabilitySupport - qualityPenalty;

  return clamp(Math.round(rawScore));
}

const modelInputs = [
  {
    field: "rainfall1hMm",
    role: "rainfall-window",
    explanation: "Very recent rainfall adds short-term rainfall momentum.",
  },
  {
    field: "rainfall3hMm",
    role: "rainfall-window",
    explanation: "Three-hour rainfall helps detect fast-moving local events.",
  },
  {
    field: "rainfallPressure",
    role: "pressure",
    explanation: "Higher rainfall pressure increases predicted local concern.",
  },
  {
    field: "riverPressure",
    role: "pressure",
    explanation: "Higher river pressure increases predicted local concern.",
  },
  {
    field: "wetnessPressure",
    role: "pressure",
    explanation: "Antecedent wetness supports the pressure score.",
  },
  {
    field: "risingRiverStations",
    role: "trend",
    explanation: "Rising stations add a worsening-condition signal.",
  },
  {
    field: "riverHeightDeltaM",
    role: "river-baseline",
    explanation: "River height above the recent station baseline adds level momentum.",
  },
  {
    field: "scoreDelta",
    role: "trend",
    explanation: "Recent rule-score increases add short-term momentum.",
  },
  {
    field: "dataFreshnessScore",
    role: "quality",
    explanation: "Fresh source observations make the transparent baseline more trustworthy.",
  },
  {
    field: "decisionReliabilityScore",
    role: "support",
    explanation: "More reliable decision inputs support the baseline score.",
  },
  {
    field: "staleSourceCount",
    role: "penalty",
    explanation: "Stale source rows reduce model confidence.",
  },
  {
    field: "fallbackSourceCount",
    role: "penalty",
    explanation: "Fallback source rows reduce model confidence.",
  },
  {
    field: "failedSourceCount",
    role: "penalty",
    explanation: "Failed source rows heavily reduce model confidence.",
  },
];

function evaluateRows(rows) {
  if (rows.length === 0) {
    return {
      sampleSize: 0,
      accuracy: null,
      accuracyStatus: "waiting-for-history",
      actualElevated: 0,
      actualLow: 0,
      truePositive: 0,
      trueNegative: 0,
      falsePositive: 0,
      falseNegative: 0,
    };
  }

  const confusion = rows.reduce(
    (counts, row) => {
      const predicted = classify(scoreRow(row));
      const actual = row.targetElevatedConcern;

      if (predicted === 1 && actual === 1) counts.truePositive += 1;
      else if (predicted === 0 && actual === 0) counts.trueNegative += 1;
      else if (predicted === 1 && actual === 0) counts.falsePositive += 1;
      else counts.falseNegative += 1;

      return counts;
    },
    { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 },
  );
  const correct = confusion.truePositive + confusion.trueNegative;
  const actualElevated = confusion.truePositive + confusion.falseNegative;
  const actualLow = confusion.trueNegative + confusion.falsePositive;
  const hasClassBalance = actualElevated > 0 && actualLow > 0;

  return {
    sampleSize: rows.length,
    accuracy: hasClassBalance ? Math.round((correct / rows.length) * 100) : null,
    accuracyStatus: hasClassBalance ? "balanced-history" : "single-class-history",
    actualElevated,
    actualLow,
    ...confusion,
  };
}

export function buildBaselinePrediction(featureRows = []) {
  const latest = featureRows.at(-1) ?? null;
  const evaluationRows = featureRows.slice(0, -1);
  const evaluation = evaluateRows(evaluationRows);
  const elevatedExamples = featureRows.filter((row) => row.targetElevatedConcern === 1).length;

  if (!latest) {
    return {
      modelName: "transparent feature baseline",
      status: "waiting-for-history",
      prediction: null,
      evaluation,
      readiness: {
        readyForExperiment: false,
        rowCount: 0,
        elevatedExamples: 0,
        note: "Collect history before running the baseline prediction.",
      },
    };
  }

  const score = scoreRow(latest);
  const predictedElevatedConcern = classify(score);

  return {
    modelName: "transparent feature baseline",
    status: featureRows.length >= 30 && elevatedExamples >= 5 ? "experiment-ready" : "collecting-history",
    prediction: {
      areaId: latest.areaId,
      areaName: latest.areaName,
      ingestedAt: latest.ingestedAt,
      score,
      predictedElevatedConcern,
      label: predictionLabel(predictedElevatedConcern),
      agreesWithRuleEngine: predictedElevatedConcern === latest.targetElevatedConcern,
      ruleEngineLabel: predictionLabel(latest.targetElevatedConcern),
      drivers: [
        `1h rainfall ${latest.rainfall1hMm ?? 0} mm`,
        `3h rainfall ${latest.rainfall3hMm ?? 0} mm`,
        `Rainfall pressure ${latest.rainfallPressure}/100`,
        `River pressure ${latest.riverPressure}/100`,
        `Wetness pressure ${latest.wetnessPressure}/100`,
        `Reliability ${latest.decisionReliabilityScore ?? "unknown"}/100`,
      ],
    },
    evaluation,
    readiness: {
      readyForExperiment: featureRows.length >= 30 && elevatedExamples >= 5,
      rowCount: featureRows.length,
      elevatedExamples,
      note:
        featureRows.length >= 30 && elevatedExamples >= 5
          ? "Enough starter history exists to compare this baseline against future models."
          : "Keep collecting balanced history before treating this as a trained model.",
    },
  };
}

export function buildBaselineModelCard(featureRows = [], datasetQuality = null) {
  const baseline = buildBaselinePrediction(featureRows);

  return {
    modelName: "transparent feature baseline",
    modelType: "rule-weighted tabular baseline",
    status: baseline.status,
    purpose:
      "Provide an inspectable comparison point before training heavier models such as random forest, XGBoost, or LightGBM.",
    target: "Predict whether the latest stored area snapshot is elevated local flood concern.",
    predictionTask: "binary-classification",
    threshold: {
      score: 45,
      label: "Scores >= 45 are classified as elevated concern.",
    },
    scoreFormula:
      "rainfall pressure 35% + river pressure 30% + wetness pressure 20% + short-rain windows + river baseline momentum + reliability/freshness support - stale/fallback/failed source penalties",
    inputs: modelInputs,
    evaluation: baseline.evaluation,
    readiness: baseline.readiness,
    datasetQuality,
    limitations: [
      "This is not a trained ML model yet.",
      "Historical labels are derived from the current rule engine, not independent flood outcomes.",
      "Small or single-class history makes accuracy unsuitable as a final performance measure.",
      "Fallback or stale public feeds reduce reliability until live source coverage improves.",
    ],
    nextModelCandidates: ["logistic regression", "random forest", "XGBoost", "LightGBM"],
  };
}
