// Service worker v3-4: navigation fallback and cache bump
const CACHE_NAME = 'sevenseg-date-v3-4';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE_NAME ? null : caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(cached => cached || fetch(req))
    );
    return;
  }
  const url = new URL(req.url);
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
