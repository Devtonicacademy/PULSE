import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/app.js';
import { createFsStorage } from '../server/photoStorage.js';
import {
  cellsInRadius,
  createCoverageService,
  originFor,
  parseOriginId
} from '../server/osm/coverage.js';
import { createProjection, VI_ORIGIN } from '../server/osm/tileBuilder.js';

const LAGOS = { lat: 6.5244, lng: 3.3792 };
const LONDON = { lat: 51.5072, lng: -0.1276 };

/** A pretend Overpass: one small house and one street in the middle of whatever cell is asked for */
function fakeOverpass() {
  const calls = [];
  return {
    calls,
    async fetchBounds(bounds) {
      calls.push(bounds);
      const [s, w, n, e] = bounds;
      const lat = (s + n) / 2;
      const lng = (w + e) / 2;
      const d = 0.0001;
      const ring = [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]];
      return {
        elements: [
          {
            type: 'way', id: calls.length, nodes: [1, 2, 3, 4, 1],
            tags: { building: 'house' },
            geometry: ring.map(([lon, la]) => ({ lat: la, lon }))
          },
          {
            type: 'way', id: 1000 + calls.length, nodes: [10, 11],
            tags: { highway: 'residential' },
            geometry: [{ lat, lon: w }, { lat, lon: e }]
          }
        ]
      };
    }
  };
}

async function setup(options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pulse-coverage-'));
  const storage = createFsStorage(path.join(dir, 'photos'));
  const overpass = fakeOverpass();
  const coverage = createCoverageService({ storage, overpass, ...options });
  return { dir, storage, overpass, coverage, cleanup: async () => {
      await new Promise((r) => setTimeout(r, 150)); // let any background download finish writing
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } };
}

async function until(fn, ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('condition not met in time');
}

test('Lagos users share the Victoria Island origin; elsewhere snaps to a grid', () => {
  assert.equal(originFor(LAGOS.lat, LAGOS.lng).id, 'vi');
  const london = originFor(LONDON.lat, LONDON.lng);
  assert.equal(london.id, '51.50_-0.25');
  assert.deepEqual(parseOriginId(london.id), london);
  assert.equal(parseOriginId('vi').latitude, VI_ORIGIN.latitude);
  for (const bad of ['', '../etc', '51.51_-0.25', '99.00_0.00', 'vi/../x', '1_2']) assert.equal(parseOriginId(bad), null, bad);
});

test('a 40 km radius is about 1,250 two-kilometer cells, nearest first', () => {
  const origin = originFor(LAGOS.lat, LAGOS.lng);
  const cells = cellsInRadius(origin, LAGOS.lat, LAGOS.lng, 40);
  const expected = (Math.PI * 40 * 40) / 4;
  assert.ok(Math.abs(cells.length - expected) / expected < 0.08, `got ${cells.length}, expected ~${Math.round(expected)}`);
  for (let i = 1; i < cells.length; i++) assert.ok(cells[i].centerDist >= cells[i - 1].centerDist);
  // The exact coordinates are inside the first cell
  const { lngLatToMeters } = createProjection(origin);
  const [x, y] = lngLatToMeters(LAGOS.lng, LAGOS.lat);
  assert.equal(cells[0].cx, Math.floor(x / 2000));
  assert.equal(cells[0].cy, Math.floor(y / 2000));
});

