/**
 * Finding the user. Every part of the app that needs a position goes through here.
 *
 * Strategy (the browser's geolocation API is the only source of a real position; the work is in
 * how it is asked):
 *   1. locate(): a fast, low-accuracy fix first so the avatar appears quickly. When that fails with
 *      "unavailable" / "timed out" it is retried once with high accuracy.
 *   2. refineLocation(): unless the first fix is already precise, a high-accuracy request follows
 *      in the background (long timeout, never a cached position) and is used when it arrives. If
 *      it times out (a desktop without GPS) nothing is shown: the quick fix stays.
 *   3. followUser() / watchLocation(): a high-accuracy watch that ignores glitches, pauses while the
 *      tab is hidden, drops to low accuracy on machines without GPS, and falls back to the IP
 *      position (then recovers) when the browser stops answering.
 *   4. The IP position (server's /api/geo/ip, about 25 km) is the backup when the browser's own
 *      location is blocked or unavailable. It never replaces a GPS fix.
 * A FixTracker decides which fix to believe, so a worse or impossible fix never moves anything.
 */
import { useSyncExternalStore } from 'react';
import { FixTracker, TRUSTED_ACCURACY_M } from './fixTracker';

export { TRUSTED_ACCURACY_M };

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
  /** For pausing the watch while the tab is hidden */
  document?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

/** First attempt: quick, low accuracy (network / Wi-Fi), a fix up to this old is fine */
const QUICK_TIMEOUT_MS = 8000;
const QUICK_MAX_AGE_MS = 60 * 1000;
/** High-accuracy attempts: give GPS time to warm up, and never reuse a cached position */
const PRECISE_TIMEOUT_MS = 20000;
/** At or below this (meters) a fix is already good: no background refinement is needed */
export const GOOD_ACCURACY_M = 30;
/** @deprecated kept for older imports: the threshold above which a fix is sharpened */
export const COARSE_ACCURACY_M = GOOD_ACCURACY_M;
/** Watch options: a patient timeout, and a short cache so a burst of updates is not recomputed */
const WATCH_HIGH_TIMEOUT_MS = 20000;
const WATCH_LOW_TIMEOUT_MS = 30000;
const WATCH_MAX_AGE_MS = 5000;
const IP_TIMEOUT_MS = 5000;
/** A watch timeout only counts as a problem when nothing has been heard for this long */
const WATCH_SILENCE_MS = 2 * 60 * 1000;

const tracker = new FixTracker<LocationFix>();
let refining: Promise<LocationFix | LocationProblem> | null = null;

/** The fix the app currently believes (the most trustworthy one seen), if any */
export const getBestFix = () => tracker.current;
export function resetFixTracker() {
  tracker.reset();
}

