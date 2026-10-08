/**
 * Pure helpers for deciding which map tiles to fetch first and when a cached tile can be reused.
 * No browser or Three.js imports, so they run (and are tested) anywhere.
 */

export interface TileCandidate {
  key: string;
  tx: number;
  ty: number;
  /** Distance from the focus to the tile center, meters */
  dist: number;
}

/** Tiles this close are always first, whichever way the camera faces: they are underfoot */
export const NEAR_METERS = 400;
/** A tile more than this many degrees off the heading counts as behind the camera */
const BEHIND_DEGREES = 110;
/** Behind-the-camera tiles wait as if they were this much farther away */
const BEHIND_PENALTY = 1.6;

/** Smallest angle between two compass headings, 0..180 */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
}

/**
 * Orders tiles for loading: nearest first, with tiles in front of the camera ahead of equally
 * distant tiles behind it. `heading` is the compass bearing the camera looks along (degrees,
 * 0 = north, clockwise); without it, plain distance decides.
 */
export function orderTiles<T extends TileCandidate>(
  tiles: T[],
  tileSize: number,
  focus: [number, number],
  heading: number | null
): T[] {
  const score = (tile: T) => {
    if (heading === null || tile.dist <= NEAR_METERS) return tile.dist;
    const cx = (tile.tx + 0.5) * tileSize - focus[0];
    const cy = (tile.ty + 0.5) * tileSize - focus[1];
    const bearing = ((Math.atan2(cx, cy) * 180) / Math.PI + 360) % 360;
    return angleBetween(bearing, heading) > BEHIND_DEGREES ? tile.dist * BEHIND_PENALTY : tile.dist;
  };
  return tiles
    .map((tile) => ({ tile, score: score(tile) }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.tile);
}

export type CacheDecision = 'fresh' | 'stale' | 'expired';

/**
 * How to treat a cached tile of this age: `fresh` is used as is, `stale` is used right away while
 * a newer copy is fetched in the background, `expired` is not used if the network can answer.
 */
export function cacheDecision(ageMs: number, freshMs: number, staleMs: number): CacheDecision {
  if (ageMs < 0 || ageMs <= freshMs) return 'fresh';
  return ageMs <= freshMs + staleMs ? 'stale' : 'expired';
}
