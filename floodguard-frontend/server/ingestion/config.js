import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const rawDataDir = path.join(rootDir, "src/data/raw");
export const storageDir = path.join(rootDir, "server/storage");
export const historyDir = path.join(storageDir, "history");
export const sourceCacheDir = path.join(storageDir, "source-cache");
export const latestSignalsSchemaVersion = 4;

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
    rainfall: numberEnv("FLOODGUARD_MAX_RAINFALL_AGE_HOURS", 1),
    river: numberEnv("FLOODGUARD_MAX_RIVER_AGE_HOURS", 1),
    warnings: numberEnv("FLOODGUARD_MAX_WARNING_AGE_HOURS", 1),
  },
  cacheRecentMaxMinutes: numberEnv("FLOODGUARD_CACHE_RECENT_MAX_MINUTES", 30),
  fetchTimeoutMs: numberEnv("FLOODGUARD_FETCH_TIMEOUT_MS", 6000),
  retryCount: numberEnv("FLOODGUARD_FETCH_RETRY_COUNT", 1),
};

export const sourceConfig = {
  weather: {
    label: "Parramatta weather observations",
    envUrl: "FLOODGUARD_WEATHER_URL",
    roadmapEnvUrl: "FLOODGUARD_BOM_PARRAMATTA_WEATHER_JSON",
    defaultUrl: "https://www.bom.gov.au/fwo/IDN60801/IDN60801.94764.json",
    fallbackFile: path.join(rawDataDir, "parramatta-weather.json"),
    sourceStrength: "official_backup",
  },
  rainfall: {
    label: "City of Parramatta FloodSmart rainfall gauges",
    envUrl: "FLOODGUARD_RAINFALL_URL",
    roadmapEnvUrl: "FLOODGUARD_PARRAMATTA_FLOODSMART_GAUGES",
    defaultUrl: "https://parramatta.lizard.net/api/v4/measuringstations/?format=json&page_size=100",
    fallbackFile: path.join(rawDataDir, "north-parramatta-rain.json"),
    sourceStrength: "primary_live_gauge",
    adapter: "floodsmart-rainfall",
    stationCodes: ["67111", "567065"],
  },
  river: {
    label: "City of Parramatta FloodSmart river gauges",
    envUrl: "FLOODGUARD_RIVER_URL",
    roadmapEnvUrl: "FLOODGUARD_PARRAMATTA_FLOODSMART_GAUGES",
    defaultUrl: "https://parramatta.lizard.net/api/v4/measuringstations/?format=json&page_size=100",
    fallbackFile: path.join(rawDataDir, "parramattaRiverData.json"),
    sourceStrength: "primary_live_gauge",
    adapter: "floodsmart-river",
    stationCodes: ["567057", "567107", "567112", "567058", "567074", "567056"],
  },
  warnings: {
    label: "NSW SES / HazardWatch warning status",
    envUrl: "FLOODGUARD_WARNINGS_URL",
    sourceStrength: "official_warning",
    optional: true,
  },
};

export const dataSourceConfig = {
  floodSmartGauges: {
    label: "City of Parramatta FloodSmart gauges",
    role: "Primary local river and rainfall gauges",
    envUrl: "FLOODGUARD_PARRAMATTA_FLOODSMART_GAUGES",
    url: "https://www.cityofparramatta.nsw.gov.au/environment/flooding-and-emergencies/floodsmart-parramatta/check-your-river-and-rain-gauge-levels",
    apiUrl: "https://parramatta.lizard.net/api/v4/measuringstations/?format=json&page_size=100",
    sourceStrength: "primary_live_gauge",
    machineReadable: true,
    priority: 1,
  },
  bomWeatherJson: {
    label: "BoM Parramatta North weather JSON",
    role: "Official weather context and proxy rainfall fallback",
    envUrl: "FLOODGUARD_BOM_PARRAMATTA_WEATHER_JSON",
    url: "https://www.bom.gov.au/fwo/IDN60801/IDN60801.94764.json",
    pageUrl: "https://www.bom.gov.au/products/IDN60801/IDN60801.94764.shtml",
    sourceStrength: "official_backup",
    machineReadable: true,
    priority: 2,
  },
  bomRainRiverPages: {
    label: "BoM NSW rain and river pages",
    role: "Official basin context and bulletin discovery",
    envUrl: "FLOODGUARD_BOM_NSW_RAIN_RIVER",
    url: "https://www.bom.gov.au/nsw/flood/rain_river.shtml",
    secondaryUrl: "https://www.bom.gov.au/nsw/flood/greatersydney.shtml",
    sourceStrength: "official_backup",
    machineReadable: false,
    priority: 3,
  },
  hazardWatch: {
    label: "HazardWatch / NSW SES warnings",
    role: "Official warning status, not gauge measurement",
    envUrl: "FLOODGUARD_HAZARDWATCH",
    url: "https://www.hazardwatch.gov.au/",
    dataNswUrl: "https://data.nsw.gov.au/data/dataset/hazard-watch",
    sesInfoUrl: "https://www.ses.nsw.gov.au/understand-warnings",
    sourceStrength: "official_warning",
    machineReadable: false,
    priority: 4,
  },
  bomNfgnMetadata: {
    label: "BoM National Flood Gauge Network metadata",
    role: "Station discovery and mapping evidence",
    envUrl: "FLOODGUARD_BOM_NFGN_MAPSERVER",
    rainGeojsonUrl:
      "https://hosting.wsapi.cloud.bom.gov.au/arcgis/rest/services/flood/National_Flood_Gauge_Network/FeatureServer/4/query?where=1%3D1&outFields=*&f=geojson",
    riverGeojsonUrl:
      "https://hosting.wsapi.cloud.bom.gov.au/arcgis/rest/services/flood/National_Flood_Gauge_Network/FeatureServer/5/query?where=1%3D1&outFields=*&f=geojson",
    sourceStrength: "official_backup",
    machineReadable: true,
    priority: 5,
  },
  waterNsw: {
    label: "WaterNSW hydrometric backup",
    role: "Optional backup for river and rainfall gauges",
    envUrl: "FLOODGUARD_WATERNSW_REALTIME",
    url: "https://realtimedata.waternsw.com.au/water.stm",
    sourceStrength: "official_backup",
    machineReadable: false,
    priority: 6,
  },
  mhl: {
    label: "Manly Hydraulics Laboratory backup",
    role: "Optional NSW water level and rainfall backup",
    envUrl: "FLOODGUARD_MHL_WATER_LEVEL",
    url: "https://mhl.nsw.gov.au/Data-Level",
    rainfallUrl: "https://mhl.nsw.gov.au/Data-Rain",
    sourceStrength: "official_backup",
    machineReadable: false,
    priority: 7,
  },
  nswFloodDataPortal: {
    label: "NSW flood data portal",
    role: "Static flood-risk context, not live ingestion",
    envUrl: "FLOODGUARD_NSW_FLOOD_DATA_PORTAL",
    url: "https://flooddata.ses.nsw.gov.au/",
    sourceStrength: "historical_context",
    machineReadable: false,
    priority: 8,
  },
};

export const latestSignalsPath = path.join(storageDir, "latest-signals.json");