function browserEnvironment(): LocateEnvironment {
  return {
    geolocation: typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
    permissions: typeof navigator !== 'undefined' ? navigator.permissions : undefined,
    fetchImpl: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : true,
    document: typeof document !== 'undefined' ? document : undefined
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
  let permissionStatus: PermissionStatus | null = null;
  let stopped = false;
  const handler = () => permissionStatus && onChange(permissionStatus.state);
  permissions
    ?.query({ name: 'geolocation' as PermissionName })
    .then((s) => {
      if (stopped) return;
      permissionStatus = s;
      s.addEventListener('change', handler);
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    permissionStatus?.removeEventListener('change', handler);
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

/**
 * The browser stopped answering (a watch error): use the IP position instead, unless a GPS fix is
 * still current. Returns the fix to apply, or null when nothing should change.
 */
export async function fallbackToIp(problem: LocationProblem, fetchImpl?: typeof fetch): Promise<LocationFix | null> {
  const fix = await ipLocation(fetchImpl ?? browserEnvironment().fetchImpl);
  if (!fix) {
    if (!tracker.current) publishStatus({ source: 'hub', permission: status.permission, problem, place: null, accuracy: null });
    return null;
  }
  if (!tracker.consider(fix).accepted) return null; // a real GPS fix is still current
  publishStatus({
    source: 'ip',
    permission: problem === 'denied' ? 'denied' : status.permission,
    problem,
    place: fix.place ?? null,
    accuracy: fix.accuracy
  });
  return fix;
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
      // The tracker may prefer a better fix we already hold (e.g. the watch got there first)
      const verdict = tracker.consider(result, Date.now(), { force: fresh });
      const fix = verdict.accepted || !tracker.current ? result : tracker.current;
      if (report && verdict.accepted) reportFix(fix);
      return { fix, permission: 'granted', problem: null };
    }
    problem = result;
  }

  const finalPermission = problem === 'denied' ? 'denied' : permission;
  let fix = ipFallback ? await ipLocation(env.fetchImpl) : null;
  if (fix) {
    const verdict = tracker.consider(fix);
    if (!verdict.accepted && tracker.current) fix = tracker.current; // a GPS fix is still current: keep it
    else if (report) {
      publishStatus({ source: 'ip', permission: finalPermission, problem, place: fix.place ?? null, accuracy: fix.accuracy });
    }
  } else if (report && !tracker.current) {
    publishStatus({ source: 'hub', permission: finalPermission, problem, place: null, accuracy: null });
  }
  return { fix, permission: finalPermission, problem };
}

/**
 * Sharpens a position in the background with one high-accuracy request (long timeout, never a
 * cached position). `onBetter` runs only when the new fix is clearly more accurate and the tracker
 * believes it. A timeout (a desktop without GPS) is silent: the fix we have stays. Returns a
 * function that cancels the callback.
 */
export function refineLocation(
  fix: LocationFix,
  onBetter: (better: LocationFix) => void,
  env: LocateEnvironment = browserEnvironment()
): () => void {
  let cancelled = false;
  if (fix.source !== 'gps' || fix.accuracy <= GOOD_ACCURACY_M || !env.geolocation) return () => undefined;
  // Callers refining at the same moment (a map mounting twice) share one high-accuracy request:
  // GPS is the expensive part
  refining ??= browserFix(env.geolocation, { enableHighAccuracy: true, timeout: PRECISE_TIMEOUT_MS, maximumAge: 0 }).finally(() => {
    refining = null;
  });
  refining.then((result) => {
    if (cancelled || typeof result === 'string') return;
    if (result.accuracy >= fix.accuracy * 0.8) return; // not clearly better: do not move anything
    if (!tracker.consider(result).accepted) return;
    reportFix(result);
    onBetter(result);
  });
  return () => {
    cancelled = true;
  };
}

export interface LocationWatchHandlers {
  /** A trusted position (glitches and much worse fixes are already filtered out) */
  onFix: (fix: LocationFix) => void;
  /** The browser stopped giving positions (blocked, or no signal for a while). Raised once per outage. */
  onProblem?: (problem: LocationProblem) => void;
}

/**
 * Follows the user with a high-accuracy watch.
 *   - fixes pass through the tracker: a much worse fix, one coarser than ~500 m after a good one, or
 *     an impossible jump is dropped
 *   - on a machine without GPS the high-accuracy watch errors out; it then restarts at low accuracy
 *   - a revoked permission stops it quietly; granting it again starts it again by itself
 *   - hidden tabs do not keep the GPS on: it stops when the tab is hidden and restarts on return
 */
export function watchLocation(handlers: LocationWatchHandlers, env: LocateEnvironment = browserEnvironment()): () => void {
  const geo = env.geolocation;
  if (!geo?.watchPosition || !geo.clearWatch) {
    handlers.onProblem?.('unsupported');
    return () => undefined;
  }
  const doc = env.document;
  let id: number | null = null;
  let stopped = false;
  let mode: 'high' | 'low' = 'high';
  let heardThisRun = false;
  let inProblem = false;

  const raise = (problem: LocationProblem) => {
    if (inProblem) return;
    inProblem = true;
    handlers.onProblem?.(problem);
  };

  const end = () => {
    if (id !== null) geo.clearWatch!(id);
    id = null;
  };

  const begin = () => {
    if (stopped || id !== null || doc?.hidden) return;
    heardThisRun = false;
    id = geo.watchPosition!(
      (pos) => {
        heardThisRun = true;
        inProblem = false; // the outage is over; the next one is reported again
        const fix = toFix(pos);
        if (tracker.consider(fix).accepted) handlers.onFix(fix);
      },
      (err) => {
        const problem = problemOf(err);
        if (problem === 'denied') {
          end(); // the permission is gone; the permission watcher restarts it if it returns
          raise('denied');
          return;
        }
        // No GPS (typical desktop): high accuracy only errors out, so ask for the network position instead
        if (mode === 'high' && !heardThisRun) {
          end();
          mode = 'low';
          begin();
          return;
        }
        // A timeout is not fatal for a watch (the browser keeps trying), unless we have heard nothing for long
        if (problem === 'timeout' && tracker.ageMs() < WATCH_SILENCE_MS) return;
        raise(problem);
      },
      {
        enableHighAccuracy: mode === 'high',
        timeout: mode === 'high' ? WATCH_HIGH_TIMEOUT_MS : WATCH_LOW_TIMEOUT_MS,
        maximumAge: WATCH_MAX_AGE_MS
      }
    );
  };

  const onVisibility = () => {
    if (doc?.hidden) end();
    else begin();
  };
  doc?.addEventListener('visibilitychange', onVisibility);

  begin();
  const stopPermissionWatch = watchLocationPermission((state) => {
    if (state === 'granted') begin();
    else if (state === 'denied') {
      end();
      raise('denied');
    }
  }, env.permissions);

  return () => {
    stopped = true;
    end();
    doc?.removeEventListener('visibilitychange', onVisibility);
    stopPermissionWatch();
  };
}

export interface FollowHandlers {
  /** Every trusted position: move the avatar */
  onMove: (fix: LocationFix) => void;
  /**
   * The app's idea of "where I am" should change: the first real GPS fix after an approximate (or
   * missing) one, a recovery after an outage, or the IP position when the watch gave up
   */
  onAnnounce: (fix: LocationFix) => void;
}

/** watchLocation plus the app-level behaviour: report fixes, fall back to IP on errors, announce recoveries */
export function followUser(handlers: FollowHandlers, env: LocateEnvironment = browserEnvironment()): () => void {
  return watchLocation(
    {
      onFix: (fix) => {
        const wasNotGps = status.source !== 'gps';
        reportFix(fix);
        handlers.onMove(fix);
        if (wasNotGps) handlers.onAnnounce(fix); // recovered (or the first real fix): clears the "approximate" state
      },
      onProblem: (problem) => {
        void fallbackToIp(problem, env.fetchImpl).then((fix) => {
          if (fix) handlers.onAnnounce(fix);
        });
      }
    },
    env
  );
}

// --- Telling the user how good the fix is -----------------------------------------------------

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'; // iPadOS reports itself as a Mac
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export const currentPlatform = (): Platform =>
  typeof navigator === 'undefined' ? 'desktop' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints);

export interface AccuracyAdvice {
  /** Stable per situation, so a dismissed tip stays dismissed */
  key: 'precise-off' | 'low';
  title: string;
  hint: string;
}

const PRECISE_STEPS: Record<Exclude<Platform, 'desktop'>, string> = {
  ios: 'On iPhone: Settings, Privacy & Security, Location Services, then your browser (Safari Websites, Chrome...): choose While Using and turn Precise Location on.',
  android:
    'On Android: Settings, Location, make sure Location is on and "Use precise location" (or Google Location Accuracy) is enabled. When the browser asks, choose Precise rather than Approximate.'
};

/** "±45 m" / "±1.2 km" */
export function formatAccuracy(meters: number): string {
  return meters < 1000 ? `±${Math.max(1, Math.round(meters))} m` : `±${(meters / 1000).toFixed(1)} km`;
}

/**
 * Advice for phones whose GPS position is coarse. Several kilometers on a phone almost always
 * means "precise location" is switched off for the browser; desktops are never nagged (a laptop's
 * Wi-Fi position is normally coarse).
 */
export function accuracyAdvice(fix: { source: string; accuracy: number } | null, platform: Platform): AccuracyAdvice | null {
  if (!fix || fix.source !== 'gps' || platform === 'desktop' || fix.accuracy <= 100) return null;
  const steps = PRECISE_STEPS[platform];
  if (fix.accuracy > 1000) {
    return {
      key: 'precise-off',
      title: 'Precise location looks switched off',
      hint: `Your phone placed you within ${formatAccuracy(fix.accuracy)}, which usually means only approximate location is shared. ${steps}`
    };
  }
  return {
    key: 'low',
    title: `Your position is only accurate to ${formatAccuracy(fix.accuracy)}`,
    hint: `Step outside or near a window for a sharper GPS fix, and check that precise location is on. ${steps}`
  };
}

/** One line for the "Location" status: which source is in use and how good it is */
export function describeSource(s: Pick<LocationStatus, 'source' | 'accuracy'>): string | null {
  switch (s.source) {
    case 'gps':
      return s.accuracy != null ? `GPS ${formatAccuracy(s.accuracy)}` : 'GPS';
    case 'ip':
      return 'Approximate, about 25 km (from your network)';
    case 'hub':
      return 'City hub (your location is not available)';
    default:
      return null;
  }
}

/** Plain-language explanation and the way out, for each reason the browser's location was not used */
export function describeLocationProblem(problem: LocationProblem, usingApproximate: boolean): { title: string; hint: string } {
  const used = usingApproximate
    ? 'Showing your approximate area (about 25 km) from your network instead.'
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
  /** Meters, for the fix in use */
  accuracy: number | null;
}

const UNKNOWN: LocationStatus = { source: 'unknown', permission: 'unknown', problem: null, place: null, accuracy: null };
let status: LocationStatus = UNKNOWN;
const listeners = new Set<() => void>();

function publishStatus(next: LocationStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

/** A trusted GPS fix is now in use: the app is no longer "approximate" and the accuracy is current */
export function reportFix(fix: LocationFix) {
  if (fix.source !== 'gps') return;
  if (status.source === 'gps' && status.accuracy === fix.accuracy) return;
  publishStatus({ source: 'gps', permission: 'granted', problem: null, place: null, accuracy: fix.accuracy });
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
  publishStatus(UNKNOWN);
  tracker.reset();
}
