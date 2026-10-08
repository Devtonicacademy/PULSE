import { test } from 'node:test';
import assert from 'node:assert/strict';

// The modules are TypeScript with no framework imports; Node strips the types itself
const { sanitizeAvatar, DEFAULT_AVATAR, HAIR_STYLES, loadStoredAvatar, storeAvatar } = await import('../src/components/avatar/avatarConfig.ts');
const { sanitizeSurvey, DEFAULT_SURVEY, loadSurvey, storeSurvey } = await import('../src/utils/survey.ts');
const { originFor } = await import('../src/utils/mapOrigin.ts');
const { originFor: serverOriginFor } = await import('../server/osm/coverage.js');

test('avatar config: anything stored or sent is reduced to a safe config', () => {
  assert.deepEqual(sanitizeAvatar(undefined), DEFAULT_AVATAR);
  assert.deepEqual(sanitizeAvatar('nope'), DEFAULT_AVATAR);
  const cleaned = sanitizeAvatar({
    skin: '#8d5a3b',
    hair: 'url(javascript:alert(1))', // not a hex color
    top: '#FFAA00',
    hairStyle: 'mohawk', // unknown style
    cap: 'yes', // not a boolean
    backpack: true,
    extra: 'ignored'
  });
  assert.equal(cleaned.skin, '#8d5a3b');
  assert.equal(cleaned.hair, DEFAULT_AVATAR.hair);
  assert.equal(cleaned.top, '#FFAA00');
  assert.equal(cleaned.hairStyle, DEFAULT_AVATAR.hairStyle);
  assert.equal(cleaned.cap, false);
  assert.equal(cleaned.backpack, true);
  assert.equal('extra' in cleaned, false);
  for (const style of HAIR_STYLES) assert.equal(sanitizeAvatar({ hairStyle: style.id }).hairStyle, style.id);
});

test('survey answers: unknown values fall back to defaults', () => {
  assert.deepEqual(sanitizeSurvey(null), { ...DEFAULT_SURVEY, hours: [], interests: [] });
  const cleaned = sanitizeSurvey({
    interests: ['events', 'hacking', 7],
    getAround: 'teleport',
    hours: ['late', 'noon'],
    radiusKm: 3,
    alerts: 'sure'
  });
  assert.deepEqual(cleaned.interests, ['events']);
  assert.equal(cleaned.getAround, DEFAULT_SURVEY.getAround);
  assert.deepEqual(cleaned.hours, ['late']);
  assert.equal(cleaned.radiusKm, DEFAULT_SURVEY.radiusKm);
  assert.equal(cleaned.alerts, DEFAULT_SURVEY.alerts);
  assert.equal(sanitizeSurvey({ radiusKm: 25 }).radiusKm, 25);
});

test('answers and avatars are stored per user', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v))
  };
  assert.equal(loadSurvey('alice'), null);
  storeSurvey('alice', { ...DEFAULT_SURVEY, radiusKm: 10 });
  storeAvatar('alice', { ...DEFAULT_AVATAR, hairStyle: 'afro' });
  assert.equal(loadSurvey('alice').radiusKm, 10);
  assert.equal(loadStoredAvatar('alice').hairStyle, 'afro');
  assert.equal(loadSurvey('bob'), null);
  assert.equal(loadStoredAvatar('bob'), null);
  // Corrupt storage never throws
  store.set('pulse.survey.carol', '{not json');
  assert.equal(loadSurvey('carol'), null);
});

test('the browser and the server pick the same map origin', () => {
  const places = [
    [6.5244, 3.3792], // Lagos
    [6.4281, 3.4219], // Victoria Island
    [7.3775, 3.947], // Ibadan (~130 km away)
    [51.5072, -0.1276], // London
    [-33.8688, 151.2093], // Sydney
    [40.7128, -74.006], // New York
    [0.1, 0.1]
  ];
  for (const [lat, lng] of places) {
    const client = originFor(lat, lng);
    const server = serverOriginFor(lat, lng);
    assert.equal(client.id, server.id, `${lat},${lng}`);
    assert.equal(client.latitude, server.latitude);
    assert.equal(client.longitude, server.longitude);
  }
  assert.equal(originFor(6.5244, 3.3792).id, 'vi');
  assert.notEqual(originFor(7.3775, 3.947).id, 'vi');
});
