import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listAreas } from "./ingestion/areaConfig.js";
import { historyDir as defaultHistoryDir } from "./ingestion/config.js";
import { readAreaHistory } from "./ingestion/store.js";
import { buildMlReadinessReport, buildMlDatasetRows, mlDatasetRowsToCsv } from "./ingestion/mlDataset.js";
import { buildDatasetQualityReport, buildFeatureRows } from "./ingestion/features.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultOutputDir = path.resolve(scriptDir, "../../floodguard-ml/data");

export async function exportMlDataset({
  historyDir = defaultHistoryDir,
  outputDir = defaultOutputDir,
  limit = 1000,
  areas = listAreas(),
} = {}) {
  const perArea = [];
  const allHistory = [];

  for (const area of areas) {
    const history = await readAreaHistory(historyDir, area.id, limit);
    const datasetRows = buildMlDatasetRows(history);

    perArea.push({
      areaId: area.id,
      areaName: area.name,
      rowCount: datasetRows.length,
    });
    allHistory.push(...history);
  }

  const rows = buildMlDatasetRows(allHistory);
  const featureRows = buildFeatureRows(allHistory);
  const datasetQuality = buildDatasetQualityReport(featureRows);
  const readiness = buildMlReadinessReport(rows, datasetQuality, {
    areas: perArea.map((area) => area.areaName),
  });
  const generatedAt = new Date().toISOString();

  const payload = {
    generatedAt,
    labelSource: "rule_derived",
    rowCount: rows.length,
    areas: perArea,
    readiness,
    rows,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "floodguard_features.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "floodguard_features.csv"), `${mlDatasetRowsToCsv(rows)}\n`, "utf8");

  return {
    outputDir,
    csvPath: path.join(outputDir, "floodguard_features.csv"),
    jsonPath: path.join(outputDir, "floodguard_features.json"),
    rowCount: rows.length,
    readiness,
  };
}

async function main() {
  const result = await exportMlDataset();
  console.log(`Exported ${result.rowCount} ML dataset row(s).`);
  console.log(`CSV: ${result.csvPath}`);
  console.log(`JSON: ${result.jsonPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
