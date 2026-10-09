import * as THREE from 'three';
import type { MapTile, FlatPoints, TileSurface, TileStreetName, TilePlace } from './tileFormat';
import { ROOF_SHAPE_NAMES } from './tileFormat';
import type { PulseMaterials } from './materials';
import { LAYER_RENDER_ORDER } from './layerOrder';
import { groundedMinHeights } from './buildingSupport';
import type { TileObstacles } from '../../../utils/obstacles';
import { buildRoof, defaultRoofHeight, orientedBox } from './roofShapes';
import type { PitchedShape } from './roofShapes';

/**
 * A tile is built in two steps so the heavy one can run in a Web Worker:
 *  1. buildTileGeometry: pure number crunching (triangulation, walls, props) -> typed arrays
 *  2. assembleTileGroup: wraps those arrays in meshes on the main thread (cheap)
 */
export interface LayerData {
  name: LayerName;
  renderOrder: number;
  attributes: Record<string, { array: Float32Array; itemSize: number }>;
}

export type LayerName = 'land' | 'water' | 'green' | 'forest' | 'sand' | 'roads' | 'barriers' | 'buildings' | 'trees' | 'lamps';

export interface TileGeometry {
  tx: number;
  ty: number;
  origin: [number, number];
  layers: LayerData[];
  /** Street and place names for the label overlay (plain data, no meshes) */
  labels: { streets: TileStreetName[]; places: TilePlace[] };
  /** What the walking avatar cannot pass through (plain data, no meshes) */
  obstacles: TileObstacles;
}

function layer(name: LayerName, renderOrder: number, attrs: Record<string, [number[], number]>): LayerData {
  const attributes: LayerData['attributes'] = {};
  for (const [key, [values, itemSize]] of Object.entries(attrs)) {
    attributes[key] = { array: new Float32Array(values), itemSize };
  }
  return { name, renderOrder, attributes };
}
import { ANCHORS } from '../../../theme/tokens';

const hex = (c: string) => parseInt(c.slice(1), 16);

/**
 * Turns one map tile into a few merged meshes (one draw call per layer).
 * Map coordinates are x east / y north; in the scene x = east, y = up, z = -north.
 * Tile groups sit at their origin so vertex positions stay small (float precision).
 */

// Facade tints per building kind (other, residential, commercial, industrial, civic, religious)
const KIND_COLORS = [0x34405e, 0x3a3d5c, 0x2f4470, 0x3d3d48, 0x354a63, 0x4a3d63].map((c) => new THREE.Color(c));
const ROOF_DARKEN = 0.7;
/** Real paint colours from OpenStreetMap are taken at this strength so they sit in the scene's light */
const REAL_COLOUR_SCALE = 0.9;

// Glow colour per road class (motorway … track), brightest for the arterials
const ROAD_EDGE_COLORS = [
  0xff4fa3, hex(ANCHORS.signal), 0x00d4ff, 0x38bdf8, 0x60a5fa, 0x3b5b8c, 0x2a3f63, 0x8b7cf6, 0x2a3f63
].map((c) => new THREE.Color(c));
const BRIDGE_EDGE_COLOR = new THREE.Color(ANCHORS.accent);
const BRIDGE_LIFT = 0.6;

const SURFACE_HEIGHT = { land: 0.01, green: 0.03, forest: 0.03, sand: 0.03, water: 0.02 };

function toRing(flat: FlatPoints): THREE.Vector2[] {
  const ring: THREE.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) ring.push(new THREE.Vector2(flat[i] / 10, flat[i + 1] / 10));
  return ring;
}

function signedArea(ring: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  }
  return sum / 2; // > 0 counter-clockwise
}

/** Deterministic 0..1 value per building so window patterns stay put across reloads */
function seedFor(tile: MapTile, index: number): number {
  const s = Math.sin((tile.tx * 73856093) ^ (tile.ty * 19349663) ^ (index * 83492791)) * 43758.5453;
  return s - Math.floor(s);
}

/** Triangulates a polygon with holes into a flat, upward-facing triangle list at height y */
function pushCap(
  positions: number[],
  normals: number[],
  outer: THREE.Vector2[],
  holes: THREE.Vector2[][],
  y: number,
  onVertex?: () => void
) {
  if (outer.length < 3) return;
  const faces = THREE.ShapeUtils.triangulateShape(outer, holes);
  const all = outer.concat(...holes);
  for (const [a, b, c] of faces) {
    const pa = all[a];
    const pb = all[b];
    const pc = all[c];
    // Keep counter-clockwise (viewed from above) so the face points up
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    const tri = cross >= 0 ? [pa, pb, pc] : [pa, pc, pb];
    for (const p of tri) {
      positions.push(p.x, y, -p.y);
      normals.push(0, 1, 0);
      onVertex?.();
    }
  }
}

