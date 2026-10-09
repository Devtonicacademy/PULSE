/**
 * Turns OpenStreetMap (Overpass JSON) elements into Pulse 3D map tiles.
 *
 * Shared by scripts/build-map-tiles.mjs (the static Lagos tiles) and the server's on-demand tile
 * service (server/osm/coverage.js), so both produce byte-identical tiles. Everything here is
 * pure and synchronous; the projection origin is passed in, so one process can build tiles for
 * any part of the world.
 *
 * Coordinates are meters from the origin: x east, y north. Tile (tx, ty) covers
 * [tx * 500, (tx + 1) * 500) x [ty * 500, (ty + 1) * 500).
 */

import {
  BUILDING_KINDS,
  ROOF_SHAPES,
  areaKind,
  buildingHeights,
  buildingKind,
  buildingStyle,
  parseMeters
} from './osmTags.js';

export { BUILDING_KINDS, ROOF_SHAPES };

export const TILE_SIZE_METERS = 500;
export const VI_ORIGIN = { latitude: 6.4281, longitude: 3.4219 };

const METERS_PER_DEGREE_LAT = 110574;

/** Equirectangular projection around `origin` (accurate to well under a meter within ~50 km) */
export function createProjection(origin) {
  const metersPerDegreeLng = 111320 * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    origin,
    lngLatToMeters: (lng, lat) => [
      (lng - origin.longitude) * metersPerDegreeLng,
      (lat - origin.latitude) * METERS_PER_DEGREE_LAT
    ],
    metersToLngLat: (x, y) => [origin.longitude + x / metersPerDegreeLng, origin.latitude + y / METERS_PER_DEGREE_LAT]
  };
}

let projection = createProjection(VI_ORIGIN);

/** Runs `fn` with `origin` as the projection origin (everything in here is synchronous) */
export function withOrigin(origin, fn) {
  const previous = projection;
  projection = createProjection(origin);
  try {
    return fn();
  } finally {
    projection = previous;
  }
}

export const tileForMeters = (x, y) => [Math.floor(x / TILE_SIZE_METERS), Math.floor(y / TILE_SIZE_METERS)];
export const tileKey = (tx, ty) => `${tx}_${ty}`;

// ---------------------------------------------------------------------------
// 2. Geometry helpers (all in local meters: x east, y north)
// ---------------------------------------------------------------------------

const EPSILON = 1e-6;

const toMeters = (geometry) => geometry.map((g) => projection.lngLatToMeters(g.lon, g.lat));

function ringSignedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2; // > 0 when counter-clockwise
}

function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  return [x / ring.length, y / ring.length];
}

function pointInRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bboxOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Drops the duplicated closing point OSM uses for closed ways */
function openRing(points) {
  const ring = points.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring;
}

/** Joins multipolygon member ways end-to-end into closed rings (geometry in lon/lat) */
function assembleRings(memberGeometries) {
  const key = (g) => `${g.lon.toFixed(7)},${g.lat.toFixed(7)}`;
  const pieces = memberGeometries.filter((g) => g && g.length > 1).map((g) => g.slice());
  const rings = [];
  while (pieces.length) {
    let ring = pieces.shift();
    let closed = key(ring[0]) === key(ring[ring.length - 1]);
    while (!closed) {
      const endKey = key(ring[ring.length - 1]);
      const idx = pieces.findIndex((p) => key(p[0]) === endKey || key(p[p.length - 1]) === endKey);
      if (idx === -1) break; // incomplete ring (member outside the download); drop it
      const next = pieces.splice(idx, 1)[0];
      if (key(next[0]) !== endKey) next.reverse();
      ring = ring.concat(next.slice(1));
      closed = key(ring[0]) === key(ring[ring.length - 1]);
    }
    if (closed && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Sutherland–Hodgman clip of a polygon ring against an axis-aligned rectangle */
function clipRingToRect(ring, [x0, y0, x1, y1]) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1
  ];
  const intersect = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]
  ];
  let output = ring;
  for (let e = 0; e < 4 && output.length; e++) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = edges[e](cur);
      const prevIn = edges[e](prev);
      if (curIn) {
        if (!prevIn) output.push(intersect[e](prev, cur));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersect[e](prev, cur));
      }
    }
  }
  return output.length >= 3 ? output : null;
}

/**
 * Liang–Barsky clip of a polyline against a rectangle. Returns the visible pieces,
 * in the original direction; a piece's ends lie on the rectangle edge wherever the
 * line crosses it.
 */
