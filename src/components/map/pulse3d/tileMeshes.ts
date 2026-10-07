import * as THREE from 'three';
import { MapTile, FlatPoints, TileSurface } from './tileFormat';
import { PulseMaterials } from './materials';

/**
 * Turns one map tile into a few merged meshes (one draw call per layer).
 * Map coordinates are x east / y north; in the scene x = east, y = up, z = -north.
 * Tile groups sit at their origin so vertex positions stay small (float precision).
 */

// Facade tints per building kind (other, residential, commercial, industrial, civic, religious)
const KIND_COLORS = [0x34405e, 0x3a3d5c, 0x2f4470, 0x3d3d48, 0x354a63, 0x4a3d63].map((c) => new THREE.Color(c));
const ROOF_DARKEN = 0.7;

// Glow colour per road class (motorway … track), brightest for the arterials
const ROAD_EDGE_COLORS = [
  0xff4fa3, 0x00f2fe, 0x00d4ff, 0x38bdf8, 0x60a5fa, 0x3b5b8c, 0x2a3f63, 0x8b7cf6, 0x2a3f63
].map((c) => new THREE.Color(c));
const BRIDGE_EDGE_COLOR = new THREE.Color(0xff4757);
const BRIDGE_LIFT = 0.6;

const SURFACE_HEIGHT = { land: 0.01, green: 0.03, sand: 0.03, water: 0.02 };

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

function buildBuildings(tile: MapTile, material: THREE.Material): THREE.Mesh | null {
  const buf: BuildingBuffers = { positions: [], normals: [], colors: [], facade: [], surface: [] };
  const color = new THREE.Color();
  const roofColor = new THREE.Color();

  tile.buildings.forEach((building, index) => {
    const [height, minHeight, kind, outerFlat, ...holeFlats] = building;
    const outer = toRing(outerFlat);
    const holes = holeFlats.map(toRing);
    const seed = seedFor(tile, index) * 100;
    const roof = Math.max(height, minHeight + 1);
    const area = Math.abs(signedArea(outer));
    const hasParapet = !holes.length && outer.length >= 4 && area >= PARAPET_MIN_AREA && roof >= PARAPET_MIN_HEIGHT;
    const wallTop = hasParapet ? roof + PARAPET_HEIGHT : roof;
    color.copy(KIND_COLORS[kind] ?? KIND_COLORS[0]);
    roofColor.copy(color).multiplyScalar(ROOF_DARKEN);

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

    // Roof
    const capStart = buf.positions.length;
    pushCap(buf.positions, buf.normals, outer, holes, roof);
    for (let v = capStart; v < buf.positions.length; v += 3) {
      buf.colors.push(roofColor.r, roofColor.g, roofColor.b);
      buf.facade.push(0, roof, seed, 0);
      buf.surface.push(kind, SURFACE_ROOF);
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

    if (area >= CLUTTER_MIN_AREA && roof >= CLUTTER_MIN_HEIGHT && !holes.length) {
      pushRooftopClutter(buf, outer, area, roof, seed, kind);
    }
  });

  if (!buf.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geometry.setAttribute('aFacade', new THREE.Float32BufferAttribute(buf.facade, 4));
  geometry.setAttribute('aSurface', new THREE.Float32BufferAttribute(buf.surface, 2));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'buildings';
  return mesh;
}

function buildRoads(tile: MapTile, material: THREE.Material): THREE.Mesh | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const edgeColors: number[] = [];

  for (const [classIndex, widthDm, isBridge, flat] of tile.roads) {
    const pts = toRing(flat);
    if (pts.length < 2) continue;
    const half = widthDm / 20;
    // Bigger roads draw slightly higher so junctions don't z-fight
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
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aEdgeColor', new THREE.Float32BufferAttribute(edgeColors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'roads';
  mesh.renderOrder = 2;
  return mesh;
}

function buildSurfaces(polygons: TileSurface[], y: number, material: THREE.Material, name: string) {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [outerFlat, ...holeFlats] of polygons) {
    pushCap(positions, normals, toRing(outerFlat), holeFlats.map(toRing), y);
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = 1;
  return mesh;
}

export function buildTileGroup(tile: MapTile, materials: PulseMaterials, tileSize: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `tile_${tile.tx}_${tile.ty}`;
  group.position.set(tile.origin[0], 0, -tile.origin[1]);

  // Base: land covers the mapped tile (hiding the "no data" grid); open water otherwise
  const square: FlatPoints = [0, 0, tileSize * 10, 0, tileSize * 10, tileSize * 10, 0, tileSize * 10];
  const landPolygons: TileSurface[] =
    tile.land === 1 ? [[square]] : tile.land === 0 ? [] : tile.land.map((ring) => [ring] as TileSurface);
  const waterPolygons: TileSurface[] = tile.land === 1 ? tile.water : [[square], ...tile.water];

  const meshes = [
    buildSurfaces(landPolygons, SURFACE_HEIGHT.land, materials.land, 'land'),
    buildSurfaces(waterPolygons, SURFACE_HEIGHT.water, materials.water, 'water'),
    buildSurfaces(tile.green, SURFACE_HEIGHT.green, materials.green, 'green'),
    buildSurfaces(tile.sand, SURFACE_HEIGHT.sand, materials.sand, 'sand'),
    buildRoads(tile, materials.road),
    buildBuildings(tile, materials.building)
  ];
  for (const mesh of meshes) if (mesh) group.add(mesh);
  return group;
}

export function disposeTileGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
  group.removeFromParent();
}
