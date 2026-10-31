/* Service worker: la app abre aunque no haya señal (con los últimos archivos guardados).
   Siempre intenta primero la red; los datos cifrados nunca se sirven desde caché si hay conexión. */
const CACHE = 'tc-v1';
const SHELL = ['./', 'index.html', 'styles.css?v=1', 'app.css?v=1', 'app.js?v=1', 'logo.png', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(r => {
    if(r.ok){ const copy = r.clone(); const key = req.url.includes('data.enc.json') ? 'data.enc.json' : req; caches.open(CACHE).then(c => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(req.url.includes('data.enc.json') ? 'data.enc.json' : req)));
});