function clipPolylineToRect(points, [x0, y0, x1, y1]) {
  const pieces = [];
  let current = null;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let visible = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (Math.abs(p) < EPSILON) {
        if (q < 0) visible = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (!visible || t0 > t1) {
      if (current) pieces.push(current);
      current = null;
      continue;
    }
    const start = [ax + t0 * dx, ay + t0 * dy];
    const end = [ax + t1 * dx, ay + t1 * dy];
    if (!current || t0 > 0) {
      if (current) pieces.push(current);
      current = [start];
    }
    current.push(end);
    if (t1 < 1) {
      pieces.push(current);
      current = null;
    }
  }
  if (current) pieces.push(current);
  return pieces.filter((piece) => piece.length >= 2);
}

const polylineLength = (pts) =>
  pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// ---------------------------------------------------------------------------
// 3. Feature extraction
// ---------------------------------------------------------------------------

// Tag reading (heights, colours, roof shapes, building kinds, ground classes) lives in osmTags.js
export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'track'];
const ROAD_CLASS_BY_HIGHWAY = {
  motorway: 'motorway', motorway_link: 'motorway', trunk: 'trunk', trunk_link: 'trunk',
  primary: 'primary', primary_link: 'primary', secondary: 'secondary', secondary_link: 'secondary',
  tertiary: 'tertiary', tertiary_link: 'tertiary', residential: 'residential', unclassified: 'residential',
  living_street: 'residential', road: 'residential', service: 'service',
  footway: 'footway', path: 'footway', pedestrian: 'footway', steps: 'footway', cycleway: 'footway',
  track: 'track'
};
const ROAD_WIDTH = {
  motorway: 16, trunk: 14, primary: 11, secondary: 9, tertiary: 7.5, residential: 6, service: 4, footway: 2.5, track: 3
};
const LANE_WIDTH = 3.3;

function roadWidth(roadClass, tags) {
  const explicit = parseMeters(tags.width);
  if (explicit && explicit < 60) return explicit;
  const lanes = parseInt(tags.lanes, 10);
  if (lanes > 0 && roadClass !== 'footway') return Math.max(ROAD_WIDTH[roadClass], lanes * LANE_WIDTH);
  return ROAD_WIDTH[roadClass];
}

// Pedestrians can walk on anything but motorways and ways that forbid them
const WALKABLE_HIGHWAYS = new Set([
  'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'residential', 'unclassified', 'living_street', 'road', 'service', 'footway', 'path', 'pedestrian', 'steps', 'track'
]);

function isWalkable(tags) {
  if (!WALKABLE_HIGHWAYS.has(tags.highway)) return false;
  if (tags.foot === 'no' || tags.foot === 'private') return false;
  if ((tags.access === 'no' || tags.access === 'private') && !['yes', 'designated', 'permissive'].includes(tags.foot)) {
    return false;
  }
  return tags.area !== 'yes';
}

/** Merges all areas' elements, de-duplicating ways/relations fetched by more than one area */
export function mergeElements(areaData) {
  const byKey = new Map();
  for (const { data } of areaData) {
    for (const el of data.elements) byKey.set(`${el.type}/${el.id}`, el);
  }
  return [...byKey.values()];
}

/** The outline is replaced by its building:part polygons once they cover at least this much of it */
const PARTS_REPLACE_OUTLINE_FROM = 0.6;

