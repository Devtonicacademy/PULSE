/**
 * Finding the user. Every part of the app that needs a position goes through here.
 *
 * locate(), in order:
 *   1. The browser's own location when the site is allowed to use it: a quick low-accuracy
 *      attempt first (fast, and a cached fix is fine), then one high-accuracy retry when that
 *      fails with "unavailable" or "timed out" (a phone with GPS but no network provider).
 *   2. An approximate position from the user's IP address (the server's /api/geo/ip) when the
 *      browser's location is blocked, unavailable or too slow. City-level only.
 *   3. Nothing: the caller keeps the active city hub.
 * The permission state is checked first, so a blocked site goes straight to the backup (and the
 * user is told how to turn precise location on) instead of waiting for a prompt that never comes.
 *
 * refineLocation() sharpens a coarse fix in the background; watchLocation() follows the user and
 * comes back by itself when the permission is granted later.
 */
import { useSyncExternalStore } from 'react';

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unsupported';
export type LocationSource = 'gps' | 'ip';
export type LocationProblem = 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported';

export interface LocationFix {
  latitude: number;
  longitude: number;
  /** Meters; an IP fix is tens of kilometers */
  accuracy: number;
  heading: number | null;
  speed: number | null;
  source: LocationSource;
  /** "Lagos, Nigeria" for an IP fix */
  place?: string;
}

export interface LocateResult {
  fix: LocationFix | null;
  permission: LocationPermission;
  /** Why the browser's location was not used (set whenever the fix is missing or came from the IP backup) */
  problem: LocationProblem | null;
}

export interface LocateOptions {
  /** Wait for the first, quick attempt at most this long (ms) */
  gpsTimeoutMs?: number;
  /** Use the IP-based backup when the browser's location fails (default true) */
  ipFallback?: boolean;
  /** The user asked for their position right now: never accept a remembered fix */
  fresh?: boolean;
  /** Tell the rest of the app how the user was located (default true; false for side lookups) */
  report?: boolean;
}

/** The browser pieces the service needs, replaceable in tests */
export interface LocateEnvironment {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'> & Partial<Pick<Geolocation, 'watchPosition' | 'clearWatch'>>;
  permissions?: Pick<Permissions, 'query'>;
  fetchImpl?: typeof fetch;
  isSecureContext?: boolean;
}

/** First attempt: quick, low accuracy (network / Wi-Fi), a fix up to this old is fine */
const QUICK_TIMEOUT_MS = 8000;
const QUICK_MAX_AGE_MS = 60 * 1000;
/** Retry after "unavailable" / "timeout": ask for real GPS and give it time to warm up */
const PRECISE_TIMEOUT_MS = 20000;
/** A low-accuracy fix worse than this (meters) is sharpened in the background */
export const COARSE_ACCURACY_M = 150;
const IP_TIMEOUT_MS = 5000;

function browserEnvironment(): LocateEnvironment {
  return {
    geolocation: typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
    permissions: typeof navigator !== 'undefined' ? navigator.permissions : undefined,
    fetchImpl: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : true
  };
}

/** What the browser says about this site's location permission (never prompts) */
export async function getLocationPermission(env: LocateEnvironment = browserEnvironment()): Promise<LocationPermission> {
  if (!env.geolocation) return 'unsupported';
  if (!env.permissions) return 'prompt'; // older browsers: the only way to find out is to ask
  try {
    const status = await env.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'prompt';
  }
}

/** Calls `onChange` when the user changes this site's location permission (e.g. in the address bar) */
export function watchLocationPermission(
  onChange: (permission: LocationPermission) => void,
  permissions: Pick<Permissions, 'query'> | undefined = typeof navigator !== 'undefined' ? navigator.permissions : undefined
): () => void {
  let status: PermissionStatus | null = null;
  let stopped = false;
  const handler = () => status && onChange(status.state);
  permissions
    ?.query({ name: 'geolocation' as PermissionName })
    .then((s) => {
      if (stopped) return;
      status = s;
      s.addEventListener('change', handler);
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    status?.removeEventListener('change', handler);
  };
}

function toFix(pos: GeolocationPosition): LocationFix {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    heading: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
    speed: pos.coords.speed ?? null,
    source: 'gps'
  };
}

const problemOf = (err: { code?: number }): LocationProblem =>
  err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';

