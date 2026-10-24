// Minimal service worker: makes Butcherplace installable ("add to home screen").
// No offline caching of data — the feed must always be live. Static icons are cached.
const CACHE = "solor-static-v2";
const STATIC = ["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
  }
});