// Surface ids read by the facade shader (aSurface.y)
const SURFACE_WALL = 0;
const SURFACE_ROOF = 1;
const SURFACE_PARAPET = 2;
const SURFACE_ITEM = 3;

// Parapets: flat-roof lip on mid-size and larger buildings
const PARAPET_MIN_AREA = 80;
const PARAPET_MIN_HEIGHT = 6;
const PARAPET_HEIGHT = 0.9;
const PARAPET_INSET = 0.35;

// Rooftop clutter: only on buildings big and tall enough for it to make sense
const CLUTTER_MIN_AREA = 200;
const CLUTTER_MIN_HEIGHT = 9;
const CLUTTER_MAX_ITEMS = 5;
const TANK_COLORS = [0x18191c, 0x1f2124, 0x2b5fa8].map((c) => new THREE.Color(c)); // black & blue plastic tanks
const AC_COLOR = new THREE.Color(0xc4c8cc);
const HUT_COLOR = new THREE.Color(0x8d8c88);

/** Small deterministic PRNG so rooftop layouts are stable across reloads */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInRing(p: THREE.Vector2, ring: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToRing(p: THREE.Vector2, ring: THREE.Vector2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1e-9)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/** Ring offset inward by `inset` meters (mitered, clamped so sharp corners don't explode) */
function insetRing(ring: THREE.Vector2[], inset: number): THREE.Vector2[] {
  const ccw = signedArea(ring) > 0;
  const n = ring.length;
  return ring.map((p, i) => {
    const prev = ring[(i + n - 1) % n];
    const next = ring[(i + 1) % n];
    const inward = (from: THREE.Vector2, to: THREE.Vector2) => {
      const d = new THREE.Vector2().subVectors(to, from).normalize();
      // Interior is on the left of a counter-clockwise ring
      return ccw ? new THREE.Vector2(-d.y, d.x) : new THREE.Vector2(d.y, -d.x);
    };
    const n1 = inward(prev, p);
    const n2 = inward(p, next);
    const bisector = n1.clone().add(n2);
    if (bisector.lengthSq() < 1e-6) bisector.copy(n1);
    bisector.normalize();
    const miter = Math.min(inset * 3, inset / Math.max(0.3, bisector.dot(n1)));
    return p.clone().addScaledVector(bisector, miter);
  });
}

interface BuildingBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
  facade: number[];
  surface: number[];
}

/**
 * Appends one vertex with all its attributes. Called for every vertex of every
 * building, so it takes plain numbers (no per-vertex arrays to garbage-collect).
 */
function pushVertex(
  buf: BuildingBuffers,
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  color: THREE.Color,
  u: number, v: number, seed: number, roofLevel: number,
  kind: number,
  surfaceId: number
) {
  buf.positions.push(x, y, z);
  buf.normals.push(nx, ny, nz);
  buf.colors.push(color.r, color.g, color.b);
  buf.facade.push(u, v, seed, roofLevel);
  buf.surface.push(kind, surfaceId);
}

/**
 * Vertical quad between ground points a -> b from y0 to y1, facing along (nx, ny)
 * in map coords. `faceRight` says whether that normal is on the right of a -> b
 * (decides the winding). Facade u runs along the edge from `u0`.
 */
function pushWall(
  buf: BuildingBuffers,
  a: THREE.Vector2, b: THREE.Vector2, y0: number, y1: number,
  nx: number, ny: number, faceRight: boolean,
  color: THREE.Color, u0: number, seed: number, roofLevel: number, kind: number, surfaceId: number
) {
  const u1 = u0 + a.distanceTo(b);
  const nz = -ny;
  // Corners: A0/B0 at the bottom, A1/B1 at the top; winding picks the visible side
  const [p, q, pu, qu] = faceRight ? [a, b, u0, u1] : [b, a, u1, u0];
  pushVertex(buf, p.x, y0, -p.y, nx, 0, nz, color, pu, y0, seed, roofLevel, kind, surfaceId);
  pushVertex(buf, q.x, y0, -q.y, nx, 0, nz, color, qu, y0, seed, roofLevel, kind, surfaceId);
  pushVertex(buf, q.x, y1, -q.y, nx, 0, nz, color, qu, y1, seed, roofLevel, kind, surfaceId);
  pushVertex(buf, p.x, y0, -p.y, nx, 0, nz, color, pu, y0, seed, roofLevel, kind, surfaceId);
  pushVertex(buf, q.x, y1, -q.y, nx, 0, nz, color, qu, y1, seed, roofLevel, kind, surfaceId);
  pushVertex(buf, p.x, y1, -p.y, nx, 0, nz, color, pu, y1, seed, roofLevel, kind, surfaceId);
}