function browserFix(
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
  options: PositionOptions
): Promise<LocationFix | LocationProblem> {
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (pos) => resolve(toFix(pos)),
        (err) => resolve(problemOf(err)),
        options
      );
    } catch {
      resolve('unavailable');
    }
  });
}

/** Approximate position from the server's IP lookup, or null when it cannot be worked out */
export async function ipLocation(fetchImpl: typeof fetch | undefined = browserEnvironment().fetchImpl): Promise<LocationFix | null> {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl('/api/geo/ip', { signal: AbortSignal.timeout(IP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = await res.json();
    const { latitude, longitude } = body ?? {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
    return {
      latitude,
      longitude,
      accuracy: (Number(body.accuracyKm) || 25) * 1000,
      heading: null,
      speed: null,
      source: 'ip',
      place: [body.city, body.country].filter(Boolean).join(', ') || undefined
    };
  } catch {
    return null;
  }
}

// Callers that ask at the same moment (a map mounting while the notice retries) share one lookup,
// so the user is prompted once and the answers cannot cross.
const inFlight = new Map<string, Promise<LocateResult>>();

/** Finds the user: the browser's location if allowed, else the IP backup, else no fix */
export function locate(options: LocateOptions = {}, env?: LocateEnvironment): Promise<LocateResult> {
  const key = `${options.ipFallback ?? true}|${options.fresh ?? false}|${options.report ?? true}|${options.gpsTimeoutMs ?? ''}`;
  if (!env) {
    const running = inFlight.get(key);
    if (running) return running;
    const promise = runLocate(options, browserEnvironment()).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }
  return runLocate(options, env);
}

async function runLocate(options: LocateOptions, env: LocateEnvironment): Promise<LocateResult> {
  const { gpsTimeoutMs = QUICK_TIMEOUT_MS, ipFallback = true, fresh = false, report = true } = options;
  const permission = await getLocationPermission(env);

  let problem: LocationProblem | null = null;
  if (env.isSecureContext === false) problem = 'insecure';
  else if (!env.geolocation) problem = 'unsupported';
  else if (permission === 'denied') problem = 'denied'; // asking again would only fail again

  if (!problem && env.geolocation) {
    // Quick, low-accuracy attempt (a remembered fix is fine unless the user asked for "now")
    let result = await browserFix(env.geolocation, {
      enableHighAccuracy: false,
      timeout: gpsTimeoutMs,
      maximumAge: fresh ? 0 : QUICK_MAX_AGE_MS
    });
    // "Unavailable" or "too slow" is not "no": phones often answer only when GPS is requested
    if (typeof result === 'string' && (result === 'unavailable' || result === 'timeout')) {
      result = await browserFix(env.geolocation, { enableHighAccuracy: true, timeout: PRECISE_TIMEOUT_MS, maximumAge: 0 });
    }
    if (typeof result !== 'string') {
      if (report) publishStatus({ source: 'gps', permission: 'granted', problem: null, place: null });
      return { fix: result, permission: 'granted', problem: null };
    }
    problem = result;
  }

  const finalPermission = problem === 'denied' ? 'denied' : permission;
  const fix = ipFallback ? await ipLocation(env.fetchImpl) : null;
  if (report) {
    publishStatus({ source: fix ? 'ip' : 'hub', permission: finalPermission, problem, place: fix?.place ?? null });
  }
  return { fix, permission: finalPermission, problem };
}

/**
 * A coarse GPS fix (network / cell based, hundreds of meters or kilometers off) is sharpened in
 * the background with one high-accuracy request. `onBetter` runs only when the new fix is clearly
 * more accurate. Returns a function that cancels the callback.
 */
export function refineLocation(
  fix: LocationFix,
  onBetter: (better: LocationFix) => void,
  env: LocateEnvironment = browserEnvironment()
): () => void {
  let cancelled = false;
  if (fix.source !== 'gps' || fix.accuracy <= COARSE_ACCURACY_M || !env.geolocation) return () => undefined;
  browserFix(env.geolocation, { enableHighAccuracy: true, timeout: PRECISE_TIMEOUT_MS, maximumAge: 0 }).then((result) => {
    if (cancelled || typeof result === 'string') return;
    if (result.accuracy < fix.accuracy * 0.7) onBetter(result);
  });
  return () => {
    cancelled = true;
  };
}

export interface LocationWatchHandlers {
  onFix: (fix: LocationFix) => void;
  /** The browser stopped giving positions (blocked, or no signal) */
  onProblem?: (problem: LocationProblem) => void;
}

/**
 * Follows the user. Unlike a bare watchPosition it stops quietly when the permission is taken
 * away, starts again by itself when it is granted later, and tells the caller about problems so
 * it can fall back to the IP position instead of staying silent.
 */
export function watchLocation(handlers: LocationWatchHandlers, env: LocateEnvironment = browserEnvironment()): () => void {
  const geo = env.geolocation;
  if (!geo?.watchPosition || !geo.clearWatch) {
    handlers.onProblem?.('unsupported');
    return () => undefined;
  }
  let id: number | null = null;
  let stopped = false;

  const begin = () => {
    if (stopped || id !== null) return;
    id = geo.watchPosition!(
      (pos) => handlers.onFix(toFix(pos)),
      (err) => {
        const problem = problemOf(err);
        if (problem === 'denied') end(); // the permission is gone; the permission watcher restarts it if it returns
        // A timeout is not fatal for a watch: the browser keeps trying and reports the next fix
        if (problem !== 'timeout') handlers.onProblem?.(problem);
      },
      // Long timeout: a watch is allowed to be patient, and a short one just spams errors
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 15000 }
    );
  };
  const end = () => {
    if (id !== null) geo.clearWatch!(id);
    id = null;
  };

  begin();
  const stopPermissionWatch = watchLocationPermission((state) => {
    if (state === 'granted') begin();
    else if (state === 'denied') {
      end();
      handlers.onProblem?.('denied');
    }
  }, env.permissions);

  return () => {
    stopped = true;
    end();
    stopPermissionWatch();
  };
}

/** Plain-language explanation and the way out, for each reason the browser's location was not used */
export function describeLocationProblem(problem: LocationProblem, usingApproximate: boolean): { title: string; hint: string } {
  const used = usingApproximate
    ? 'Showing your approximate area from your network instead.'
    : 'Showing the city hub instead.';
  switch (problem) {
    case 'denied':
      return {
        title: 'Location access is blocked',
        hint: `${used} For your exact position, allow Location for this site (lock icon beside the address, then Site settings), then try again.`
      };
    case 'insecure':
      return {
        title: 'Precise location needs a secure connection',
        hint: `${used} Open the site over https to use your device's location.`
      };
    case 'unsupported':
      return {
        title: "This browser can't share its location",
        hint: used
      };
    case 'timeout':
      return {
        title: "Your device didn't answer in time",
        hint: `${used} Move near a window or check that device location is on, then try again.`
      };
    default:
      return {
        title: "We couldn't get a GPS fix",
        hint: `${used} Check that your device's location services are turned on, then try again.`
      };
  }
}

/** The label for a hub that follows the user's own position */
export function hubNameFor(fix: Pick<LocationFix, 'source' | 'place'>, areaName?: string): string {
  if (fix.source === 'ip') return `${fix.place || 'Near you'} (approx.)`;
  return areaName && areaName !== 'Local Area' ? areaName : 'My location';
}

/** The compact hub label for tight spaces: "Lagos, Nigeria (approx.)" -> "~Lagos" (the ~ marks an approximate spot) */
export function shortHubName(name: string): string {
  const approx = /\(approx\.\)\s*$/.test(name);
  const base = name.replace(/\s*\(approx\.\)\s*$/, '').split(',')[0].trim();
  return approx ? `~${base}` : base;
}

// --- Shared status, so the whole app can tell the user how they were located -----------------

export interface LocationStatus {
  /** `hub` = no fix at all; the map is on the active city hub */
  source: LocationSource | 'hub' | 'unknown';
  permission: LocationPermission | 'unknown';
  problem: LocationProblem | null;
  place: string | null;
}

let status: LocationStatus = { source: 'unknown', permission: 'unknown', problem: null, place: null };
const listeners = new Set<() => void>();

function publishStatus(next: LocationStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

/** A real GPS position arrived by another route (the watch): the app is no longer "approximate" */
export function reportGpsFix() {
  if (status.source !== 'gps') publishStatus({ source: 'gps', permission: 'granted', problem: null, place: null });
}

export const getLocationStatus = () => status;

export function useLocationStatus(): LocationStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocationStatus,
    getLocationStatus
  );
}

/** Test hook: forget what was learned */
export function resetLocationStatus() {
  publishStatus({ source: 'unknown', permission: 'unknown', problem: null, place: null });
}
