import { cacheDecision } from './tilePriority';

/**
 * Persistent tile cache (the browser's Cache API), shared by every tile worker and kept between
 * visits. Pre-built tiles are static files, server-built ones can improve over time, so they get
 * different lifetimes. Stale tiles still render instantly while a fresh copy downloads.
 */
const CACHE_NAME = 'pulse-map-tiles-v1';
const STAMP_HEADER = 'x-pulse-cached-at';
const MAX_ENTRIES = 500;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LIFETIMES = {
  prebuilt: { fresh: 7 * DAY, stale: 30 * DAY },
  built: { fresh: HOUR, stale: 7 * DAY }
};

const kindOf = (url: string) => (url.startsWith('/map-tiles/') ? 'prebuilt' : 'built');

let cachePromise: Promise<Cache | null> | null = null;
const openCache = () => {
  cachePromise ??=
    typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(CACHE_NAME).catch(() => null);
  return cachePromise;
};

async function store(cache: Cache, url: string, text: string) {
  await cache.put(
    url,
    new Response(text, { headers: { 'content-type': 'application/json', [STAMP_HEADER]: String(Date.now()) } })
  );
  // Keep the cache bounded: drop the oldest entries (insertion order) once it grows past the cap
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(request);
}

async function download(url: string, cache: Cache | null): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (cache) store(cache, url, text).catch(() => undefined);
  return text;
}

/**
 * The tile's JSON text. Fresh cached copy: no network at all. Stale copy: returned immediately,
 * refreshed behind the scenes. Nothing usable cached (or it expired): downloaded, and a stale
 * copy still beats a failed download.
 */
export async function loadTileText(url: string): Promise<string> {
  const cache = await openCache();
  const hit = cache ? await cache.match(url).catch(() => undefined) : undefined;
  if (!hit) return download(url, cache);

  const cachedAt = Number(hit.headers.get(STAMP_HEADER)) || 0;
  const { fresh, stale } = LIFETIMES[kindOf(url)];
  const decision = cacheDecision(Date.now() - cachedAt, fresh, stale);
  if (decision === 'fresh') return hit.text();
  if (decision === 'stale') {
    download(url, cache).catch(() => undefined);
    return hit.text();
  }
  try {
    return await download(url, cache);
  } catch (err) {
    if (hit) return hit.text();
    throw err;
  }
}
