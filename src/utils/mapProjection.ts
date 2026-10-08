/**
 * Local flat projection shared by the server's tile builder (server/osm/tileBuilder.js)
 * and the Pulse 3D map, so both agree on where every coordinate lands.
 *
 * Coordinates are meters from an origin: x grows east, y grows north. Over the ~50 km
 * span a tile origin covers, an equirectangular projection is accurate to about a meter.
 */

import { VI_ORIGIN } from './mapOrigin';

export { VI_ORIGIN };

/**
 * The origin in use. It is the Victoria Island one for anyone near Lagos, and a coarse
 * grid point elsewhere (see mapOrigin.ts); the scene sets it once, before building anything.
 */
export let MAP_ORIGIN = VI_ORIGIN;
export let MAP_ORIGIN_ID = 'vi';

/** Edge length of one map tile, in meters */
export const TILE_SIZE_METERS = 500;

const METERS_PER_DEGREE_LAT = 110574;
let METERS_PER_DEGREE_LNG = 111320 * Math.cos((MAP_ORIGIN.latitude * Math.PI) / 180);

export function setMapOrigin(origin: { latitude: number; longitude: number }, id: string) {
  MAP_ORIGIN = origin;
  MAP_ORIGIN_ID = id;
  METERS_PER_DEGREE_LNG = 111320 * Math.cos((origin.latitude * Math.PI) / 180);
}

/** The pre-built Lagos tiles and walking graph only line up with the Victoria Island origin */
export const usesLagosData = () => MAP_ORIGIN_ID === 'vi';

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
