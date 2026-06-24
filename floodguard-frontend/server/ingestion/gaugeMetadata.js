import { areaConfigs } from "./areaConfig.js";
import { dataSourceConfig } from "./config.js";

function distanceKm(from, to) {
  const radians = Math.PI / 180;
  const dLat = (to.lat - from.lat) * radians;
  const dLon = (to.lon - from.lon) * radians;
  const lat1 = from.lat * radians;
  const lat2 = to.lat * radians;
  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function fetchGeojson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function normaliseFeature(feature, type, area) {
  const properties = feature.properties ?? {};
  const station = {
    type,
    stationNumber: properties.bom_stn_num ? String(properties.bom_stn_num) : null,
    awrcStateId: properties.awrc_stateid ?? null,
    name: properties.name,
    basin: properties.basin,
    agency: properties.agency,
    classification: properties.forecast_site_classification,
    lat: properties.lat,
    lon: properties.long,
  };

  return {
    ...station,
    distanceKm: Number(distanceKm(area, { lat: station.lat, lon: station.lon }).toFixed(1)),
  };
}

function localStations(features, type, area) {
  return features
    .filter((feature) => feature.properties?.state === "NSW")
    .map((feature) => normaliseFeature(feature, type, area))
    .filter((station) => station.distanceKm <= 15)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);
}

export async function readGaugeMetadata() {
  const metadataConfig = dataSourceConfig.bomNfgnMetadata;
  const [rainGeojson, riverGeojson] = await Promise.all([
    fetchGeojson(metadataConfig.rainGeojsonUrl),
    fetchGeojson(metadataConfig.riverGeojsonUrl),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      label: metadataConfig.label,
      sourceStrength: metadataConfig.sourceStrength,
      rainGeojsonUrl: metadataConfig.rainGeojsonUrl,
      riverGeojsonUrl: metadataConfig.riverGeojsonUrl,
      note: "Metadata is used for station discovery and mapping evidence. It is not a live measurement feed.",
    },
    areas: Object.fromEntries(
      Object.values(areaConfigs).map((area) => [
        area.id,
        {
          area: {
            id: area.id,
            name: area.name,
            lat: area.lat,
            lon: area.lon,
          },
          configuredStations: area.relevantStations,
          nearestRainGauges: localStations(rainGeojson.features ?? [], "rainfall", area),
          nearestRiverGauges: localStations(riverGeojson.features ?? [], "river", area),
        },
      ]),
    ),
  };
}
