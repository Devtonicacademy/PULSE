/**
 * Pitched roofs from a building footprint, for buildings that OpenStreetMap tags with roof:shape.
 * Pure geometry (no Three.js): the mesh builder turns the triangles into vertices.
 *
 * Coordinates in: map meters (x east, y north). Coordinates out: scene space (x east, y UP, z = -north).
 *
 * Gabled, hipped and skillion roofs sit on the footprint's oriented bounding box, so they only make
 * sense for footprints that are close to a rectangle; pyramidal roofs fan out from the centre and
 * need a roughly convex footprint; domes want something near round or square. Anything else returns
 * null and the building keeps its flat roof, which is always better than a wrong roof.
 */

export interface Pt {
  x: number;
  y: number;
}

export type PitchedShape = 'gabled' | 'hipped' | 'pyramidal' | 'skillion' | 'dome';

export interface RoofGeometry {
  /** Roof surface triangles (x, y, z per vertex, 9 numbers per triangle) */
  roof: number[];
  /** Vertical triangles that close the roof's ends (gable ends, the high side of a skillion roof) */
  gables: number[];
  /** Per-vertex normals for `roof` and `gables`, same layout */
  roofNormals: number[];
  gableNormals: number[];
  /** A dome rests on the walls without covering the corners: the caller still draws a flat deck */
  needsFlatDeck: boolean;
  /** Highest point above the eaves */
  height: number;
}

export interface OrientedBox {
  cx: number;
  cy: number;
  /** Unit long axis */
  ux: number;
  uy: number;
  halfLength: number;
  halfWidth: number;
  /** Footprint area / box area: 1 for a perfect rectangle */
  fill: number;
}

const signedArea = (ring: Pt[]) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  return sum / 2;
};

/** Smallest-area rectangle around the footprint, found by trying every edge direction */
export function orientedBox(ring: Pt[]): OrientedBox | null {
  if (ring.length < 3) return null;
  const area = Math.abs(signedArea(ring));
  let best: { areaBox: number; angle: number; minU: number; maxU: number; minV: number; maxV: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.2) continue;
    const ux = dx / len;
    const uy = dy / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of ring) {
      const u = p.x * ux + p.y * uy;
      const v = -p.x * uy + p.y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const areaBox = (maxU - minU) * (maxV - minV);
    if (!best || areaBox < best.areaBox) best = { areaBox, angle: Math.atan2(uy, ux), minU, maxU, minV, maxV };
  }
  if (!best || best.areaBox < 1e-6) return null;

  // Make u the long axis
  let { angle, minU, maxU, minV, maxV } = best;
  if (maxV - minV > maxU - minU) {
    angle += Math.PI / 2;
    [minU, maxU, minV, maxV] = [minV, maxV, -maxU, -minU];
  }
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  return {
    cx: midU * ux - midV * uy,
    cy: midU * uy + midV * ux,
    ux,
    uy,
    halfLength: (maxU - minU) / 2,
    halfWidth: (maxV - minV) / 2,
    fill: area / best.areaBox
  };
}

/** Footprint area over the area of its convex hull: 1 for a convex shape, lower for concave ones */
export function convexity(ring: Pt[]): number {
  const pts = ring.map((p) => [p.x, p.y] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return 0;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1)).map(([x, y]) => ({ x, y }));
  const hullArea = Math.abs(signedArea(hull));
  return hullArea > 0 ? Math.abs(signedArea(ring)) / hullArea : 0;
}

/** A sensible roof height when OpenStreetMap does not say (about a 30 degree pitch) */
export function defaultRoofHeight(shape: PitchedShape, box: Pick<OrientedBox, 'halfLength' | 'halfWidth'>): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  switch (shape) {
    case 'gabled':
    case 'hipped':
      return clamp(box.halfWidth * 0.58, 1, 5);
    case 'pyramidal':
      return clamp(Math.min(box.halfLength, box.halfWidth) * 0.6, 1, 6);
    case 'skillion':
      return clamp(box.halfWidth * 0.3, 0.8, 3);
    case 'dome':
      return clamp(Math.min(box.halfLength, box.halfWidth) * 0.9, 1.5, 14);
  }
}

