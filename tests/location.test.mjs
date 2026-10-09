import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);

const mod = await import('../src/services/locationService.ts');
const { locate, getLocationPermission, ipLocation, describeLocationProblem, getLocationStatus, resetLocationStatus } = mod;

// The service remembers the best fix it has seen: every test starts from a clean slate
beforeEach(() => resetLocationStatus());

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

// ---- Retry ladder, freshness, refinement and the watcher --------------------------------------------

const { refineLocation, watchLocation, hubNameFor, reportFix, COARSE_ACCURACY_M } = mod;

/** A geolocation whose answers are scripted per call, recording the options it was asked with */
const scripted = (answers) => {
  const calls = [];
  return {
    calls,
    getCurrentPosition: (ok, fail, options) => {
      calls.push(options);
      const next = answers[Math.min(calls.length - 1, answers.length - 1)];
      return next.code ? fail({ code: next.code }) : ok(position(next));
    }
  };
};

test('"timed out" or "unavailable" is retried once with high accuracy before giving up', async () => {
  const geo = scripted([{ code: 3 }, { accuracy: 12 }]);
  const result = await locate({}, { geolocation: geo, permissions: permissions('prompt'), fetchImpl: ipFetch({}, false), isSecureContext: true });
  assert.equal(result.fix.source, 'gps');
  assert.equal(result.fix.accuracy, 12);
  assert.equal(geo.calls.length, 2);
  assert.equal(geo.calls[0].enableHighAccuracy, false);
  assert.equal(geo.calls[1].enableHighAccuracy, true);
  assert.equal(geo.calls[1].maximumAge, 0, 'the retry never accepts a remembered fix');
  assert.ok(geo.calls[1].timeout > geo.calls[0].timeout, 'GPS gets longer to warm up');
});

test('"denied" is never retried (asking again cannot change the answer)', async () => {
  const geo = scripted([{ code: 1 }]);
  const result = await locate({}, { geolocation: geo, permissions: permissions('prompt'), fetchImpl: ipFetch(LAGOS_IP), isSecureContext: true });
  assert.equal(geo.calls.length, 1);
  assert.equal(result.problem, 'denied');
  assert.equal(result.fix.source, 'ip');
});

test('a remembered fix is fine at startup, but "find me now" never takes one', async () => {
  const env = (geo) => ({ geolocation: geo, permissions: permissions('granted'), fetchImpl: ipFetch({}, false), isSecureContext: true });
  const startup = scripted([{}]);
  await locate({}, env(startup));
  assert.ok(startup.calls[0].maximumAge > 0);
  const now = scripted([{}]);
  await locate({ fresh: true }, env(now));
  assert.equal(now.calls[0].maximumAge, 0);
});

test('side lookups (report: false) do not change what the app tells the user', async () => {
  resetLocationStatus();
  await locate({ report: false }, { geolocation: geolocation({ code: 1 }), permissions: permissions('prompt'), fetchImpl: ipFetch(LAGOS_IP), isSecureContext: true });
  assert.equal(getLocationStatus().source, 'unknown');
});

