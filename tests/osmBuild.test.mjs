// Overpass elements -> tiles: forests and grass, paint and roofs, outlines versus parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_KINDS,
  ROOF_SHAPES,
  TILE_FORMAT_VERSION,
  VI_ORIGIN,
  buildTiles,
  extractFeatures,
  serializeTile
} from '../server/osm/tileBuilder.js';
import { buildCellBundle } from '../server/osm/coverage.js';

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((VI_ORIGIN.latitude * Math.PI) / 180);
/** meters from the origin -> an Overpass geometry point */
const pt = (x, y) => ({ lat: VI_ORIGIN.latitude + y / M_PER_DEG_LAT, lon: VI_ORIGIN.longitude + x / M_PER_DEG_LNG });

let nextId = 1;
/** A closed rectangle way [x0, y0] -> [x1, y1] in meters */
function rectWay(x0, y0, x1, y1, tags) {
  const geometry = [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
  const nodes = [1, 2, 3, 4, 1].map((n) => nextId * 10 + n);
  return { type: 'way', id: nextId++, nodes, geometry, tags };
}
const ringGeometry = (x0, y0, x1, y1) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];

/** Everything the builder produces for tile (0, 0) from these elements */
function build(elements) {
  const stats = { buildings: { height: 0, levels: 0, default: 0 }, styled: { wallColour: 0, roofColour: 0, roofShape: 0 }, replacedByParts: 0, roadMeters: 0, danglingPieces: 0 };
  const features = extractFeatures(elements);
  const tiles = buildTiles([[0, 0]], features, stats);
  return { tile: tiles.get('0_0'), features, stats };
}

// ---- forests and green -----------------------------------------------------------------------------

test('a wood becomes a forest polygon; a park becomes grass; they do not mix', () => {
  const { tile } = build([
    rectWay(50, 50, 250, 250, { natural: 'wood' }),
    rectWay(300, 300, 450, 450, { leisure: 'park' }),
    rectWay(300, 50, 450, 200, { landuse: 'forest' })
  ]);
  assert.equal(tile.forest.length, 2);
  assert.equal(tile.green.length, 1);
});

test('a forest keeps its real boundary (clipped only by the tile edge)', () => {
  const { tile } = build([rectWay(100, 100, 300, 400, { natural: 'wood' })]);
  const ring = tile.forest[0][0];
  const xs = ring.filter((_, i) => i % 2 === 0).map((v) => v / 10);
  const ys = ring.filter((_, i) => i % 2 === 1).map((v) => v / 10);
  assert.ok(Math.abs(Math.min(...xs) - 100) < 0.2 && Math.abs(Math.max(...xs) - 300) < 0.2);
  assert.ok(Math.abs(Math.min(...ys) - 100) < 0.2 && Math.abs(Math.max(...ys) - 400) < 0.2);
});

test('a wood mapped as a multipolygon keeps its clearing (the inner ring is a hole)', () => {
  const relation = {
    type: 'relation',
    id: 900,
    tags: { type: 'multipolygon', natural: 'wood' },
    members: [
      { type: 'way', role: 'outer', geometry: ringGeometry(50, 50, 450, 450) },
      { type: 'way', role: 'inner', geometry: ringGeometry(200, 200, 300, 300) }
    ]
  };
  const { tile } = build([relation]);
  assert.equal(tile.forest.length, 1);
  assert.equal(tile.forest[0].length, 2, 'outer ring plus one hole');
});

test('built-up land is not drawn as ground even if it is in the data', () => {
  const { tile } = build([
    rectWay(50, 50, 450, 450, { landuse: 'residential' }),
    rectWay(60, 60, 200, 200, { landuse: 'commercial' }),
    rectWay(60, 300, 200, 450, { landuse: 'industrial' })
  ]);
  assert.deepEqual([tile.green.length, tile.forest.length, tile.sand.length], [0, 0, 0]);
});

test('swimming pools and reservoirs are water; farmland and scrub are grass', () => {
  const { tile } = build([
    rectWay(50, 50, 80, 80, { leisure: 'swimming_pool' }),
    rectWay(100, 50, 200, 150, { landuse: 'reservoir' }),
    rectWay(250, 50, 400, 200, { landuse: 'farmland' }),
    rectWay(250, 250, 400, 400, { natural: 'scrub' })
  ]);
  assert.equal(tile.water.length, 2);
  assert.equal(tile.green.length, 2);
});

