const CACHE_NAME = 'time-tracker-v6';
const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/ui.js',
  '/style.css',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map(url => cache.add(url).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network first, cache fallback. Map tiles are never cached.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.url.includes('tile.openstreetmap.org')) return;

  const cacheable = request.url.startsWith(self.location.origin) || request.url.includes('cdn.jsdelivr.net');

  event.respondWith(
    fetch(request).then((response) => {
      if (cacheable && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() =>
      caches.match(request).then(cached =>
        cached || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error())
      )
    )
  );
});
