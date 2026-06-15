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
  const tendencyScore = row.risingRiverStations * 12 + Math.max(row.scoreDelta ?? 0, 0) * 1.5;
  const qualityPenalty =
    row.staleSourceCount * 10 + row.fallbackSourceCount * 6 + row.failedSourceCount * 20;
  const reliabilitySupport = (row.decisionReliabilityScore ?? 0) * 0.15;
  const rawScore = pressureScore + tendencyScore + reliabilitySupport - qualityPenalty;

  return clamp(Math.round(rawScore));
}

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