test('a coarse fix is sharpened in the background, and only a clearly better one is used', async () => {
  const coarse = { latitude: 6.5, longitude: 3.4, accuracy: 900, heading: null, speed: null, source: 'gps' };
  assert.ok(coarse.accuracy > COARSE_ACCURACY_M);
  const better = [];
  refineLocation(coarse, (f) => better.push(f), { geolocation: scripted([{ accuracy: 15, latitude: 6.52 }]) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(better.length, 1);
  assert.equal(better[0].accuracy, 15);

  const same = [];
  refineLocation(coarse, (f) => same.push(f), { geolocation: scripted([{ accuracy: 800 }]) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(same.length, 0, 'barely better is not worth moving the avatar');

  let asked = 0;
  const geo = { getCurrentPosition: () => { asked++; } };
  refineLocation({ ...coarse, accuracy: 20 }, () => {}, { geolocation: geo });
  refineLocation({ ...coarse, source: 'ip', accuracy: 25000 }, () => {}, { geolocation: geo });
  assert.equal(asked, 0, 'an already precise fix, or an IP one, is not refined');

  const cancelled = [];
  const cancel = refineLocation(coarse, (f) => cancelled.push(f), { geolocation: scripted([{ accuracy: 10 }]) });
  cancel();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cancelled.length, 0);
});

/** A geolocation + permissions pair with a watch the test can drive */
function fakeWatchEnv(initial = 'granted') {
  const state = { permission: initial, listeners: [], watching: new Set(), onFix: null, onErr: null, started: 0, nextId: 1 };
  return {
    state,
    env: {
      geolocation: {
        getCurrentPosition: () => {},
        watchPosition: (ok, fail) => { state.onFix = ok; state.onErr = fail; state.started++; const id = state.nextId++; state.watching.add(id); return id; },
        clearWatch: (id) => state.watching.delete(id)
      },
      permissions: { query: async () => ({ get state() { return state.permission; }, addEventListener: (_t, l) => state.listeners.push(l), removeEventListener: () => {} }) },
      isSecureContext: true
    },
    change(next) { state.permission = next; state.listeners.forEach((l) => l()); }
  };
}

test('the watcher reports fixes, and shrugs off a timeout without stopping', async () => {
  const w = fakeWatchEnv();
  const fixes = []; const problems = [];
  const stop = watchLocation({ onFix: (f) => fixes.push(f), onProblem: (p) => problems.push(p) }, w.env);
  w.state.onFix(position({ accuracy: 20 }));
  w.state.onErr({ code: 3 });
  assert.equal(fixes.length, 1);
  assert.deepEqual(problems, []);
  assert.equal(w.state.watching.size, 1, 'still watching after a timeout');
  stop();
  assert.equal(w.state.watching.size, 0);
});

test('when access is blocked the watcher stops and says so; granting it later starts it again by itself', async () => {
  const w = fakeWatchEnv('granted');
  const problems = [];
  watchLocation({ onFix: () => {}, onProblem: (p) => problems.push(p) }, w.env);
  await new Promise((r) => setTimeout(r, 10));
  w.state.onErr({ code: 1 });
  assert.deepEqual(problems, ['denied']);
  assert.equal(w.state.watching.size, 0);
  w.change('granted'); // the user fixed it in the address bar
  assert.equal(w.state.started, 2);
  assert.equal(w.state.watching.size, 1);
  w.change('denied'); // and took it away again
  assert.equal(w.state.watching.size, 0);
  assert.equal(problems.at(-1), 'denied');
});

test('a browser without watching support reports "unsupported" instead of throwing', () => {
  const problems = [];
  const stop = watchLocation({ onFix: () => {}, onProblem: (p) => problems.push(p) }, { geolocation: { getCurrentPosition: () => {} } });
  assert.deepEqual(problems, ['unsupported']);
  stop();
});

test('hub names say when a position is approximate; a GPS hub uses the area name when there is one', () => {
  assert.equal(hubNameFor({ source: 'ip', place: 'Lagos, Nigeria' }), 'Lagos, Nigeria (approx.)');
  assert.equal(hubNameFor({ source: 'ip' }), 'Near you (approx.)');
  assert.equal(hubNameFor({ source: 'gps' }, 'Lekki Phase 1'), 'Lekki Phase 1');
  assert.equal(hubNameFor({ source: 'gps' }, 'Local Area'), 'My location');
  resetLocationStatus();
  reportFix({ source: 'gps', accuracy: 12, latitude: 6.4, longitude: 3.4, heading: null, speed: null });
  assert.equal(getLocationStatus().source, 'gps');
  assert.equal(getLocationStatus().accuracy, 12);
});

test('the short hub label marks an approximate spot with ~, which that a plain split(",") would drop', () => {
  const { shortHubName } = mod;
  assert.equal(shortHubName('Lagos, Nigeria (approx.)'), '~Lagos');
  assert.equal(shortHubName('Victoria Island, Lagos'), 'Victoria Island');
  assert.equal(shortHubName('My location'), 'My location');
  assert.equal(shortHubName('Near you (approx.)'), '~Near you');
});
