// The accuracy strategy end to end, with a scripted browser: fast fix first, precise fix after,
// glitches ignored, the watch resilient (IP fallback, recovery, hidden tabs).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);
const svc = await import('../src/services/locationService.ts');
const { accuracyCircle } = await import('../src/utils/geoUtils.ts');
const { planHubMove } = await import('../src/utils/hubFollow.ts');
const { locate, refineLocation, watchLocation, followUser, getLocationStatus, resetLocationStatus, getBestFix } = svc;

beforeEach(() => resetLocationStatus());

const LAGOS = { latitude: 6.5244, longitude: 3.3792 };
const LONDON = { latitude: 51.5072, longitude: -0.1276 };
const pos = (place, accuracy, extra = {}) => ({ coords: { ...place, accuracy, heading: null, speed: null, ...extra } });
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const granted = { query: async () => ({ state: 'granted', addEventListener() {}, removeEventListener() {} }) };

/** getCurrentPosition answers scripted per call: { place, accuracy } or { code } */
const scriptedGeo = (answers) => {
  const calls = [];
  return {
    calls,
    getCurrentPosition: (ok, fail, opts) => {
      calls.push(opts);
      const a = answers[Math.min(calls.length - 1, answers.length - 1)];
      setTimeout(() => (a.code ? fail({ code: a.code }) : ok(pos(a.place, a.accuracy))), 1);
    }
  };
};

/** A watch the test drives, with a hideable document */
function watchEnv({ hidden = false } = {}) {
  const w = { starts: [], cleared: [], hidden, visibilityListeners: [], nextId: 1 };
  const env = {
    geolocation: {
      getCurrentPosition() {},
      watchPosition: (ok, err, opts) => {
        const id = w.nextId++;
        w.starts.push({ id, ok, err, opts });
        return id;
      },
      clearWatch: (id) => w.cleared.push(id)
    },
    permissions: granted,
    isSecureContext: true,
    document: {
      get hidden() {
        return w.hidden;
      },
      addEventListener: (_t, l) => w.visibilityListeners.push(l),
      removeEventListener: () => {}
    }
  };
  w.live = () => w.starts.at(-1);
  w.setHidden = (value) => {
    w.hidden = value;
    w.visibilityListeners.forEach((l) => l());
  };
  return { w, env };
}

// ---- 1. fast fix first, precise fix after ---------------------------------------------------------

test('a quick low-accuracy fix comes first; the precise fix follows in the background and replaces it', async () => {
  const geo = scriptedGeo([{ place: LAGOS, accuracy: 900 }, { place: { latitude: 6.525, longitude: 3.38 }, accuracy: 14 }]);
  const env = { geolocation: geo, permissions: granted, isSecureContext: true };

  const { fix } = await locate({}, env);
  assert.equal(fix.accuracy, 900, 'the avatar can appear straight away');
  assert.deepEqual([geo.calls.length, geo.calls[0].enableHighAccuracy], [1, false]);

  const better = [];
  refineLocation(fix, (f) => better.push(f), env);
  await wait();
  assert.equal(geo.calls.length, 2);
  assert.equal(geo.calls[1].enableHighAccuracy, true);
  assert.equal(geo.calls[1].maximumAge, 0, 'never a cached position');
  assert.ok(geo.calls[1].timeout >= 15000 && geo.calls[1].timeout <= 20000, 'long enough for GPS to warm up');
  assert.equal(better.length, 1);
  assert.equal(better[0].accuracy, 14);
  assert.equal(getLocationStatus().accuracy, 14, 'the status line shows the sharper number');
  assert.equal(getBestFix().accuracy, 14);
});

test('an already precise fix is not refined (saves battery)', async () => {
  const geo = scriptedGeo([{ place: LAGOS, accuracy: 12 }]);
  refineLocation({ ...LAGOS, accuracy: 12, source: 'gps', heading: null, speed: null }, () => {}, { geolocation: geo });
  await wait();
  assert.equal(geo.calls.length, 0);
});

// ---- 2. the precise attempt times out ------------------------------------------------------------

test('when the high-accuracy attempt times out (a desktop without GPS) nothing changes and no error shows', async () => {
  const geo = scriptedGeo([{ place: LAGOS, accuracy: 80 }, { code: 3 }]);
  const env = { geolocation: geo, permissions: granted, isSecureContext: true };
  const { fix } = await locate({}, env);
  const better = [];
  refineLocation(fix, (f) => better.push(f), env);
  await wait();
  assert.deepEqual(better, []);
  assert.equal(getLocationStatus().problem, null, 'no error is shown while a fix is in use');
  assert.equal(getLocationStatus().accuracy, 80);
  assert.equal(getBestFix().accuracy, 80);
});

