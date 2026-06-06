import {
  readOrRefreshRegionalSignals,
  runRegionalIngestion,
  selectAreaSignals,
} from "./aggregators.js";
import { defaultAreaId } from "./areaConfig.js";

export async function buildParramattaSignals() {
  const regionalSignals = await runRegionalIngestion();
  return selectAreaSignals(regionalSignals, defaultAreaId);
}

export async function runParramattaIngestion() {
  return buildParramattaSignals();
}

export async function readOrRefreshParramattaSignals() {
  const regionalSignals = await readOrRefreshRegionalSignals();
  return selectAreaSignals(regionalSignals, defaultAreaId);
}
