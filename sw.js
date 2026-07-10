const CACHE = 'sol-santiago-v2';
const ENHANCER = './js/webgl-enhance.js';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  ENHANCER
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

async function indexWithEnhancer(response) {
  const text = await response.text();
  if (text.includes('js/webgl-enhance.js')) {
    return new Response(text, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const enhanced = text.replace('</body>', '<script src="js/webgl-enhance.js"></script></body>');
  return new Response(enhanced, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate' || url.pathname.endsWith('/Estaciones/') || url.pathname.endsWith('/Estaciones/index.html');

  if (isSameOrigin && isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy.clone()));
          return indexWithEnhancer(response);
        })
        .catch(() => caches.match('./index.html').then(cached => cached ? indexWithEnhancer(cached) : caches.match('./')))
    );
    return;
  }

  if (!isSameOrigin) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});