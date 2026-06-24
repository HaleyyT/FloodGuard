import { buildRegionalIngestionHealth } from "./ingestion/health.js";
import { readOrRefreshRegionalSignals, runRegionalIngestion } from "./ingestion/aggregators.js";
import { getSourceRegistry } from "./ingestion/sourceRegistry.js";

const shouldRefresh = !process.argv.includes("--no-refresh");
const regionalSignals = shouldRefresh
  ? await runRegionalIngestion()
  : await readOrRefreshRegionalSignals();
const health = regionalSignals.ingestionHealth ?? buildRegionalIngestionHealth(regionalSignals);

console.log(`FloodGuard ingestion health: ${health.status}`);
console.log(`Areas checked: ${health.areaCount}`);

for (const area of health.areas) {
  console.log(`\n${area.areaName}: ${area.status}`);
  console.log(
    `  Area fit: ${area.areaRelevance.matchedSignals}/${area.areaRelevance.expectedSignals} (${area.areaRelevance.score}%)`,
  );

  for (const source of area.sources) {
    console.log(
      `  ${source.type}: ${source.sourceStrength}, ${source.mode}, ${source.freshnessStatus}, observed ${
        source.observedAt ?? "unknown"
      }`,
    );
  }

  for (const issue of area.issues) {
    console.log(`  ISSUE: ${issue}`);
  }

  for (const warning of area.warnings) {
    console.log(`  WARNING: ${warning}`);
  }
}

if (!health.ready) {
  const registry = getSourceRegistry();
  console.log("\nLive source policy:");
  console.log(
    `  rainfall: ${registry.activeIngestion.rainfall.sourceStrength}, ${registry.activeIngestion.rainfall.adapter}`,
  );
  console.log(
    `  river: ${registry.activeIngestion.river.sourceStrength}, ${registry.activeIngestion.river.adapter}`,
  );
  console.log("  A blocked result is expected when live gauges are stale, unreachable, or fallback-only.");
  process.exitCode = 1;
}
