const cacheVersion = "scouting-cache-v1";

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
  "/",
  "/css/form.css",
  "/css/global.css",
  "/css/internal.css",
  "/css/landing.css",
  "/css/match-scouting.css",
  "/css/waiting.css",
  "/icons/favicon.ico",
  "/img/field.svg",
  "/img/gear.svg",
  "/img/logo.png",
  "/img/spinner.svg",
  "/js/lib/qrcode.js",
  "/js/qrcode.js",
  "/js/form.js",
  "/js/global.js",
  "/js/internal.js",
  "/js/landing.js",
  "/js/local-data.js",
  "/js/match-scouting.js",
  "/js/scouting-sync.js",
  "/js/waiting.js",
  "/manifest.json",
  "/executables.js",
  // Offline Analysis Page
  "/analysis/",
  "/analysis/modules.js",
  "/analysis/transformers.js",
  "/analysis/css/style.css",
  "/analysis/css/internal.css",
  "/analysis/css/global.css",
  "/analysis/img/field.svg",
  "/analysis/img/logo.png",
  "/analysis/img/spinner.svg",
  "/analysis/js/elements.js",
  "/analysis/js/script.js",
  "/analysis/js/ui.js",
  "/analysis/js/util.js",
  "/analysis/js/analysisPipeline.js",
  "/analysis/js/DataTransformer.js",
  "/analysis/api/dataset",
  "/analysis/api/teams",
  "/analysis/api/manual",
  // Config
  "/config/analysis-pipeline.json",
  "/config/analysis-modules.json",
  "/admin/api/matches",
  "/config/config.json",
  "/config/match-scouting.json",
  "/config/qr.json",
  // Icons
  "/icons/site.webmanifest",
  "/icons/favicon-16x16.png",
  "/icons/favicon-32x32.png",
  // Offline QRCode Page
  "/qrscanner/",
  "/qrscanner/css/global.css",
  "/qrscanner/css/scanner.css",
  "/qrscanner/js/html5-qrcode.min.js",
  "/qrscanner/js/results.js",
];

self.addEventListener("install", function (event) {
  // Perform install steps
  event.waitUntil(
    caches.open(cacheVersion).then(function (cache) {
      return cache.addAll(filesToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.open(cacheVersion).then((cache) => {
      return cache.match(event.request).then((response) => {
        event.request.importance = "low"; //low priority
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (filesToCache.includes(new URL(event.request.url).pathname)) {
              //if the file is in the cache list
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch((e) => console.log(e));

        return response || fetchPromise;
      });
    })
  );
});