/** Axis-aligned box sitting on the roof (no bottom face), rotated by `angle` */
function pushBox(
  buf: BuildingBuffers, cx: number, cy: number, base: number,
  w: number, d: number, h: number, angle: number,
  color: THREE.Color, seed: number, kind: number
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corner = (sx: number, sy: number) =>
    new THREE.Vector2(cx + (sx * w * cos - sy * d * sin) / 2, cy + (sx * w * sin + sy * d * cos) / 2);
  const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]; // counter-clockwise
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    const dir = new THREE.Vector2().subVectors(b, a).normalize();
    pushWall(buf, a, b, base, base + h, dir.y, -dir.x, true, color, 0, seed, 0, kind, SURFACE_ITEM);
  }
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const p = ring[i];
    pushVertex(buf, p.x, base + h, -p.y, 0, 1, 0, color, 0, base + h, seed, 0, kind, SURFACE_ITEM);
  }
}

/** Hexagonal prism (water tank) on the roof */
function pushTank(
  buf: BuildingBuffers, cx: number, cy: number, base: number,
  radius: number, h: number, color: THREE.Color, seed: number, kind: number
) {
  const sides = 6;
  const ring: THREE.Vector2[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    ring.push(new THREE.Vector2(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius));
  }
  for (let i = 0; i < sides; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % sides];
    const mid = new THREE.Vector2((a.x + b.x) / 2 - cx, (a.y + b.y) / 2 - cy).normalize();
    pushWall(buf, a, b, base, base + h, mid.x, mid.y, true, color, 0, seed, 0, kind, SURFACE_ITEM);
  }
  for (let i = 0; i < sides; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % sides];
    for (const p of [new THREE.Vector2(cx, cy), a, b]) {
      pushVertex(buf, p.x, base + h, -p.y, 0, 1, 0, color, 0, base + h, seed, 0, kind, SURFACE_ITEM);
    }
  }
}

