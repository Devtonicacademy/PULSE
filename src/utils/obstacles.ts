/**
 * What the avatar cannot walk through: building footprints and water, built from the loaded map tiles.
 * Shared by free walking (collision with sliding along walls) and the street router (so a route never
 * cuts across a building to reach its start or end). Pure maths on map meters (x east, y north).
 *
 * Buildings that hover (raised parts with nothing underneath) do not block; water does not block on a
 * bridge. Standing inside an obstacle (a GPS fix that lands on a footprint) never traps the avatar: it
 * can always walk out.
 */

export type Point = [number, number];
type Flat = number[];

export interface TileObstacles {
  /** Ground-level building footprints: [outerRing, ...holeRings], flat decimeters relative to the tile origin */
  buildings: Flat[][];
  /** Water polygons, same shape */
  water: Flat[][];
  /** Bridge centrelines [half width dm, points], where water can be crossed */
  bridges: [number, Flat][];
}

interface Ring {
  pts: Point[];
  bbox: [number, number, number, number];
}

interface Poly {
  outer: Ring;
  holes: Ring[];
}

interface BridgeLine {
  pts: Point[];
  half: number;
  bbox: [number, number, number, number];
}

interface TileEntry {
  buildings: Poly[];
  water: Poly[];
  bridges: BridgeLine[];
}

/** Keeps the avatar this far from a wall, meters */
export const AVATAR_RADIUS = 0.7;
/** Finest step used to check a move, so a long step cannot jump over a thin wall */
const SUBSTEP_METERS = 0.4;
const BRIDGE_MARGIN = 2.5;

