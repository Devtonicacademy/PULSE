import { test } from 'node:test';
import assert from 'node:assert/strict';

const { orderTiles, cacheDecision, angleBetween, NEAR_METERS } = await import('../src/components/map/pulse3d/tilePriority.ts');

const SIZE = 500;
const tile = (tx, ty, focus = [0, 0]) => ({
  key: `${tx}_${ty}`,
  tx,
  ty,
  dist: Math.hypot((tx + 0.5) * SIZE - focus[0], (ty + 0.5) * SIZE - focus[1])
});

test('angleBetween wraps around north', () => {
  assert.equal(angleBetween(350, 10), 20);
  assert.equal(angleBetween(0, 180), 180);
  assert.equal(angleBetween(90, 90), 0);
});

test('without a heading the nearest tile loads first', () => {
  const ordered = orderTiles([tile(3, 0), tile(1, 0), tile(2, 0)], SIZE, [0, 0], null);
  assert.deepEqual(ordered.map((t) => t.key), ['1_0', '2_0', '3_0']);
});

test('a tile ahead of the camera beats an equally distant tile behind it', () => {
  const ahead = tile(2, 0); // east
  const behind = tile(-3, 0); // west, a hair closer than `ahead`
  assert.ok(behind.dist <= ahead.dist);
  const facingEast = orderTiles([behind, ahead], SIZE, [0, 0], 90);
  assert.equal(facingEast[0].key, ahead.key);
  const facingWest = orderTiles([behind, ahead], SIZE, [0, 0], 270);
  assert.equal(facingWest[0].key, behind.key);
});

test('tiles underfoot always load first, whichever way the camera faces', () => {
  const underfoot = tile(-1, 0); // behind a camera facing east, but within reach of the focus
  const ahead = { ...tile(1, 0), dist: 400 }; // slightly farther away
  assert.ok(underfoot.dist <= NEAR_METERS);
  const ordered = orderTiles([ahead, underfoot], SIZE, [0, 0], 90);
  assert.equal(ordered[0].key, underfoot.key);
});

test('cached tiles are fresh, then usable while refreshing, then expired', () => {
  const HOUR = 3600_000;
  assert.equal(cacheDecision(10 * 60_000, HOUR, 24 * HOUR), 'fresh');
  assert.equal(cacheDecision(5 * HOUR, HOUR, 24 * HOUR), 'stale');
  assert.equal(cacheDecision(30 * HOUR, HOUR, 24 * HOUR), 'expired');
  assert.equal(cacheDecision(-5, HOUR, 24 * HOUR), 'fresh', 'a clock that moved backwards does not discard the tile');
});