/** Seeded water tanks, AC units and stair huts, kept clear of the roof edge */
function pushRooftopClutter(
  buf: BuildingBuffers, outer: THREE.Vector2[], area: number, roof: number,
  seed: number, kind: number
) {
  const rand = mulberry32(Math.floor(seed * 1e6) + 17);
  const count = Math.min(CLUTTER_MAX_ITEMS, 1 + Math.floor(rand() * 3) + (area > 800 ? 2 : 0));
  const [minX, minY, maxX, maxY] = outer.reduce(
    ([a, b, c, d], p) => [Math.min(a, p.x), Math.min(b, p.y), Math.max(c, p.x), Math.max(d, p.y)],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
  const placed: { p: THREE.Vector2; r: number }[] = [];
  for (let item = 0; item < count; item++) {
    const roll = rand();
    const type = roll < 0.5 ? 'tank' : roll < 0.85 ? 'ac' : 'hut';
    const radius = type === 'tank' ? 0.9 + rand() * 0.4 : type === 'ac' ? 0.7 : 1.9;
    for (let attempt = 0; attempt < 8; attempt++) {
      const p = new THREE.Vector2(minX + rand() * (maxX - minX), minY + rand() * (maxY - minY));
      if (!pointInRing(p, outer) || distanceToRing(p, outer) < radius + PARAPET_INSET + 0.5) continue;
      if (placed.some((q) => q.p.distanceTo(p) < q.r + radius + 0.4)) continue;
      placed.push({ p, r: radius });
      const angle = rand() * Math.PI;
      if (type === 'tank') {
        const color = TANK_COLORS[Math.floor(rand() * TANK_COLORS.length)];
        pushTank(buf, p.x, p.y, roof, radius, 1.6 + rand() * 0.6, color, seed, kind);
      } else if (type === 'ac') {
        pushBox(buf, p.x, p.y, roof, 1.0, 0.75, 0.8, angle, AC_COLOR, seed, kind);
      } else {
        pushBox(buf, p.x, p.y, roof, 3.0, 2.6, 2.6, angle, HUT_COLOR, seed, kind);
      }
      break;
    }
  }
}

function buildBuildings(tile: MapTile): LayerData | null {
  const buf: BuildingBuffers = { positions: [], normals: [], colors: [], facade: [], surface: [] };
  const color = new THREE.Color();
  const roofColor = new THREE.Color();
  // Parts that start above the ground with nothing under them are built down to it instead of hovering
  const startHeights = groundedMinHeights(tile.buildings);

  tile.buildings.forEach((building, index) => {
    const [height, , kind, outerFlat, ...holeFlats] = building;
    const minHeight = startHeights[index];
    const outer = toRing(outerFlat);
    const holes = holeFlats.map(toRing);
    const seed = seedFor(tile, index) * 100;
    const area = Math.abs(signedArea(outer));

    // What OpenStreetMap says about this building's paint and roof (only some buildings have it)
    const meta = tile.bmeta?.[index];
    const shape = meta ? ROOF_SHAPE_NAMES[meta[2]] : 'flat';
    let pitched: ReturnType<typeof buildRoof> = null;
    let eaves = Math.max(height, minHeight + 1);
    if (meta && shape !== 'flat' && !holes.length) {
      const box = orientedBox(outer);
      if (box) {
        const rise = meta[3] > 0 ? meta[3] / 10 : defaultRoofHeight(shape as PitchedShape, box);
        const top = Math.max(height, minHeight + 1) + (meta[4] ? 0 : rise);
        eaves = Math.max(minHeight + 1, top - rise);
        pitched = buildRoof(outer, shape as PitchedShape, eaves, Math.min(rise, top - eaves));
      }
    }

    const roof = pitched ? eaves : Math.max(height, minHeight + 1);
    const hasParapet = !pitched && !holes.length && outer.length >= 4 && area >= PARAPET_MIN_AREA && roof >= PARAPET_MIN_HEIGHT;
    const wallTop = hasParapet ? roof + PARAPET_HEIGHT : roof;
    if (meta && meta[0]) {
      // The real paint, a touch deeper so it sits in the scene's lighting
      color.setHex(meta[0]).multiplyScalar(REAL_COLOUR_SCALE);
    } else {
      color.copy(KIND_COLORS[kind] ?? KIND_COLORS[0]);
    }
    if (meta && meta[1]) roofColor.setHex(meta[1]).multiplyScalar(REAL_COLOUR_SCALE);
    else roofColor.copy(color).multiplyScalar(ROOF_DARKEN);

    // Walls (outer walls rise past the roof to form the parapet's outside face)
    [outer, ...holes].forEach((ring, ringIndex) => {
      const ccw = signedArea(ring) > 0;
      // Outer walls face away from the polygon, hole walls face into the hole
      const normalOnRight = ccw !== (ringIndex > 0);
      let along = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.05) continue;
        const nx = (normalOnRight ? dy : -dy) / len;
        const ny = (normalOnRight ? -dx : dx) / len;
        pushWall(buf, a, b, minHeight, wallTop, nx, ny, normalOnRight, color, along, seed, roof, kind, SURFACE_WALL);
        along += len;
      }
    });

    // Roof: flat deck, or a pitched roof (a dome still needs the deck under it)
    if (!pitched || pitched.needsFlatDeck) {
      const capStart = buf.positions.length;
      pushCap(buf.positions, buf.normals, outer, holes, roof);
      for (let v = capStart; v < buf.positions.length; v += 3) {
        buf.colors.push(roofColor.r, roofColor.g, roofColor.b);
        buf.facade.push(0, roof, seed, 0);
        buf.surface.push(kind, SURFACE_ROOF);
      }
    }
    if (pitched) {
      for (let v = 0; v < pitched.roof.length; v += 3) {
        pushVertex(buf, pitched.roof[v], pitched.roof[v + 1], pitched.roof[v + 2], pitched.roofNormals[v], pitched.roofNormals[v + 1], pitched.roofNormals[v + 2], roofColor, 0, pitched.roof[v + 1], seed, 0, kind, SURFACE_ROOF);
      }
      for (let v = 0; v < pitched.gables.length; v += 3) {
        // Gable ends are wall: same paint and windows as the rest of the facade
        const u = pitched.gables[v] + pitched.gables[v + 2];
        pushVertex(buf, pitched.gables[v], pitched.gables[v + 1], pitched.gables[v + 2], pitched.gableNormals[v], pitched.gableNormals[v + 1], pitched.gableNormals[v + 2], color, u, pitched.gables[v + 1], seed, eaves, kind, SURFACE_WALL);
      }
    }

    if (hasParapet) {
      // Inner face of the lip (facing the roof) and its top cap
      const inner = insetRing(outer, PARAPET_INSET);
      const ccw = signedArea(outer) > 0;
      for (let i = 0; i < outer.length; i++) {
        const j = (i + 1) % outer.length;
        const a = inner[i];
        const b = inner[j];
        const len = a.distanceTo(b);
        if (len < 0.05) continue;
        // Facing inward = left of a -> b on a counter-clockwise ring
        const dx = (b.x - a.x) / len;
        const dy = (b.y - a.y) / len;
        const nx = ccw ? -dy : dy;
        const ny = ccw ? dx : -dx;
        pushWall(buf, a, b, roof, wallTop, nx, ny, !ccw, color, 0, seed, roof, kind, SURFACE_PARAPET);

        const quad = [outer[i], outer[j], inner[j], outer[i], inner[j], inner[i]];
        const cross = (quad[1].x - quad[0].x) * (quad[2].y - quad[0].y) - (quad[1].y - quad[0].y) * (quad[2].x - quad[0].x);
        const ordered = cross >= 0 ? quad : [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
        for (const p of ordered) {
          pushVertex(buf, p.x, wallTop, -p.y, 0, 1, 0, color, 0, wallTop, seed, 0, kind, SURFACE_PARAPET);
        }
      }
    }

    if (!pitched && area >= CLUTTER_MIN_AREA && roof >= CLUTTER_MIN_HEIGHT && !holes.length) {
      pushRooftopClutter(buf, outer, area, roof, seed, kind);
    }
  });

  if (!buf.positions.length) return null;
  return layer('buildings', LAYER_RENDER_ORDER.solid, {
    position: [buf.positions, 3],
    normal: [buf.normals, 3],
    color: [buf.colors, 3],
    aFacade: [buf.facade, 4],
    aSurface: [buf.surface, 2]
  });
}

