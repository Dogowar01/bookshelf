// Offline support: serve the app shell from cache, refreshing it in the background.
// Bump VERSION when shipping changes so old caches are cleared.
const VERSION = 'v4';
const CACHE = `bookshelf-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
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
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/app-icon-192.png',
  'icons/app-icon-512.png',
  'icons/app-maskable-192.png',
  'icons/app-maskable-512.png',
  'images/bookcase.webp',
  'images/room-blur.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
