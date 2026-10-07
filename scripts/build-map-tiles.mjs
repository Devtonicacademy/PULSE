/**
 * Builds the Pulse 3D map tiles from OpenStreetMap data.
 *
 *   node scripts/build-map-tiles.mjs                 fetch (cached) + build every area
 *   node scripts/build-map-tiles.mjs --refresh       ignore the cache and re-download
 *   node scripts/build-map-tiles.mjs --fetch-only    download raw OSM data only
 *   node scripts/build-map-tiles.mjs --input <area>=<file.osm.json>
 *                                                    use a local Overpass JSON export for an area
 *
 * Output (public/map-tiles/):
 *   index.json        tile list, area bounds, origin, data-quality stats
 *   <tx>_<ty>.json    one 500 m tile: buildings, roads, water, parks, land
 *   walk-graph.json   walkable street network for in-browser routing
 *
 * Map data © OpenStreetMap contributors, ODbL. The generated tiles are a derived
 * database and are distributed under the same license.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  lngLatToMeters,
  tileForMeters,
  tileKey,
  TILE_SIZE_METERS,
  MAP_ORIGIN
} from '../src/utils/mapProjection.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'osm');
const OUT_DIR = path.join(ROOT, 'public', 'map-tiles');

// Areas around the app's five city hubs (AppShell PRESET_LOCATIONS).
// Bounds are [south, west, north, east].
const AREAS = [
  { id: 'victoria-island', label: 'Victoria Island', bounds: [6.418, 3.398, 6.442, 3.445] },
  { id: 'lekki-phase-1', label: 'Lekki Phase 1', center: [6.4474, 3.473], halfSizeMeters: 1250 },
  { id: 'lagos-island', label: 'Lagos Island (Freedom Park)', center: [6.453, 3.398], halfSizeMeters: 1250 },
  { id: 'yaba', label: 'Yaba Tech Hub', center: [6.5095, 3.3711], halfSizeMeters: 1250 },
  { id: 'unilag', label: 'University of Lagos (Akoka)', center: [6.5168, 3.3976], halfSizeMeters: 1250 }
].map((area) => {
  if (area.bounds) return area;
  const [lat, lng] = area.center;
  const dLat = area.halfSizeMeters / 110574;
  const dLng = area.halfSizeMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { ...area, bounds: [lat - dLat, lng - dLng, lat + dLat, lng + dLng] };
});

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

const args = process.argv.slice(2);
const flags = {
  refresh: args.includes('--refresh'),
  fetchOnly: args.includes('--fetch-only'),
  inputs: Object.fromEntries(
    args
      .map((arg, i) => (arg === '--input' ? args[i + 1] : null))
      .filter(Boolean)
      .map((pair) => pair.split('='))
  )
};

// ---------------------------------------------------------------------------
// 1. Fetch
// ---------------------------------------------------------------------------

function overpassQuery([s, w, n, e]) {
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:180];
(
  way["building"](${bbox});
  way["building:part"](${bbox});
  relation["building"]["type"="multipolygon"](${bbox});
  way["highway"](${bbox});
  way["natural"="coastline"](${bbox});
  way["natural"~"^(water|wetland|beach|sand)$"](${bbox});
  relation["natural"~"^(water|wetland)$"](${bbox});
  way["waterway"="riverbank"](${bbox});
  relation["waterway"="riverbank"](${bbox});
  way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"](${bbox});
  relation["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"](${bbox});
  way["leisure"~"^(park|garden|pitch|golf_course|playground|stadium)$"](${bbox});
  relation["leisure"~"^(park|garden|golf_course)$"](${bbox});
);
out body geom;`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchFromOverpass(area) {
  const body = new URLSearchParams({ data: overpassQuery(area.bounds) });
  const attempts = 3;
  for (let round = 0; round < attempts; round++) {
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body,
          headers: { 'User-Agent': 'PULSE-map-tile-builder/1.0' },
          signal: AbortSignal.timeout(200_000)
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith('{')) {
          const json = JSON.parse(text);
          if (json.remark && /runtime error|timeout/i.test(json.remark)) {
            throw new Error(json.remark);
          }
          console.log(`  ✓ ${area.id}: ${json.elements.length} elements from ${new URL(url).host}`);
          return json;
        }
        const reason = /too busy|timeout|rate_limited/i.exec(text)?.[0] ?? `HTTP ${res.status}`;
        console.warn(`  · ${area.id}: ${new URL(url).host} failed (${reason})`);
      } catch (err) {
        console.warn(`  · ${area.id}: ${new URL(url).host} failed (${err.message})`);
      }
    }
    if (round < attempts - 1) {
      const waitMs = 30_000 * (round + 1);
      console.warn(`  … all mirrors busy, retrying in ${waitMs / 1000}s`);
      await sleep(waitMs);
    }
  }
  throw new Error(
    `Could not download ${area.id} from any Overpass mirror. Try again later, or export it ` +
      `yourself and pass --input ${area.id}=<file.osm.json>.`
  );
}

async function loadAreaData(area) {
  if (flags.inputs[area.id]) {
    console.log(`  ✓ ${area.id}: reading ${flags.inputs[area.id]}`);
    return JSON.parse(fs.readFileSync(flags.inputs[area.id], 'utf8'));
  }
  const cacheFile = path.join(CACHE_DIR, `${area.id}.json`);
  if (!flags.refresh && fs.existsSync(cacheFile)) {
    console.log(`  ✓ ${area.id}: cached`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  const data = await fetchFromOverpass(area);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------------------
// 2. Geometry helpers (all in local meters: x east, y north)
// ---------------------------------------------------------------------------

const EPSILON = 1e-6;

const toMeters = (geometry) => geometry.map((g) => lngLatToMeters(g.lon, g.lat));

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

function parseMeters(value) {
  if (value == null) return null;
  const match = /^\s*([\d.]+)\s*(m|ft|'|)?/i.exec(String(value).replace(',', '.'));
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /ft|'/i.test(match[2] ?? '') ? n * 0.3048 : n;
}

const BUILDING_KINDS = ['other', 'residential', 'commercial', 'industrial', 'civic', 'religious'];
const KIND_BY_TYPE = {
  house: 'residential', detached: 'residential', semidetached_house: 'residential', terrace: 'residential',
  residential: 'residential', apartments: 'residential', dormitory: 'residential',
  commercial: 'commercial', office: 'commercial', retail: 'commercial', hotel: 'commercial', supermarket: 'commercial',
  industrial: 'industrial', warehouse: 'industrial', factory: 'industrial', hangar: 'industrial',
  school: 'civic', university: 'civic', college: 'civic', hospital: 'civic', government: 'civic', public: 'civic',
  civic: 'civic', stadium: 'civic', train_station: 'civic', transportation: 'civic',
  church: 'religious', mosque: 'religious', cathedral: 'religious', chapel: 'religious', temple: 'religious'
};
const DEFAULT_HEIGHT_BY_TYPE = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 7, residential: 9, apartments: 15, dormitory: 12,
  commercial: 12, office: 18, retail: 6, hotel: 24, supermarket: 7,
  industrial: 9, warehouse: 9, factory: 10, hangar: 12,
  school: 9, university: 12, college: 12, hospital: 12, government: 12, public: 10, civic: 10,
  church: 12, mosque: 12, cathedral: 18,
  garage: 3, garages: 3, shed: 3, hut: 3, kiosk: 3, roof: 4, carport: 3, container: 3
};
const LEVEL_HEIGHT = 3;

function defaultHeight(type, footprintArea) {
  if (DEFAULT_HEIGHT_BY_TYPE[type]) return DEFAULT_HEIGHT_BY_TYPE[type];
  // Untyped buildings ("yes"): bigger footprints are usually taller in Lagos' commercial districts
  if (footprintArea < 100) return 4;
  if (footprintArea < 400) return 7;
  if (footprintArea < 1500) return 10;
  return 14;
}

function buildingHeights(tags, footprintArea) {
  const type = tags.building && tags.building !== 'yes' ? tags.building : tags['building:part'] ?? 'yes';
  const minHeight =
    parseMeters(tags.min_height) ??
    (tags['building:min_level'] ? parseFloat(tags['building:min_level']) * LEVEL_HEIGHT : 0);
  const height = parseMeters(tags.height);
  if (height) return { height, minHeight, source: 'height', type };
  const levels = parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) {
    return { height: levels * LEVEL_HEIGHT + (tags['roof:levels'] ? 1.5 : 0), minHeight, source: 'levels', type };
  }
  return { height: defaultHeight(type, footprintArea), minHeight, source: 'default', type };
}

const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'track'];
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

function surfaceKind(tags) {
  if (tags.natural === 'water' || tags.waterway === 'riverbank') return 'water';
  if (tags.natural === 'beach' || tags.natural === 'sand') return 'sand';
  if (tags.natural === 'wetland' || tags.landuse || tags.leisure) return 'green';
  return null;
}

/** Merges all areas' elements, de-duplicating ways/relations fetched by more than one area */
function mergeElements(areaData) {
  const byKey = new Map();
  for (const { data } of areaData) {
    for (const el of data.elements) byKey.set(`${el.type}/${el.id}`, el);
  }
  return [...byKey.values()];
}

