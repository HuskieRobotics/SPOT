/* SPOT service worker: offline scouting + analysis.
 * - Hashed Next.js build assets: cache-first (they never change once built).
 * - Pages and data the apps need offline (/api/bootstrap, /api/analysis/data): network-first,
 *   falling back to the last good response.
 * - Images/icons: stale-while-revalidate.
 * Admin APIs and uploads are never cached. */
const VERSION = "spot-v6-2";
const SHELL = ["/", "/analysis", "/img/field.svg", "/img/half-field.svg", "/img/logo.svg", "/icons/android-chrome-192x192.png"];
const OFFLINE_DATA = ["/api/bootstrap", "/api/analysis/data"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) return e.respondWith(cacheFirst(req));
  if (OFFLINE_DATA.includes(url.pathname)) return e.respondWith(networkFirst(req));
  // Uploaded field maps never change once saved.
  if (url.pathname.startsWith("/api/field-maps/") && url.pathname.endsWith("/image")) return e.respondWith(cacheFirst(req));
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") return e.respondWith(networkFirst(req));
  if (/\.(svg|png|jpg|jpeg|webp|ico)$/.test(url.pathname)) return e.respondWith(staleWhileRevalidate(req));
});
