'use strict';

const CACHE_NAME = 'crono-maquina-v5.0.2';
const ASSETS = [
  './',
  './index.html?v=5.0.2',
  './app.js?v=5.0.2',
  './theme-init.js?v=5.0.2',
  './pwa-ui.js?v=5.0.2',
  './report-enhancements.js?v=5.0.2',
  './whatsapp-share-fix.js?v=5.0.2',
  './general-improvements.js?v=5.0.2',
  './light-trigger.js?v=5.0.2',
  './styles.css?v=5.0.2',
  './manifest.json?v=5.0.2',
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
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('version.json')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', {headers:{'Content-Type':'application/json'}})));
    return;
  }

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
