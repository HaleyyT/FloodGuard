import { runParramattaIngestion } from "./ingestion/parramattaPipeline.js";

const signals = await runParramattaIngestion();

console.log(
  `Ingested ${signals.location.name}: ${signals.riskAssessment.concernLevel} concern from ${signals.sourceMetadata.length} sources`,
);
