import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  TILE_SIZE_METERS,
  VI_ORIGIN,
  buildTiles,
  createProjection,
  extractFeatures,
  tileKey,
  withOrigin
} from './tileBuilder.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** A cell is a square block of tiles downloaded and cached together (4 x 4 tiles = 2 km) */
export const BLOCK_TILES = 4;
const CELL_METERS = BLOCK_TILES * TILE_SIZE_METERS;

export const MAX_RADIUS_KM = 40;
const NEAR_VI_KM = 100;
const ORIGIN_GRID_DEGREES = 0.25;

// --- Origins ---------------------------------------------------------------------------------

const toRad = (deg) => (deg * Math.PI) / 180;

export function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * The projection origin for a user's location. Near Lagos everyone shares the Victoria Island
 * origin (so the pre-built tiles line up and the cache is shared); anywhere else the origin
 * snaps to a coarse grid, so users in the same area also share cached data. The client has the
 * same rule in src/utils/mapOrigin.ts.
 */
export function originFor(lat, lng) {
  if (distanceKm(lat, lng, VI_ORIGIN.latitude, VI_ORIGIN.longitude) <= NEAR_VI_KM) {
    return { id: 'vi', latitude: VI_ORIGIN.latitude, longitude: VI_ORIGIN.longitude };
  }
  const snap = (v) => Math.round(v / ORIGIN_GRID_DEGREES) * ORIGIN_GRID_DEGREES;
  const latitude = Math.round(snap(lat) * 100) / 100;
  const longitude = Math.round(snap(lng) * 100) / 100;
  return { id: `${latitude.toFixed(2)}_${longitude.toFixed(2)}`, latitude, longitude };
}

/** Parses an origin id from a URL; returns null for anything originFor() could not have produced */
export function parseOriginId(id) {
  if (id === 'vi') return { id, latitude: VI_ORIGIN.latitude, longitude: VI_ORIGIN.longitude };
  const match = /^(-?\d{1,2}\.\d{2})_(-?\d{1,3}\.\d{2})$/.exec(id);
  if (!match) return null;
  const [latitude, longitude] = [Number(match[1]), Number(match[2])];
  const onGrid = (v) => Math.abs(v / ORIGIN_GRID_DEGREES - Math.round(v / ORIGIN_GRID_DEGREES)) < 1e-6;
  if (!onGrid(latitude) || !onGrid(longitude) || Math.abs(latitude) > 70 || Math.abs(longitude) > 180) return null;
  return { id, latitude, longitude };
}

// --- Cells -----------------------------------------------------------------------------------

export const cellOfTile = (tx, ty) => [Math.floor(tx / BLOCK_TILES), Math.floor(ty / BLOCK_TILES)];

/** [south, west, north, east] of a cell, with a small margin so features on the border are kept */
export function cellBounds(origin, cx, cy) {
  const { metersToLngLat } = createProjection(origin);
  const margin = 25;
  const [west, south] = metersToLngLat(cx * CELL_METERS - margin, cy * CELL_METERS - margin);
  const [east, north] = metersToLngLat((cx + 1) * CELL_METERS + margin, (cy + 1) * CELL_METERS + margin);
  return [south, west, north, east];
}

/** Cells whose area intersects the circle, nearest to the center first */
export function cellsInRadius(origin, lat, lng, radiusKm) {
  const { lngLatToMeters } = createProjection(origin);
  const [x, y] = lngLatToMeters(lng, lat);
  const r = radiusKm * 1000;
  const cells = [];
  for (let cx = Math.floor((x - r) / CELL_METERS); cx <= Math.floor((x + r) / CELL_METERS); cx++) {
    for (let cy = Math.floor((y - r) / CELL_METERS); cy <= Math.floor((y + r) / CELL_METERS); cy++) {
      const nearestX = Math.max(cx * CELL_METERS, Math.min(x, (cx + 1) * CELL_METERS));
      const nearestY = Math.max(cy * CELL_METERS, Math.min(y, (cy + 1) * CELL_METERS));
      if (Math.hypot(nearestX - x, nearestY - y) > r) continue;
      const centerDist = Math.hypot((cx + 0.5) * CELL_METERS - x, (cy + 0.5) * CELL_METERS - y);
      cells.push({ cx, cy, centerDist });
    }
  }
  return cells.sort((a, b) => a.centerDist - b.centerDist);
}

const storageKey = (originId, cx, cy) => `osm/${originId}/${cx}_${cy}.json.gz`;
const cellId = (originId, cx, cy) => `${originId}:${cx}_${cy}`;

