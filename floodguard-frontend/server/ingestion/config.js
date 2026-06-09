import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const rawDataDir = path.join(rootDir, "src/data/raw");
export const storageDir = path.join(rootDir, "server/storage");
export const historyDir = path.join(storageDir, "history");

export const sourceConfig = {
  weather: {
    label: "Parramatta weather observations",
    envUrl: "FLOODGUARD_WEATHER_URL",
    defaultUrl: "https://www.bom.gov.au/fwo/IDN60801/IDN60801.94764.json",
    fallbackFile: path.join(rawDataDir, "parramatta-weather.json"),
  },
  rainfall: {
    label: "North Parramatta rainfall gauge",
    envUrl: "FLOODGUARD_RAINFALL_URL",
    fallbackFile: path.join(rawDataDir, "north-parramatta-rain.json"),
  },
  river: {
    label: "Parramatta river context",
    envUrl: "FLOODGUARD_RIVER_URL",
    fallbackFile: path.join(rawDataDir, "parramattaRiverData.json"),
  },
};

export const latestSignalsPath = path.join(storageDir, "latest-signals.json");
