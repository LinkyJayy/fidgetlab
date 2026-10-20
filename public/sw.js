// FidgetLab service worker: precaches the app shell so every fidget works
// offline. Static files are network-first (fresh when online, cached when not);
// the API is never cached.

const VERSION = 'fidgetlab-v2';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/img/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/js/app.js',
  '/js/sound.js',
  '/js/state.js',
  '/js/theme.js',
  '/js/fidgets/popit.js',
  '/js/fidgets/spinner.js',
  '/js/fidgets/cradle.js',
  '/js/fidgets/joystick.js',
  '/js/fidgets/knob.js',
  '/js/fidgets/toggles.js',
  '/js/fidgets/gears.js',
  '/js/fidgets/slider.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req), timeout(4000)]);
      if (res.ok) cache.put(req.mode === 'navigate' ? '/' : req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req.mode === 'navigate' ? '/' : req, { ignoreSearch: true });
      if (hit) return hit;
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
