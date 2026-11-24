/**
 * A device's connection to the registry (RT-5 to RT-8, RT-26, OF-7, #359): its event stream,
 * read with `fetch` rather than `EventSource` so a refusal's reason can be read, and kept open
 * for as long as someone is signed in.
 *
 * - The status is Connected, Disconnected (it was connected since the page loaded) or Not
 *   connected, and it changes quietly: no message per attempt (F-17). Attempts back off from
 *   1 s to 10 s; the browser coming back online tries at once.
 * - A stream that has sent nothing, not even its 20 s heartbeat, for 45 s is taken for dead
 *   and reopened, which catches a Wi-Fi change that leaves the old connection hanging.
 * - The registry no longer knowing the scouter (a sign-in made offline, a server whose active
 *   event changed back) signs them in again with the details the device kept. Only a refusal a
 *   person must act on, another device taking the session or a wrong join code, signs the device
 *   out.
 */
import type { DeviceMessage } from "@/sessions/registry";
import type { ScouterApi } from "./api";
import type { DeviceStore } from "./device";
import { signIn } from "./sign-in";

export type ConnectionStatus = "not-connected" | "connected" | "disconnected";

export interface SseMessage {
  event: string;
  data: string;
}

/** Split server-sent event text into whole messages and the unfinished rest (comments dropped). */
export function parseSse(text: string): { messages: SseMessage[]; rest: string } {
  const blocks = text.replace(/\r\n?/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const messages: SseMessage[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) messages.push({ event, data: data.join("\n") });
  }
  return { messages, rest };
}

export interface ConnectionHandlers {
  status(status: ConnectionStatus, detail?: string): void;
  message(message: DeviceMessage): void;
  /** The device must sign in again, for the reason given. The connection has stopped. */
  signedOut(reason: string): void;
}

export interface ConnectionOptions {
  store: DeviceStore;
  api: ScouterApi;
  handlers: ConnectionHandlers;
  fetch?: typeof fetch;
  /** Reopen a stream that has been silent this long (ms). */
  staleMs?: number;
  backoff?: { firstMs: number; maxMs: number };
  /** Wait between attempts while the server has no active event or refuses for now (ms). */
  refusedMs?: number;
}

export const STALE_MS = 45_000;
const BACKOFF = { firstMs: 1_000, maxMs: 10_000 };
const REFUSED_MS = 10_000;

type Outcome =
  | { kind: "ended" }
  | { kind: "network" }
  | { kind: "refused"; status: number; error: string; message: string };

export class Connection {
  private stopped = false;
  private everConnected = false;
  private delay: number;
  private wakeUp: (() => void) | null = null;
  private abort: AbortController | null = null;
  private readonly fetch: typeof fetch;
  private readonly staleMs: number;
  private readonly backoff: { firstMs: number; maxMs: number };
  private readonly refusedMs: number;

  constructor(private readonly options: ConnectionOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.staleMs = options.staleMs ?? STALE_MS;
    this.backoff = options.backoff ?? BACKOFF;
    this.refusedMs = options.refusedMs ?? REFUSED_MS;
    this.delay = this.backoff.firstMs;
  }

  /** Run until stopped or signed out. */
  async run(): Promise<void> {
    const { store, api, handlers } = this.options;
    let signedInAgain = false;
    while (!this.stopped) {
      const who = store.signedIn();
      if (!who) return;
      const outcome = await this.openOnce(who.scouterId, store.deviceId());
      if (this.stopped) return;
      if (outcome.kind !== "refused") {
        signedInAgain = false;
        this.lost();
        await this.pause(this.nextDelay());
        continue;
      }
      if (outcome.status === 401 && outcome.error === "not-signed-in") {
        // The registry has no session for this scouter: sign in again, once without waiting.
        if (signedInAgain) await this.pause(this.nextDelay());
        signedInAgain = true;
        const result = await signIn(store, api, { id: who.scouterId, name: who.name });
        if (this.stopped) return;
        if (result.status === "online") handlers.message({ kind: "state", view: result.view });
        else if (result.status === "join-code") return this.signOut(result.message);
        else if (result.status === "offline") {
          this.lost();
          await this.pause(this.nextDelay());
        } else {
          handlers.status("not-connected", result.message);
          await this.pause(this.refusedMs);
        }
        continue;
      }
      signedInAgain = false;
      if (outcome.status === 401 || outcome.status === 400 || outcome.status === 403)
        return this.signOut(outcome.message);
      if (outcome.status >= 500) {
        this.lost();
        await this.pause(this.nextDelay());
      } else {
        // No active event (409), or anything else the server refuses for now.
        handlers.status(this.everConnected ? "disconnected" : "not-connected", outcome.message);
        await this.pause(this.refusedMs);
      }
    }
  }

  stop() {
    this.stopped = true;
    this.abort?.abort();
    this.wake();
  }

  /** Try again now, as when the browser says it is back online. */
  wake() {
    this.delay = this.backoff.firstMs;
    this.wakeUp?.();
  }

  private lost() {
    this.options.handlers.status(this.everConnected ? "disconnected" : "not-connected");
  }

  private signOut(reason: string) {
    this.stopped = true;
    this.options.handlers.signedOut(reason);
  }

  private nextDelay(): number {
    const d = this.delay;
    this.delay = Math.min(this.delay * 2, this.backoff.maxMs);
    return d;
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wakeUp = () => {
        this.wakeUp = null;
        done();
      };
    });
  }

  private async openOnce(scouterId: string, deviceId: string): Promise<Outcome> {
    const abort = (this.abort = new AbortController());
    const url = `/api/scouter/stream?scouter=${encodeURIComponent(scouterId)}&device=${encodeURIComponent(deviceId)}`;
    let response: Response;
    // Set once the stream opens; the silence timer cancels it.
    const body: { reader?: ReadableStreamDefaultReader<Uint8Array> } = {};
    let stale: ReturnType<typeof setTimeout> | undefined;
    const watch = () => {
      clearTimeout(stale);
      stale = setTimeout(() => {
        abort.abort();
        body.reader?.cancel().catch(() => undefined);
      }, this.staleMs);
    };
    try {
      watch(); // the server answers at once; a request that hangs is a dead network
      response = await this.fetch(url, {
        headers: { accept: "text/event-stream" },
        cache: "no-store",
        signal: abort.signal,
      });
    } catch {
      clearTimeout(stale);
      return { kind: "network" };
    }
    if (!response.ok || !response.body) {
      clearTimeout(stale);
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        kind: "refused",
        status: response.status,
        error: typeof body.error === "string" ? body.error : "server",
        message: typeof body.message === "string" ? body.message : "The server refused.",
      };
    }

    this.everConnected = true;
    this.delay = this.backoff.firstMs;
    this.options.handlers.status("connected");
    const reader = (body.reader = response.body.getReader());
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        watch();
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { messages, rest } = parseSse(buffer);
        buffer = rest;
        for (const m of messages) {
          let message: DeviceMessage;
          try {
            message = JSON.parse(m.data) as DeviceMessage;
          } catch {
            continue;
          }
          if (message.kind === "signed-out") {
            abort.abort();
            this.signOut("You were signed out. Sign in again to keep scouting.");
            return { kind: "ended" };
          }
          this.options.handlers.message(message);
        }
      }
    } catch {
      // The stream broke, or went silent and was aborted.
    } finally {
      clearTimeout(stale);
    }
    return { kind: "ended" };
  }
}
