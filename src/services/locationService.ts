/**
 * Finding the user. Order of preference:
 *   1. The browser's own location (GPS / Wi-Fi), when the site is allowed to use it.
 *   2. An approximate position from the user's IP address (the server's /api/geo/ip), when the
 *      browser's location is blocked, unavailable or too slow. City-level only.
 *   3. Nothing: the caller keeps the active city hub.
 * The permission state is checked first, so a blocked site goes straight to the backup (and the
 * user is told how to turn precise location on) instead of waiting for a prompt that never comes.
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
  /** How long to wait for the browser before using the backup */
  gpsTimeoutMs?: number;
  /** Use the IP-based backup when the browser's location fails (default true) */
  ipFallback?: boolean;
}

/** The browser pieces locate() needs, replaceable in tests */
export interface LocateEnvironment {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>;
  permissions?: Pick<Permissions, 'query'>;
  fetchImpl?: typeof fetch;
  isSecureContext?: boolean;
}

const DEFAULT_GPS_TIMEOUT_MS = 8000;
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
export function watchLocationPermission(onChange: (permission: LocationPermission) => void): () => void {
  let status: PermissionStatus | null = null;
  let stopped = false;
  const handler = () => status && onChange(status.state);
  navigator.permissions
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

function browserFix(geolocation: Pick<Geolocation, 'getCurrentPosition'>, timeoutMs: number): Promise<LocationFix | LocationProblem> {
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
          speed: pos.coords.speed ?? null,
          source: 'gps'
        }),
      (err) => resolve(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 }
    );
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

/** Finds the user: the browser's location if allowed, else the IP backup, else no fix */
export async function locate(options: LocateOptions = {}, env: LocateEnvironment = browserEnvironment()): Promise<LocateResult> {
  const { gpsTimeoutMs = DEFAULT_GPS_TIMEOUT_MS, ipFallback = true } = options;
  const permission = await getLocationPermission(env);

  let problem: LocationProblem | null = null;
  if (env.isSecureContext === false) problem = 'insecure';
  else if (!env.geolocation) problem = 'unsupported';
  else if (permission === 'denied') problem = 'denied'; // asking again would only fail again

  if (!problem && env.geolocation) {
    const result = await browserFix(env.geolocation, gpsTimeoutMs);
    if (typeof result !== 'string') {
      publishStatus({ source: 'gps', permission: 'granted', problem: null, place: null });
      return { fix: result, permission: 'granted', problem: null };
    }
    problem = result;
  }

  const finalPermission = problem === 'denied' ? 'denied' : permission;
  const fix = ipFallback ? await ipLocation(env.fetchImpl) : null;
  publishStatus({
    source: fix ? 'ip' : 'hub',
    permission: finalPermission,
    problem,
    place: fix?.place ?? null
  });
  return { fix, permission: finalPermission, problem };
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