export function extractFeatures(elements) {
  const buildings = [];
  const buildingParts = [];
  const roads = [];
  const surfaces = [];
  const coastlineWays = [];
  const walkWays = [];

  for (const el of elements) {
    const tags = el.tags ?? {};

    // Polygons: closed ways, or multipolygon relations assembled from their members
    let polygons = null;
    if (el.type === 'way' && el.geometry?.length >= 4 && el.nodes[0] === el.nodes[el.nodes.length - 1]) {
      polygons = [{ outer: openRing(toMeters(el.geometry)), holes: [] }];
    } else if (el.type === 'relation' && el.members) {
      const ways = (role) => el.members.filter((m) => m.type === 'way' && m.role === role).map((m) => m.geometry);
      const outers = assembleRings(ways('outer')).map((r) => openRing(toMeters(r)));
      const inners = assembleRings(ways('inner')).map((r) => openRing(toMeters(r)));
      polygons = outers.map((outer) => ({
        outer,
        holes: inners.filter((inner) => pointInRing(inner[0], outer))
      }));
    }

    if ((tags.building && tags.building !== 'no') || tags['building:part']) {
      for (const poly of polygons ?? []) {
        const area = Math.abs(ringSignedArea(poly.outer));
        if (area < 4) continue; // slivers / mapping noise
        const feature = {
          ...poly,
          area,
          ...buildingHeights(tags, area),
          kind: buildingKind(tags),
          style: buildingStyle(tags)
        };
        (tags['building:part'] ? buildingParts : buildings).push(feature);
      }
      continue;
    }

    if (tags.natural === 'coastline' && el.type === 'way') {
      coastlineWays.push({ nodes: el.nodes, points: toMeters(el.geometry) });
      continue;
    }

    if (tags.highway && el.type === 'way' && el.geometry?.length >= 2) {
      if (isWalkable(tags)) walkWays.push({ nodes: el.nodes, points: toMeters(el.geometry) });
      const roadClass = ROAD_CLASS_BY_HIGHWAY[tags.highway];
      const isTunnel = tags.tunnel && tags.tunnel !== 'no';
      if (roadClass && !isTunnel && tags.area !== 'yes') {
        roads.push({
          roadClass,
          width: roadWidth(roadClass, tags),
          bridge: Boolean(tags.bridge && tags.bridge !== 'no'),
          points: toMeters(el.geometry)
        });
      }
      continue;
    }

    const kind = areaKind(tags);
    if (kind) {
      for (const poly of polygons ?? []) surfaces.push({ kind, ...poly });
    }
  }

  // Where a building is modelled as parts, draw the parts instead of the outline: but only when the
  // parts cover most of it. A single tower part inside a big podium outline must not delete the podium.
  const partInfo = buildingParts.map((p) => ({ centroid: ringCentroid(p.outer), area: p.area }));
  const outlines = buildings.filter((b) => {
    const [minX, minY, maxX, maxY] = bboxOf(b.outer);
    let covered = 0;
    for (const { centroid: [x, y], area } of partInfo) {
      if (x >= minX && x <= maxX && y >= minY && y <= maxY && pointInRing([x, y], b.outer)) covered += area;
    }
    return covered < b.area * PARTS_REPLACE_OUTLINE_FROM;
  });

  return {
    buildings: outlines.concat(buildingParts),
    replacedByParts: buildings.length - outlines.length,
    roads,
    surfaces,
    coastline: mergeCoastline(coastlineWays),
    walkWays
  };
}

/** Joins coastline ways that share end nodes into continuous chains */
function mergeCoastline(ways) {
  const remaining = ways.map((w) => ({ nodes: w.nodes.slice(), points: w.points.slice() }));
  const chains = [];
  while (remaining.length) {
    const chain = remaining.shift();
    let extended = true;
    while (extended) {
      extended = false;
      const endId = chain.nodes[chain.nodes.length - 1];
      const startId = chain.nodes[0];
      if (endId === startId) break;
      const nextIdx = remaining.findIndex((w) => w.nodes[0] === endId);
      if (nextIdx !== -1) {
        const next = remaining.splice(nextIdx, 1)[0];
        chain.nodes.push(...next.nodes.slice(1));
        chain.points.push(...next.points.slice(1));
        extended = true;
      }
      const prevIdx = remaining.findIndex((w) => w.nodes[w.nodes.length - 1] === startId);
      if (prevIdx !== -1) {
        const prev = remaining.splice(prevIdx, 1)[0];
        chain.nodes.unshift(...prev.nodes.slice(0, -1));
        chain.points.unshift(...prev.points.slice(0, -1));
        extended = true;
      }
    }
    chains.push({ points: chain.points, closed: chain.nodes[0] === chain.nodes[chain.nodes.length - 1] });
  }
  return chains;
}

// ---------------------------------------------------------------------------
// 4. Land from coastline (OSM coastlines run with land on their left)
// ---------------------------------------------------------------------------

/** Position along the rectangle edge, counter-clockwise from the south-west corner */
function perimeterPosition([x, y], [x0, y0, x1, y1]) {
  const w = x1 - x0;
  const h = y1 - y0;
  const tol = 1e-4;
  if (Math.abs(y - y0) < tol) return x - x0;
  if (Math.abs(x - x1) < tol) return w + (y - y0);
  if (Math.abs(y - y1) < tol) return w + h + (x1 - x);
  if (Math.abs(x - x0) < tol) return 2 * w + h + (y1 - y);
  return null; // not on the edge
}