function buildRoads(tile: MapTile): LayerData | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const edgeColors: number[] = [];

  // Roads do not write depth any more, so the paint order decides who is on top at a junction:
  // smaller streets first, then bigger roads, then bridges (stable, so equal roads keep their order)
  const roadRank = (r: MapTile['roads'][number]) => (r[2] ? 100 : 0) + (8 - r[0]);
  const roads = tile.roads.map((r, i) => [r, i] as const).sort((a, b) => roadRank(a[0]) - roadRank(b[0]) || a[1] - b[1]);

  for (const [[classIndex, widthDm, isBridge, flat]] of roads) {
    const pts = toRing(flat);
    if (pts.length < 2) continue;
    const half = widthDm / 20;
    // A hair above the surfaces; the real ordering is the paint order above
    const y = 0.05 + (8 - classIndex) * 0.012 + (isBridge ? BRIDGE_LIFT : 0);
    const edge = isBridge ? BRIDGE_EDGE_COLOR : ROAD_EDGE_COLORS[classIndex] ?? ROAD_EDGE_COLORS[5];

    // Mitered offsets at each vertex
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const dirIn = new THREE.Vector2().subVectors(pts[i], prev).normalize();
      const dirOut = new THREE.Vector2().subVectors(next, pts[i]).normalize();
      if (i === 0) dirIn.copy(dirOut);
      if (i === pts.length - 1) dirOut.copy(dirIn);
      const tangent = dirIn.add(dirOut).normalize();
      const normal = new THREE.Vector2(-tangent.y, tangent.x);
      const segNormal = new THREE.Vector2(-dirOut.y, dirOut.x);
      const miter = Math.min(2.5, 1 / Math.max(0.2, normal.dot(segNormal)));
      left.push(pts[i].clone().addScaledVector(normal, half * miter));
      right.push(pts[i].clone().addScaledVector(normal, -half * miter));
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const quad: [THREE.Vector2, number][] = [
        [left[i], 0], [right[i], 1], [right[i + 1], 1],
        [left[i], 0], [right[i + 1], 1], [left[i + 1], 0]
      ];
      // Ensure the strip faces up regardless of travel direction
      const [p0, , p2] = quad;
      const p1 = quad[1];
      const cross =
        (p1[0].x - p0[0].x) * (p2[0].y - p0[0].y) - (p1[0].y - p0[0].y) * (p2[0].x - p0[0].x);
      const ordered = cross >= 0 ? quad : [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
      for (const [p, across] of ordered) {
        positions.push(p.x, y, -p.y);
        normals.push(0, 1, 0);
        uvs.push(across, 0);
        edgeColors.push(edge.r, edge.g, edge.b);
      }
    }
  }

  if (!positions.length) return null;
  return layer('roads', LAYER_RENDER_ORDER.roads, { position: [positions, 3], normal: [normals, 3], uv: [uvs, 2], aEdgeColor: [edgeColors, 3] });
}

function buildSurfaces(polygons: TileSurface[], y: number, name: LayerName): LayerData | null {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [outerFlat, ...holeFlats] of polygons) {
    pushCap(positions, normals, toRing(outerFlat), holeFlats.map(toRing), y);
  }
  if (!positions.length) return null;
  return layer(name, LAYER_RENDER_ORDER[name as 'land' | 'water' | 'sand' | 'green' | 'forest'], { position: [positions, 3], normal: [normals, 3] });
}

