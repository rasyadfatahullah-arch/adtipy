/* ADTIFY service worker — keep shell cached, help background audio context */
const CACHE = 'adtify-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // Don't cache audio/API streams
  if (url.includes('ytmp3') || url.includes('yotomp3') || url.includes('youtube') || url.includes('lehzz')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
