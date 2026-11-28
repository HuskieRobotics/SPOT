/**
 * Runs once when the server starts (Next's instrumentation hook). With
 * `NEXT_MANUAL_SIG_HANDLE=true`, as the deploy recipes start it, SPOT handles SIGINT and SIGTERM
 * itself, so a stop saves the registry first (#412, `src/server/shutdown.ts`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_MANUAL_SIG_HANDLE !== "true") return;
  const { installShutdown } = await import("./server/shutdown");
  installShutdown();
}
