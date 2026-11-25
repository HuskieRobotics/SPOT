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
