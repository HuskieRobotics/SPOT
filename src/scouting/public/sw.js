const cacheVersion = "scouting-cache-v3";

/**
 * These are all the files that need to be cached for offline functionality.
 * In the event that a user does not have connection to the internet, they
 * will instead be served these files that have been cached, but must first
 * connect to the site with an internet connection to initially cache them.
 * Some routes, such as /analysis/api/dataset return data, such as a JS object,
 * instead of an actual file. When doing a fetch request (such as
 * await fetch('./api/dataset')), it will instead grab the most recently cached version,
 * and NOT the most up-to-date version from the server
 */

const filesToCache = [
  // scouting page
  "/",
  "/executables.js",
  "/css/form.css",
  "/css/global.css",
  "/css/internal.css",
  "/css/landing.css",
  "/css/match-scouting.css",
  "/css/waiting.css",
  "/icons/android-chrome-192x192.png",
  "/icons/android-chrome-512x512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-16x16.png",
  "/icons/favicon-32x32.png",
  "/icons/favicon.ico",
  "/icons/menu-button.png",
  "/icons/menu-button.svg",
  "/icons/mstile-150x150.png",
  "/icons/safari-pinned-tab.svg",
  "/icons/site.webmanifest",
  "/img/field.svg",
  "/img/gear.svg",
  "/img/logo.svg",
  "/img/spinner.svg",
  "/js/lib/jsqr.js",
  "/js/lib/qrcode.js",
  "/js/form.js",
  "/js/global.js",
  "/js/internal.js",
  "/js/landing.js",
  "/js/local-data.js",
  "/js/match-scouting.js",
  "/js/qrcode.js",
  "/js/scouting-sync.js",
  "/js/settingsmenu.js",
  "/js/waiting.js",
  "/manifest.json",

  // analysis page
  "/analysis/",
  "/analysis/modules.css",
  "/analysis/modules.js",
  "/analysis/transformers.js",
  "/analysis/css/global.css",
  "/analysis/css/internal.css",
  "/analysis/css/style.css",
  "/analysis/icons/android-chrome-192x192.png",
  "/analysis/icons/android-chrome-512x512.png",
  "/analysis/icons/apple-touch-icon.png",
  "/analysis/icons/favicon-16x16.png",
  "/analysis/icons/favicon-32x32.png",
  "/analysis/icons/favicon.ico",
  "/analysis/icons/mstile-150x150.png",
  "/analysis/icons/safari-pinned-tab.svg",
  "/analysis/icons/site.webmanifest",
  "/analysis/img/field.svg",
  "/analysis/img/logo.png",
  "/analysis/img/spinner.svg",
  "/analysis/js/analysisPipeline.js",
  "/analysis/js/autoPick.js",
  "/analysis/js/DataTransformer.js",
  "/analysis/js/elements.js",
  "/analysis/js/script.js",
  "/analysis/js/ui.js",
  "/analysis/js/util.js",
  "/analysis/api/dataset",
  "/analysis/api/teams",
  "/analysis/api/manual",
  "/analysis/api/events",
  "/analysis/api/blueApiData",
  "/analysis/api/blueApiOPR",
  "/analysis/api/blueApiOPRStrings",

  // config
  "/admin/api/matches",
  "/config/analysis-modules.json",
  "/config/analysis-pipeline.json",
  "/config/config.json",
  "/config/match-scouting.json",
  "/config/qr.json",

  // QR code page
  "/qrscanner/",
  "/qrscanner/css/global.css",
  "/qrscanner/css/scanner.css",
  "/qrscanner/icons/android-chrome-192x192.png",
  "/qrscanner/icons/android-chrome-512x512.png",
  "/qrscanner/icons/apple-touch-icon.png",
  "/qrscanner/icons/favicon-16x16.png",
  "/qrscanner/icons/favicon-32x32.png",
  "/qrscanner/icons/favicon.ico",
  "/qrscanner/icons/mstile-150x150.png",
  "/qrscanner/icons/safari-pinned-tab.svg",
  "/qrscanner/icons/site.webmanifest",
  "/qrscanner/js/html5-qrcode.min.js",
  "/qrscanner/js/qr-sync.js",
  "/qrscanner/js/results.js",

  // external files
  "https://cdn.plot.ly/plotly-2.8.3.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.0/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;700&family=Saira:wght@300;400;700&family=Tajawal:wght@300;400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Zilla+Slab:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.0/webfonts/fa-brands-400.ttf",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.0/webfonts/fa-solid-900.ttf",
  "https://fonts.gstatic.com/s/cairo/v30/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscRiyS8p4_RA.woff2",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.0/webfonts/fa-solid-900.woff2",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.0/webfonts/fa-brands-400.woff2",
  "https://unpkg.com/simple-statistics@7.8.0/dist/simple-statistics.min.js",
  "https://cdn.jsdelivr.net/npm/fuzzysort@1.2.1/fuzzysort.js",
];

const installFilesToCache = filesToCache.filter((file) => {
  if (!file.startsWith("/")) {
    return false;
  }

  return !file.includes("/api/");
});

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(cacheVersion).then(function (cache) {
      return Promise.allSettled(
        installFilesToCache.map((file) => cache.add(file)),
      ).then((results) => {
        const failed = results.filter((result) => result.status === "rejected");

        if (failed.length > 0) {
          console.warn(
            `[SW] ${failed.length} asset(s) failed to precache during install.`,
          );
        }
      });
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== cacheVersion)
          .map((key) => caches.delete(key)),
      );
    }),
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
    return;
  }

  event.respondWith(
    caches.open(cacheVersion).then((cache) => {
      return cache.match(event.request).then((response) => {
        const requestPathname = requestUrl.pathname;
        const shouldCache =
          filesToCache.includes(event.request.url) ||
          filesToCache.includes(requestPathname);

        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            // Cache API rejects some technically successful responses (ex: 206).
            const isCacheableStatus =
              networkResponse.type === "opaque" ||
              (networkResponse.ok && networkResponse.status !== 206);

            if (
              shouldCache &&
              event.request.method === "GET" &&
              isCacheableStatus
            ) {
              cache.put(event.request, networkResponse.clone()).catch((err) => {
                console.warn(
                  "[SW] Failed to cache response:",
                  event.request.url,
                  err,
                );
              });
            }
            return networkResponse;
          })
          .catch((e) => {
            console.log(e, "Error fetching:", event.request.url);

            if (response) {
              return response;
            }

            if (event.request.mode === "navigate") {
              return cache.match("/");
            }

            return new Response("", { status: 503, statusText: "Offline" });
          });
        return response || fetchPromise;
      });
    }),
  );
});
