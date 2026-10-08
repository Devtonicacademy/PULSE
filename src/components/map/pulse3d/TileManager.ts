import * as THREE from 'three';
import { MAP_ORIGIN_ID, tileForMeters, tileKey, usesLagosData } from '../../../utils/mapProjection';
import { MapTile, MapTileIndex, MAP_TILES_BASE_URL } from './tileFormat';
import { PulseMaterials } from './materials';
import { assembleTileGroup, buildTileGeometry, disposeTileGroup, TileGeometry } from './tileMeshes';
import type { TileRequest, TileResponse } from './tileWorker';
import { loadTileText } from './tileCache';
import { orderTiles } from './tilePriority';

export interface TileManagerOptions {
  /** Tiles whose center is within this distance of the focus are loaded */
  loadRadiusMeters?: number;
  /** Loaded tiles farther than this are unloaded (hysteresis avoids thrashing) */
  unloadRadiusMeters?: number;
  /** Upper bound on tiles kept in the scene at once */
  maxLoadedTiles?: number;
  /** Upper bound on the load radius when the camera is high up */
  maxLoadRadiusMeters?: number;
  /** Web Workers used for tile streaming (0 builds on the main thread) */
  workerCount?: number;
  /**
   * Build tiles missing from the pre-built set on the server (/api/map/tiles). Without it,
   * only the pre-built Lagos areas have data.
   */
  streamFromServer?: boolean;
}

/** Meshes wrapped per frame (cheap: the geometry already exists as typed arrays) */
const ASSEMBLE_PER_FRAME = 2;
/** A tile that failed to load is not asked for again for this long */
const RETRY_AFTER_MS = 20_000;
/** Tiles downloading at once; the rest wait their turn in priority order so the nearest arrive first */
const MAX_IN_FLIGHT = 6;
/** A jump this long (teleport, camera flight) waits for the view to settle before asking the server for tiles */
const JUMP_METERS = 400;
const SETTLE_MS = 700;

/**
 * Streams map tiles in and out around a focus point (map meters, x east / y north).
 * Downloading, parsing and geometry building happen in Web Workers; the render loop only
 * wraps finished arrays in meshes, a couple per frame. Without Worker support the same
 * work runs on the main thread, one tile per frame.
 */
export class TileManager {
  readonly root = new THREE.Group();
  index: MapTileIndex | null = null;

  private loaded = new Map<string, THREE.Group>();
  /** Requested and not yet turned into meshes (downloading, or built and waiting for tick()) */
  private pending = new Set<string>();
  /** Wanted but not requested yet, nearest / most visible first */
  private waiting: string[] = [];
  private downloading = 0;
  private heading: number | null = null;
  private buildQueue: TileGeometry[] = [];
  private workers: Worker[] = [];
  private nextWorker = 0;
  private streamFromServer: boolean;
  private failedAt = new Map<string, number>();
  private settleAt = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private nextRequestId = 1;
  private requests = new Map<number, string>();
  private focus: [number, number] = [0, 0];
  private disposed = false;
  private loadRadius: number;
  private unloadRadius: number;
  private readonly baseLoadRadius: number;
  private readonly maxLoadRadius: number;
  private readonly maxLoaded: number;

