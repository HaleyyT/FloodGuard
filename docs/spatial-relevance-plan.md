# FloodGuard Spatial Relevance Plan

## Current short-term design

FloodGuard now stores structured station metadata for configured weather, rainfall, and river gauges:

- `stationId`
- `stationName`
- `latitude`
- `longitude`
- `areaIds`
- `sourceType`
- `provider`

The selection policy is:

1. use configured area-to-station mapping first
2. rank those stations by centroid distance
3. expose nearest same-type context stations second

This means each area can explain both:

- which gauges are intentionally mapped to it
- which nearby stations are spatial context only

## PostGIS migration plan

Target stack: **PostgreSQL + PostGIS**

Planned follow-up:

1. store gauge points, warning polygons, and local flood-prone overlays in PostGIS
2. replace area-name warning matching with polygon intersection
3. score station relevance using creek corridor distance and suburb overlays
4. add road-underpass and local hot-spot proximity queries for decision support

## Current limitation

The present spatial method is still centroid-distance and configured mapping based, so it improves local relevance but does not yet replace full catchment-aware geospatial modelling.
