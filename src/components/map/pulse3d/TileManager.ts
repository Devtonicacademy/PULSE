import * as THREE from 'three';
import { tileForMeters, tileKey } from '../../../utils/mapProjection';
import { MapTile, MapTileIndex, MAP_TILES_BASE_URL } from './tileFormat';
import { PulseMaterials } from './materials';
import { buildTileGroup, disposeTileGroup } from './tileMeshes';

export interface TileManagerOptions {
  /** Tiles whose center is within this distance of the focus are loaded */
  loadRadiusMeters?: number;
  /** Loaded tiles farther than this are unloaded (hysteresis avoids thrashing) */
  unloadRadiusMeters?: number;
  /** Upper bound on tiles kept in the scene at once */
  maxLoadedTiles?: number;
}

/**
 * Streams map tiles in and out around a focus point (map meters, x east / y north).
 * Fetches are parallel, but meshes are built at most one per frame to avoid hitches.
 */
export class TileManager {
  readonly root = new THREE.Group();
  index: MapTileIndex | null = null;

  private loaded = new Map<string, THREE.Group>();
  private pending = new Set<string>();
  private buildQueue: MapTile[] = [];
  private focus: [number, number] = [0, 0];
  private disposed = false;
  private readonly loadRadius: number;
  private readonly unloadRadius: number;
  private readonly maxLoaded: number;

  constructor(private materials: PulseMaterials, options: TileManagerOptions = {}) {
    this.loadRadius = options.loadRadiusMeters ?? 1000;
    this.unloadRadius = options.unloadRadiusMeters ?? 1500;
    this.maxLoaded = options.maxLoadedTiles ?? 40;
    this.root.name = 'map-tiles';
  }

  async init(): Promise<MapTileIndex> {
    const res = await fetch(`${MAP_TILES_BASE_URL}index.json`);
    if (!res.ok) throw new Error(`Map tile index failed to load (HTTP ${res.status})`);
    this.index = (await res.json()) as MapTileIndex;
    this.refresh();
    return this.index;
  }

  get loadedCount() {
    return this.loaded.size;
  }

  /** True when the focus point lies inside a tile we have data for */
  hasDataAt(x: number, y: number): boolean {
    return Boolean(this.index?.tiles[tileKey(...tileForMeters(x, y))]);
  }

  setFocus(x: number, y: number) {
    this.focus = [x, y];
    this.refresh();
  }

  /** Call once per frame: builds at most one queued tile */
  tick() {
    if (this.buildQueue.length > 1) {
      this.buildQueue.sort((a, b) => this.tileDistance(a.tx, a.ty) - this.tileDistance(b.tx, b.ty));
    }
    const tile = this.buildQueue.shift();
    if (!tile || this.disposed) return;
    const key = tileKey(tile.tx, tile.ty);
    if (this.loaded.has(key) || !this.isWithin(tile.tx, tile.ty, this.unloadRadius)) return;
    const group = buildTileGroup(tile, this.materials, this.index!.tileSize);
    this.root.add(group);
    this.loaded.set(key, group);
  }

  dispose() {
    this.disposed = true;
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

    // Request near tiles, closest first, within the tile budget
    const [ftx, fty] = tileForMeters(...this.focus);
    const reach = Math.ceil(this.loadRadius / size) + 1;
    const wanted: { key: string; tx: number; ty: number; dist: number }[] = [];
    for (let tx = ftx - reach; tx <= ftx + reach; tx++) {
      for (let ty = fty - reach; ty <= fty + reach; ty++) {
        const key = tileKey(tx, ty);
        if (!this.index.tiles[key] || this.loaded.has(key) || this.pending.has(key)) continue;
        const dist = this.tileDistance(tx, ty);
        if (dist <= this.loadRadius) wanted.push({ key, tx, ty, dist });
      }
    }
    wanted.sort((a, b) => a.dist - b.dist);
    const budget = this.maxLoaded - this.loaded.size - this.pending.size;
    for (const { key } of wanted.slice(0, Math.max(0, budget))) this.fetchTile(key);
  }

  private async fetchTile(key: string) {
    this.pending.add(key);
    try {
      const res = await fetch(`${MAP_TILES_BASE_URL}${key}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tile = (await res.json()) as MapTile;
      if (!this.disposed) this.buildQueue.push(tile);
    } catch (err) {
      console.warn(`[PULSE 3D] Tile ${key} failed to load:`, err);
    } finally {
      this.pending.delete(key);
    }
  }
}
