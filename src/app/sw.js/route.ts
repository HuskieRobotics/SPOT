/**
 * The service worker script (#361, docs/spec/18): `src/offline/service-worker.ts` as text, called
 * with this build's shell (`src/offline/shell.ts`). A new build lists new files, so the browser
 * sees a new worker and installs it on the next online load.
 *
 * Only a production build (`next build && next start`) has a shell. Under `next dev` the script
 * removes any worker an earlier production run left on this address, so a student editing the
 * code never sees a stale copy; the client registers none in development
 * (`src/offline/register.ts`).
 */
import { readShell } from "@/offline/shell";
import { REMOVE_WORKER, workerSource } from "@/offline/worker-source";

export const dynamic = "force-dynamic";

const HEADERS = {
  "content-type": "application/javascript; charset=utf-8",
  // The browser asks every time, so a new build is found on the next online load.
  "cache-control": "no-cache",
};

let source: string | null = null;

export function GET() {
  if (process.env.NODE_ENV !== "production")
    return new Response(REMOVE_WORKER, { headers: HEADERS });
  source ??= workerSource(readShell());
  return new Response(source, { headers: HEADERS });
}
