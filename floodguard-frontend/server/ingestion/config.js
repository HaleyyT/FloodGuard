import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const rawDataDir = path.join(rootDir, "src/data/raw");
export const storageDir = path.join(rootDir, "server/storage");
export const historyDir = path.join(storageDir, "history");

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const ingestionPolicy = {
  allowLocalFallback: booleanEnv("FLOODGUARD_ALLOW_LOCAL_FALLBACK", true),
  maxAgeHours: {
    weather: numberEnv("FLOODGUARD_MAX_WEATHER_AGE_HOURS", 12),
    rainfall: numberEnv("FLOODGUARD_MAX_RAINFALL_AGE_HOURS", 6),
    river: numberEnv("FLOODGUARD_MAX_RIVER_AGE_HOURS", 6),
  },
};

export const sourceConfig = {
  weather: {
    label: "Parramatta weather observations",
    envUrl: "FLOODGUARD_WEATHER_URL",
    defaultUrl: "https://www.bom.gov.au/fwo/IDN60801/IDN60801.94764.json",
    fallbackFile: path.join(rawDataDir, "parramatta-weather.json"),
    sourceStrength: "official_backup",
  },
  rainfall: {
    label: "North Parramatta rainfall gauge",
    envUrl: "FLOODGUARD_RAINFALL_URL",
    fallbackFile: path.join(rawDataDir, "north-parramatta-rain.json"),
    sourceStrength: "primary_live_gauge",
  },
  river: {
    label: "Parramatta river context",
    envUrl: "FLOODGUARD_RIVER_URL",
    fallbackFile: path.join(rawDataDir, "parramattaRiverData.json"),
    sourceStrength: "primary_live_gauge",
  },
};

export const latestSignalsPath = path.join(storageDir, "latest-signals.json");
