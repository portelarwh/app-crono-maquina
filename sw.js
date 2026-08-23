'use strict';

/* ⚠ REGRA PERMANENTE: a cada mudança publicada, incremente o CACHE_NAME abaixo
   junto com APP_VERSION/APP_RELEASE_DATE em app-version.js e version.json.
   Prefira rodar ./bump-version.sh X.Y.Z — ele atualiza tudo de uma vez.
   Todos os caminhos aqui são RELATIVOS (GitHub Pages de projeto serve num
   subcaminho — caminhos absolutos '/...' dariam 404). */
const CACHE_NAME = 'crono-maquina-v5.2.8';
const ASSETS = [
  './',
  './index.html?v=5.2.8',
  './app-version.js?v=5.2.8',
  './app.js?v=5.2.8',
  './theme-init.js?v=5.2.8',
  './pwa-ui.js?v=5.2.8',
  './report-enhancements.js?v=5.2.8',
  './whatsapp-share-fix.js?v=5.2.8',
  './general-improvements.js?v=5.2.8',
  './light-trigger.js?v=5.2.8',
  './styles.css?v=5.2.8',
  './manifest.json?v=5.2.8',
  './assets/Icon-192.png',
  './assets/Icon-512.png',
  './assets/lib/html2canvas.min.js',
  './assets/lib/jspdf.umd.min.js'
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
    // HTML sempre da rede (no-store), atualizando a cópia offline; se a rede
    // falhar, cai para o cache. ignoreSearch: o index é pré-cacheado com query
    // de versão (?v=...) — sem isso o fallback offline falha.
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
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
