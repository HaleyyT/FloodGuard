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
      rainfall: ["67111"],
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
      rainfall: ["67111"],
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
      rainfall: ["567065"],
      river: [
        "Toongabbie Creek at Johnstons Bridge",
        "Toongabbie Creek at Briens Rd",
        "Toongabbie Creek at Redbank Road",
      ],
    },
  },
};

export const stationCatalog = [
  {
    id: "weather-parramatta",
    type: "weather",
    name: "Parramatta",
    lat: -33.8,
    lon: 151.0,
  },
  {
    id: "rainfall-67111",
    type: "rainfall",
    name: "Burnside Homes",
    stationNumber: "67111",
    lat: -33.7916,
    lon: 151.0179,
  },
  {
    id: "rainfall-567065",
    type: "rainfall",
    name: "Toongabbie Bowling Club",
    stationNumber: "567065",
    lat: -33.784,
    lon: 150.9525,
  },
  {
    id: "river-riverside-theatre",
    type: "river",
    name: "Parramatta River at Riverside Theatre",
    lat: -33.814,
    lon: 151.004,
  },
  {
    id: "river-marsden-weir",
    type: "river",
    name: "Parramatta River at Marsden Weir",
    lat: -33.809,
    lon: 150.999,
  },
  {
    id: "river-darling-mills",
    type: "river",
    name: "Darling Mills Creek at North Parramatta",
    lat: -33.788,
    lon: 151.009,
  },
  {
    id: "river-toongabbie-johnstons",
    type: "river",
    name: "Toongabbie Creek at Johnstons Bridge",
    lat: -33.785,
    lon: 150.95,
  },
  {
    id: "river-toongabbie-briens",
    type: "river",
    name: "Toongabbie Creek at Briens Rd",
    lat: -33.795,
    lon: 150.963,
  },
  {
    id: "river-toongabbie-redbank",
    type: "river",
    name: "Toongabbie Creek at Redbank Road",
    lat: -33.804,
    lon: 150.943,
  },
];

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
