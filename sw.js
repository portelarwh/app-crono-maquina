'use strict';

const CACHE_NAME = 'crono-maquina-v4.0.8';
const ASSETS = [
  './',
  './index.html?v=4.0.8',
  './app.js?v=4.0.8',
  './theme-init.js?v=4.0.8',
  './pwa-ui.js?v=4.0.8',
  './report-enhancements.js?v=4.0.8',
  './whatsapp-share-fix.js?v=4.0.8',
  './general-improvements.js?v=4.0.8',
  './styles.css?v=4.0.8',
  './manifest.json?v=4.0.8',
  './assets/Icon-192.png',
  './assets/Icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
