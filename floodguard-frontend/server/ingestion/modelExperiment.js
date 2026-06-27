const elevatedRiskLevels = new Set(["Moderate", "High"]);

const featureSpec = [
  { field: "rainfall1hMm", label: "Rainfall 1h", weight: 0.08 },
  { field: "rainfall3hMm", label: "Rainfall 3h", weight: 0.08 },
  { field: "rainfall24hMm", label: "Rainfall 24h", weight: 0.1 },
  { field: "rainfall72hMm", label: "Rainfall 72h", weight: 0.08 },
  { field: "antecedentWetnessMm", label: "Antecedent wetness", weight: 0.08 },
  { field: "riverHeightDeltaM", label: "River delta", weight: 0.1 },
  { field: "risingRiverStations", label: "Rising river stations", weight: 0.09 },
  { field: "rainfallPressure", label: "Rainfall pressure", weight: 0.12 },
  { field: "riverPressure", label: "River pressure", weight: 0.12 },
  { field: "wetnessPressure", label: "Wetness pressure", weight: 0.08 },
  { field: "publicSignalPressure", label: "Public signal pressure", weight: 0.04 },
  { field: "confidence", label: "Source confidence", weight: 0.03 },
];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function average(values) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return 0;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function standardDeviation(values, mean) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (usable.length <= 1) return 1;
  const variance =
    usable.reduce((total, value) => total + (value - mean) ** 2, 0) / (usable.length - 1);
  const deviation = Math.sqrt(variance);
  return deviation > 0 ? deviation : 1;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function rowTarget(row) {
  if (typeof row.targetElevatedConcern === "number") return row.targetElevatedConcern;
  return elevatedRiskLevels.has(row.targetRiskLevel) ? 1 : 0;
}

function buildNormalisation(rows) {
  return Object.fromEntries(
    featureSpec.map((feature) => {
      const values = rows.map((row) => numeric(row[feature.field]));
      const mean = average(values);
      return [
        feature.field,
        {
          mean,
          deviation: standardDeviation(values, mean),
        },
      ];
    }),
  );
}

function scoreRuleBaseline(row) {
  const pressureScore =
    numeric(row.rainfallPressure) * 0.35 +
    numeric(row.riverPressure) * 0.3 +
    numeric(row.wetnessPressure) * 0.18 +
    numeric(row.publicSignalPressure) * 0.07;
  const qualityPenalty =
    numeric(row.staleSourceCount) * 6 + numeric(row.fallbackSourceCount) * 8 + numeric(row.failedSourceCount) * 18;

  return clamp(Math.round(pressureScore - qualityPenalty));
}

function scoreLogisticBaseline(row, normalisation) {
  const weightedSignal = featureSpec.reduce((total, feature) => {
    const stats = normalisation[feature.field];
    const zScore = (numeric(row[feature.field]) - stats.mean) / stats.deviation;
    return total + zScore * feature.weight;
  }, 0);
  const probability = sigmoid(weightedSignal - 0.25);

  return {
    probability,
    score: Math.round(probability * 100),
    predictedElevatedConcern: probability >= 0.5 ? 1 : 0,
  };
}

function evaluatePredictions(rows, predict) {
  const confusion = rows.reduce(
    (counts, row) => {
      const predicted = predict(row);
      const actual = rowTarget(row);

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
  const balanced = actualElevated > 0 && actualLow > 0;

  return {
    sampleSize: rows.length,
    accuracy: balanced && rows.length > 0 ? Math.round((correct / rows.length) * 100) : null,
    accuracyStatus:
      rows.length === 0 ? "waiting-for-history" : balanced ? "balanced-history" : "single-class-history",
    actualElevated,
    actualLow,
    ...confusion,
  };
}

function topDrivers(row, normalisation) {
  return featureSpec
    .map((feature) => {
      const stats = normalisation[feature.field];
      const zScore = (numeric(row[feature.field]) - stats.mean) / stats.deviation;
      return {
        field: feature.field,
        label: feature.label,
        value: numeric(row[feature.field]),
        contribution: Number((zScore * feature.weight).toFixed(3)),
      };
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);
}

export function buildModelExperiment(featureRows = []) {
  const rows = [...featureRows].filter((row) => typeof row.riskScore === "number");
  const latest = rows.at(-1) ?? null;
  const evaluationRows = rows.slice(0, -1);
  const elevatedCount = rows.filter((row) => rowTarget(row) === 1).length;
  const lowCount = rows.length - elevatedCount;
  const readyForComparison = rows.length >= 30 && elevatedCount >= 5 && lowCount >= 5;
  const hasTwoClassHistory = elevatedCount > 0 && lowCount > 0;
  const normalisation = buildNormalisation(rows);
  const ruleEvaluation = evaluatePredictions(evaluationRows, (row) =>
    scoreRuleBaseline(row) >= 45 ? 1 : 0,
  );
  const logisticEvaluation = evaluatePredictions(evaluationRows, (row) =>
    scoreLogisticBaseline(row, normalisation).predictedElevatedConcern,
  );
  const latestLogistic = latest && hasTwoClassHistory ? scoreLogisticBaseline(latest, normalisation) : null;
  const latestRuleScore = latest ? scoreRuleBaseline(latest) : null;

  return {
    modelFamily: "tabular flood-signal baseline",
    status: readyForComparison ? "comparison-ready" : "collecting-history",
    target: "Predict whether the selected area has elevated local flood concern.",
    rowCount: rows.length,
    classBalance: {
      elevatedCount,
      lowCount,
      status: elevatedCount > 0 && lowCount > 0 ? "two-class-history" : "single-class-history",
    },
    readiness: {
      readyForComparison,
      note: readyForComparison
        ? "Enough balanced history exists to compare simple tabular baselines."
        : "Keep collecting live snapshots until the dataset has at least 30 rows, 5 elevated examples, and 5 low examples.",
    },
    candidates: [
      {
        name: "rule-weighted baseline",
        type: "transparent deterministic baseline",
        status: rows.length > 0 ? "available" : "waiting-for-history",
        latestScore: latestRuleScore,
        latestLabel: latestRuleScore === null ? "Waiting" : latestRuleScore >= 45 ? "Elevated concern" : "Low concern",
        evaluation: ruleEvaluation,
        explanation: "Uses the same pressure features as the decision engine as the first comparison point.",
      },
      {
        name: "logistic tabular baseline",
        type: "lightweight normalised linear baseline",
        status:
          rows.length < 10
            ? "needs-more-history"
            : hasTwoClassHistory
              ? "prototype"
              : "needs-balanced-history",
        latestScore: latestLogistic?.score ?? null,
        latestProbability:
          latestLogistic === null ? null : Number(latestLogistic.probability.toFixed(3)),
        latestLabel:
          latestLogistic === null
            ? hasTwoClassHistory
              ? "Waiting"
              : "Waiting for elevated examples"
            : latestLogistic.predictedElevatedConcern === 1
              ? "Elevated concern"
              : "Low concern",
        evaluation: logisticEvaluation,
        topDrivers: latest ? topDrivers(latest, normalisation) : [],
        explanation:
          "Normalises rainfall, river, wetness, public-signal, and confidence features before producing a probability-like score.",
      },
    ],
    nextModelCandidates: ["logistic regression", "random forest", "XGBoost", "LightGBM"],
    safeguards: [
      "Model outputs remain supplementary until enough balanced history exists.",
      "Current labels are generated from the rule engine, not independent flood outcome labels.",
      "Fallback, stale, or failed source rows are tracked so they can be excluded or down-weighted later.",
    ],
  };
}
