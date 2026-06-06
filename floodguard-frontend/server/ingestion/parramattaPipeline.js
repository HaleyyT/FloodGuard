import { latestSignalsPath, sourceConfig } from "./config.js";
import { loadSource } from "./fetchers.js";
import { normalizeRainfall, normalizeRiverContext, normalizeWeather } from "./normalisers.js";
import { assessRisk } from "./riskEngine.js";
import { readLatestSignals, writeLatestSignals } from "./store.js";

export async function buildParramattaSignals() {
  const [weatherSource, rainfallSource, riverSource] = await Promise.all([
    loadSource(sourceConfig.weather),
    loadSource(sourceConfig.rainfall),
    loadSource(sourceConfig.river),
  ]);

  const weatherObservations = normalizeWeather(weatherSource.data);
  const rainfallSeries = normalizeRainfall(rainfallSource.data);
  const riverContext = normalizeRiverContext(riverSource.data);

  const signals = {
    location: {
      name: "Parramatta, NSW",
      region: "Greater Sydney",
      lat: weatherObservations.lat,
      lon: weatherObservations.lon,
    },
    weatherObservations,
    rainfallSeries,
    riverContext,
    sourceMetadata: [
      {
        label: "Parramatta weather observations",
        type: "weather",
        note: "Current local weather observations normalised from the ingestion pipeline.",
        ...weatherSource.metadata,
      },
      {
        label: "North Parramatta rainfall gauge",
        type: "rainfall",
        note: "Nearby rainfall time series normalised from the ingestion pipeline.",
        ...rainfallSource.metadata,
      },
      {
        label: "Parramatta river context",
        type: "river",
        note: "Current local river and creek heights normalised from the ingestion pipeline.",
        ...riverSource.metadata,
      },
    ],
  };

  return {
    ...signals,
    riskAssessment: assessRisk(signals),
    ingestedAt: new Date().toISOString(),
  };
}

export async function runParramattaIngestion() {
  const signals = await buildParramattaSignals();
  await writeLatestSignals(latestSignalsPath, signals);
  return signals;
}

export async function readOrRefreshParramattaSignals() {
  try {
    return await readLatestSignals(latestSignalsPath);
  } catch {
    return runParramattaIngestion();
  }
}
