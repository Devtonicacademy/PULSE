/**
 * Decides which position fixes to believe. Pure bookkeeping (no browser APIs): the location service
 * feeds it every fix (quick, precise, watch, IP) and it keeps the best current one.
 *
 * Rules, in order:
 *   - the first fix is always taken (a coarse one is better than none)
 *   - a GPS fix always beats an IP guess, and an IP guess never replaces a GPS fix that is not old
 *   - a fix that would need the user to travel faster than any vehicle is a glitch: ignored
 *   - once there is a fresh, better fix, a much worse one (or one worse than ~500 m) is ignored
 *   - when the current fix is old, whatever arrives next is taken: the user has probably moved
 */

export interface TrackedFix {
  latitude: number;
  longitude: number;
  /** Meters (68% confidence radius, as the browser reports it) */
  accuracy: number;
  source: 'gps' | 'ip';
}

export type Verdict =
  | { accepted: true }
  | { accepted: false; reason: 'ip-over-gps' | 'jump' | 'worse' | 'inaccurate' };

/** A fix older than this no longer protects itself: the user may have moved */
export const STALE_MS = 2 * 60 * 1000;
/** An IP guess may replace a GPS fix only when that fix is this old */
export const IP_REPLACES_GPS_AFTER_MS = 10 * 60 * 1000;
/** Faster than this (m/s, about 360 km/h) is not a person or a car: a GPS glitch */
export const MAX_SPEED_MS = 100;
/** A GPS fix at or below this (meters) is trusted to move the whole app: hub, feed, camera */
export const TRUSTED_ACCURACY_M = 200;
/** A new fix this many times less accurate than the current one counts as "much worse" */
export const MUCH_WORSE_FACTOR = 3;
/** Once a fix this good exists, nothing coarser than this is taken while it is fresh */
export const INACCURATE_M = 500;

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class FixTracker<T extends TrackedFix = TrackedFix> {
  /** The fix currently believed, and when it arrived */
  current: (T & { at: number }) | null = null;

  /**
   * Offers a fix. `force` is for "find me now": the user asked, so it is taken unless it is an
   * impossible jump from a very recent fix.
   */
  consider(fix: T, now = Date.now(), { force = false } = {}): Verdict {
    const best = this.current;
    if (!best) return this.take(fix, now);

    const age = now - best.at;
    const fresh = age <= STALE_MS;

    // GPS beats IP, always; an IP guess only displaces a GPS fix that has gone old
    if (fix.source === 'ip' && best.source === 'gps' && age < IP_REPLACES_GPS_AFTER_MS) {
      return { accepted: false, reason: 'ip-over-gps' };
    }
    if (fix.source === 'gps' && best.source === 'ip') return this.take(fix, now);

    // A teleport: more distance than the two accuracy circles plus a sprint can explain
    if (fix.source === 'gps' && best.source === 'gps' && !force) {
      const allowed = best.accuracy + fix.accuracy + MAX_SPEED_MS * Math.max(1, age / 1000);
      if (distanceMeters(best, fix) > allowed) return { accepted: false, reason: 'jump' };
    }

    if (fresh && !force && fix.source === best.source) {
      if (fix.accuracy > INACCURATE_M && best.accuracy <= INACCURATE_M) return { accepted: false, reason: 'inaccurate' };
      if (fix.accuracy > best.accuracy * MUCH_WORSE_FACTOR) return { accepted: false, reason: 'worse' };
    }
    return this.take(fix, now);
  }

  private take(fix: T, now: number): Verdict {
    this.current = { ...fix, at: now };
    return { accepted: true };
  }

  /** How long ago the current fix arrived, or Infinity when there is none */
  ageMs(now = Date.now()): number {
    return this.current ? now - this.current.at : Infinity;
  }

  reset() {
    this.current = null;
  }
}
