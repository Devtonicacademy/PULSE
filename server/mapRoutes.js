import express from 'express';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
/** Compressed tiles kept in memory so a busy tile is not re-compressed for every viewer */
const COMPRESSED_CACHE_LIMIT = 300;
/** Fresh for an hour, then served stale for a day while the browser re-checks in the background */
const TILE_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
import { MAX_RADIUS_KM, originFor, parseOriginId } from './osm/coverage.js';

const TILE_WAIT_MS = 45_000;
const COVERAGE_HOURLY_LIMIT = 10;

const validCoordinates = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 70 && Math.abs(lng) <= 180;

/**
 * Map data routes:
 *   GET  /api/map/tiles/:origin/:tx_:ty.json   one 3D map tile, built from OpenStreetMap on demand
 *   POST /api/map/coverage                     start downloading everything within 40 km of a point
 *   GET  /api/map/coverage?lat=&lng=           progress of that download
 */
export function createMapRouter({ coverage, now = Date.now, tileWaitMs = TILE_WAIT_MS, hourlyLimit = COVERAGE_HOURLY_LIMIT }) {
  const router = express.Router();
  const starts = new Map(); // ip -> timestamps of coverage starts in the last hour
  const compressed = new Map(); // tile id -> gzipped JSON, newest last

  async function tileBody(id, tile) {
    let body = compressed.get(id);
    if (!body) {
      body = await gzipAsync(Buffer.from(JSON.stringify(tile)));
      if (compressed.size >= COMPRESSED_CACHE_LIMIT) compressed.delete(compressed.keys().next().value);
      compressed.set(id, body);
    }
    return body;
  }

  router.get('/api/map/tiles/:origin/:file', async (req, res) => {
    const origin = parseOriginId(req.params.origin);
    const match = /^(-?\d{1,5})_(-?\d{1,5})\.json$/.exec(req.params.file);
    if (!origin || !match) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    let timer;
    try {
      const tile = await Promise.race([
        coverage.getTile(origin, Number(match[1]), Number(match[2])),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('Still building this area'), { retryable: true })), tileWaitMs);
        })
      ]);
      if (!tile) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.set({ 'Cache-Control': TILE_CACHE_CONTROL, Vary: 'Accept-Encoding' });
      if (/gzip/.test(req.headers['accept-encoding'] ?? '')) {
        const body = await tileBody(`${origin.id ?? req.params.origin}/${req.params.file}`, tile);
        res.set('Content-Encoding', 'gzip').type('json').send(body); // Express adds the ETag, so revalidation is a cheap 304
      } else {
        res.json(tile);
      }
    } catch (err) {
      // The download keeps going in the background; the client asks again shortly
      res.set('Retry-After', '15').status(503).json({ error: err.retryable ? 'Still building this area' : 'Map data is unavailable right now' });
    } finally {
      clearTimeout(timer);
    }
  });

  router.post('/api/map/coverage', express.json({ limit: '1kb' }), (req, res) => {
    const { latitude, longitude, radiusKm } = req.body ?? {};
    if (!validCoordinates(latitude, longitude)) {
      res.status(400).json({ error: 'Send latitude and longitude.' });
      return;
    }
    const cutoff = now() - 60 * 60 * 1000;
    const recent = (starts.get(req.ip) ?? []).filter((t) => t > cutoff);
    const existing = coverage.findJob(latitude, longitude, Number(radiusKm) || MAX_RADIUS_KM);
    if (!existing) {
      if (recent.length >= hourlyLimit) {
        res.status(429).json({ error: 'Too many map coverage requests. Try again later.' });
        return;
      }
      recent.push(now());
      starts.set(req.ip, recent);
    }
    const job = coverage.startCoverage(latitude, longitude, Number(radiusKm) || MAX_RADIUS_KM);
    const origin = originFor(latitude, longitude);
    res.status(202).json({ origin: { id: origin.id, latitude: origin.latitude, longitude: origin.longitude }, ...coverage.jobStatus(job) });
  });

  router.get('/api/map/coverage', (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    if (!validCoordinates(latitude, longitude)) {
      res.status(400).json({ error: 'Send lat and lng.' });
      return;
    }
    const job = coverage.findJob(latitude, longitude, Number(req.query.radius) || MAX_RADIUS_KM);
    if (!job) {
      res.status(404).json({ error: 'No coverage started for this location.' });
      return;
    }
    res.json(coverage.jobStatus(job));
  });

  return router;
}