/** Builds every tile of a cell from the Overpass elements (pure; no I/O) */
export function buildCellBundle(elements, origin, cx, cy) {
  return withOrigin(origin, () => {
    const features = extractFeatures(elements);
    const tileList = [];
    for (let tx = cx * BLOCK_TILES; tx < (cx + 1) * BLOCK_TILES; tx++) {
      for (let ty = cy * BLOCK_TILES; ty < (cy + 1) * BLOCK_TILES; ty++) tileList.push([tx, ty]);
    }
    const stats = { buildings: { height: 0, levels: 0, default: 0 }, replacedByParts: 0, roadMeters: 0, danglingPieces: 0 };
    const tiles = {};
    for (const tile of buildTiles(tileList, features, stats).values()) {
      tiles[tileKey(tile.tx, tile.ty)] = {
        v: 1,
        tx: tile.tx,
        ty: tile.ty,
        origin: tile.origin,
        buildings: tile.buildings,
        roads: tile.roads,
        water: tile.water,
        green: tile.green,
        sand: tile.sand,
        land: tile.land
      };
    }
    return { v: 1, cx, cy, builtAt: new Date().toISOString(), tiles };
  });
}

// --- Service ---------------------------------------------------------------------------------

/**
 * Builds, caches and serves map tiles for any place, and downloads a whole radius in the
 * background. Cells are built from Overpass one at a time (nearest first, on-demand requests
 * jump the queue) and cached in the photo bucket, so each area is only ever downloaded once.
 */
