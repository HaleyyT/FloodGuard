import { areaConfigs, defaultAreaId, getAreaConfig, stationCatalog } from "./areaConfig.js";

const earthRadiusKm = 6371;
const configuredFitRadiusKm = 8;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function roundDistance(value) {
  return Math.round(value * 10) / 10;
}

export function distanceKm(from, to) {
  if (
    typeof from?.lat !== "number" ||
    typeof from?.lon !== "number" ||
    typeof to?.lat !== "number" ||
    typeof to?.lon !== "number"
  ) {
    return null;
  }

  const latDelta = toRadians(to.lat - from.lat);
  const lonDelta = toRadians(to.lon - from.lon);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

  return roundDistance(earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function stationKey(station) {
  return station.stationNumber ?? station.name;
}

function stationDescriptor(station) {
  return {
    id: station.id,
    stationId: station.stationId ?? station.stationNumber ?? station.id,
    stationNumber: station.stationNumber ?? null,
    name: station.name,
    stationName: station.stationName ?? station.name,
    type: station.type,
    sourceType: station.sourceType ?? "unknown",
    provider: station.provider ?? "FloodGuard",
    areaIds: station.areaIds ?? [],
    lat: station.lat,
    lon: station.lon,
  };
}

function isConfiguredForArea(station, area) {
  const configured = area.relevantStations?.[station.type] ?? [];
  return configured.some((value) => value.toLowerCase() === stationKey(station).toLowerCase());
}

function nearestStationsForLocation(location, limit = 6) {
  return stationCatalog
    .map((station) => ({
      ...stationDescriptor(station),
      distanceKm: distanceKm(location, station),
    }))
    .filter((station) => station.distanceKm !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function buildSpatialRelevance(area = getAreaConfig(defaultAreaId)) {
  const location = {
    lat: area.lat,
    lon: area.lon,
  };
  const configuredStations = stationCatalog
    .filter((station) => isConfiguredForArea(station, area))
    .map((station) => ({
      ...stationDescriptor(station),
      distanceKm: distanceKm(location, station),
      matchStatus: "configured",
      selectionReason: "configured-for-area",
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearestStations = nearestStationsForLocation(location).map((station) => ({
    ...station,
    matchStatus: isConfiguredForArea(station, area) ? "configured" : "nearby-context",
    selectionReason: isConfiguredForArea(station, area) ? "configured-for-area" : "nearest-context",
  }));
  const nearestByType = ["weather", "rainfall", "river"].reduce((byType, type) => {
    byType[type] = nearestStationsForLocation(location, stationCatalog.length).find(
      (station) => station.type === type,
    );
    return byType;
  }, {});
  const selectedStations = ["weather", "rainfall", "river"].reduce((byType, type) => {
    byType[type] = configuredStations.filter((station) => station.type === type);
    return byType;
  }, {});
  const primaryStationsByType = ["weather", "rainfall", "river"].reduce((byType, type) => {
    byType[type] = selectedStations[type][0] ?? nearestByType[type] ?? null;
    return byType;
  }, {});
  const coverageRadiusKm =
    configuredStations.length > 0
      ? Math.max(...configuredStations.map((station) => station.distanceKm ?? 0))
      : null;
  const nearestStationDistanceKm = nearestStations[0]?.distanceKm ?? null;

  return {
    method: "coordinate-distance-pre-postgis",
    selectionPolicy: "configured-area-first-then-nearest-context",
    areaId: area.id,
    areaName: area.name,
    catchment: area.catchment,
    location,
    status:
      configuredStations.length === 0
        ? "no-station-coordinates"
        : coverageRadiusKm <= configuredFitRadiusKm
          ? "local-fit"
          : "wide-fit",
    stationCount: configuredStations.length,
    nearestStationDistanceKm,
    coverageRadiusKm,
    configuredFitRadiusKm,
    configuredStations,
    selectedStations,
    nearestStations,
    nearestByType,
    primaryStationsByType,
    postgisMigrationPlan: {
      status: "planned",
      target: "PostgreSQL + PostGIS",
      nextMilestones: [
        "Store gauge and warning geometry in PostGIS tables.",
        "Replace area-name matching with polygon and catchment intersection.",
        "Score gauges and warnings by suburb, creek corridor, and flood-prone overlays.",
      ],
    },
    notes: [
      configuredStations.length === 0
        ? "No configured station coordinates are available yet."
        : `${configuredStations.length} configured station coordinate(s) are available for ${area.name}.`,
      coverageRadiusKm === null
        ? "Coverage radius cannot be calculated until station coordinates are added."
        : `Configured station coverage radius is ${coverageRadiusKm} km from the area centroid.`,
      "Spatial selection currently uses configured station mapping first and nearest-station context second.",
    ],
  };
}

export function resolveSpatialQuery({ areaId, lat, lon }) {
  const selectedArea = areaId ? getAreaConfig(areaId) : null;
  const queryLocation =
    typeof lat === "number" && typeof lon === "number"
      ? {
          lat,
          lon,
        }
      : selectedArea
        ? {
            lat: selectedArea.lat,
            lon: selectedArea.lon,
          }
        : null;

  if (!queryLocation) return null;

  const rankedAreas = Object.values(areaConfigs)
    .map((area) => ({
      id: area.id,
      name: area.name,
      catchment: area.catchment,
      distanceKm: distanceKm(queryLocation, area),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const resolvedArea = selectedArea ?? getAreaConfig(rankedAreas[0]?.id);

  return {
    query: {
      areaId: selectedArea?.id ?? null,
      lat: queryLocation.lat,
      lon: queryLocation.lon,
    },
    resolvedArea: rankedAreas[0] ?? null,
    rankedAreas,
    spatialRelevance: buildSpatialRelevance(resolvedArea),
  };
}
