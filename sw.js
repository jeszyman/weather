// GO/NO-GO service worker: cache the app shell for offline load; never cache live weather APIs.
const CACHE = 'gonogo-v1';
const SHELL = [
  './',
  './index.html',
  './uv-core.js',
  './manifest.webmanifest',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // App shell = same-origin GET: cache-first, fall back to network.
  // Everything else (Open-Meteo, NWS, IEM, OSM tiles) = network only, never cached.
  if (e.request.method === 'GET' && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        // opportunistically cache newly-fetched same-origin assets
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  }
  // cross-origin (APIs/tiles): let the network handle it, no SW involvement
});