// ---- paint and roofs -------------------------------------------------------------------------------

test('wall colour, roof colour, roof shape and roof height travel with the building', () => {
  const { tile } = build([
    rectWay(100, 100, 120, 112, {
      building: 'house',
      'building:levels': '2',
      'building:colour': '#cc9966',
      'roof:colour': 'red',
      'roof:shape': 'gabled',
      'roof:height': '3'
    }),
    rectWay(200, 100, 215, 115, { building: 'yes', height: '9' })
  ]);
  assert.equal(tile.buildings.length, 2);
  const meta = tile.bmeta['0'];
  assert.equal(meta[0], 0xcc9966);
  assert.ok(meta[1] > 0, 'roof colour');
  assert.equal(ROOF_SHAPES[meta[2]], 'gabled');
  assert.equal(meta[3], 30, 'roof height in decimeters');
  assert.equal(meta[4], 0, 'two storeys: the roof goes on top of the walls');
  assert.equal(tile.bmeta['1'], undefined, 'an unstyled building carries no meta');
  assert.equal(tile.buildings[0][0], 9, '2 levels x 3 m + 3 m roof');
});

test('a building height tag is the top of the roof, and the tile says so', () => {
  const { tile } = build([rectWay(100, 100, 120, 112, { building: 'yes', height: '12', 'roof:shape': 'hipped' })]);
  assert.equal(tile.buildings[0][0], 12);
  assert.equal(tile.bmeta['0'][4], 1);
});

test('building kind comes from the building type or from what is inside', () => {
  const { tile } = build([
    rectWay(100, 100, 130, 130, { building: 'yes', amenity: 'place_of_worship' }),
    rectWay(200, 100, 230, 130, { building: 'apartments' }),
    rectWay(300, 100, 330, 130, { building: 'yes' })
  ]);
  const kinds = tile.buildings.map((b) => BUILDING_KINDS[b[2]]);
  assert.deepEqual(kinds, ['religious', 'residential', 'other']);
});

// ---- outlines versus parts -------------------------------------------------------------------------

test('parts replace the outline only when they cover most of it', () => {
  // A 40 x 40 podium with one small tower part on it: the podium must survive
  const sparse = build([
    rectWay(100, 100, 140, 140, { building: 'yes', height: '8' }),
    rectWay(110, 110, 118, 118, { 'building:part': 'yes', height: '30' })
  ]);
  assert.equal(sparse.tile.buildings.length, 2, 'podium and tower');

  // Parts that fill the outline stand in for it
  const full = build([
    rectWay(100, 100, 140, 140, { building: 'yes', height: '8' }),
    rectWay(100, 100, 140, 120, { 'building:part': 'yes', height: '20' }),
    rectWay(100, 120, 140, 140, { 'building:part': 'yes', height: '12' })
  ]);
  assert.equal(full.tile.buildings.length, 2, 'the two parts only');
  assert.deepEqual(full.tile.buildings.map((b) => b[0]).sort((a, b) => a - b), [12, 20]);
});

// ---- serialising -----------------------------------------------------------------------------------

test('a tile with no forests or styled buildings is written exactly as before', () => {
  const { tile } = build([rectWay(100, 100, 130, 130, { building: 'yes' })]);
  const out = serializeTile(tile);
  assert.equal(out.v, TILE_FORMAT_VERSION);
  assert.equal('forest' in out, false);
  assert.equal('bmeta' in out, false);
  assert.deepEqual(Object.keys(out).sort(), ['buildings', 'green', 'land', 'origin', 'roads', 'sand', 'tx', 'ty', 'v', 'water']);
});

test('the on-demand bundles carry forests and styles too, under the new format version', () => {
  const elements = [
    rectWay(100, 100, 300, 300, { natural: 'wood' }),
    rectWay(400, 400, 420, 412, { building: 'house', 'building:colour': 'white', 'roof:shape': 'pyramidal' })
  ];
  const bundle = buildCellBundle(elements, { id: 'vi', ...VI_ORIGIN }, 0, 0);
  assert.equal(bundle.v, TILE_FORMAT_VERSION);
  const tile = bundle.tiles['0_0'];
  assert.equal(tile.forest.length, 1);
  assert.ok(tile.bmeta['0'][0] > 0);
});