// --- Street props: trees in parks and lamp posts along the main roads --------------------

const TREE_SPACING = 7; // meters between trees in a wood (wider when a huge forest would exceed the budget)
const MAX_TREE_SPACING = 28;
const MAX_TREES_PER_TILE = 420;
const LAMP_SPACING = 34;
const LAMP_MAX_ROAD_CLASS = 5; // up to residential streets
const MAX_LAMPS_PER_TILE = 220;
const POLE_HEIGHT = 5.2;
const TRUNK_COLOR = new THREE.Color(0x4a3a2a);
const POLE_COLOR = new THREE.Color(0x2a2f3a);
const LAMP_GLOW = new THREE.Color(1.6, 1.15, 0.6); // above 1 so the bloom pass picks it up
const CANOPY_COLORS = [0x1f5a32, 0x256b3a, 0x2f7a3f, 0x1a4d2c, 0x3b7f3d].map((c) => new THREE.Color(c));

interface PropBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
}

/** One flat-shaded triangle whose normal faces away from `inside` */
function pushFlatTriangle(
  buf: PropBuffers,
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
  inside: THREE.Vector3, color: THREE.Color
) {
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const centroid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
  const flip = normal.dot(centroid.sub(inside)) < 0;
  const [p, q, r] = flip ? [a, c, b] : [a, b, c];
  if (flip) normal.negate();
  for (const v of [p, q, r]) {
    buf.positions.push(v.x, v.y, v.z);
    buf.normals.push(normal.x, normal.y, normal.z);
    buf.colors.push(color.r, color.g, color.b);
  }
}

/** Prism (or pyramid frustum) standing on the ground at map point (x, y) */
function pushPrism(
  buf: PropBuffers, x: number, y: number, base: number, top: number,
  baseRadius: number, topRadius: number, sides: number, color: THREE.Color
) {
  const ring = (radius: number, height: number) =>
    Array.from({ length: sides }, (_, i) => {
      const t = ((i + 0.5) / sides) * Math.PI * 2;
      return new THREE.Vector3(x + Math.cos(t) * radius, height, -(y + Math.sin(t) * radius));
    });
  const lo = ring(baseRadius, base);
  const hi = ring(topRadius, top);
  const inside = new THREE.Vector3(x, (base + top) / 2, -y);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushFlatTriangle(buf, lo[i], lo[j], hi[j], inside, color);
    pushFlatTriangle(buf, lo[i], hi[j], hi[i], inside, color);
  }
  const apex = new THREE.Vector3(x, top, -y);
  for (let i = 0; i < sides; i++) pushFlatTriangle(buf, hi[i], hi[(i + 1) % sides], apex, inside, color);
}

/** Six-sided bipyramid canopy: cheap, flat shaded and reads as foliage from a distance */
function pushCanopy(buf: PropBuffers, x: number, y: number, mid: number, radius: number, up: number, down: number, color: THREE.Color) {
  const sides = 6;
  const ring = Array.from({ length: sides }, (_, i) => {
    const t = (i / sides) * Math.PI * 2 + 0.3;
    return new THREE.Vector3(x + Math.cos(t) * radius, mid, -(y + Math.sin(t) * radius));
  });
  const top = new THREE.Vector3(x, mid + up, -y);
  const bottom = new THREE.Vector3(x, mid - down, -y);
  const inside = new THREE.Vector3(x, mid, -y);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushFlatTriangle(buf, ring[i], ring[j], top, inside, color);
    pushFlatTriangle(buf, ring[i], ring[j], bottom, inside, color);
  }
}

// --- Fences, compound walls and hedges ------------------------------------------------------

const BARRIER_COLORS = [0x6b7080, 0x7a8190, 0x1f5a32].map((c) => new THREE.Color(c));
const BARRIER_THICKNESS = [0.25, 0.1, 0.7];
const MAX_BARRIER_SEGMENTS_PER_TILE = 3000;