export function createCoverageService({
  storage,
  overpass,
  now = Date.now,
  maxDownloadsPerDay = Number(process.env.COVERAGE_MAX_DOWNLOADS_PER_DAY ?? 2500),
  failureBackoffMs = 5 * 60 * 1000,
  memoryCells = 16,
  log = () => {}
}) {
  const memory = new Map(); // cell id -> bundle (LRU by insertion order)
  const inflight = new Map(); // cell id -> Promise<bundle>
  const failedUntil = new Map(); // cell id -> timestamp
  const queue = []; // { id, originId, origin, cx, cy, priority, resolve, reject }
  const jobs = new Map(); // job key -> job
  const pumping = { interactive: false, background: false };
  let resumeTimer = null;
  let day = { date: '', downloads: 0 };

  const today = () => new Date(now()).toISOString().slice(0, 10);
  function downloadsToday() {
    if (day.date !== today()) day = { date: today(), downloads: 0 };
    return day.downloads;
  }

  function remember(id, bundle) {
    memory.delete(id);
    memory.set(id, bundle);
    while (memory.size > memoryCells) memory.delete(memory.keys().next().value);
  }

  async function readCached(originId, cx, cy) {
    const buffer = await storage.getMapData(storageKey(originId, cx, cy));
    if (!buffer) return null;
    try {
      const bundle = JSON.parse((await gunzipAsync(buffer)).toString('utf8'));
      // Anything that is not a bundle for this cell (corrupt, truncated, foreign) is rebuilt
      return bundle && typeof bundle.tiles === 'object' && bundle.cx === cx && bundle.cy === cy ? bundle : null;
    } catch {
      return null;
    }
  }

  async function build(task) {
    const { origin, cx, cy } = task;
    const bounds = cellBounds(origin, cx, cy);
    const data = await overpass.fetchBounds(bounds, task.id, { background: task.priority > 0 });
    day.downloads++;
    const bundle = buildCellBundle(data.elements ?? [], origin, cx, cy);
    await storage.putMapData(storageKey(origin.id, cx, cy), await gzipAsync(JSON.stringify(bundle)));
    return bundle;
  }

  /** One worker per lane: priority 0 (a person is waiting) and background (priority 1) */
  async function pump(lane) {
    if (pumping[lane]) return;
    pumping[lane] = true;
    const inLane = (t) => (lane === 'interactive' ? t.priority === 0 : t.priority > 0);
    try {
      for (;;) {
        const task = queue.find(inLane);
        if (!task) break;
        // Background work stops at the daily cap; people actually looking at the map get 20% more
        const cap = lane === 'interactive' ? Math.ceil(maxDownloadsPerDay * 1.2) : maxDownloadsPerDay;
        if (downloadsToday() >= cap) {
          if (lane === 'interactive') {
            queue.splice(queue.indexOf(task), 1);
            task.reject(new Error('Daily map download limit reached'));
            continue;
          }
          // Background tasks wait for the next day; look again in a while
          if (!resumeTimer) {
            resumeTimer = setTimeout(() => {
              resumeTimer = null;
              void pump('background');
            }, 10 * 60 * 1000);
            resumeTimer.unref?.();
          }
          break;
        }
        queue.splice(queue.indexOf(task), 1);
        try {
          const bundle = await build(task);
          remember(task.id, bundle);
          task.resolve(bundle);
        } catch (err) {
          log(`cell ${task.id} failed: ${err.message}`);
          failedUntil.set(task.id, now() + failureBackoffMs);
          task.reject(err);
        }
      }
    } finally {
      pumping[lane] = false;
    }
  }

  /** Resolves with the cell's bundle, from memory, the bucket or a fresh download */
  function getBundle(origin, cx, cy, priority = 0) {
    const id = cellId(origin.id, cx, cy);
    const cached = memory.get(id);
    if (cached) {
      remember(id, cached);
      return Promise.resolve(cached);
    }
    if (inflight.has(id)) {
      const waiting = queue.find((t) => t.id === id);
      if (waiting && priority < waiting.priority) {
        waiting.priority = priority; // a person is now waiting on a background download: move it to the front lane
        void pump('interactive');
      }
      return inflight.get(id);
    }
    if ((failedUntil.get(id) ?? 0) > now()) return Promise.reject(new Error('Map data for this area is unavailable right now'));

    const promise = (async () => {
      const fromStorage = await readCached(origin.id, cx, cy);
      if (fromStorage) {
        remember(id, fromStorage);
        return fromStorage;
      }
      return new Promise((resolve, reject) => {
        queue.push({ id, origin, cx, cy, priority, resolve, reject });
        void pump(priority === 0 ? 'interactive' : 'background');
      });
    })().finally(() => inflight.delete(id));
    inflight.set(id, promise);
    return promise;
  }

  return {
    /** One map tile (a plain object), or null when the key is outside the bundle */
    async getTile(origin, tx, ty) {
      const [cx, cy] = cellOfTile(tx, ty);
      const bundle = await getBundle(origin, cx, cy, 0);
      return bundle.tiles[tileKey(tx, ty)] ?? null;
    },

    /** Starts (or returns) the background download of everything within `radiusKm` */
    startCoverage(lat, lng, radiusKm = MAX_RADIUS_KM) {
      const radius = Math.min(MAX_RADIUS_KM, Math.max(1, radiusKm));
      const origin = originFor(lat, lng);
      const key = `${origin.id}:${lat.toFixed(4)}:${lng.toFixed(4)}:${radius}`;
      const existing = jobs.get(key);
      // A finished job that had failures is run again once the failure back-off has passed
      const retryable = existing?.finishedAt && existing.failed > 0 && now() - existing.finishedAt > failureBackoffMs;
      if (existing && !retryable) return existing;

      const cells = cellsInRadius(origin, lat, lng, radius);
      const job = { key, originId: origin.id, radiusKm: radius, total: cells.length, done: 0, failed: 0, startedAt: now(), finishedAt: null };
      jobs.set(key, job);
      while (jobs.size > 8) jobs.delete(jobs.keys().next().value);

      // Walk the cells nearest-first; cached cells are skipped without downloading anything
      void (async () => {
        for (const { cx, cy } of cells) {
          try {
            const id = cellId(origin.id, cx, cy);
            if (!memory.has(id) && (await storage.hasMapData(storageKey(origin.id, cx, cy)))) {
              job.done++;
              continue;
            }
            await getBundle(origin, cx, cy, 1);
            job.done++;
          } catch {
            job.failed++;
          }
        }
        job.finishedAt = now();
      })();
      return job;
    },

    jobStatus(job) {
      const finished = job.done + job.failed;
      return {
        originId: job.originId,
        radiusKm: job.radiusKm,
        total: job.total,
        done: job.done,
        failed: job.failed,
        percent: Math.min(100, Math.round((finished / Math.max(1, job.total)) * 100)),
        state: job.finishedAt ? 'done' : downloadsToday() >= maxDownloadsPerDay && queue.length ? 'paused' : 'running'
      };
    },

    findJob(lat, lng, radiusKm = MAX_RADIUS_KM) {
      const origin = originFor(lat, lng);
      return jobs.get(`${origin.id}:${lat.toFixed(4)}:${lng.toFixed(4)}:${Math.min(MAX_RADIUS_KM, Math.max(1, radiusKm))}`) ?? null;
    },

    /** Test hook */
    get queueLength() {
      return queue.length;
    }
  };
}
