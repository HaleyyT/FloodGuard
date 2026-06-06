import { runRegionalIngestion } from "./ingestion/aggregators.js";

const signals = await runRegionalIngestion();

console.log(
  `Ingested ${signals.areaList.length} area(s): ${signals.areaList
    .map((area) => area.name)
    .join(", ")}`,
);
