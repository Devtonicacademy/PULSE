import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);

const { planHubMove } = await import('../src/utils/hubFollow.ts');
const { originFor } = await import('../src/utils/mapOrigin.ts');
const { lngLatToMeters, metersToLngLat } = await import('../src/utils/mapProjection.ts');

const VI = { latitude: 6.4281, longitude: 3.4219 };
const IKEJA = { latitude: 6.6018, longitude: 3.3515 }; // ~20 km north of VI: same map origin, different neighbourhood
const LONDON = { latitude: 51.5072, longitude: -0.1276 };

test('inside the Lagos area the hub follows the real position (the map origin stays Victoria Island)', () => {
  assert.equal(originFor(IKEJA.latitude, IKEJA.longitude).id, 'vi', 'the old origin check alone would have ignored this fix');
  assert.deepEqual(planHubMove(VI, IKEJA, false, 'auto'), { move: true, unpin: false });
});

test('a fix beside the hub changes nothing', () => {
  assert.equal(planHubMove(VI, { latitude: 6.4283, longitude: 3.4221 }, false, 'auto').move, false);
});

test('a hand-picked hub survives the automatic look, but "find me" overrides it', () => {
  assert.deepEqual(planHubMove(VI, IKEJA, true, 'auto'), { move: false, unpin: false });
  assert.deepEqual(planHubMove(VI, IKEJA, true, 'user'), { move: true, unpin: true });
});

test('an approximate IP position never replaces a real GPS one that is already known', () => {
  const ip = { ...IKEJA, source: 'ip' };
  assert.equal(planHubMove(VI, ip, false, 'auto', false).move, true, 'with nothing better, the guess is used');
  assert.equal(planHubMove(VI, ip, false, 'auto', true).move, false, 'a late guess is ignored once GPS is known');
  assert.equal(planHubMove(VI, ip, false, 'user', true).move, true, 'but pressing "find me" always answers');
});

test('a fix on the other side of the world moves the hub too', () => {
  assert.equal(planHubMove(VI, LONDON, false, 'auto').move, true);
});

test('coordinates round-trip through the map projection as [lng, lat] in both origins', () => {
  for (const place of [VI, IKEJA]) {
    const [x, y] = lngLatToMeters(place.longitude, place.latitude);
    const [lng, lat] = metersToLngLat(x, y);
    assert.ok(Math.abs(lng - place.longitude) < 1e-6 && Math.abs(lat - place.latitude) < 1e-6);
  }
  // Swapping lat and lng is the classic mistake: it would put Ikeja thousands of kilometres away
  const [x, y] = lngLatToMeters(IKEJA.longitude, IKEJA.latitude);
  assert.ok(Math.hypot(x, y) < 30_000, 'Ikeja is ~20 km from the origin');
  const [sx, sy] = lngLatToMeters(IKEJA.latitude, IKEJA.longitude);
  assert.ok(Math.hypot(sx, sy) > 100_000, 'swapped arguments land far away, so the call sites must stay [lng, lat]');
});
