/**
 * Registering the service worker (#361, docs/spec/18): from a production build only, so
 * `next dev` never serves a stale copy of code being edited. Test offline with
 * `npm run build && npm start`.
 *
 * `updateViaCache: "none"`: the browser fetches `/sw.js` itself on every online load, so a new
 * build is found at once (OF-8).
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch(() => undefined); // No worker: the app works on, online only.
}

/**
 * Keep the page open now for offline use (#411): a page in `shell.visited` is kept when the
 * service worker answers it, which it does not do the first time, before it controls the page.
 * Once it does, the page asks for itself again, and the worker keeps the answer.
 */
export function keepPage(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (navigator.serviceWorker.controller) return; // the worker answered this load and kept it
  const path = window.location.pathname;
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () =>
      void fetch(path, { headers: { "X-SPOT-Keep-Page": "1" }, cache: "no-store" }).catch(
        () => undefined,
      ),
    { once: true },
  );
}
