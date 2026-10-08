/**
 * Asks the server to download OpenStreetMap data for everything within 40 km of the user's
 * exact coordinates, and reports progress. Tiles near the camera are also built on demand,
 * so the map works immediately; this fills in the rest of the radius in the background.
 */

export const COVERAGE_RADIUS_KM = 40;
const POLL_MS = 15_000;
const GIVE_UP_AFTER_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const MAX_RETRIES = 3;

export interface CoverageStatus {
  originId: string;
  radiusKm: number;
  total: number;
  done: number;
  failed: number;
  percent: number;
  state: 'running' | 'paused' | 'done';
}

/** Starts coverage for a point and keeps `onStatus` updated until it finishes. Returns a stop function. */
export function startMapCoverage(
  latitude: number,
  longitude: number,
  onStatus: (status: CoverageStatus | null) => void
): () => void {
  let stopped = false;
  let timer: number | undefined;
  let retries = 0;
  const startedAt = Date.now();

  /** A finished job that had failed cells (a busy OpenStreetMap server) is asked for again later */
  const finish = (status: CoverageStatus) => {
    if (status.state === 'done' && status.failed > 0 && retries < MAX_RETRIES && Date.now() - startedAt < GIVE_UP_AFTER_MS) {
      retries++;
      timer = window.setTimeout(begin, RETRY_MS);
      return;
    }
    if (status.state !== 'done' && Date.now() - startedAt < GIVE_UP_AFTER_MS) timer = window.setTimeout(poll, POLL_MS);
  };

  const poll = async () => {
    try {
      const res = await fetch(
        `/api/map/coverage?lat=${latitude.toFixed(4)}&lng=${longitude.toFixed(4)}&radius=${COVERAGE_RADIUS_KM}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = (await res.json()) as CoverageStatus;
      if (stopped) return;
      onStatus(status);
      finish(status);
    } catch (err) {
      console.info('[PULSE map] Coverage status unavailable:', (err as Error).message);
      if (!stopped) timer = window.setTimeout(poll, POLL_MS);
    }
  };

  async function begin() {
    try {
      const res = await fetch('/api/map/coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, radiusKm: COVERAGE_RADIUS_KM })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = (await res.json()) as CoverageStatus;
      if (stopped) return;
      onStatus(status);
      finish(status);
    } catch (err) {
      // No map server (static hosting, offline): the pre-built areas still work
      console.info('[PULSE map] Coverage not started:', (err as Error).message);
      onStatus(null);
    }
  }

  void begin();

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
  };
}
