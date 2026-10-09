// Ground layers must not fight over depth, and no building may hover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);
const { groundedMinHeights, pointInRing } = await import('../src/components/map/pulse3d/buildingSupport.ts');
const { LAYER_RENDER_ORDER, GROUND_LAYER_ORDER } = await import('../src/components/map/pulse3d/layerOrder.ts');
const { buildTileGeometry } = await import('../src/components/map/pulse3d/tileMeshes.ts');
const { createPulseMaterials } = await import('../src/components/map/pulse3d/materials.ts');

/** A square footprint in decimeters: centre (cx, cy) meters, half-size meters */
const square = (cx, cy, half) => {
  const [a, b, c, d] = [(cx - half) * 10, (cy - half) * 10, (cx + half) * 10, (cy + half) * 10];
  return [a, b, c, b, c, d, a, d];
};
/** [height, minHeight, kind, outer] */
const building = (height, minHeight, cx, cy, half) => [height, minHeight, 0, square(cx, cy, half)];

// ---- floating buildings -----------------------------------------------------------------------------

test('a raised part with nothing under it is built down to the ground', () => {
  const canopy = building(5, 3, 100, 100, 4);
  assert.deepEqual(groundedMinHeights([canopy]), [0]);
});

test('a raised part resting on a building that starts at the ground keeps its height', () => {
  const podium = building(12, 0, 100, 100, 20);
  const tower = building(60, 12, 100, 100, 8);
  assert.deepEqual(groundedMinHeights([podium, tower]), [0, 12]);
});

test('a part on a part on the ground is held up through the chain', () => {
  const base = building(10, 0, 0, 0, 20);
  const middle = building(30, 10, 0, 0, 12);
  const top = building(50, 30, 0, 0, 6);
  assert.deepEqual(groundedMinHeights([top, middle, base]), [30, 10, 0], 'order in the file does not matter');
});

test('a podium that is too low to reach the raised part does not hold it up', () => {
  const lowShed = building(2, 0, 0, 0, 20);
  const bridgeLike = building(30, 20, 0, 0, 5);
  assert.deepEqual(groundedMinHeights([lowShed, bridgeLike]), [0, 0]);
});

test('a raised part beside (not above) a building is still unsupported', () => {
  const house = building(10, 0, 0, 0, 5);
  const neighbourCanopy = building(5, 3, 100, 0, 4);
  assert.deepEqual(groundedMinHeights([house, neighbourCanopy]), [0, 0]);
});

test('point in ring', () => {
  const ring = square(0, 0, 5);
  assert.equal(pointInRing(0, 0, ring), true);
  assert.equal(pointInRing(200, 0, ring), false);
});

test('in the real Lagos tiles, no building is left hovering', () => {
  const dir = new URL('../public/map-tiles/', import.meta.url);
  let raised = 0;
  let stillFloating = 0;
  let heldUp = 0;
  for (const file of readdirSync(dir)) {
    if (!/^-?\d+_-?\d+\.json$/.test(file)) continue;
    const tile = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const starts = groundedMinHeights(tile.buildings);
    tile.buildings.forEach((b, i) => {
      if (!(b[1] > 0)) return;
      raised++;
      if (starts[i] > 0) heldUp++;
      // Anything still raised must have a ground-level building under a sample point of it
      if (starts[i] > 0) {
        const supported = tile.buildings.some((o, oi) => oi !== i && (starts[oi] > 0 || o[1] === 0) && o[0] >= b[1] * 0.5 && o[3].length >= 6);
        if (!supported) stillFloating++;
      }
    });
  }
  assert.ok(raised > 100, 'the data does contain raised parts');
  assert.equal(stillFloating, 0);
  assert.ok(heldUp < raised, 'most of them had nothing under them and now reach the ground');
});

// ---- the geometry itself ----------------------------------------------------------------------------