const RECT_FILL = 0.85; // gabled / hipped / skillion need a footprint that is nearly the box
const ROUND_FILL = 0.7; // domes can sit on rounder footprints
const CONVEX = 0.92; // pyramids fan out from the centre

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v: V3): V3 => {
  const len = Math.hypot(...v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

/**
 * Builds the roof. `eaves` is the height of the wall tops, `rise` how far the roof climbs above them.
 * Returns null when the footprint does not suit the shape.
 */
export function buildRoof(ring: Pt[], shape: PitchedShape, eaves: number, rise: number): RoofGeometry | null {
  if (!(rise > 0.05) || ring.length < 3) return null;
  const roof: V3[][] = [];
  const gables: V3[][] = [];
  let needsFlatDeck = false;

  const box = orientedBox(ring);
  if (!box) return null;
  // Box (u, v) -> scene
  const at = (u: number, v: number, y: number): V3 => {
    const x = box.cx + u * box.ux - v * box.uy;
    const my = box.cy + u * box.uy + v * box.ux;
    return [x, y, -my];
  };
  const L = box.halfLength;
  const W = box.halfWidth;

  if (shape === 'pyramidal') {
    if (convexity(ring) < CONVEX) return null;
    let cx = 0;
    let cy = 0;
    for (const p of ring) {
      cx += p.x;
      cy += p.y;
    }
    const apex: V3 = [cx / ring.length, eaves + rise, -(cy / ring.length)];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) continue;
      roof.push([[a.x, eaves, -a.y], [b.x, eaves, -b.y], apex]);
    }
  } else if (shape === 'dome') {
    if (box.fill < ROUND_FILL) return null;
    needsFlatDeck = true;
    const rings = 5;
    const segments = 16;
    const point = (ring: number, seg: number): V3 => {
      const phi = (ring / rings) * (Math.PI / 2);
      const theta = (seg / segments) * Math.PI * 2;
      return at(Math.cos(theta) * Math.cos(phi) * L * 0.97, Math.sin(theta) * Math.cos(phi) * W * 0.97, eaves + Math.sin(phi) * rise);
    };
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = point(r, s);
        const b = point(r, s + 1);
        const c = point(r + 1, s + 1);
        const d = point(r + 1, s);
        roof.push([a, b, c]);
        if (r + 1 < rings) roof.push([a, c, d]);
      }
    }
  } else {
    if (box.fill < RECT_FILL) return null;
    const c0 = at(-L, -W, eaves);
    const c1 = at(L, -W, eaves);
    const c2 = at(L, W, eaves);
    const c3 = at(-L, W, eaves);
    if (shape === 'gabled') {
      const r0 = at(-L, 0, eaves + rise);
      const r1 = at(L, 0, eaves + rise);
      roof.push([c0, c1, r1], [c0, r1, r0], [c2, c3, r0], [c2, r0, r1]);
      gables.push([c3, c0, r0], [c1, c2, r1]);
    } else if (shape === 'hipped') {
      if (L <= W * 1.05) {
        const apex = at(0, 0, eaves + rise);
        roof.push([c0, c1, apex], [c1, c2, apex], [c2, c3, apex], [c3, c0, apex]);
      } else {
        const inset = W; // equal pitch on all four slopes
        const rs = at(-(L - inset), 0, eaves + rise);
        const re = at(L - inset, 0, eaves + rise);
        roof.push([c0, c1, re], [c0, re, rs], [c2, c3, rs], [c2, rs, re], [c3, c0, rs], [c1, c2, re]);
      }
    } else {
      // skillion: one slope, high on the +v side
      const h2 = at(L, W, eaves + rise);
      const h3 = at(-L, W, eaves + rise);
      roof.push([c0, c1, h2], [c0, h2, h3]);
      gables.push([c1, c2, h2], [c3, c0, h3], [c2, c3, h3], [c2, h3, h2]);
    }
  }
  if (!roof.length) return null;

  // Normals: roof faces point up, gable faces point away from the middle of the building
  const middle: V3 = at(0, 0, eaves);
  const flatten = (tris: V3[][], upward: boolean) => {
    const positions: number[] = [];
    const normals: number[] = [];
    for (const [a, b, c] of tris) {
      let [p, q, r] = [a, b, c];
      let n = normalize(cross3(sub(q, p), sub(r, p)));
      const centre: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const outward = upward ? n[1] >= 0 : n[0] * (centre[0] - middle[0]) + n[2] * (centre[2] - middle[2]) >= 0;
      if (!outward) {
        [q, r] = [r, q];
        n = [-n[0], -n[1], -n[2]];
      }
      for (const v of [p, q, r]) {
        positions.push(v[0], v[1], v[2]);
        normals.push(n[0], n[1], n[2]);
      }
    }
    return { positions, normals };
  };
  const roofOut = flatten(roof, true);
  const gableOut = flatten(gables, false);
  return {
    roof: roofOut.positions,
    roofNormals: roofOut.normals,
    gables: gableOut.positions,
    gableNormals: gableOut.normals,
    needsFlatDeck,
    height: rise
  };
}
