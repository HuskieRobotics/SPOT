/**
 * The service worker (docs/spec/18, #361): it keeps the app itself on the device, so a page
 * loaded online once opens again with no connection (OF-1, OF-5).
 *
 * - **Install** caches the build's shell: every file Next built (`/_next/static/`), the images in
 *   `public/`, the web app manifest, and the pages in `shell.pages` (`/`). One cache per build;
 *   if any file fails, the install fails and the next load tries again.
 * - **Activate** deletes the caches of earlier builds and takes over the open pages.
 * - **A page** in `shell.pages` comes from the network while it answers within
 *   `shell.timeoutMs`, so an online load always gets the newest build, and from the cache
 *   otherwise (OF-7). Its query string is ignored: `/?join=K7QF2M` is `/`.
 * - **A built file or an image** comes from the cache, and from the network when it is not
 *   there (a build newer than this worker's).
 * - **Everything else** (the API, the event stream, other pages) is left to the browser. The
 *   scouting client keeps its own data, the configuration, roster and schedule, in the device's
 *   storage (`src/scouter/device.ts`), so a configuration change reaches it on the next online
 *   load (OF-8). The analysis and scanner pages (Phases 3 and 4) add their pages to
 *   `shell.pages` in `src/offline/shell.ts`, and their own rules here.
 *
 * `/sw.js` (`src/app/sw.js/route.ts`) sends this function as text, followed by a call with the
 * build's shell, so a new build is a new worker. It must therefore use nothing outside itself:
 * no imports and no module constants. `tests/unit/offline.test.ts` runs it from that text.
 */

export interface Shell {
  /** The build's id: the cache is `spot-shell-<build>`. */
  build: string;
  /** Every URL to cache at install, pages included. */
  urls: string[];
  /** Pages answered from the network first, then from the cache. */
  pages: string[];
  /** How long a page waits for the network before the cached copy (OF-7). */
  timeoutMs: number;
}

/** What a service worker's events look like, as much as this worker uses. */
export interface WorkerEvent {
  waitUntil(promise: Promise<unknown>): void;
}

export interface WorkerFetchEvent extends WorkerEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
}

/** The worker's global scope (`self`), as much as this worker uses. */
export interface WorkerScope {
  location: { origin: string };
  caches: CacheStorage;
  fetch(request: Request): Promise<Response>;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: "install" | "activate", listener: (event: WorkerEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: WorkerFetchEvent) => void): void;
}

export function serviceWorker(sw: WorkerScope, shell: Shell): void {
  const prefix = "spot-shell-";
  const name = prefix + shell.build;
  const cached = new Set(shell.urls);

  sw.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await sw.caches.open(name);
        // `reload`: the files themselves, never a copy the browser kept from an earlier build.
        await cache.addAll(shell.urls.map((url) => new Request(url, { cache: "reload" })));
        await sw.skipWaiting();
      })(),
    );
  });

  sw.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        for (const key of await sw.caches.keys())
          if (key.startsWith(prefix) && key !== name) await sw.caches.delete(key);
        await sw.clients.claim();
      })(),
    );
  });

  sw.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) return;
    if (request.mode === "navigate") {
      if (shell.pages.includes(url.pathname)) event.respondWith(page(request, url.pathname));
      return;
    }
    if (cached.has(url.pathname) || url.pathname.startsWith("/_next/static/"))
      event.respondWith(file(request, url.pathname));
  });

  /** The network if it answers in time, else the copy from install (OF-7). */
  async function page(request: Request, path: string): Promise<Response> {
    const network = sw.fetch(request);
    network.catch(() => undefined); // answered below, or not needed
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), shell.timeoutMs));
    try {
      const response = await Promise.race([network, late]);
      if (response) return response;
    } catch {
      // No connection: the cached copy.
    }
    const copy = await (await sw.caches.open(name)).match(path, { ignoreVary: true });
    return copy ?? network;
  }

  /** The cached file, or the network's, kept when it is a built file (they never change). */
  async function file(request: Request, path: string): Promise<Response> {
    const cache = await sw.caches.open(name);
    const copy = await cache.match(cached.has(path) ? path : request, { ignoreVary: true });
    if (copy) return copy;
    const response = await sw.fetch(request);
    if (response.ok && path.startsWith("/_next/static/"))
      await cache.put(request, response.clone()).catch(() => undefined);
    return response;
  }
}
