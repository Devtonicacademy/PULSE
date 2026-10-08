/**
 * Picks the projection origin for a location. Must match originFor() in server/osm/coverage.js:
 * near Lagos everyone shares the Victoria Island origin (pre-built tiles line up, the cache is
 * shared); elsewhere it snaps to a 0.25 degree grid so nearby users share cached data too.
 */
/** The Victoria Island origin the pre-built Lagos tiles and walking graph are measured from */
export const VI_ORIGIN = { latitude: 6.4281, longitude: 3.4219 };

const NEAR_VI_KM = 100;
const GRID_DEGREES = 0.25;

const toRad = (deg: number) => (deg * Math.PI) / 180;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export interface MapOrigin {
  id: string;
  latitude: number;
  longitude: number;
}

export function originFor(latitude: number, longitude: number): MapOrigin {
  if (distanceKm(latitude, longitude, VI_ORIGIN.latitude, VI_ORIGIN.longitude) <= NEAR_VI_KM) {
    return { id: 'vi', latitude: VI_ORIGIN.latitude, longitude: VI_ORIGIN.longitude };
  }
  const snap = (v: number) => Math.round((Math.round(v / GRID_DEGREES) * GRID_DEGREES) * 100) / 100;
  const lat = snap(latitude);
  const lng = snap(longitude);
  return { id: `${lat.toFixed(2)}_${lng.toFixed(2)}`, latitude: lat, longitude: lng };
}
