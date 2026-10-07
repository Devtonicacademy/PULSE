/**
 * Local flat projection shared by the tile builder (scripts/build-map-tiles.mjs)
 * and the Pulse 3D map, so both agree on where every coordinate lands.
 *
 * Coordinates are meters from a fixed origin in Victoria Island: x grows east,
 * y grows north. Over the ~25 km span of Lagos we cover, an equirectangular
 * projection is accurate to well under a meter.
 *
 * Plain erasable TypeScript only: Node runs this file directly when building tiles.
 */

export const MAP_ORIGIN = { latitude: 6.4281, longitude: 3.4219 };

/** Edge length of one map tile, in meters */
export const TILE_SIZE_METERS = 500;

const METERS_PER_DEGREE_LAT = 110574;
const METERS_PER_DEGREE_LNG = 111320 * Math.cos((MAP_ORIGIN.latitude * Math.PI) / 180);

/** [longitude, latitude] -> [x east, y north] in meters from MAP_ORIGIN */
export function lngLatToMeters(lng: number, lat: number): [number, number] {
  return [
    (lng - MAP_ORIGIN.longitude) * METERS_PER_DEGREE_LNG,
    (lat - MAP_ORIGIN.latitude) * METERS_PER_DEGREE_LAT
  ];
}

/** [x east, y north] in meters from MAP_ORIGIN -> [longitude, latitude] */
export function metersToLngLat(x: number, y: number): [number, number] {
  return [
    MAP_ORIGIN.longitude + x / METERS_PER_DEGREE_LNG,
    MAP_ORIGIN.latitude + y / METERS_PER_DEGREE_LAT
  ];
}

/** Tile column/row containing a point given in meters */
export function tileForMeters(x: number, y: number): [number, number] {
  return [Math.floor(x / TILE_SIZE_METERS), Math.floor(y / TILE_SIZE_METERS)];
}

export function tileKey(tx: number, ty: number): string {
  return `${tx}_${ty}`;
}
