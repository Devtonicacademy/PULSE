// Collision for the walking avatar: buildings and water block, walls are slid along, bridges are crossable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);

const { ObstacleIndex } = await import('../src/utils/obstacles.ts');

/** square [x0,y0]-[x1,y1] meters -> flat decimeters */
const box = (x0, y0, x1, y1) => [x0 * 10, y0 * 10, x1 * 10, y0 * 10, x1 * 10, y1 * 10, x0 * 10, y1 * 10];

function world(data) {
  const index = new ObstacleIndex(500);
  index.setTile(0, 0, [0, 0], { buildings: [], water: [], bridges: [], ...data });
  return index;
}

test('a building blocks its inside and keeps a margin outside its walls', () => {
  const w = world({ buildings: [[box(20, 20, 40, 40)]] });
  assert.equal(w.blocked([30, 30]), true);
  assert.equal(w.blocked([19.6, 30]), true); // inside the avatar radius
  assert.equal(w.blocked([10, 30]), false);
});

test('walking straight at a wall stops at the wall', () => {
  const w = world({ buildings: [[box(20, 0, 40, 100)]] });
  const { position, blocked } = w.move([10, 50], [30, 50]);
  assert.equal(blocked, true);
  assert.ok(position[0] < 20 && position[0] > 17, `stopped at ${position[0]}`);
});

test('a long stride cannot jump over a thin wall', () => {
  const w = world({ buildings: [[box(20, 0, 21, 100)]] });
  const { position } = w.move([10, 50], [40, 50]);
  assert.ok(position[0] < 20, `ended at ${position[0]}`);
});

test('walking at an angle slides along the wall instead of sticking', () => {
  const w = world({ buildings: [[box(20, 0, 40, 100)]] });
  const { position } = w.move([10, 50], [25, 65]);
  assert.ok(position[1] > 55, `slid to y=${position[1]}`);
  assert.ok(position[0] < 20);
});

test('an avatar that starts inside a footprint can walk out', () => {
  const w = world({ buildings: [[box(20, 20, 40, 40)]] });
  const { position } = w.move([30, 30], [60, 30]);
  assert.deepEqual(position, [60, 30]);
});

test('a courtyard (hole) is walkable', () => {
  const w = world({ buildings: [[box(0, 0, 60, 60), box(20, 20, 40, 40)]] });
  assert.equal(w.blocked([30, 30]), false);
  assert.equal(w.blocked([5, 30]), true);
});

test('water blocks except on a bridge', () => {
  const w = world({
    water: [[box(0, 40, 100, 60)]],
    bridges: [[30, [50 * 10, 30 * 10, 50 * 10, 70 * 10]]] // 3 m half width, runs north-south at x=50
  });
  assert.equal(w.blocked([10, 50], 0), true);
  assert.equal(w.blocked([50, 50], 0), false);
  assert.equal(w.segmentBlocked([50, 30], [50, 70]), false);
  assert.equal(w.segmentBlocked([10, 30], [10, 70]), true);
});

test('hovering parts are not given to the index, so tiles with none stay open', () => {
  const w = world({});
  assert.equal(w.blocked([5, 5]), false);
  assert.ok(Math.abs(w.move([0, 0], [20, 0]).position[0] - 20) < 1e-6);
});

test('buildings reach across tile edges', () => {
  const w = new ObstacleIndex(500);
  // filed under tile (0,0) but extending past x=500
  w.setTile(0, 0, [0, 0], { buildings: [[box(490, 10, 520, 40)]], water: [], bridges: [] });
  assert.equal(w.blocked([510, 25]), true);
});
