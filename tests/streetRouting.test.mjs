// Street graph from tile roads + A* routing: joins, seams, no estimate, far destinations end on the street.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);

const { buildGraph, connectedComponents, StreetGraphStore } = await import('../src/utils/streetGraph.ts');
const { findWalkingRoute } = await import('../src/utils/walkingRouter.ts');
const { metersToLngLat } = await import('../src/utils/mapProjection.ts');
const { distanceToPolyline, polylineLength } = await import('../src/utils/obstacles.ts');

/** a road as stored in a tile: [class (5 = residential), width dm, bridge, flat decimeter points] */
const road = (...pts) => [5, 60, 0, pts.flatMap(([x, y]) => [Math.round(x * 10), Math.round(y * 10)])];
const lngLat = ([x, y]) => metersToLngLat(x, y);

test('road ends within half a meter are one junction; farther apart they are not', () => {
  const close = buildGraph([[[0, 0], [50, 0]], [[50.4, 0], [50.4, 40]]]);
  assert.equal(connectedComponents(close).count, 1);
  const apart = buildGraph([[[0, 0], [50, 0]], [[50.8, 0], [50.8, 40]]]);
  assert.equal(connectedComponents(apart).count, 2);
});

test('a shared vertex splits both roads so the route can turn there', () => {
  const g = buildGraph([[[0, 0], [50, 0], [100, 0]], [[50, -40], [50, 0], [50, 40]]]);
  assert.equal(g.edges.length, 4);
  assert.equal(connectedComponents(g).count, 1);
});

test('roads that only cross, with no shared vertex, stay unconnected', () => {
  const g = buildGraph([[[0, 0], [100, 0]], [[50, -40], [50, 40]]]);
  assert.equal(connectedComponents(g).count, 2);
});

test('roads cut at a tile edge join across the seam', () => {
  const store = new StreetGraphStore();
  store.setTile(0, 0, [0, 0], [road([400, 20], [500, 20])]);
  store.setTile(1, 0, [500, 0], [road([0, 20], [90, 20])]); // starts where the other ended
  const g = store.graph();
  assert.equal(connectedComponents(g).count, 1);
  store.removeTile(1, 0);
  assert.equal(store.graph().edges.length, 1);
});

test('motorways are left out of the walking network', () => {
  const store = new StreetGraphStore();
  store.setTile(0, 0, [0, 0], [[0, 160, 0, [0, 0, 1000, 0]], road([0, 50], [100, 50])]);
  assert.equal(store.graph().edges.length, 1);
});

test('distanceToPolyline reports how far along the line the nearest spot is', () => {
  const line = [[0, 0], [100, 0], [100, 100]];
  const r = distanceToPolyline([100, 40], line);
  assert.ok(Math.abs(r.along - 140) < 1e-6 && Math.abs(r.dist) < 1e-6);
  const off = distanceToPolyline([30, 12], line);
  assert.ok(Math.abs(off.along - 30) < 1e-6 && Math.abs(off.dist - 12) < 1e-6);
  assert.equal(polylineLength(line), 200);
});

// ---- routing --------------------------------------------------------------------------------------

const { streetGraph } = await import('../src/utils/streetGraph.ts');

function loadStreets(roads) {
  streetGraph.clear();
  streetGraph.setTile(0, 0, [0, 0], roads);
}

test('a route follows the streets round a corner instead of cutting across', async () => {
  loadStreets([road([0, 0], [100, 0]), road([100, 0], [100, 100])]);
  const route = await findWalkingRoute(lngLat([10, 3]), lngLat([100, 90]), 'Cafe');
  assert.ok(route);
  assert.ok(route.totalDistanceMeters >= 175 && route.totalDistanceMeters <= 195, `length ${route.totalDistanceMeters}`);
  assert.equal(route.routeSource, 'streets');
  assert.ok(route.waypoints.some((w) => w.cueType === 'turn-left'), 'there is a turn cue at the corner');
});

test('no street near the start means no route, not an estimate', async () => {
  loadStreets([road([0, 0], [100, 0])]);
  assert.equal(await findWalkingRoute(lngLat([0, 900]), lngLat([100, 5]), 'Far'), null);
  streetGraph.clear();
  assert.equal(await findWalkingRoute(lngLat([0, 0]), lngLat([100, 5]), 'Nowhere'), null);
});

test('streets that do not connect give no route', async () => {
  loadStreets([road([0, 0], [100, 0]), road([0, 200], [100, 200])]);
  assert.equal(await findWalkingRoute(lngLat([10, 2]), lngLat([90, 198]), 'Other block'), null);
});

test('a destination far from any street ends on the nearest street', async () => {
  loadStreets([road([0, 0], [100, 0]), road([100, 0], [100, 100])]);
  const route = await findWalkingRoute(lngLat([5, 0]), lngLat([100, 600]), 'Far away pin');
  assert.ok(route);
  assert.ok(route.endsShortMeters > 400, `ends ${route.endsShortMeters} m short`);
  assert.ok(route.totalDistanceMeters < 220);
});

test('a destination on the street is reached exactly', async () => {
  loadStreets([road([0, 0], [100, 0])]);
  const route = await findWalkingRoute(lngLat([5, 0]), lngLat([95, 1]), 'Corner shop');
  assert.equal(route.endsShortMeters, 0);
});
