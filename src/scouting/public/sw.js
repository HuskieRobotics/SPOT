const cacheVersion = "scouting-cache-v1"
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
    "/analysis/api/dataset",
    "/analysis/api/teams",
    "/config/analysis-modules.json",,
	"/admin/api/matches",
	"/config/config.json",
	"/config/match-scouting.json",
	"/config/qr.json",
	"/icons/site.webmanifest",
	"/icons/favicon-16x16.png",
	"/icons/favicon-32x32.png",
    // Offline QRCode Page
    "/qrscanner/",
    "/qrscanner/css/global.css",
    "/qrscanner/css/scanner.css",
    "/qrscanner/js/html5-qrcode.min.js",
    "/qrscanner/js/results.js",
]

self.addEventListener('install', function(event) {
    // Perform install steps
    event.waitUntil(
        caches.open(cacheVersion)
        .then(function(cache) {
            for (const file in filesToCache) {
                console.log(`${filesToCache[file]} @ ${file}`);
                cache.add(filesToCache[file]);
            }
            // return cache.addAll(filesToCache);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.open(cacheVersion).then((cache) => {
            return cache.match(event.request).then((response) => {
                event.request.importance = "low"; //low priority
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (filesToCache.includes((new URL(event.request.url)).pathname)) {//if the file is in the cache list
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(e=>console.log(e))

                return response || fetchPromise;
            })
        })
    );
});