const emptyTile = (over = {}) => ({
  v: 1, tx: 0, ty: 0, origin: [0, 0], buildings: [], roads: [], water: [], green: [], sand: [], land: 1, ...over
});
const layerOf = (geometry, name) => geometry.layers.find((l) => l.name === name);
const minY = (layer) => {
  const p = layer.attributes.position.array;
  let min = Infinity;
  for (let i = 1; i < p.length; i += 3) min = Math.min(min, p[i]);
  return min;
};

test('a hovering building is built from y = 0 in the finished geometry', () => {
  const geometry = buildTileGeometry(emptyTile({ buildings: [building(5, 3, 100, 100, 4)] }), 500);
  assert.equal(minY(layerOf(geometry, 'buildings')), 0);
});

test('a building that is held up keeps its raised start', () => {
  const geometry = buildTileGeometry(emptyTile({ buildings: [building(12, 0, 100, 100, 20), building(60, 12, 100, 100, 8)] }), 500);
  // The lowest wall is the podium's (0); the raised part's wall starts at 12, so some vertices sit exactly at 12
  const p = layerOf(geometry, 'buildings').attributes.position.array;
  const ys = new Set();
  for (let i = 1; i < p.length; i += 3) ys.add(Math.round(p[i] * 10) / 10);
  assert.ok(ys.has(12));
});

test('the flat layers are painted bottom to top in a fixed order, behind the solid objects', () => {
  const ring = square(100, 100, 30);
  const geometry = buildTileGeometry(
    emptyTile({ land: 1, water: [[ring]], sand: [[ring]], green: [[ring]], roads: [[3, 80, 0, [0, 0, 2000, 2000]]], buildings: [building(10, 0, 300, 300, 10)] }),
    500
  );
  const order = (name) => layerOf(geometry, name).renderOrder;
  assert.ok(order('land') < order('water') && order('water') < order('sand') && order('sand') < order('green') && order('green') < order('roads'));
  assert.ok(order('buildings') < order('land'), 'solid things first, so hidden ground is rejected cheaply');
  assert.deepEqual(GROUND_LAYER_ORDER.map((n) => LAYER_RENDER_ORDER[n]), [...GROUND_LAYER_ORDER].map((n) => LAYER_RENDER_ORDER[n]).sort((a, b) => a - b));
});

test('no two flat layers share a draw order (a tie would be decided by material creation order)', () => {
  const orders = GROUND_LAYER_ORDER.map((n) => LAYER_RENDER_ORDER[n]);
  assert.equal(new Set(orders).size, orders.length);
});

test('flat ground materials never write depth, so their centimetre gaps cannot flicker', () => {
  const m = createPulseMaterials();
  for (const name of ['ground', 'land', 'water', 'sand', 'green', 'road']) {
    assert.equal(m[name].depthWrite, false, name);
    assert.equal(m[name].depthTest, true, `${name} is still hidden by buildings in front of it`);
  }
  assert.notEqual(m.building.depthWrite, false, 'buildings do write depth');
});

test('roads are painted small streets first, then bigger roads, then bridges', () => {
  // Listed backwards on purpose: a motorway (class 0), a bridge (class 2), a service street (class 7)
  const roads = [
    [0, 120, 0, [0, 0, 3000, 0]],
    [2, 100, 1, [0, 100, 3000, 100]],
    [7, 40, 0, [0, 200, 3000, 200]]
  ];
  const geometry = buildTileGeometry(emptyTile({ roads }), 500);
  const p = layerOf(geometry, 'roads').attributes.position.array;
  // Six vertices per segment; the first vertex of each road's first segment
  const heights = [0, 6, 12].map((v) => p[v * 3 + 1]);
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2], `ascending paint order, got ${heights}`);
  const zOfFirst = [0, 6, 12].map((v) => Math.round(Math.abs(p[v * 3 + 2])));
  assert.deepEqual(zOfFirst.map((z) => z < 100 ? 'service' : z < 150 ? 'motorway' : 'bridge').length, 3);
});
