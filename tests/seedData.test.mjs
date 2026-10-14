// The Lagos test seeds: valid, inside Lagos, spread out, and consistent with each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);

const seeds = await import('../src/services/seedLagos.ts');
const data = await import('../src/services/mockData.ts');

const CATEGORIES = new Set(['events', 'alerts', 'food_drinks', 'lost_found', 'recommendations', 'activities', 'deals', 'community']);
// Greater Lagos and the Badagry corridor out to Agbara: Badagry to Ikorodu / Epe, lagoon to Ikeja
const inLagos = (lat, lng) => lat > 6.35 && lat < 6.7 && lng > 2.8 && lng < 3.65;
const km = (a, b) => Math.hypot((a.latitude - b.latitude) * 110.5, (a.longitude - b.longitude) * 110.5 * Math.cos((6.5 * Math.PI) / 180));

test('every seeded moment is complete, in Lagos and unique', () => {
  const ids = new Set();
  for (const m of seeds.LAGOS_TEST_MOMENTS) {
    assert.ok(m.id.startsWith('seed-moment-'), m.id);
    assert.ok(!ids.has(m.id), `duplicate ${m.id}`);
    ids.add(m.id);
    assert.ok(CATEGORIES.has(m.category), `${m.id}: ${m.category}`);
    assert.ok(inLagos(m.latitude, m.longitude), `${m.id} (${m.latitude}, ${m.longitude}) is outside Lagos`);
    assert.ok(m.title.length >= 5 && m.description.length >= 10);
    assert.ok(new Date(m.expiresAt) > new Date(m.createdAt), `${m.id} expires before it starts`);
    assert.ok(new Date(m.expiresAt) > new Date(), `${m.id} is already expired`);
    assert.ok(m.approxAddress);
  }
  assert.ok(seeds.LAGOS_TEST_MOMENTS.length >= 54);
});

test('the seeds cover every category and many neighbourhoods', () => {
  const categories = new Set(seeds.LAGOS_TEST_MOMENTS.map((m) => m.category));
  assert.equal(categories.size, CATEGORIES.size);
  // far apart enough to be different places: count moments that are at least 600 m from every earlier one
  const spread = [];
  for (const m of seeds.LAGOS_TEST_MOMENTS) if (spread.every((o) => km(o, m) > 0.6)) spread.push(m);
  assert.ok(spread.length >= 44, `only ${spread.length} distinct places`);
  const north = seeds.LAGOS_TEST_MOMENTS.some((m) => m.latitude > 6.58);
  const east = seeds.LAGOS_TEST_MOMENTS.some((m) => m.longitude > 3.53);
  const west = seeds.LAGOS_TEST_MOMENTS.some((m) => m.longitude < 3.3);
  assert.ok(north && east && west, 'spread to the north, east and west edges of the city');
  // the Ojo region, around Alaba International Market
  const ojo = seeds.LAGOS_TEST_MOMENTS.filter((m) => m.latitude > 6.44 && m.latitude < 6.5 && m.longitude > 3.17 && m.longitude < 3.23);
  assert.ok(ojo.length >= 10, `only ${ojo.length} moments around Ojo`);
  assert.ok(new Set(ojo.map((m) => m.category)).size >= 6, 'Ojo has a mix of categories');
  // beyond Ojo, towards Agbara and Badagry
  const agbara = seeds.LAGOS_TEST_MOMENTS.filter((m) => m.longitude > 2.82 && m.longitude < 3.0 && m.latitude > 6.35 && m.latitude < 6.56);
  assert.ok(agbara.length >= 12, `only ${agbara.length} moments towards Agbara`);
  assert.ok(new Set(agbara.map((m) => m.category)).size >= 6, 'Agbara has a mix of categories');
  assert.ok(agbara.some((m) => /Agbara/.test(m.approxAddress)), 'Agbara itself is covered');
});

test('zones, businesses, pins, communities and comments all point at things that exist', () => {
  const momentIds = new Set(data.INITIAL_MOMENTS.map((m) => m.id));
  const businessIds = new Set(data.INITIAL_BUSINESSES.map((b) => b.id));
  for (const z of seeds.LAGOS_TEST_ZONES) assert.ok(inLagos(z.centerLat, z.centerLng), z.id);
  for (const b of seeds.LAGOS_TEST_BUSINESSES) assert.ok(inLagos(b.latitude, b.longitude), b.id);
  for (const p of seeds.LAGOS_TEST_BUSINESS_POSTS) {
    assert.ok(businessIds.has(p.businessId), `${p.id} -> ${p.businessId}`);
    assert.ok(new Date(p.expiresAt) > new Date());
  }
  for (const c of seeds.LAGOS_TEST_COMMUNITIES) assert.ok(momentIds.has(c.momentId), `${c.id} -> ${c.momentId}`);
  const commentIds = new Set(data.INITIAL_COMMENTS.map((c) => c.id));
  for (const c of seeds.LAGOS_TEST_COMMENTS) {
    assert.ok(momentIds.has(c.momentId), `${c.id} -> ${c.momentId}`);
    if (c.parentId) assert.ok(commentIds.has(c.parentId), `${c.id} reply to missing ${c.parentId}`);
  }
});

test('the seeds are part of the app demo data without clashing with the original ids', () => {
  for (const list of [data.INITIAL_MOMENTS, data.INITIAL_ZONES, data.INITIAL_BUSINESSES, data.INITIAL_BUSINESS_POSTS, data.INITIAL_COMMUNITIES, data.INITIAL_COMMENTS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  }
  assert.ok(data.INITIAL_MOMENTS.length >= 8 + seeds.LAGOS_TEST_MOMENTS.length);
  assert.ok(data.INITIAL_MOMENTS.some((m) => m.id === 'moment-1'), 'the original demo moments are still there');
});
