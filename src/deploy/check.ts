/**
 * Checking a deployed server (#412; ADR 0001, SEC-4a): `npm run deploy:check -- <address>` runs
 * these against a server through its real proxy (nginx on EC2, Cloud Run's front end), the way
 * phones reach it. Each check says what it found and, when it fails, what to fix.
 */

export interface CheckResult {
  name: string;
  /** null: skipped, with the reason in `detail`. */
  ok: boolean | null;
  detail: string;
}

export interface CheckOptions {
  fetch?: typeof fetch;
  /** The admin password, to check the admin cookie; from the environment, never typed. */
  password?: string;
  /** The test stream's length and gaps, seconds (`/api/scouter/stream/check`). */
  streamSeconds?: number;
  streamEvery?: number;
  /** How soon the stream's first line must arrive, ms: later means the proxy buffers it. */
  firstWithinMs?: number;
  now?: () => number;
}

const NGINX = "deploy/aws/README.md";

async function health(base: URL, f: typeof fetch): Promise<CheckResult> {
  const name = "SPOT answers, and so does its database";
  try {
    const r = await f(new URL("/api/health", base), { signal: AbortSignal.timeout(15_000) });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.ok && body.database === "ok")
      return { name, ok: true, detail: `build ${body.build ?? "(development)"}` };
    return {
      name,
      ok: false,
      detail:
        typeof body.message === "string"
          ? `${r.status}: ${body.message}`
          : `${r.status}: not SPOT's health check. Is SPOT running behind this address?`,
    };
  } catch (error) {
    return { name, ok: false, detail: `no answer: ${String(error)}` };
  }
}

async function redirect(base: URL, f: typeof fetch): Promise<CheckResult> {
  const name = "HTTP goes to HTTPS";
  if (base.protocol !== "https:")
    return {
      name,
      ok: null,
      detail: "skipped: the address is not HTTPS, so phones can't install SPOT or use the camera",
    };
  const http = new URL(base);
  http.protocol = "http:";
  try {
    const r = await f(http, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const to = r.headers.get("location") ?? "";
    if (r.status >= 300 && r.status < 400 && to.startsWith("https:"))
      return { name, ok: true, detail: `${r.status} to ${to}` };
    return {
      name,
      ok: false,
      detail: `${r.status}${to ? ` to ${to}` : ""}: add the port 80 server block (${NGINX})`,
    };
  } catch (error) {
    return { name, ok: false, detail: `no answer on port 80: ${String(error)}` };
  }
}

async function stream(base: URL, f: typeof fetch, options: CheckOptions): Promise<CheckResult> {
  const seconds = options.streamSeconds ?? 70;
  const every = options.streamEvery ?? 25;
  const firstWithin = options.firstWithinMs ?? 5_000;
  const now = options.now ?? Date.now;
  const name = `a stream arrives as it is sent and lasts ${seconds} s, quiet for ${every} s at a time`;
  const started = now();
  const url = new URL(`/api/scouter/stream/check?seconds=${seconds}&every=${every}`, base);
  try {
    const r = await f(url, { signal: AbortSignal.timeout((seconds + 30) * 1000) });
    if (!r.ok || !r.body) return { name, ok: false, detail: `${r.status}: no stream` };
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let first: number | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      first ??= now() - started;
      text += decoder.decode(value, { stream: true });
    }
    const lasted = (now() - started) / 1000;
    if (first === null || first > firstWithin)
      return {
        name,
        ok: false,
        detail: `the first line took ${((first ?? lasted * 1000) / 1000).toFixed(1)} s: the proxy buffers streams. Turn proxy_buffering off for /api/scouter/stream (${NGINX}).`,
      };
    if (!text.includes("event: done"))
      return {
        name,
        ok: false,
        detail: `cut off after ${lasted.toFixed(0)} s: raise the proxy's read timeout (nginx proxy_read_timeout, ${NGINX}; Cloud Run's --timeout).`,
      };
    return {
      name,
      ok: true,
      detail: `first line after ${(first / 1000).toFixed(1)} s, ended after ${lasted.toFixed(0)} s`,
    };
  } catch (error) {
    return { name, ok: false, detail: `${String(error)}` };
  }
}

async function cookie(
  base: URL,
  f: typeof fetch,
  password: string | undefined,
): Promise<CheckResult> {
  const name = "the admin cookie is sent only over HTTPS (SEC-4a)";
  if (!password)
    return {
      name,
      ok: null,
      detail: "skipped: set SPOT_ADMIN_PASSWORD in the environment to check it",
    };
  if (base.protocol !== "https:")
    return { name, ok: null, detail: "skipped: the address is not HTTPS" };
  const session = new URL("/api/admin/session", base);
  try {
    const r = await f(session, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(15_000),
    });
    const set = r.headers.get("set-cookie") ?? "";
    if (r.status !== 204)
      return { name, ok: false, detail: `${r.status}: the password was refused` };
    await f(session, {
      method: "DELETE",
      headers: { cookie: set.split(";")[0] },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
    return /;\s*secure/i.test(set)
      ? { name, ok: true, detail: "Secure" }
      : {
          name,
          ok: false,
          detail: `not Secure: the proxy must send X-Forwarded-Proto (${NGINX})`,
        };
  } catch (error) {
    return { name, ok: false, detail: String(error) };
  }
}

/** Every check, in order. */
export async function checkServer(
  address: string,
  options: CheckOptions = {},
): Promise<CheckResult[]> {
  const base = new URL(address);
  const f = options.fetch ?? fetch;
  return [
    await health(base, f),
    await redirect(base, f),
    await stream(base, f, options),
    await cookie(base, f, options.password),
  ];
}
