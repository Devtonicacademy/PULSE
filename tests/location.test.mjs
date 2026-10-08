import { test } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../src/services/locationService.ts');
const { locate, getLocationPermission, ipLocation, describeLocationProblem, getLocationStatus, resetLocationStatus } = mod;

const position = (over = {}) => ({ coords: { latitude: 6.45, longitude: 3.4, accuracy: 30, heading: null, speed: null, ...over } });
const geolocation = (outcome) => ({
  getCurrentPosition: (ok, fail) => (outcome.code ? fail({ code: outcome.code }) : ok(position(outcome))),
});
const permissions = (state) => ({ query: async () => ({ state }) });
const ipFetch = (body, ok = true) => async () => ({ ok, json: async () => body });
const LAGOS_IP = { latitude: 6.52, longitude: 3.38, city: 'Lagos', country: 'Nigeria', accuracyKm: 25 };

test('allowed location uses the browser and never touches the IP service', async () => {
  resetLocationStatus();
  let fetched = false;
  const result = await locate({}, {
    geolocation: geolocation({}),
    permissions: permissions('granted'),
    fetchImpl: async () => { fetched = true; return { ok: false }; },
    isSecureContext: true
  });
  assert.equal(result.fix.source, 'gps');
  assert.equal(result.problem, null);
  assert.equal(fetched, false);
  assert.equal(getLocationStatus().source, 'gps');
});

test('a blocked site skips the browser (no pointless prompt) and uses the IP backup', async () => {
  let asked = false;
  const result = await locate({}, {
    geolocation: { getCurrentPosition: () => { asked = true; } },
    permissions: permissions('denied'),
    fetchImpl: ipFetch(LAGOS_IP),
    isSecureContext: true
  });
  assert.equal(asked, false);
  assert.equal(result.permission, 'denied');
  assert.equal(result.problem, 'denied');
  assert.equal(result.fix.source, 'ip');
  assert.equal(result.fix.place, 'Lagos, Nigeria');
  assert.ok(result.fix.accuracy >= 10000, 'the IP fix is never presented as precise');
  assert.deepEqual([getLocationStatus().source, getLocationStatus().problem], ['ip', 'denied']);
});

test('the user declining the prompt, a timeout and an unavailable fix all fall back to IP', async () => {
  for (const [code, problem] of [[1, 'denied'], [3, 'timeout'], [2, 'unavailable']]) {
    const result = await locate({}, {
      geolocation: geolocation({ code }),
      permissions: permissions('prompt'),
      fetchImpl: ipFetch(LAGOS_IP),
      isSecureContext: true
    });
    assert.equal(result.problem, problem);
    assert.equal(result.fix.source, 'ip');
  }
});

test('an insecure page or a browser without geolocation goes straight to the backup', async () => {
  const insecure = await locate({}, { geolocation: geolocation({}), permissions: permissions('granted'), fetchImpl: ipFetch(LAGOS_IP), isSecureContext: false });
  assert.equal(insecure.problem, 'insecure');
  assert.equal(insecure.fix.source, 'ip');
  const none = await locate({}, { fetchImpl: ipFetch(LAGOS_IP), isSecureContext: true });
  assert.equal(none.problem, 'unsupported');
  assert.equal(none.fix.source, 'ip');
  assert.equal(await getLocationPermission({}), 'unsupported');
});

test('when the backup fails too there is no fix, and the status says the hub is in use', async () => {
  const result = await locate({}, { geolocation: geolocation({ code: 1 }), permissions: permissions('prompt'), fetchImpl: ipFetch({}, false), isSecureContext: true });
  assert.equal(result.fix, null);
  assert.equal(getLocationStatus().source, 'hub');
  const thrown = await ipLocation(async () => { throw new Error('offline'); });
  assert.equal(thrown, null);
  assert.equal(await ipLocation(ipFetch({ latitude: 'x', longitude: 3 })), null);
});

test('the IP backup can be switched off', async () => {
  let fetched = false;
  const result = await locate({ ipFallback: false }, {
    geolocation: geolocation({ code: 1 }), permissions: permissions('prompt'),
    fetchImpl: async () => { fetched = true; return { ok: true, json: async () => LAGOS_IP }; }, isSecureContext: true
  });
  assert.equal(result.fix, null);
  assert.equal(fetched, false);
});

test('every problem has a plain explanation, and blocked access says how to fix it', () => {
  for (const problem of ['denied', 'insecure', 'unsupported', 'timeout', 'unavailable']) {
    const { title, hint } = describeLocationProblem(problem, true);
    assert.ok(title.length > 5 && hint.length > 10, problem);
  }
  assert.match(describeLocationProblem('denied', true).hint, /site settings/i);
  assert.match(describeLocationProblem('denied', true).hint, /approximate/i);
  assert.match(describeLocationProblem('denied', false).hint, /hub/i);
});
