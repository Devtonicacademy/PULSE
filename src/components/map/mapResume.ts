/**
 * Where the user was standing when they switched between the flat map and Pulse 3D, so the other
 * map opens on the same spot instead of snapping back to the hub or the last GPS fix.
 */
export interface MapResume {
  longitude: number;
  latitude: number;
  /** Compass degrees */
  heading: number;
}

/** A GPS fix within this distance of the resumed spot is treated as "still here" */
const SAME_SPOT_METERS = 60;

/** Approximate ground distance in meters (fine at city scale) */
export function metersBetween(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dy = (bLat - aLat) * 110574;
  const dx = (bLng - aLng) * 111320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

/**
 * True when an automatic GPS update should be ignored because the user has walked or jumped away
 * from where the live position is: the map keeps their chosen spot until they ask to be located.
 */
export function isAwayFromFix(spot: { longitude: number; latitude: number }, fixLng: number, fixLat: number): boolean {
  return metersBetween(spot.longitude, spot.latitude, fixLng, fixLat) > SAME_SPOT_METERS;
}