// ---- 3 + 4. worse fixes and impossible jumps ------------------------------------------------------

test('the watch ignores a much worse fix and an impossible jump, and takes a sensible one', async () => {
  const { w, env } = watchEnv();
  const seen = [];
  watchLocation({ onFix: (f) => seen.push(f) }, env);
  const feed = (place, acc) => w.live().ok(pos(place, acc));
  feed(LAGOS, 10);
  feed({ latitude: 6.5245, longitude: 3.3793 }, 900); // coarser than 500 m after a good fix
  feed({ latitude: 6.5245, longitude: 3.3793 }, 80); // 8x worse
  feed(LONDON, 10); // a teleport
  feed({ latitude: 6.5246, longitude: 3.3794 }, 14); // ordinary movement
  assert.deepEqual(seen.map((f) => f.accuracy), [10, 14]);
  assert.equal(getBestFix().accuracy, 14);
});

test('the watch asks for high accuracy, and falls back to low accuracy on a machine without GPS', async () => {
  const { w, env } = watchEnv();
  watchLocation({ onFix: () => {} }, env);
  assert.equal(w.live().opts.enableHighAccuracy, true);
  w.live().err({ code: 2 }); // high accuracy unavailable before any fix: no GPS here
  assert.equal(w.starts.length, 2);
  assert.equal(w.live().opts.enableHighAccuracy, false);
  assert.deepEqual(w.cleared, [1], 'the failed watch is released');
});

// ---- IP fallback and recovery ----------------------------------------------------------------------

const ipFetch = (place) => async () => ({
  ok: true,
  json: async () => ({ ...place, city: 'Lagos', country: 'Nigeria', accuracyKm: 25 })
});

test('when the watch gives up the app falls back to the IP position, and clears it again when the watch recovers', async () => {
  const { w, env } = watchEnv();
  env.fetchImpl = ipFetch(LAGOS);
  const announced = [];
  const moved = [];
  followUser({ onMove: (f) => moved.push(f), onAnnounce: (f) => announced.push(f) }, env);

  w.live().err({ code: 2 }); // high -> low mode
  w.live().err({ code: 2 }); // low mode fails too: the browser has nothing for us
  await wait(20);
  assert.equal(announced.length, 1);
  assert.equal(announced[0].source, 'ip');
  assert.equal(getLocationStatus().source, 'ip');
  assert.equal(getLocationStatus().problem, 'unavailable');

  w.live().ok(pos(LAGOS, 25)); // the browser works again
  assert.equal(moved.length, 1);
  assert.equal(announced.length, 2, 'recovery is announced so the map can leave "approximate"');
  assert.equal(announced[1].source, 'gps');
  assert.deepEqual([getLocationStatus().source, getLocationStatus().problem, getLocationStatus().accuracy], ['gps', null, 25]);

  w.live().err({ code: 2 }); // a second outage is reported again...
  await wait(20);
  assert.equal(getLocationStatus().source, 'gps', '...but a current GPS fix is never replaced by an IP guess');
});

test('an outage is reported once, not on every error', async () => {
  const { w, env } = watchEnv();
  const problems = [];
  watchLocation({ onFix: () => {}, onProblem: (p) => problems.push(p) }, env);
  w.live().err({ code: 2 });
  for (let i = 0; i < 4; i++) w.live().err({ code: 2 });
  assert.deepEqual(problems, ['unavailable']);
});

test('a watch timeout is ignored while a recent fix exists', async () => {
  const { w, env } = watchEnv();
  const problems = [];
  watchLocation({ onFix: () => {}, onProblem: (p) => problems.push(p) }, env);
  w.live().ok(pos(LAGOS, 20));
  w.live().err({ code: 3 });
  assert.deepEqual(problems, []);
});

// ---- battery: a hidden tab does not keep GPS on ---------------------------------------------------

test('the watch stops when the tab is hidden and restarts when the user comes back', async () => {
  const { w, env } = watchEnv();
  const stop = watchLocation({ onFix: () => {} }, env);
  assert.equal(w.starts.length, 1);
  w.setHidden(true);
  assert.deepEqual(w.cleared, [1]);
  w.setHidden(false);
  assert.equal(w.starts.length, 2);
  stop();
  assert.deepEqual(w.cleared, [1, 2]);
});