function buildBarriers(tile: MapTile): LayerData | null {
  const buf: PropBuffers = { positions: [], normals: [], colors: [] };
  let segments = 0;
  for (const [kind, heightDm, flat] of tile.barriers ?? []) {
    const pts = toRing(flat);
    const half = BARRIER_THICKNESS[kind] / 2;
    const top = heightDm / 10;
    const color = BARRIER_COLORS[kind];
    for (let i = 0; i < pts.length - 1 && segments < MAX_BARRIER_SEGMENTS_PER_TILE; i++, segments++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      if (len < 0.2) continue;
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;
      // Extended by half the thickness at both ends so corners close up
      const sx = a.x - dx * half, sy = a.y - dy * half, ex = b.x + dx * half, ey = b.y + dy * half;
      const nx = -dy * half, ny = dx * half;
      const v = (x: number, y: number, h: number) => new THREE.Vector3(x, h, -y);
      const lo = [v(sx + nx, sy + ny, 0.03), v(ex + nx, ey + ny, 0.03), v(ex - nx, ey - ny, 0.03), v(sx - nx, sy - ny, 0.03)];
      const hi = lo.map((p) => new THREE.Vector3(p.x, top, p.z));
      const inside = new THREE.Vector3((a.x + b.x) / 2, top / 2, -(a.y + b.y) / 2);
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        pushFlatTriangle(buf, lo[k], lo[j], hi[j], inside, color);
        pushFlatTriangle(buf, lo[k], hi[j], hi[k], inside, color);
      }
      pushFlatTriangle(buf, hi[0], hi[1], hi[2], inside, color);
      pushFlatTriangle(buf, hi[0], hi[2], hi[3], inside, color);
    }
  }
  return buf.positions.length
    ? layer('barriers', LAYER_RENDER_ORDER.solid, { position: [buf.positions, 3], normal: [buf.normals, 3], color: [buf.colors, 3] })
    : null;
}

function buildProps(tile: MapTile): { trees: LayerData | null; lamps: LayerData | null } {
  const solid: PropBuffers = { positions: [], normals: [], colors: [] };
  const glow: PropBuffers = { positions: [], normals: [], colors: [] };
  const rand = mulberry32(((tile.tx * 73856093) ^ (tile.ty * 19349663)) >>> 0);

  // Trees on a jittered grid inside each wood / forest polygon. Grass, parks and pitches stay clean
  // planes. A huge forest gets wider spacing so a tile never exceeds its tree budget.
  const woods = tile.forest ?? [];
  let woodArea = 0;
  for (const [outerFlat] of woods) woodArea += Math.abs(signedArea(toRing(outerFlat)));
  const spacing = Math.min(MAX_TREE_SPACING, Math.max(TREE_SPACING, Math.sqrt(woodArea / MAX_TREES_PER_TILE)));
  let trees = 0;
  for (const [outerFlat, ...holeFlats] of woods) {
    if (trees >= MAX_TREES_PER_TILE) break;
    const outer = toRing(outerFlat);
    if (outer.length < 3) continue;
    const holes = holeFlats.map(toRing);
    const xs = outer.map((p) => p.x);
    const ys = outer.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    for (let gx = minX + spacing / 2; gx < maxX && trees < MAX_TREES_PER_TILE; gx += spacing) {
      for (let gy = minY + spacing / 2; gy < maxY && trees < MAX_TREES_PER_TILE; gy += spacing) {
        const p = new THREE.Vector2(gx + (rand() - 0.5) * spacing * 0.7, gy + (rand() - 0.5) * spacing * 0.7);
        if (!pointInRing(p, outer) || holes.some((h) => pointInRing(p, h))) continue;
        const size = 0.75 + rand() * 0.6;
        const ground = SURFACE_HEIGHT.forest;
        pushPrism(solid, p.x, p.y, ground, ground + 2 * size, 0.2 * size, 0.14 * size, 4, TRUNK_COLOR);
        const color = CANOPY_COLORS[Math.floor(rand() * CANOPY_COLORS.length)];
        pushCanopy(solid, p.x, p.y, ground + 2.4 * size, 1.7 * size, 2.6 * size, 1.1 * size, color);
        trees++;
      }
    }
  }

  // Lamp posts down both sides of the streets, alternating
  let lamps = 0;
  for (const [classIndex, widthDm, isBridge, flat] of tile.roads) {
    if (lamps >= MAX_LAMPS_PER_TILE) break;
    if (classIndex > LAMP_MAX_ROAD_CLASS || isBridge) continue;
    const pts = toRing(flat);
    const offset = widthDm / 20 + 1.1;
    let carried = rand() * LAMP_SPACING;
    let side = rand() < 0.5 ? 1 : -1;
    for (let i = 0; i < pts.length - 1 && lamps < MAX_LAMPS_PER_TILE; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      if (len < 0.5) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (let d = LAMP_SPACING - carried; d < len; d += LAMP_SPACING) {
        const t = d / len;
        const x = a.x + (b.x - a.x) * t + nx * offset * side;
        const y = a.y + (b.y - a.y) * t + ny * offset * side;
        side = -side;
        const ground = 0.05;
        pushPrism(solid, x, y, ground, ground + POLE_HEIGHT, 0.09, 0.06, 4, POLE_COLOR);
        pushPrism(glow, x, y, ground + POLE_HEIGHT - 0.1, ground + POLE_HEIGHT + 0.35, 0.55, 0.38, 6, LAMP_GLOW);
        lamps++;
      }
      carried = (carried + len) % LAMP_SPACING;
    }
  }

  const pack = (name: LayerName, buf: PropBuffers) =>
    buf.positions.length ? layer(name, LAYER_RENDER_ORDER.solid, { position: [buf.positions, 3], normal: [buf.normals, 3], color: [buf.colors, 3] }) : null;
  return { trees: pack('trees', solid), lamps: pack('lamps', glow) };
}