function extractFeatures(elements) {
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
        const feature = { ...poly, area, ...buildingHeights(tags, area) };
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

    const kind = surfaceKind(tags);
    if (kind) {
      for (const poly of polygons ?? []) surfaces.push({ kind, ...poly });
    }
  }

  // Where a building is modelled as parts (typical for towers), draw the parts, not the outline
  const partCentroids = buildingParts.map((p) => ringCentroid(p.outer));
  const outlines = buildings.filter((b) => {
    const [minX, minY, maxX, maxY] = bboxOf(b.outer);
    return !partCentroids.some(
      ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY && pointInRing([x, y], b.outer)
    );
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
function landForTile(rect, chains, stats) {
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
function encodePoints(points, [ox, oy]) {
  const out = [];
  for (const [x, y] of points) out.push(dm(x - ox), dm(y - oy));
  return out;
}

function areaTiles(area) {
  const [s, w, n, e] = area.bounds;
  const [minX, minY] = lngLatToMeters(w, s);
  const [maxX, maxY] = lngLatToMeters(e, n);
  const [tx0, ty0] = tileForMeters(minX, minY);
  const [tx1, ty1] = tileForMeters(maxX, maxY);
  const tiles = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) tiles.push([tx, ty]);
  return { tiles, bounds: [minX, minY, maxX, maxY].map((v) => Math.round(v)) };
}

function buildTiles(tileList, features, stats) {
  const tiles = new Map(
    tileList.map(([tx, ty]) => {
      const origin = [tx * TILE_SIZE_METERS, ty * TILE_SIZE_METERS];
      const rect = [origin[0], origin[1], origin[0] + TILE_SIZE_METERS, origin[1] + TILE_SIZE_METERS];
      return [
        tileKey(tx, ty),
        { tx, ty, origin, rect, buildings: [], roads: [], water: [], green: [], sand: [], land: 1 }
      ];
    })
  );

  // Buildings belong to the tile holding their centroid (never split)
  for (const b of features.buildings) {
    const [cx, cy] = ringCentroid(b.outer);
    const tile = tiles.get(tileKey(...tileForMeters(cx, cy)));
    if (!tile) continue;
    stats.buildings[b.source]++;
    tile.buildings.push([
      Math.round(b.height * 10) / 10,
      Math.round(b.minHeight * 10) / 10,
      BUILDING_KINDS.indexOf(KIND_BY_TYPE[b.type] ?? 'other'),
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

function buildWalkGraph(walkWays) {
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
// Main
// ---------------------------------------------------------------------------

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  console.log('Fetching OpenStreetMap data…');
  const areaData = [];
  for (const area of AREAS) {
    areaData.push({ area, data: await loadAreaData(area) });
  }
  if (flags.fetchOnly) return;

  console.log('\nExtracting features…');
  const features = extractFeatures(mergeElements(areaData));
  const stats = {
    buildings: { height: 0, levels: 0, default: 0 },
    replacedByParts: features.replacedByParts,
    roadMeters: 0,
    danglingPieces: 0
  };

  const tileSet = new Map();
  const areas = AREAS.map((area) => {
    const { tiles, bounds } = areaTiles(area);
    tiles.forEach(([tx, ty]) => tileSet.set(tileKey(tx, ty), [tx, ty]));
    const center = [Math.round((bounds[0] + bounds[2]) / 2), Math.round((bounds[1] + bounds[3]) / 2)];
    return { id: area.id, label: area.label, bounds, center };
  });

  const tiles = buildTiles([...tileSet.values()], features, stats);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tileIndex = {};
  let totalBytes = 0;
  for (const tile of tiles.values()) {
    const json = JSON.stringify({
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
    });
    const key = tileKey(tile.tx, tile.ty);
    fs.writeFileSync(path.join(OUT_DIR, `${key}.json`), json);
    tileIndex[key] = json.length;
    totalBytes += json.length;
  }

  const graph = buildWalkGraph(features.walkWays);
  const graphJson = JSON.stringify({ v: 1, ...graph });
  fs.writeFileSync(path.join(OUT_DIR, 'walk-graph.json'), graphJson);

  const totalBuildings = stats.buildings.height + stats.buildings.levels + stats.buildings.default;
  const index = {
    v: 1,
    attribution: '© OpenStreetMap contributors (ODbL)',
    generatedAt: new Date().toISOString(),
    origin: MAP_ORIGIN,
    tileSize: TILE_SIZE_METERS,
    units: 'decimeters relative to tile origin; origin in meters from map origin (x east, y north)',
    schema: {
      buildings: '[height m, minHeight m, kindIndex, outerRing, ...holeRings]',
      roads: '[classIndex, width dm, isBridge, points]',
      surfaces: '[outerRing, ...holeRings] for water / green / sand',
      land: '1 = all land, 0 = all water, else land rings'
    },
    buildingKinds: BUILDING_KINDS,
    roadClasses: ROAD_CLASSES,
    areas,
    tiles: tileIndex,
    stats: {
      buildings: totalBuildings,
      heightFromTag: stats.buildings.height,
      heightFromLevels: stats.buildings.levels,
      heightDefaulted: stats.buildings.default,
      outlinesReplacedByParts: stats.replacedByParts,
      roadKm: Math.round(stats.roadMeters / 100) / 10,
      coastlineChains: features.coastline.length,
      danglingCoastlinePieces: stats.danglingPieces,
      walkGraph: { nodes: graph.nodes.length / 2, edges: graph.edges.length }
    }
  };
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  const pct = (n) => `${((n / Math.max(1, totalBuildings)) * 100).toFixed(1)}%`;
  console.log(`\nWrote ${tiles.size} tiles to public/map-tiles/`);
  console.log(`  tiles:      ${kb(totalBytes)} total, largest ${kb(Math.max(...Object.values(tileIndex)))}`);
  console.log(`  walk graph: ${kb(graphJson.length)} (${index.stats.walkGraph.nodes} nodes, ${index.stats.walkGraph.edges} edges)`);
  console.log(`  buildings:  ${totalBuildings} — height tag ${pct(stats.buildings.height)}, levels ${pct(stats.buildings.levels)}, defaulted ${pct(stats.buildings.default)}`);
  console.log(`  roads:      ${index.stats.roadKm} km`);
  console.log(`  coastline:  ${features.coastline.length} chains, ${stats.danglingPieces} dangling pieces`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