const ringOf = (flat: Flat, origin: Point): Ring => {
  const pts: Point[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = origin[0] + flat[i] / 10;
    const y = origin[1] + flat[i + 1] / 10;
    pts.push([x, y]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { pts, bbox: [minX, minY, maxX, maxY] };
};

function inRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on a segment, with its distance */
function nearestOnSegment(p: Point, a: Point, b: Point): { point: Point; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const point: Point = [a[0] + t * dx, a[1] + t * dy];
  return { point, dist: Math.hypot(p[0] - point[0], p[1] - point[1]) };
}

/** Distance from a point to a polyline, and the segment direction at the nearest spot */
export function distanceToPolyline(p: Point, pts: Point[]): { dist: number; point: Point; tangent: Point } {
  let best = { dist: Infinity, point: pts[0] ?? p, tangent: [1, 0] as Point };
  for (let i = 0; i < pts.length - 1; i++) {
    const n = nearestOnSegment(p, pts[i], pts[i + 1]);
    if (n.dist < best.dist) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1;
      best = { dist: n.dist, point: n.point, tangent: [(pts[i + 1][0] - pts[i][0]) / len, (pts[i + 1][1] - pts[i][1]) / len] };
    }
  }
  return best;
}

const near = (bbox: [number, number, number, number], p: Point, r: number) =>
  p[0] >= bbox[0] - r && p[0] <= bbox[2] + r && p[1] >= bbox[1] - r && p[1] <= bbox[3] + r;

export class ObstacleIndex {
  private tiles = new Map<string, TileEntry>();
  private tileSize: number;

  constructor(tileSize = 500) {
    this.tileSize = tileSize;
  }

  private key(tx: number, ty: number) {
    return `${tx}_${ty}`;
  }

  setTile(tx: number, ty: number, origin: Point, data: TileObstacles) {
    const polys = (list: Flat[][]): Poly[] =>
      list
        .filter((rings) => rings.length && rings[0].length >= 6)
        .map(([outer, ...holes]) => ({ outer: ringOf(outer, origin), holes: holes.map((h) => ringOf(h, origin)) }));
    this.tiles.set(this.key(tx, ty), {
      buildings: polys(data.buildings),
      water: polys(data.water),
      bridges: data.bridges.map(([halfDm, flat]) => {
        const ring = ringOf(flat, origin);
        return { pts: ring.pts, half: halfDm / 10, bbox: ring.bbox };
      })
    });
  }

  removeTile(tx: number, ty: number) {
    this.tiles.delete(this.key(tx, ty));
  }

  clear() {
    this.tiles.clear();
  }

  get tileCount() {
    return this.tiles.size;
  }

  /** The tile entries around a point (buildings are filed by centroid, so they can reach into neighbours) */
  private around(p: Point): TileEntry[] {
    const tx = Math.floor(p[0] / this.tileSize);
    const ty = Math.floor(p[1] / this.tileSize);
    const out: TileEntry[] = [];
    for (let x = tx - 1; x <= tx + 1; x++) {
      for (let y = ty - 1; y <= ty + 1; y++) {
        const entry = this.tiles.get(this.key(x, y));
        if (entry) out.push(entry);
      }
    }
    return out;
  }

  /** Inside the polygon, or closer than `r` to its boundary (a wall has thickness for the avatar) */
  private touches(poly: Poly, p: Point, r: number): boolean {
    if (!near(poly.outer.bbox, p, r)) return false;
    const inOuter = inRing(p, poly.outer.pts);
    const inHole = poly.holes.find((h) => near(h.bbox, p, 0) && inRing(p, h.pts));
    if (inOuter && !inHole) {
      // Inside the walls: blocked, unless clear of every edge inside a courtyard
      return true;
    }
    if (r <= 0) return false;
    if (inHole) {
      const d = distanceToPolyline(p, [...inHole.pts, inHole.pts[0]]).dist;
      return d < r;
    }
    return distanceToPolyline(p, [...poly.outer.pts, poly.outer.pts[0]]).dist < r;
  }

  private onBridge(p: Point, entries: TileEntry[]): boolean {
    for (const entry of entries) {
      for (const bridge of entry.bridges) {
        if (near(bridge.bbox, p, bridge.half + BRIDGE_MARGIN) && distanceToPolyline(p, bridge.pts).dist <= bridge.half + BRIDGE_MARGIN) {
          return true;
        }
      }
    }
    return false;
  }

  /** True when the avatar (a disc of radius r) cannot stand at p */
  blocked(p: Point, r = AVATAR_RADIUS): boolean {
    const entries = this.around(p);
    for (const entry of entries) {
      for (const poly of entry.buildings) if (this.touches(poly, p, r)) return true;
    }
    for (const entry of entries) {
      for (const poly of entry.water) {
        if (this.touches(poly, p, 0) && !this.onBridge(p, entries)) return true;
      }
    }
    return false;
  }

  /** Whether a straight walk from a to b passes through anything */
  segmentBlocked(a: Point, b: Point, r = AVATAR_RADIUS): boolean {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / 1.0));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r)) return true;
    }
    return false;
  }

  /** Nearest wall edge direction near p, for sliding along it */
  private wallTangent(p: Point): Point | null {
    let best: { dist: number; tangent: Point } | null = null;
    for (const entry of this.around(p)) {
      for (const poly of entry.buildings) {
        if (!near(poly.outer.bbox, p, 6)) continue;
        const ring = [...poly.outer.pts, poly.outer.pts[0]];
        const d = distanceToPolyline(p, ring);
        if (!best || d.dist < best.dist) best = { dist: d.dist, tangent: d.tangent };
      }
    }
    return best && best.dist < 6 ? best.tangent : null;
  }

  /**
   * Moves from `from` toward `to` without entering an obstacle. The move is checked in small steps (a
   * long stride cannot jump a thin wall); when a wall is hit, the rest of the move slides along it.
   * If the avatar already stands inside an obstacle it is let out freely.
   */
  move(from: Point, to: Point, r = AVATAR_RADIUS): { position: Point; blocked: boolean } {
    if (this.blocked(from, r)) return { position: to, blocked: false };
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return { position: from, blocked: false };

    let pos: Point = from;
    let hit = false;
    let remaining = length;
    let dir: Point = [dx / length, dy / length];
    const steps = Math.ceil(length / SUBSTEP_METERS);
    const stepLen = length / steps;
    for (let i = 0; i < steps && remaining > 1e-6; i++) {
      const next: Point = [pos[0] + dir[0] * stepLen, pos[1] + dir[1] * stepLen];
      if (!this.blocked(next, r)) {
        pos = next;
        remaining -= stepLen;
        continue;
      }
      hit = true;
      // Slide: keep only the part of the heading that runs along the wall
      const tangent = this.wallTangent(next);
      let slid = false;
      if (tangent) {
        const along = dir[0] * tangent[0] + dir[1] * tangent[1];
        const slide: Point = [pos[0] + tangent[0] * along * stepLen, pos[1] + tangent[1] * along * stepLen];
        if (Math.abs(along) > 0.05 && !this.blocked(slide, r)) {
          pos = slide;
          dir = [tangent[0] * Math.sign(along), tangent[1] * Math.sign(along)];
          remaining -= stepLen;
          slid = true;
        }
      }
      if (!slid) {
        // Corner or dead end: try each axis on its own, else stop here
        const ax: Point = [pos[0] + Math.sign(dir[0]) * stepLen, pos[1]];
        const ay: Point = [pos[0], pos[1] + Math.sign(dir[1]) * stepLen];
        if (Math.abs(dir[0]) > 0.2 && !this.blocked(ax, r)) pos = ax;
        else if (Math.abs(dir[1]) > 0.2 && !this.blocked(ay, r)) pos = ay;
        else break;
        remaining -= stepLen;
      }
    }
    return { position: pos, blocked: hit };
  }
}

/** The tile data the 3D map keeps current as tiles stream in and out */
export const obstacles = new ObstacleIndex();