/** Is the point on the land (left) side of the closest coastline segment? */
function isLandBySide(point, chains) {
  let best = null;
  for (const { points } of chains) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy || EPSILON;
      const t = Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lenSq));
      const dist = Math.hypot(point[0] - (ax + t * dx), point[1] - (ay + t * dy));
      if (!best || dist < best.dist) {
        best = { dist, cross: dx * (point[1] - ay) - dy * (point[0] - ax) };
      }
    }
  }
  return best ? best.cross > 0 : true;
}

/**
 * Land polygons for one tile. Returns 1 (all land), 0 (all water) or a list of rings.
 * `stats.danglingPieces` counts coastline pieces that end inside the tile (broken data).
 */
export function landForTile(rect, chains, stats) {
  if (!chains.length) return 1;
  const [x0, y0, x1, y1] = rect;
  const perimeter = 2 * (x1 - x0) + 2 * (y1 - y0);
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const cornerPositions = [0, x1 - x0, x1 - x0 + (y1 - y0), 2 * (x1 - x0) + (y1 - y0)];

  const islands = [];
  const pieces = [];
  for (const chain of chains) {
    const [minX, minY, maxX, maxY] = bboxOf(chain.points);
    if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1) continue;
    if (chain.closed && minX > x0 && maxX < x1 && minY > y0 && maxY < y1) {
      if (ringSignedArea(chain.points) > 0) islands.push(openRing(chain.points));
      continue;
    }
    for (const piece of clipPolylineToRect(chain.points, rect)) {
      const start = perimeterPosition(piece[0], rect);
      const end = perimeterPosition(piece[piece.length - 1], rect);
      if (start == null || end == null) {
        stats.danglingPieces++;
        continue;
      }
      pieces.push({ points: piece, start, end });
    }
  }

  if (!pieces.length) {
    if (islands.length) return islands;
    const center = [(x0 + x1) / 2, (y0 + y1) / 2];
    return isLandBySide(center, chains) ? 1 : 0;
  }

  const rings = [];
  const used = new Set();
  for (const first of pieces) {
    if (used.has(first)) continue;
    used.add(first);
    const ring = first.points.slice();
    let at = first.end;
    for (let guard = 0; guard < pieces.length + 1; guard++) {
      // Walk counter-clockwise along the tile edge to the next coastline piece
      let next = null;
      let nextDist = Infinity;
      for (const candidate of pieces) {
        if (used.has(candidate) && candidate !== first) continue;
        const dist = (candidate.start - at + perimeter) % perimeter;
        if (dist < nextDist) {
          nextDist = dist;
          next = candidate;
        }
      }
      cornerPositions
        .map((pos, i) => ({ i, dist: (pos - at + perimeter) % perimeter }))
        .filter(({ dist }) => dist > 0 && dist < nextDist)
        .sort((a, b) => a.dist - b.dist)
        .forEach(({ i }) => ring.push(corners[i]));
      if (next === first) break;
      used.add(next);
      ring.push(...next.points);
      at = next.end;
    }
    rings.push(ring);
  }
  return rings.concat(islands);
}

// ---------------------------------------------------------------------------
// 5. Tiling and encoding
// ---------------------------------------------------------------------------

const dm = (v) => Math.round(v * 10); // decimeters: compact integers, 10 cm precision

/** Flattens points relative to the tile origin as decimeter integers */
export function encodePoints(points, [ox, oy]) {
  const out = [];
  for (const [x, y] of points) out.push(dm(x - ox), dm(y - oy));
  return out;
}

export function areaTiles(area) {
  const [s, w, n, e] = area.bounds;
  const [minX, minY] = projection.lngLatToMeters(w, s);
  const [maxX, maxY] = projection.lngLatToMeters(e, n);
  const [tx0, ty0] = tileForMeters(minX, minY);
  const [tx1, ty1] = tileForMeters(maxX, maxY);
  const tiles = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) tiles.push([tx, ty]);
  return { tiles, bounds: [minX, minY, maxX, maxY].map((v) => Math.round(v)) };
}

