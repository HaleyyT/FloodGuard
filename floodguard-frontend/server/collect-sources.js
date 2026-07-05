import { runRegionalIngestion } from "./ingestion/aggregators.js";
import { collectScheduledSources } from "./ingestion/scheduledCollection.js";

const signals = await runRegionalIngestion();
const collection = await collectScheduledSources();

console.log(
  `Ingested ${signals.areaList.length} area(s) and recorded ${collection.sourceCount} scheduled source snapshot(s).`,
);
console.log(
  `Scheduled source states: ${collection.liveCount} ok, ${collection.failureCount} failed, ${collection.notConfiguredCount} not configured.`,
);
