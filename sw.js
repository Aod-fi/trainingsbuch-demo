// Service Worker: hält die App-Dateien vor, damit das Trainingsbuch auch ohne Netz startet.
// Strategie "erst Netz, dann Speicher": online immer die neueste Version, offline die zuletzt geladene.
// Daten (Supabase, andere Adresse) werden nicht zwischengespeichert.
const CACHE = 'trainingsbuch-v2';
const GRUNDDATEIEN = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-512.png', './apple-touch-icon.png',
  './css/style.css', './js/main.js', './js/config.js', './js/daten/index.js', './js/daten/mock.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(GRUNDDATEIEN)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok) { const kopie = antwort.clone(); caches.open(CACHE).then((c) => c.put(e.request, kopie)); }
        return antwort;
      })
      .catch(async () => (await caches.match(e.request, { ignoreSearch: true }))
        || (e.request.mode === 'navigate' && await caches.match('./index.html'))
        || Response.error()),
  );
});
