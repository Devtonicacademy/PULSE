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
 *   <tx>_<ty>.json    one 500 m tile: buildings, roads, water, parks, forests, land
 *   walk-graph.json   walkable street network for in-browser routing
 *
 * Map data © OpenStreetMap contributors, ODbL. The generated tiles are a derived
 * database and are distributed under the same license.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  areaTiles,
  buildTiles,
  buildWalkGraph,
  serializeTile,
  extractFeatures,
  mergeElements,
  tileKey,
  BUILDING_KINDS,
  ROOF_SHAPES,
  ROAD_CLASSES,
  TILE_SIZE_METERS,
  VI_ORIGIN as MAP_ORIGIN
} from '../server/osm/tileBuilder.js';
import { DEFAULT_MIRRORS, overpassQuery } from '../server/osm/overpass.js';

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

const OVERPASS_MIRRORS = DEFAULT_MIRRORS;

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
    styled: { wallColour: 0, roofColour: 0, roofShape: 0 },
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
    const json = JSON.stringify(serializeTile(tile));
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
      bmeta: '{ buildingIndex: [wall rgb, roof rgb, roofShapeIndex, roofHeight dm, heightIncludesRoof] } (optional, only styled buildings)',
      forest: '[outerRing, ...holeRings] woods and forests (optional)',
      roads: '[classIndex, width dm, isBridge, points]',
      surfaces: '[outerRing, ...holeRings] for water / green / sand',
      land: '1 = all land, 0 = all water, else land rings'
    },
    buildingKinds: BUILDING_KINDS,
    roofShapes: ROOF_SHAPES,
    roadClasses: ROAD_CLASSES,
    areas,
    tiles: tileIndex,
    stats: {
      buildings: totalBuildings,
      heightFromTag: stats.buildings.height,
      heightFromLevels: stats.buildings.levels,
      heightDefaulted: stats.buildings.default,
      withWallColour: stats.styled.wallColour,
      withRoofColour: stats.styled.roofColour,
      withRoofShape: stats.styled.roofShape,
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
  console.log(`  styling:    wall colour ${stats.styled.wallColour}, roof colour ${stats.styled.roofColour}, roof shape ${stats.styled.roofShape}`);
  console.log(`  roads:      ${index.stats.roadKm} km`);
  console.log(`  coastline:  ${features.coastline.length} chains, ${stats.danglingPieces} dangling pieces`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
