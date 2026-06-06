export const defaultAreaId = "parramatta";

export const areaConfigs = {
  parramatta: {
    id: "parramatta",
    name: "Parramatta, NSW",
    region: "Greater Sydney",
    catchment: "Parramatta River",
    lat: -33.8,
    lon: 151.0,
    relevantStations: {
      weather: ["Parramatta"],
      rainfall: ["567112"],
      river: [
        "Parramatta River at Riverside Theatre",
        "Parramatta River at Marsden Weir",
        "Darling Mills Creek at North Parramatta",
      ],
    },
  },
  "north-parramatta": {
    id: "north-parramatta",
    name: "North Parramatta, NSW",
    region: "Greater Sydney",
    catchment: "Darling Mills Creek / Parramatta River",
    lat: -33.79,
    lon: 151.01,
    relevantStations: {
      weather: ["Parramatta"],
      rainfall: ["567112"],
      river: [
        "Darling Mills Creek at North Parramatta",
        "Parramatta River at Riverside Theatre",
      ],
    },
  },
  toongabbie: {
    id: "toongabbie",
    name: "Toongabbie, NSW",
    region: "Greater Sydney",
    catchment: "Toongabbie Creek",
    lat: -33.79,
    lon: 150.95,
    relevantStations: {
      weather: ["Parramatta"],
      rainfall: ["567112"],
      river: [
        "Toongabbie Creek at Johnstons Bridge",
        "Toongabbie Creek at Briens Rd",
        "Toongabbie Creek at Redbank Road",
      ],
    },
  },
};

export function listAreas() {
  return Object.values(areaConfigs).map((area) => ({
    id: area.id,
    name: area.name,
    region: area.region,
    catchment: area.catchment,
  }));
}

export function getAreaConfig(areaId = defaultAreaId) {
  return areaConfigs[areaId] ?? null;
}
