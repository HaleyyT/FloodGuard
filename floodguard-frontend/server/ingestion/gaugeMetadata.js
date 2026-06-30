import { areaConfigs, stationCatalog } from "./areaConfig.js";
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

function catalogMatch(area, signalType, configuredId) {
  if (signalType === "weather") {
    return stationCatalog.find((station) => station.type === "weather" && station.name === configuredId) ?? null;
  }

  if (signalType === "rainfall") {
    return stationCatalog.find(
      (station) => station.type === "rainfall" && station.stationNumber === configuredId,
    ) ?? null;
  }

  return stationCatalog.find((station) => station.type === "river" && station.name === configuredId) ?? null;
}

function metadataMatch(signalType, configuredId, nearestRainGauges, nearestRiverGauges) {
  if (signalType === "rainfall") {
    return nearestRainGauges.find((station) => station.stationNumber === configuredId) ?? null;
  }

  if (signalType === "river") {
    return nearestRiverGauges.find((station) => station.name === configuredId) ?? null;
  }

  return null;
}

function mappingEvidence(area, nearestRainGauges, nearestRiverGauges) {
  const configuredRows = Object.entries(area.relevantStations).flatMap(([signalType, configuredIds]) =>
    configuredIds.map((configuredId) => {
      const catalogStation = catalogMatch(area, signalType, configuredId);
      const metadataStation = metadataMatch(
        signalType,
        configuredId,
        nearestRainGauges,
        nearestRiverGauges,
      );
      const status = catalogStation && (signalType === "weather" || metadataStation) ? "matched" : "warn";

      return {
        signalType,
        stationId: catalogStation?.stationNumber ?? catalogStation?.id ?? configuredId,
        stationName: catalogStation?.name ?? configuredId,
        source: signalType === "weather" ? "Station catalog" : "BoM NFGN metadata + station catalog",
        coordinates:
          typeof catalogStation?.lat === "number" && typeof catalogStation?.lon === "number"
            ? { lat: catalogStation.lat, lon: catalogStation.lon }
            : null,
        areaRelevanceReason:
          signalType === "rainfall"
            ? `${area.name} is configured to use rainfall gauge ${configuredId}.`
            : signalType === "river"
              ? `${catalogStation?.name ?? configuredId} is one of the configured creek/river stations for ${area.name}.`
              : `${configuredId} is the configured weather context station for ${area.name}.`,
        metadataMatched: Boolean(signalType === "weather" || metadataStation),
        metadataSource:
          signalType === "rainfall"
            ? metadataStation?.agency ?? null
            : signalType === "river"
              ? metadataStation?.agency ?? null
              : "Station catalog",
        status,
      };
    }),
  );

  const issues = configuredRows
    .filter((row) => row.status !== "matched")
    .map((row) =>
      row.signalType === "weather"
        ? `${row.stationName} is configured as weather context but only verified through the local station catalog.`
        : `${row.stationName} is configured for ${area.name} but was not found in nearby BoM metadata evidence.`,
    );

  return {
    status: issues.length === 0 ? "pass" : "warn",
    configuredSignalCount: configuredRows.length,
    matchedSignalCount: configuredRows.length - issues.length,
    issues,
    configuredSignals: configuredRows,
  };
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
      Object.values(areaConfigs).map((area) => {
        const nearestRainGauges = localStations(rainGeojson.features ?? [], "rainfall", area);
        const nearestRiverGauges = localStations(riverGeojson.features ?? [], "river", area);
        const mapping = mappingEvidence(area, nearestRainGauges, nearestRiverGauges);

        return [
          area.id,
          {
            area: {
              id: area.id,
              name: area.name,
              lat: area.lat,
              lon: area.lon,
            },
            configuredStations: area.relevantStations,
            configuredSignals: mapping.configuredSignals,
            mappingStatus: mapping.status,
            mappingIssues: mapping.issues,
            nearestRainGauges,
            nearestRiverGauges,
          },
        ];
      }),
    ),
  };
}
