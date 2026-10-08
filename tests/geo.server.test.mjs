import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createGeoRouter, isPrivateAddress } from '../server/geoRoutes.js';

/** An app that reports the caller as `ip`, with a fake lookup service behind the geo route */
async function serve(ip, fetchImpl, options = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: ip });
    next();
  });
  app.use(createGeoRouter({ fetchImpl, ...options }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { base: `http://localhost:${server.address().port}`, close: () => server.close() };
}

const ok = (body) => async () => ({ ok: true, json: async () => body });

test('private and loopback addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.1.1', '::1', 'fe80::1', 'not-an-ip', '']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['102.89.23.4', '8.8.8.8', '2a00:1450:4009::1']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('a public address is placed by the lookup service and cached', async () => {
  let calls = 0;
  const { base, close } = await serve('102.89.23.4', async (url) => {
    calls++;
    assert.match(String(url), /102\.89\.23\.4/);
    return { ok: true, json: async () => ({ success: true, latitude: 6.45, longitude: 3.4, city: 'Lagos', region: 'Lagos', country: 'Nigeria' }) };
  });
  try {
    const res = await fetch(`${base}/api/geo/ip`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual([body.latitude, body.longitude, body.city, body.source], [6.45, 3.4, 'Lagos', 'ip']);
    assert.ok(body.accuracyKm >= 10, 'IP positions are never presented as precise');
    await fetch(`${base}/api/geo/ip`);
    assert.equal(calls, 1, 'second answer comes from the cache');
  } finally {
    close();
  }
});

test('local addresses are not sent to any lookup service', async () => {
  let calls = 0;
  const { base, close } = await serve('127.0.0.1', async () => {
    calls++;
    return { ok: true, json: async () => ({}) };
  });
  try {
    assert.equal((await fetch(`${base}/api/geo/ip`)).status, 404);
    assert.equal(calls, 0);
  } finally {
    close();
  }
});

test('falls back to the second service, then gives up cleanly', async () => {
  const seen = [];
  const { base, close } = await serve('102.89.23.5', async (url) => {
    seen.push(String(url));
    if (String(url).includes('ipwho.is')) throw new Error('down');
    return { ok: true, json: async () => ({ latitude: 51.5, longitude: -0.12, city: 'London', country_name: 'United Kingdom' }) };
  });
  try {
    const body = await (await fetch(`${base}/api/geo/ip`)).json();
    assert.equal(body.city, 'London');
    assert.equal(body.country, 'United Kingdom');
    assert.equal(seen.length, 2);
  } finally {
    close();
  }

  const dead = await serve('102.89.23.6', async () => {
    throw new Error('down');
  });
  try {
    assert.equal((await fetch(`${dead.base}/api/geo/ip`)).status, 404);
  } finally {
    dead.close();
  }
});

test('nonsense coordinates from a service are rejected', async () => {
  const { base, close } = await serve('102.89.23.7', ok({ success: true, latitude: 999, longitude: 3 }));
  try {
    assert.equal((await fetch(`${base}/api/geo/ip`)).status, 404);
  } finally {
    close();
  }
});

// ---- Behind a proxy (Railway): the visitor's address is in headers, not req.ip -------------------

import { clientIp } from '../server/clientIp.js';

const req = (headers = {}, ip = '') => ({ headers, ip });

test('clientIp prefers X-Real-IP (what Railway documents), then the first public X-Forwarded-For entry', () => {
  // req.ip is the proxy's public edge address: the exact mistake that located visitors in London
  assert.equal(clientIp(req({ 'x-real-ip': '105.127.11.4' }, '212.50.1.9')), '105.127.11.4');
  assert.equal(clientIp(req({ 'x-forwarded-for': '105.127.11.4, 100.64.0.2, 212.50.1.9' }, '212.50.1.9')), '105.127.11.4');
  assert.equal(clientIp(req({ 'x-forwarded-for': '10.0.0.5, 105.127.11.4' }, '100.64.0.2')), '105.127.11.4', 'skips private hops');
  assert.equal(clientIp(req({ 'x-real-ip': '::ffff:105.127.11.4' })), '105.127.11.4');
  assert.equal(clientIp(req({ 'x-real-ip': 'not-an-ip' }, '8.8.8.8')), '8.8.8.8', 'garbage headers fall back to req.ip');
  assert.equal(clientIp(req({}, '127.0.0.1')), '127.0.0.1');
});

test('the geo route looks up the visitor from X-Real-IP, not the proxy hop', async () => {
  const looked = [];
  const app = express();
  app.set('trust proxy', 1);
  app.use((r, _res, next) => {
    Object.defineProperty(r, 'ip', { value: '212.50.1.9' }); // the proxy's own address
    next();
  });
  app.use(createGeoRouter({ fetchImpl: async (url) => {
    looked.push(String(url));
    return { ok: true, json: async () => ({ success: true, latitude: 6.45, longitude: 3.39, city: 'Lagos', country: 'Nigeria' }) };
  } }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/geo/ip`, { headers: { 'x-real-ip': '105.127.11.4' } });
    assert.equal((await res.json()).city, 'Lagos');
    assert.match(looked[0], /105\.127\.11\.4/);
    assert.doesNotMatch(looked[0], /212\.50\.1\.9/);
  } finally {
    server.close();
  }
});