test('a watch started in a hidden tab waits until it is visible', async () => {
  const { w, env } = watchEnv({ hidden: true });
  watchLocation({ onFix: () => {} }, env);
  assert.equal(w.starts.length, 0);
  w.setHidden(false);
  assert.equal(w.starts.length, 1);
});

// ---- what the user is told ------------------------------------------------------------------------

test('the status line names the source and how good it is', () => {
  const { describeSource, formatAccuracy } = svc;
  assert.equal(describeSource({ source: 'gps', accuracy: 12.4 }), 'GPS ±12 m');
  assert.equal(describeSource({ source: 'gps', accuracy: 2400 }), 'GPS ±2.4 km');
  assert.match(describeSource({ source: 'ip', accuracy: 25000 }), /Approximate, about 25 km/);
  assert.match(describeSource({ source: 'hub', accuracy: null }), /City hub/);
  assert.equal(describeSource({ source: 'unknown', accuracy: null }), null);
  assert.equal(formatAccuracy(0.2), '±1 m');
});

test('phones with a coarse GPS fix are told how to turn precise location on; desktops are not nagged', () => {
  const { accuracyAdvice, detectPlatform } = svc;
  const IOS = detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');
  const ANDROID = detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36');
  const IPAD = detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5);
  const DESKTOP = detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
  assert.deepEqual([IOS, ANDROID, IPAD, DESKTOP], ['ios', 'android', 'ios', 'desktop']);

  assert.equal(accuracyAdvice({ source: 'gps', accuracy: 60 }, 'ios'), null, 'under ~100 m is fine');
  assert.equal(accuracyAdvice({ source: 'gps', accuracy: 4000 }, 'desktop'), null);
  assert.equal(accuracyAdvice({ source: 'ip', accuracy: 25000 }, 'android'), null, 'IP has its own notice');

  const ios = accuracyAdvice({ source: 'gps', accuracy: 4200 }, 'ios');
  assert.equal(ios.key, 'precise-off');
  assert.match(ios.hint, /Precise Location/);
  assert.match(ios.hint, /Location Services/);
  const android = accuracyAdvice({ source: 'gps', accuracy: 3000 }, 'android');
  assert.equal(android.key, 'precise-off');
  assert.match(android.hint, /Use precise location/);
  const mid = accuracyAdvice({ source: 'gps', accuracy: 350 }, 'android');
  assert.equal(mid.key, 'low');
  assert.match(mid.title, /±350 m/);
});

// ---- applying the fix to the app ------------------------------------------------------------------

test('a coarse GPS fix that still contains the hub does not move it; a trusted one does, wherever it is', () => {
  const hub = { latitude: 6.4281, longitude: 3.4219 };
  const here = { latitude: 6.44, longitude: 3.43 }; // ~1.6 km from the hub
  assert.equal(planHubMove(hub, { ...here, source: 'gps', accuracy: 4000 }, false, 'auto').move, false, 'the hub is inside the error circle');
  assert.equal(planHubMove(hub, { ...here, source: 'gps', accuracy: 40 }, false, 'auto').move, true);
  assert.equal(planHubMove(hub, { ...here, source: 'gps', accuracy: 600 }, false, 'auto').move, true, 'the hub is outside a 600 m circle');
  assert.equal(planHubMove(hub, { ...LONDON, source: 'gps', accuracy: 30 }, false, 'auto').move, true);
});

test('the accuracy circle is a closed ring of the right radius', () => {
  const fc = accuracyCircle(3.4219, 6.4281, 120);
  const ring = fc.features[0].geometry.coordinates[0];
  assert.equal(ring.length, 65);
  assert.deepEqual(ring[0], ring.at(-1));
  const toRad = (d) => (d * Math.PI) / 180;
  const meters = (a, b) => {
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
  };
  for (const point of [ring[0], ring[16], ring[32], ring[48]]) {
    assert.ok(Math.abs(meters([3.4219, 6.4281], point) - 120) < 1.5, 'every point is 120 m from the centre');
  }
});

test('callers refining at the same moment share one high-accuracy request', async () => {
  const geo = scriptedGeo([{ place: LAGOS, accuracy: 12 }]);
  const coarse = { ...LAGOS, accuracy: 900, source: 'gps', heading: null, speed: null };
  const results = [];
  refineLocation(coarse, (f) => results.push(['a', f.accuracy]), { geolocation: geo });
  refineLocation(coarse, (f) => results.push(['b', f.accuracy]), { geolocation: geo });
  await wait();
  assert.equal(geo.calls.length, 1, 'GPS is the expensive part: asked once');
  assert.deepEqual(results.map((r) => r[0]).sort(), ['a', 'b'], 'both callers still hear the answer');
});
