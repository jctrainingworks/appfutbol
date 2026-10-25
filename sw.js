const V = 'futbol-v11';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/config.js', 'js/ui.js', 'js/crests.js', 'js/data/index.js', 'js/data/demo.js', 'js/data/footballdata.js', 'js/data/footballcsv.js', 'js/data/standings.js', 'js/views/home.js', 'js/views/leagues.js', 'js/views/matches.js', 'js/views/analysis.js', 'js/views/markets.js', 'js/model/poisson.js', 'js/model/trends.js', 'js/model/insight.js', 'js/views/soon.js', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
// Solo cachea el propio sitio. Primero RED (así cada cambio y cada dato nuevo se ve al instante) y, si no hay conexión, lo guardado.
// Las APIs externas nunca pasan por aquí.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
