/**
 * The text `/sw.js` sends (`src/app/sw.js/route.ts`, #361): the worker's code from
 * `service-worker.ts`, then the call that starts it with the build's shell.
 */
import { serviceWorker, type Shell } from "./service-worker";

/** A worker that removes itself and SPOT's caches: what `/sw.js` sends with no build. */
export const REMOVE_WORKER = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith("spot-shell-")) await caches.delete(key);
  await self.registration.unregister();
})()));
`;

export function workerSource(shell: Shell | null): string {
  if (!shell) return REMOVE_WORKER;
  return `"use strict";\n(${serviceWorker.toString()})(self, ${JSON.stringify(shell)});\n`;
}