test('tiles are built from downloaded data, then served from cache without downloading again', async () => {
  const { coverage, overpass, storage, cleanup } = await setup();
  try {
    const origin = originFor(LAGOS.lat, LAGOS.lng);
    const { lngLatToMeters } = createProjection(origin);
    const [x, y] = lngLatToMeters(LAGOS.lng, LAGOS.lat);
    const tx = Math.floor(x / 500);
    const ty = Math.floor(y / 500);

    const tile = await coverage.getTile(origin, tx, ty);
    assert.equal(tile.tx, tx);
    assert.equal(tile.origin[0], tx * 500);
    assert.equal(overpass.calls.length, 1);

    // The whole 4 x 4 block came with it: the neighbouring tile costs nothing
    const neighbour = await coverage.getTile(origin, tx, ty + (ty % 4 === 3 ? -1 : 1));
    assert.ok(neighbour);
    assert.equal(overpass.calls.length, 1);

    // A new process (empty memory) reads the cell from the bucket instead of Overpass
    const restarted = createCoverageService({ storage, overpass });
    assert.ok(await restarted.getTile(origin, tx, ty));
    assert.equal(overpass.calls.length, 1);
  } finally {
    await cleanup();
  }
});

test('a corrupt cached cell is rebuilt instead of crashing', async () => {
  const { coverage, overpass, storage, cleanup } = await setup();
  try {
    const origin = originFor(LAGOS.lat, LAGOS.lng);
    await storage.putMapData('osm/vi/0_0.json.gz', Buffer.from('not gzip at all'));
    assert.ok(await coverage.getTile(origin, 0, 0));
    assert.equal(overpass.calls.length, 1);
    // A well-formed object that is not a bundle is a miss too
    const { gzipSync } = await import('node:zlib');
    await storage.putMapData('osm/vi/5_5.json.gz', gzipSync(JSON.stringify({ hello: 'world' })));
    assert.ok(await coverage.getTile(origin, 20, 20));
    assert.equal(overpass.calls.length, 2);
  } finally {
    await cleanup();
  }
});

test('a failed download is reported, then not retried until the back-off passes', async () => {
  let time = 1_000_000;
  const { coverage, overpass, cleanup } = await setup({ now: () => time, failureBackoffMs: 60_000 });
  try {
    overpass.fetchBounds = async () => {
      throw new Error('Overpass down');
    };
    const origin = originFor(LAGOS.lat, LAGOS.lng);
    await assert.rejects(coverage.getTile(origin, 0, 0), /Overpass down/);
    await assert.rejects(coverage.getTile(origin, 0, 0), /unavailable/);
    time += 61_000;
    await assert.rejects(coverage.getTile(origin, 0, 0), /Overpass down/);
  } finally {
    await cleanup();
  }
});

test('coverage downloads the radius in the background and reports progress', async () => {
  const { coverage, overpass, cleanup } = await setup();
  try {
    const job = coverage.startCoverage(LAGOS.lat, LAGOS.lng, 3);
    const expected = cellsInRadius(originFor(LAGOS.lat, LAGOS.lng), LAGOS.lat, LAGOS.lng, 3).length;
    assert.equal(coverage.jobStatus(job).total, expected);
    await until(() => coverage.jobStatus(job).state === 'done');
    const status = coverage.jobStatus(job);
    assert.equal(status.percent, 100);
    assert.equal(status.failed, 0);
    assert.equal(overpass.calls.length, expected);
    // Asking again reuses the job; nothing is downloaded twice
    assert.equal(coverage.startCoverage(LAGOS.lat, LAGOS.lng, 3), job);
    assert.equal(overpass.calls.length, expected);
  } finally {
    await cleanup();
  }
});

test('background coverage pauses at the daily cap while map viewers are still served', async () => {
  const { coverage, overpass, cleanup } = await setup({ maxDownloadsPerDay: 2 });
  try {
    const job = coverage.startCoverage(LAGOS.lat, LAGOS.lng, 5);
    await until(() => overpass.calls.length === 2);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(overpass.calls.length, 2, 'background work stopped at the cap');
    assert.equal(coverage.jobStatus(job).state, 'paused');
    // A tile far from the center is still built for someone looking at it (cap + 20%)
    const origin = originFor(LAGOS.lat, LAGOS.lng);
    await coverage.getTile(origin, 400, 400);
    assert.equal(overpass.calls.length, 3);
  } finally {
    await cleanup();
  }
});

