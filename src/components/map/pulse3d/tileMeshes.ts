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

function buildBuildings(tile: MapTile, material: THREE.Material): THREE.Mesh | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const facade: number[] = [];
  const color = new THREE.Color();

  tile.buildings.forEach((building, index) => {
    const [height, minHeight, kind, outerFlat, ...holeFlats] = building;
    const outer = toRing(outerFlat);
    const holes = holeFlats.map(toRing);
    const seed = seedFor(tile, index) * 100;
    const top = Math.max(height, minHeight + 1);
    color.copy(KIND_COLORS[kind] ?? KIND_COLORS[0]);

    // Walls
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
        // Quad corners (scene coords) + facade coords (meters along wall, meters up)
        const A0 = [a.x, minHeight, -a.y, along, minHeight];
        const B0 = [b.x, minHeight, -b.y, along + len, minHeight];
        const B1 = [b.x, top, -b.y, along + len, top];
        const A1 = [a.x, top, -a.y, along, top];
        const quad = normalOnRight ? [A0, B0, B1, A0, B1, A1] : [B0, A0, A1, B0, A1, B1];
        for (const [x, y, z, u, v] of quad) {
          positions.push(x, y, z);
          normals.push(nx, 0, -ny);
          colors.push(color.r, color.g, color.b);
          facade.push(u, v, seed, top);
        }
        along += len;
      }
    });

    // Roof
    pushCap(positions, normals, outer, holes, top, () => {
      colors.push(color.r * ROOF_DARKEN, color.g * ROOF_DARKEN, color.b * ROOF_DARKEN);
      facade.push(0, top, seed, 0);
    });
  });

  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aFacade', new THREE.Float32BufferAttribute(facade, 4));
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
