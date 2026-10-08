import express from 'express';
import { clientIp, isPrivateAddress } from './clientIp.js';

export { isPrivateAddress };

const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 500;
/** City-level accuracy: an IP address says roughly which town, never which street */
const IP_ACCURACY_KM = 25;

const asNumber = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));

const PROVIDERS = [
  {
    name: 'ipwho.is',
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,latitude,longitude,city,region,country`,
    parse: (body) =>
      body && body.success !== false
        ? { latitude: asNumber(body.latitude), longitude: asNumber(body.longitude), city: body.city, region: body.region, country: body.country }
        : null
  },
  {
    name: 'ipapi.co',
    url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (body) =>
      body && !body.error
        ? { latitude: asNumber(body.latitude), longitude: asNumber(body.longitude), city: body.city, region: body.region, country: body.country_name }
        : null
  }
];

const validPlace = (place) =>
  place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180;

/**
 * GET /api/geo/ip: an approximate position for the caller, from their IP address. This is the
 * backup for when the browser's own location is blocked or unavailable. The lookup runs on the
 * server (the browser never contacts the lookup service), results are cached for an hour per
 * address, and a failure is a 404 so the client can fall back to the active hub.
 */
export function createGeoRouter({ fetchImpl = fetch, now = Date.now, timeoutMs = LOOKUP_TIMEOUT_MS } = {}) {
  const cache = new Map(); // ip -> { at, place }
  const router = express.Router();

  async function lookup(ip) {
    for (const provider of PROVIDERS) {
      try {
        const res = await fetchImpl(provider.url(ip), { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
        if (!res.ok) continue;
        const place = provider.parse(await res.json());
        if (validPlace(place)) return place;
      } catch {
        // try the next provider
      }
    }
    return null;
  }

  router.get('/api/geo/ip', async (req, res) => {
    res.set('Cache-Control', 'private, max-age=600');
    const ip = clientIp(req);
    if (isPrivateAddress(ip)) {
      res.status(404).json({ error: 'This address cannot be located.' });
      return;
    }
    const hit = cache.get(ip);
    let place = hit && now() - hit.at < CACHE_MS ? hit.place : undefined;
    if (place === undefined) {
      place = await lookup(ip);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(ip, { at: now(), place });
    }
    if (!place) {
      res.status(404).json({ error: 'Could not work out a location from this address.' });
      return;
    }
    res.json({
      latitude: place.latitude,
      longitude: place.longitude,
      city: place.city || null,
      region: place.region || null,
      country: place.country || null,
      accuracyKm: IP_ACCURACY_KM,
      source: 'ip'
    });
  });

  return router;
}

