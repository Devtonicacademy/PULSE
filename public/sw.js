const CACHE_PREFIX = 'pulse-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v3`;
const RUNTIME_CACHE_MAX_ENTRIES = 400;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// Hosts whose images/tiles/glyphs are worth keeping for offline use (OpenFreeMap serves the
// vector tiles and fonts for the map; its tile URLs are versioned, so cached copies stay valid).
const RUNTIME_CACHE_HOSTS = ['tiles.openfreemap.org', 'images.unsplash.com'];

// Install: Cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PULSE ServiceWorker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up our outdated caches (leave other libraries' caches alone)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== RUNTIME_CACHE) {
            console.log('[PULSE ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

async function putInCache(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) {
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
  }
}

// Page loads: network first so a new deploy shows up on the next visit; cached shell offline
function handleNavigation(event) {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          event.waitUntil(putInCache(CACHE_NAME, '/index.html', response.clone()));
        }
        return response;
      })
      .catch(async () => (await caches.match('/index.html')) || Response.error())
  );
}

// Same-origin assets: serve from cache, refresh in the background (hashed bundles never change)
function handleAppAsset(event) {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response.ok) {
          event.waitUntil(putInCache(CACHE_NAME, event.request, response.clone()));
        }
        return response;
      });

      if (cachedResponse) {
        event.waitUntil(networkFetch.catch(() => {}));
        return cachedResponse;
      }
      return networkFetch;
    })
  );
}

// Tiles & photos: network first, keep a bounded offline copy of successful responses only
function handleRuntimeAsset(event) {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          event.waitUntil(putInCache(RUNTIME_CACHE, event.request, response.clone(), RUNTIME_CACHE_MAX_ENTRIES));
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || Response.error())
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // The photo API is never cached (uploaded photos under /photos/ are, as same-origin assets)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    handleNavigation(event);
  } else if (url.origin === self.location.origin) {
    handleAppAsset(event);
  } else if (RUNTIME_CACHE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    handleRuntimeAsset(event);
  }
  // Everything else (Firebase, ...) goes straight to the network
});

// Clicking an alert notification focuses the app (or opens it) and tells it which moment to show
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const momentId = event.notification.data && event.notification.data.momentId;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client);
      if (open) {
        open.postMessage({ type: 'pulse-open-moment', momentId });
        return open.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
