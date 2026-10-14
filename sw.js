// Offline support: network first so updates arrive, with the cache as the fallback when offline.
// Icons, the manifest and the home-screen profile are never cached or served from the cache, so a
// phone always gets the real files (an old cached icon is what breaks home-screen icons).
// Bump VERSION when shipping changes so old caches are cleared.
const VERSION = 'v6';
const CACHE = `bookshelf-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/arrange.js',
  'js/book3d.js',
  'js/cropper.js',
  'js/db.js',
  'js/editor.js',
  'js/images.js',
  'js/install.js',
  'js/library.js',
  'js/lookup.js',
  'js/shelf.js',
  'js/sound.js',
  'js/stats.js',
  'js/sync.js',
  'js/syncui.js',
  'js/ui.js',
  'images/bookcase.webp',
  'images/room-blur.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || /\.(png|ico|webmanifest|mobileconfig)$/.test(url.pathname)) return;
  // Always ask the server for the latest copy (cache: 'no-cache' revalidates instead of trusting the
  // browser's short-term HTTP cache), so a single refresh picks up a new version of the app.
  const fresh = e.request.mode === 'navigate'
    ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(fresh)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