export function buildTiles(tileList, features, stats) {
  const tiles = new Map(
    tileList.map(([tx, ty]) => {
      const origin = [tx * TILE_SIZE_METERS, ty * TILE_SIZE_METERS];
      const rect = [origin[0], origin[1], origin[0] + TILE_SIZE_METERS, origin[1] + TILE_SIZE_METERS];
      return [
        tileKey(tx, ty),
        { tx, ty, origin, rect, buildings: [], bmeta: {}, roads: [], water: [], green: [], forest: [], sand: [], land: 1 }
      ];
    })
  );

  // Buildings belong to the tile holding their centroid (never split)
  for (const b of features.buildings) {
    const [cx, cy] = ringCentroid(b.outer);
    const tile = tiles.get(tileKey(...tileForMeters(cx, cy)));
    if (!tile) continue;
    stats.buildings[b.source]++;
    // Colours and roof only for the buildings that have them: [wall rgb, roof rgb, roof shape, roof height dm, top includes roof]
    const { wall, roof, shape, roofHeight } = b.style;
    if (wall || roof || shape || roofHeight) {
      tile.bmeta[tile.buildings.length] = [wall, roof, shape, dm(roofHeight), b.topIncludesRoof ? 1 : 0];
      if (stats.styled) {
        if (wall) stats.styled.wallColour++;
        if (roof) stats.styled.roofColour++;
        if (shape) stats.styled.roofShape++;
      }
    }
    tile.buildings.push([
      Math.round(b.height * 10) / 10,
      Math.round(b.minHeight * 10) / 10,
      Math.max(0, BUILDING_KINDS.indexOf(b.kind)),
      encodePoints(b.outer, tile.origin),
      ...b.holes.map((h) => encodePoints(h, tile.origin))
    ]);
  }

  for (const tile of tiles.values()) {
    for (const road of features.roads) {
      const [minX, minY, maxX, maxY] = bboxOf(road.points);
      const [x0, y0, x1, y1] = tile.rect;
      if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1) continue;
      for (const piece of clipPolylineToRect(road.points, tile.rect)) {
        tile.roads.push([
          ROAD_CLASSES.indexOf(road.roadClass),
          dm(road.width),
          road.bridge ? 1 : 0,
          encodePoints(piece, tile.origin)
        ]);
        stats.roadMeters += polylineLength(piece);
      }
    }

    for (const surface of features.surfaces) {
      const [minX, minY, maxX, maxY] = bboxOf(surface.outer);
      const [x0, y0, x1, y1] = tile.rect;
      if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1) continue;
      const outer = clipRingToRect(surface.outer, tile.rect);
      if (!outer) continue;
      const holes = surface.holes.map((h) => clipRingToRect(h, tile.rect)).filter(Boolean);
      tile[surface.kind].push([encodePoints(outer, tile.origin), ...holes.map((h) => encodePoints(h, tile.origin))]);
    }

    const land = landForTile(tile.rect, features.coastline, stats);
    tile.land = Array.isArray(land) ? land.map((ring) => encodePoints(ring, tile.origin)) : land;
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// 6. Walking graph (intersections + edges with their street geometry)
// ---------------------------------------------------------------------------

export function buildWalkGraph(walkWays) {
  const useCount = new Map();
  for (const way of walkWays) {
    way.nodes.forEach((id, i) => {
      const isEnd = i === 0 || i === way.nodes.length - 1;
      useCount.set(id, (useCount.get(id) ?? 0) + (isEnd ? 2 : 1));
    });
  }

  const vertexIndex = new Map();
  const nodes = [];
  const vertexOf = (id, point) => {
    if (!vertexIndex.has(id)) {
      vertexIndex.set(id, nodes.length / 2);
      nodes.push(dm(point[0]), dm(point[1]));
    }
    return vertexIndex.get(id);
  };

  const edges = [];
  for (const way of walkWays) {
    let startIdx = 0;
    for (let i = 1; i < way.nodes.length; i++) {
      const isVertex = i === way.nodes.length - 1 || useCount.get(way.nodes[i]) > 1;
      if (!isVertex) continue;
      const segment = way.points.slice(startIdx, i + 1);
      const a = vertexOf(way.nodes[startIdx], way.points[startIdx]);
      const b = vertexOf(way.nodes[i], way.points[i]);
      if (a !== b) {
        edges.push([a, b, dm(polylineLength(segment)), encodePoints(segment.slice(1, -1), [0, 0])]);
      }
      startIdx = i;
    }
  }
  return { nodes, edges };
}



// ---------------------------------------------------------------------------
// 7. Serialising a tile (shared by the static tiles and the on-demand bundles)
// ---------------------------------------------------------------------------

/** Bump when the tile format gains something old cached tiles do not have */
export const TILE_FORMAT_VERSION = 2;

/**
 * The tile as written to disk / the cache. Optional parts (forest, per-building style) are left out
 * when empty, so tiles without them stay as small as before.
 */
export function serializeTile(tile) {
  const out = {
    v: TILE_FORMAT_VERSION,
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
  if (tile.forest?.length) out.forest = tile.forest;
  if (tile.bmeta && Object.keys(tile.bmeta).length) out.bmeta = tile.bmeta;
  return out;
}
