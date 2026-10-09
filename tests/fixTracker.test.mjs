import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);
const { FixTracker, distanceMeters, STALE_MS, MAX_SPEED_MS } = await import('../src/services/fixTracker.ts');

const LAGOS = { latitude: 6.5244, longitude: 3.3792 };
const NEAR = { latitude: 6.5245, longitude: 3.3793 }; // ~15 m away
const LONDON = { latitude: 51.5072, longitude: -0.1276 };
const gps = (place, accuracy, extra = {}) => ({ ...place, accuracy, source: 'gps', ...extra });
const ip = (place) => ({ ...place, accuracy: 25000, source: 'ip' });

test('the first fix is always taken, even a coarse one', () => {
  const t = new FixTracker();
  assert.deepEqual(t.consider(gps(LAGOS, 4000), 0), { accepted: true });
  assert.equal(t.current.accuracy, 4000);
});

test('a precise fix replaces a coarse one', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 800), 0);
  assert.equal(t.consider(gps(NEAR, 12), 5_000).accepted, true);
  assert.equal(t.current.accuracy, 12);
});

test('a much worse fix is ignored while the current one is fresh', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 10), 0);
  const verdict = t.consider(gps(NEAR, 80), 3_000);
  assert.deepEqual(verdict, { accepted: false, reason: 'worse' });
  assert.equal(t.current.accuracy, 10, 'the good fix is kept');
  assert.equal(t.consider(gps(NEAR, 25), 3_500).accepted, true, 'slightly worse is normal movement');
});

test('nothing coarser than 500 m is taken after a good fix', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 300), 0);
  assert.deepEqual(t.consider(gps(NEAR, 900), 1_000), { accepted: false, reason: 'inaccurate' });
});

test('...but when the current fix is old, the next one is taken: the user has probably moved', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 10), 0);
  assert.equal(t.consider(gps(NEAR, 900), STALE_MS + 1_000).accepted, true);
});

test('an impossible jump is ignored: London two seconds after Lagos', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 10), 0);
  assert.ok(distanceMeters(LAGOS, LONDON) > 4_000_000);
  assert.deepEqual(t.consider(gps(LONDON, 10), 2_000), { accepted: false, reason: 'jump' });
  assert.equal(t.current.latitude, LAGOS.latitude);
});

test('a real journey is fine: the allowed distance grows with the time between fixes', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 10), 0);
  const kmAway = { latitude: LAGOS.latitude + 0.18, longitude: LAGOS.longitude }; // ~20 km
  assert.equal(t.consider(gps(kmAway, 10), 60_000).accepted, false, '20 km in a minute is a teleport');
  assert.equal(t.consider(gps(kmAway, 10), 20 * 60_000).accepted, true, '20 km in twenty minutes is a drive');
  assert.ok(MAX_SPEED_MS * 60 < 20_000);
});

test('the accuracy radii count: a jump inside the error circles is just noise', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 4000), 0);
  const farButWithinError = { latitude: LAGOS.latitude + 0.02, longitude: LAGOS.longitude }; // ~2.2 km
  assert.equal(t.consider(gps(farButWithinError, 3000), 1_000).accepted, true);
});

test('an IP guess never replaces a GPS fix, until that fix is very old', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 20), 0);
  assert.deepEqual(t.consider(ip(LONDON), 60_000), { accepted: false, reason: 'ip-over-gps' });
  assert.equal(t.current.source, 'gps');
  assert.equal(t.consider(ip(LAGOS), 11 * 60_000).accepted, true, 'a ten-minute-old GPS fix no longer protects itself');
});

test('GPS always replaces an IP guess, however coarse', () => {
  const t = new FixTracker();
  t.consider(ip(LAGOS), 0);
  assert.equal(t.consider(gps(LAGOS, 4000), 1_000).accepted, true);
  assert.equal(t.current.source, 'gps');
});

test('"find me now" (force) is taken even when it is a little worse: the person asked', () => {
  const t = new FixTracker();
  t.consider(gps(LAGOS, 10), 0);
  assert.equal(t.consider(gps(NEAR, 200), 1_000, { force: true }).accepted, true);
});
