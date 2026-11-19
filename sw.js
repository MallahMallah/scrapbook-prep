// Bump this every time you deploy a change. That's what tells phones a new version exists.
const VERSION = 'v1.1.1';
const CACHE = `scrapbook-prep-${VERSION}`;

const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's own copy, so we never save an outdated page.
  event.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Serve the app from the cache so it opens instantly and works offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(event.request))
  );
});
