import { test } from 'node:test';
import assert from 'node:assert/strict';

// The util is TypeScript; strip the types with Node's built-in type stripping
const mod = await import('../src/utils/sunLight.ts');
const { getSunPosition, getLighting } = mod;

const LAGOS = { lat: 6.5244, lng: 3.3792 };
const at = (iso) => new Date(iso);

test('sun is high at midday in Lagos and below the horizon at midnight', () => {
  const noon = getSunPosition(at('2026-10-08T12:00:00Z'), LAGOS.lat, LAGOS.lng);
  assert.ok(noon.altitude > 60, `noon altitude ${noon.altitude}`);
  const midnight = getSunPosition(at('2026-10-08T00:00:00Z'), LAGOS.lat, LAGOS.lng);
  assert.ok(midnight.altitude < -50, `midnight altitude ${midnight.altitude}`);
});

test('sun rises in the east and sets in the west', () => {
  const morning = getSunPosition(at('2026-10-08T05:30:00Z'), LAGOS.lat, LAGOS.lng);
  assert.ok(morning.azimuth > 60 && morning.azimuth < 120, `morning azimuth ${morning.azimuth}`);
  const evening = getSunPosition(at('2026-10-08T17:30:00Z'), LAGOS.lat, LAGOS.lng);
  assert.ok(evening.azimuth > 240 && evening.azimuth < 300, `evening azimuth ${evening.azimuth}`);
});

test('Lagos sunrise and sunset are near 6:30 and 18:40 local time (UTC+1) in October', () => {
  const find = (fromH, toH, rising) => {
    for (let m = fromH * 60; m < toH * 60; m++) {
      const t = new Date(Date.UTC(2026, 9, 8, 0, m));
      const a = getSunPosition(t, LAGOS.lat, LAGOS.lng).altitude;
      const b = getSunPosition(new Date(t.getTime() + 60000), LAGOS.lat, LAGOS.lng).altitude;
      if (rising ? a < -0.83 && b >= -0.83 : a > -0.83 && b <= -0.83) return t.getUTCHours() * 60 + t.getUTCMinutes();
    }
    return null;
  };
  const sunrise = find(4, 8, true); // UTC minutes
  const sunset = find(16, 20, false);
  assert.ok(Math.abs(sunrise - (5 * 60 + 40)) < 15, `sunrise ${sunrise} (expected about 5:40 UTC)`);
  assert.ok(Math.abs(sunset - (17 * 60 + 40)) < 15, `sunset ${sunset} (expected about 17:40 UTC)`);
});

test('moods follow the day: night, dawn, day, dusk, night', () => {
  const mood = (iso) => getLighting(at(iso), LAGOS.lat, LAGOS.lng).mood;
  assert.equal(mood('2026-10-08T01:00:00Z'), 'night');
  assert.equal(mood('2026-10-08T05:50:00Z'), 'dawn');
  assert.equal(mood('2026-10-08T11:00:00Z'), 'day');
  assert.equal(mood('2026-10-08T17:30:00Z'), 'dusk');
  assert.equal(mood('2026-10-08T21:00:00Z'), 'night');
});

test('daylight is 0 at night, 1 at noon and rises smoothly through dawn', () => {
  const day = (iso) => getLighting(at(iso), LAGOS.lat, LAGOS.lng).daylight;
  assert.equal(day('2026-10-08T00:00:00Z'), 0);
  assert.equal(day('2026-10-08T12:00:00Z'), 1);
  const samples = ['05:00', '05:20', '05:40', '06:00', '06:20', '06:40'].map((t) => day(`2026-10-08T${t}:00Z`));
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= samples[i - 1], 'monotonic rise ' + samples.join(','));
});

test('works for other cities too (London in winter has a low midday sun)', () => {
  const noon = getSunPosition(at('2026-12-21T12:00:00Z'), 51.5, -0.12);
  assert.ok(noon.altitude > 10 && noon.altitude < 20, `london noon altitude ${noon.altitude}`);
});
