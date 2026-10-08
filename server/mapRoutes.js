import express from 'express';
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
      res.set('Cache-Control', 'public, max-age=3600').json(tile);
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
