/**
 * Stopping cleanly (#412; DV-15, DV-16). The registry is saved behind the changes that make it,
 * so a stop could lose the last few. When pm2 (or Cloud Run) stops SPOT, it sends SIGINT or
 * SIGTERM and waits a while before killing the process. On either signal this closes the scouters'
 * streams, saves the registry, and exits.
 *
 * Next's own handler would wait for every open connection to end before exiting, and a scouter's
 * stream never ends on its own, so the process would be killed before saving anything. Starting
 * with `NEXT_MANUAL_SIG_HANDLE=true` (the recipes in `deploy/` set it) turns Next's handler off
 * and `src/instrumentation.ts` installs this one. Requests in flight are cut off; every client
 * sends again (OF-2), and a record that arrives twice is stored once (DV-18).
 */

/** What stopping needs from the process's runtime (`src/sessions/runtime.ts`). */
interface Stoppable {
  shutdown(): Promise<void>;
}

const store = globalThis as typeof globalThis & { __spotRuntime?: Promise<Stoppable> };

/** How long saving may take before the process exits anyway. pm2's `kill_timeout` is longer. */
export const SHUTDOWN_TIMEOUT_MS = 8_000;

export interface ShutdownOptions {
  process?: Pick<NodeJS.Process, "once">;
  exit?: (code: number) => void;
  log?: (message: string) => void;
  timeoutMs?: number;
}

/** Save what the process holds, within the time allowed. Resolves with what happened. */
export async function stopRuntime(timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<string> {
  const runtime = store.__spotRuntime;
  if (!runtime) return "nothing to save: no scouter had signed in since the server started";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(
      () => resolve(`gave up after ${timeoutMs / 1000} s: the database did not answer`),
      timeoutMs,
    );
  });
  const saved = runtime
    .then((r) => r.shutdown())
    .then(
      () => "the registry is saved",
      (error: unknown) => `the registry could not be saved: ${String(error)}`,
    );
  try {
    return await Promise.race([saved, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** On SIGINT or SIGTERM, close the streams, save the registry, and exit. */
export function installShutdown(options: ShutdownOptions = {}): void {
  const proc = options.process ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? ((message: string) => console.log(message));
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`SPOT is stopping (${signal}): closing the scouters' streams and saving the registry.`);
    log(`SPOT stopped: ${await stopRuntime(options.timeoutMs)}.`);
    exit(0);
  };
  proc.once("SIGTERM", () => void stop("SIGTERM"));
  proc.once("SIGINT", () => void stop("SIGINT"));
}