/** Ground-level building footprints, water and bridge lines: what the avatar collides with */
function buildObstacles(tile: MapTile): TileObstacles {
  const startHeights = groundedMinHeights(tile.buildings);
  const buildings: TileObstacles['buildings'] = [];
  tile.buildings.forEach(([height, , , outer, ...holes], index) => {
    // Raised parts with open ground under them do not block; neither do tiny sheds
    if (startHeights[index] >= 2.5 || height < 1.5) return;
    buildings.push([outer, ...holes]);
  });
  const bridges: TileObstacles['bridges'] = [];
  for (const [, widthDm, isBridge, flat] of tile.roads) if (isBridge) bridges.push([widthDm / 2, flat]);
  return { buildings, water: tile.water, bridges };
}

export function buildTileGeometry(tile: MapTile, tileSize: number): TileGeometry {
  // Base: land covers the mapped tile (hiding the "no data" grid); open water otherwise
  const square: FlatPoints = [0, 0, tileSize * 10, 0, tileSize * 10, tileSize * 10, 0, tileSize * 10];
  const landPolygons: TileSurface[] =
    tile.land === 1 ? [[square]] : tile.land === 0 ? [] : tile.land.map((ring) => [ring] as TileSurface);
  const waterPolygons: TileSurface[] = tile.land === 1 ? tile.water : [[square], ...tile.water];

  const props = buildProps(tile);
  const layers = [
    buildSurfaces(landPolygons, SURFACE_HEIGHT.land, 'land'),
    buildSurfaces(waterPolygons, SURFACE_HEIGHT.water, 'water'),
    buildSurfaces(tile.green, SURFACE_HEIGHT.green, 'green'),
    buildSurfaces(tile.forest ?? [], SURFACE_HEIGHT.forest, 'forest'),
    buildSurfaces(tile.sand, SURFACE_HEIGHT.sand, 'sand'),
    buildRoads(tile),
    buildBuildings(tile),
    buildBarriers(tile),
    props.trees,
    props.lamps
  ].filter((l): l is LayerData => l !== null);
  return { tx: tile.tx, ty: tile.ty, origin: tile.origin, layers, labels: { streets: tile.streetNames ?? [], places: tile.places ?? [] }, obstacles: buildObstacles(tile) };
}

/** Every transferable buffer in a built tile, for postMessage's transfer list */
export function tileGeometryBuffers(geometry: TileGeometry): ArrayBuffer[] {
  return geometry.layers.flatMap((l) => Object.values(l.attributes).map((a) => a.array.buffer as ArrayBuffer));
}

export function assembleTileGroup(data: TileGeometry, materials: PulseMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = `tile_${data.tx}_${data.ty}`;
  group.position.set(data.origin[0], 0, -data.origin[1]);
  const materialFor: Record<LayerName, THREE.Material> = {
    land: materials.land,
    water: materials.water,
    green: materials.green,
    forest: materials.forest,
    sand: materials.sand,
    roads: materials.road,
    barriers: materials.prop,
    buildings: materials.building,
    trees: materials.prop,
    lamps: materials.lamp
  };
  for (const l of data.layers) {
    const geometry = new THREE.BufferGeometry();
    for (const [key, { array, itemSize }] of Object.entries(l.attributes)) {
      geometry.setAttribute(key, new THREE.BufferAttribute(array, itemSize));
    }
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materialFor[l.name]);
    mesh.name = l.name;
    mesh.renderOrder = l.renderOrder;
    group.add(mesh);
  }
  return group;
}

/** Same result without a worker (used where Web Workers are unavailable) */
export function buildTileGroup(tile: MapTile, materials: PulseMaterials, tileSize: number): THREE.Group {
  return assembleTileGroup(buildTileGeometry(tile, tileSize), materials);
}

export function disposeTileGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
  group.removeFromParent();
}