test('a tile somebody is waiting for is never queued behind background downloads', async () => {
  const { coverage, overpass, cleanup } = await setup();
  try {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const original = overpass.fetchBounds.bind(overpass);
    overpass.fetchBounds = async (bounds, label, options = {}) => {
      if (options.background) await gate; // the background lane is stuck on a slow mirror
      return original(bounds);
    };
    const job = coverage.startCoverage(LAGOS.lat, LAGOS.lng, 3);
    await new Promise((r) => setTimeout(r, 30));
    const origin = originFor(LAGOS.lat, LAGOS.lng);
    const tile = await Promise.race([
      coverage.getTile(origin, 400, 400),
      new Promise((_, reject) => setTimeout(() => reject(new Error('blocked behind the background lane')), 2000))
    ]);
    assert.ok(tile);
    release();
    await until(() => coverage.jobStatus(job).state === 'done');
  } finally {
    await cleanup();
  }
});

test('HTTP routes: tiles, coverage start / status, validation and rate limit', async () => {
  const { dir, coverage, cleanup } = await setup();
  const distDir = path.join(dir, 'dist');
  await mkdir(distDir, { recursive: true });
  const app = createApp({
    storage: createFsStorage(path.join(dir, 'photos')),
    verifyToken: async () => ({ uid: 'x' }),
    distDir,
    coverage,
    mapOptions: { hourlyLimit: 2 }
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/map/tiles/nope/0_0.json`)).status, 404);
    assert.equal((await fetch(`${base}/api/map/tiles/vi/not-a-tile.json`)).status, 404);
    const tile = await fetch(`${base}/api/map/tiles/vi/0_0.json`);
    assert.equal(tile.status, 200);
    assert.match(tile.headers.get('cache-control'), /max-age/);
    const body = await tile.json();
    assert.equal(body.tx, 0);
    assert.ok(Array.isArray(body.buildings));
    // Tiles travel compressed and revalidate cheaply
    assert.match(tile.headers.get('cache-control'), /stale-while-revalidate/);
    // fetch hides content-encoding once it has decoded the body and adds no-cache to conditional
    // requests, so check the wire behaviour over plain http
    const wire = (headers) =>
      new Promise((resolve, reject) => {
        http.get(`${base}/api/map/tiles/vi/0_0.json`, { headers: { 'accept-encoding': 'gzip', ...headers } }, (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
        }).on('error', reject);
      });
    const wired = await wire({});
    assert.equal(wired.headers['content-encoding'], 'gzip');
    assert.match(wired.headers['cache-control'], /stale-while-revalidate/);
    assert.match(wired.headers.vary, /Accept-Encoding/);
    assert.ok(wired.headers.etag);
    assert.equal((await wire({ 'if-none-match': wired.headers.etag })).status, 304);

    const post = (payload) =>
      fetch(`${base}/api/map/coverage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await post({ latitude: 'x', longitude: 3 })).status, 400);
    assert.equal((await fetch(`${base}/api/map/coverage?lat=6.5&lng=3.4`)).status, 404);

    const started = await post({ latitude: 6.5, longitude: 3.4, radiusKm: 2 });
    assert.equal(started.status, 202);
    const first = await started.json();
    assert.equal(first.origin.id, 'vi');
    assert.ok(first.total > 0);
    await until(async () => (await (await fetch(`${base}/api/map/coverage?lat=6.5&lng=3.4&radius=2`)).json()).state === 'done');

    // Re-asking for the same place is free; the second and third new places hit the limit of 2
    assert.equal((await post({ latitude: 6.5, longitude: 3.4, radiusKm: 2 })).status, 202);
    assert.equal((await post({ latitude: 6.6, longitude: 3.4, radiusKm: 2 })).status, 202);
    assert.equal((await post({ latitude: 6.7, longitude: 3.4, radiusKm: 2 })).status, 429);
  } finally {
    server.close();
    await cleanup();
  }
});