  constructor(private materials: PulseMaterials, options: TileManagerOptions = {}) {
    this.baseLoadRadius = options.loadRadiusMeters ?? 1000;
    this.loadRadius = this.baseLoadRadius;
    this.unloadRadius = options.unloadRadiusMeters ?? 1500;
    this.maxLoaded = options.maxLoadedTiles ?? 64;
    this.maxLoadRadius = options.maxLoadRadiusMeters ?? 2000;
    this.root.name = 'map-tiles';
    this.streamFromServer = options.streamFromServer ?? false;
    this.startWorkers(options.workerCount ?? Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 4) - 2)));
  }

  private startWorkers(count: number) {
    if (typeof Worker === 'undefined') return;
    try {
      for (let i = 0; i < count; i++) {
        const worker = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<TileResponse>) => this.onWorkerMessage(event.data);
        worker.onerror = (event) => {
          console.warn('[PULSE 3D] Tile worker failed, building tiles on the main thread:', event.message);
          this.stopWorkers();
        };
        this.workers.push(worker);
      }
    } catch (err) {
      console.warn('[PULSE 3D] Web Workers unavailable, building tiles on the main thread:', err);
      this.stopWorkers();
    }
  }

  private stopWorkers() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    // Anything still in flight is retried on the main thread
    const orphaned = [...this.requests.values()];
    this.requests.clear();
    orphaned.forEach((key) => {
      this.pending.delete(key);
      this.downloading = Math.max(0, this.downloading - 1);
    });
    if (!this.disposed) this.refresh();
  }

  private onWorkerMessage(msg: TileResponse) {
    const key = this.requests.get(msg.id);
    if (key === undefined) return;
    this.requests.delete(msg.id);
    this.downloading = Math.max(0, this.downloading - 1);
    if ('error' in msg) {
      this.pending.delete(key);
      this.failedAt.set(key, Date.now());
      console.warn(`[PULSE 3D] Tile ${key} failed to load:`, msg.error);
      this.pump();
      return;
    }
    // Stays "pending" until tick() wraps it, so refresh() doesn't ask for it again
    if (!this.disposed) this.buildQueue.push(msg.geometry);
    else this.pending.delete(key);
    this.pump();
  }

  async init(): Promise<MapTileIndex> {
    if (usesLagosData()) {
      const res = await fetch(`${MAP_TILES_BASE_URL}index.json`);
      if (!res.ok) throw new Error(`Map tile index failed to load (HTTP ${res.status})`);
      this.index = (await res.json()) as MapTileIndex;
    } else {
      // Outside Lagos there is no pre-built set: every tile comes from the server
      this.index = { v: 1, attribution: '© OpenStreetMap contributors (ODbL)', tileSize: 500, buildingKinds: [], roadClasses: [], areas: [], tiles: {} };
    }
    this.refresh();
    return this.index;
  }

  get loadedCount() {
    return this.loaded.size;
  }

  /** True when the focus point lies inside a tile we have data for */
  hasDataAt(x: number, y: number): boolean {
    return this.streamFromServer || Boolean(this.index?.tiles[tileKey(...tileForMeters(x, y))]);
  }

  /**
   * `viewRadius` widens loading when the camera is high enough to see further; `heading` is the
   * compass bearing the camera faces, so tiles ahead load before tiles behind
   */
  setFocus(x: number, y: number, viewRadius = 0, heading: number | null = null) {
    this.heading = heading;
    // Teleports and camera flights pass through many points; only the place the view lands
    // on is worth building on the server
    if (Math.hypot(x - this.focus[0], y - this.focus[1]) > JUMP_METERS) {
      this.settleAt = Date.now() + SETTLE_MS;
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => this.refresh(), SETTLE_MS + 50);
    }
    this.focus = [x, y];
    this.loadRadius = Math.min(this.maxLoadRadius, Math.max(this.baseLoadRadius, viewRadius));
    this.unloadRadius = this.loadRadius + 500;
    this.refresh();
  }

  /** Call once per frame: wraps a couple of finished tiles in meshes */
  tick() {
    if (this.buildQueue.length > 1) {
      this.buildQueue.sort((a, b) => this.tileDistance(a.tx, a.ty) - this.tileDistance(b.tx, b.ty));
    }
    const limit = this.workers.length ? ASSEMBLE_PER_FRAME : 1;
    for (let n = 0; n < limit; n++) {
      const data = this.buildQueue.shift();
      if (!data || this.disposed) return;
      const key = tileKey(data.tx, data.ty);
      this.pending.delete(key);
      if (this.loaded.has(key) || !this.isWithin(data.tx, data.ty, this.unloadRadius)) continue;
      const group = assembleTileGroup(data, this.materials);
      this.root.add(group);
      this.loaded.set(key, group);
    }
  }

  dispose() {
    this.disposed = true;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.requests.clear();
    this.loaded.forEach((group) => disposeTileGroup(group));
    this.loaded.clear();
    this.buildQueue = [];
  }

  private tileDistance(tx: number, ty: number): number {
    const size = this.index!.tileSize;
    const cx = (tx + 0.5) * size;
    const cy = (ty + 0.5) * size;
    return Math.hypot(cx - this.focus[0], cy - this.focus[1]);
  }

  private isWithin(tx: number, ty: number, radius: number) {
    return this.tileDistance(tx, ty) <= radius;
  }

  private refresh() {
    if (!this.index) return;
    const size = this.index.tileSize;

    // Unload far tiles
    this.loaded.forEach((group, key) => {
      const [tx, ty] = key.split('_').map(Number);
      if (!this.isWithin(tx, ty, this.unloadRadius)) {
        disposeTileGroup(group);
        this.loaded.delete(key);
      }
    });

    // Forget requests for places the view has left (their answers are ignored when they arrive)
    for (const key of [...this.pending]) {
      const [tx, ty] = key.split('_').map(Number);
      if (this.isWithin(tx, ty, this.unloadRadius) || this.buildQueue.some((t) => tileKey(t.tx, t.ty) === key)) continue;
      this.pending.delete(key);
      for (const [id, requested] of this.requests) {
        if (requested !== key) continue;
        this.requests.delete(id);
        this.downloading = Math.max(0, this.downloading - 1);
      }
    }

    // Work out what is wanted: near tiles, within the tile budget, in loading order
    const [ftx, fty] = tileForMeters(...this.focus);
    const reach = Math.ceil(this.loadRadius / size) + 1;
    const wanted: { key: string; tx: number; ty: number; dist: number }[] = [];
    for (let tx = ftx - reach; tx <= ftx + reach; tx++) {
      for (let ty = fty - reach; ty <= fty + reach; ty++) {
        const key = tileKey(tx, ty);
        const prebuilt = Boolean(this.index.tiles[key]);
        if (!prebuilt && (!this.streamFromServer || Date.now() < this.settleAt)) continue;
        if (this.loaded.has(key) || this.pending.has(key)) continue;
        if ((this.failedAt.get(key) ?? 0) > Date.now() - RETRY_AFTER_MS) continue;
        const dist = this.tileDistance(tx, ty);
        if (dist <= this.loadRadius) wanted.push({ key, tx, ty, dist });
      }
    }
    const budget = Math.max(0, this.maxLoaded - this.loaded.size - this.pending.size);
    // Only the best candidates are queued; anything the view moved away from simply drops out
    this.waiting = orderTiles(wanted, size, this.focus, this.heading)
      .slice(0, budget)
      .map((tile) => tile.key);
    this.pump();
  }

  /** Starts downloads from the front of the queue until MAX_IN_FLIGHT are running */
  private pump() {
    while (!this.disposed && this.downloading < MAX_IN_FLIGHT && this.waiting.length) {
      const key = this.waiting.shift()!;
      if (this.loaded.has(key) || this.pending.has(key)) continue;
      this.fetchTile(key);
    }
  }

  private async fetchTile(key: string) {
    this.pending.add(key);
    this.downloading++;
    const tileSize = this.index!.tileSize;
    // Pre-built tiles are static files; anything else is built by the server on demand
    const url = this.index!.tiles[key] ? `${MAP_TILES_BASE_URL}${key}.json` : `/api/map/tiles/${MAP_ORIGIN_ID}/${key}.json`;
    if (this.workers.length) {
      const id = this.nextRequestId++;
      this.requests.set(id, key);
      const request: TileRequest = { id, key, tileSize, url };
      this.workers[this.nextWorker++ % this.workers.length].postMessage(request);
      return;
    }
    try {
      const tile = JSON.parse(await loadTileText(url)) as MapTile;
      if (!this.disposed) this.buildQueue.push(buildTileGeometry(tile, tileSize));
      else this.pending.delete(key);
    } catch (err) {
      this.pending.delete(key);
      this.failedAt.set(key, Date.now());
      console.warn(`[PULSE 3D] Tile ${key} failed to load:`, err);
    } finally {
      this.downloading = Math.max(0, this.downloading - 1);
      this.pump();
    }
  }
}
