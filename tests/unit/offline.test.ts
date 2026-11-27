/**
 * The service worker (#361, docs/spec/18): what it keeps (OF-5, OF-6) and how it answers (OF-1,
 * OF-7, OF-8), run from the very text `/sw.js` sends, in a fake worker scope. The browser test
 * (`tests/e2e/offline.spec.ts`, T-8) runs it in Chromium.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GET as getWorker } from "@/app/sw.js/route";
import type { Shell, WorkerEvent, WorkerFetchEvent } from "@/offline/service-worker";
import { readShell } from "@/offline/shell";
import { REMOVE_WORKER, workerSource } from "@/offline/worker-source";

const ORIGIN = "https://spot.example";

// ------------------------------------------------------------------------- what it keeps

describe("OF-5, OF-6: the shell is the build's own files", () => {
  const root = mkdtempSync(join(tmpdir(), "spot-shell-"));
  const put = (path: string, text = "x") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("is nothing before a build", () => {
    expect(readShell(root)).toBeNull();
  });

  it("lists every built file, the self-hosted fonts among them, every image in public/, and the pages", () => {
    put(".next/BUILD_ID", "b1d\n");
    put(".next/static/chunks/0a1b.js");
    put(".next/static/chunks/0c2d.css");
    put(".next/static/media/cairo.p.woff2");
    put(".next/static/b1d/_buildManifest.js");
    put("public/img/field.svg");
    put("public/img/Field Map 2027.png");
    put("public/img/TBA_API_KEY.webm");
    put("public/icons/android-chrome-192x192.png");
    put("public/icons/browserconfig.xml");
    expect(readShell(root)).toEqual({
      build: "b1d",
      urls: [
        "/",
        "/_next/static/b1d/_buildManifest.js",
        "/_next/static/chunks/0a1b.js",
        "/_next/static/chunks/0c2d.css",
        "/_next/static/media/cairo.p.woff2",
        "/analysis",
        "/icons/android-chrome-192x192.png",
        "/img/Field%20Map%202027.png",
        "/img/field.svg",
        "/manifest.webmanifest",
      ],
      // The scouting client, and the analysis dashboard (#390, OF-3).
      pages: ["/", "/analysis"],
      timeoutMs: 4_000,
    });
  });

  it("under next dev, /sw.js removes any worker a production run left", async () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    const r = getWorker();
    expect(r.headers.get("content-type")).toMatch(/javascript/);
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(await r.text()).toBe(REMOVE_WORKER);
    expect(workerSource(null)).toBe(REMOVE_WORKER);
  });
});

// ------------------------------------------------------------------------- how it answers

/** A request as the browser hands one to the worker; Node's `Request` refuses `navigate`. */
function request(path: string, init: { mode?: string; method?: string } = {}): Request {
  const url = new URL(path, ORIGIN).href;
  return { url, mode: init.mode ?? "cors", method: init.method ?? "GET" } as Request;
}

class FakeRequest {
  readonly url: string;
  constructor(
    url: string,
    readonly init: { cache?: string } = {},
  ) {
    this.url = new URL(url, ORIGIN).href;
  }
}

const keyOf = (r: string | { url: string }) =>
  new URL(typeof r === "string" ? r : r.url, ORIGIN).href;

class FakeCache {
  readonly entries = new Map<string, Response>();
  constructor(private readonly fetch: (r: { url: string }) => Promise<Response>) {}
  async match(r: string | { url: string }) {
    return this.entries.get(keyOf(r))?.clone();
  }
  async put(r: { url: string }, response: Response) {
    this.entries.set(keyOf(r), response);
  }
  async addAll(requests: FakeRequest[]) {
    const responses = await Promise.all(requests.map((r) => this.fetch(r)));
    if (responses.some((r) => !r.ok)) throw new TypeError("addAll: a request failed");
    requests.forEach((r, i) => this.entries.set(keyOf(r), responses[i]));
  }
}

/** A worker scope with a network that can be cut off or slowed, running `/sw.js`'s text. */
function worker(shell: Shell) {
  const network = { online: true, slowMs: 0, build: shell.build, fetched: [] as string[] };
  const fetch = async (r: { url: string; init?: { cache?: string } }) => {
    network.fetched.push(new URL(r.url).pathname + (r.init?.cache ? ` (${r.init.cache})` : ""));
    if (network.slowMs) await new Promise((resolve) => setTimeout(resolve, network.slowMs));
    if (!network.online) throw new TypeError("Failed to fetch");
    const path = new URL(r.url).pathname;
    return new Response(`${path} from build ${network.build}`, {
      status: path.includes("missing") ? 404 : 200,
    });
  };
  const caches = new Map<string, FakeCache>();
  const storage = {
    open: async (name: string) =>
      caches.get(name) ?? caches.set(name, new FakeCache(fetch)).get(name)!,
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  };
  const listeners = new Map<string, (event: unknown) => void>();
  const scope = {
    location: { origin: ORIGIN },
    caches: storage,
    fetch,
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
  };
  new Function("self", "Request", workerSource(shell))(scope, FakeRequest);

  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p) => waits.push(p) } satisfies WorkerEvent);
    await Promise.all(waits);
  }
  /** The worker's answer, as text, or null when it leaves the request to the browser. */
  async function get(r: Request): Promise<string | null> {
    let answer: Promise<Response> | null = null;
    listeners.get("fetch")!({
      request: r,
      waitUntil: () => undefined,
      respondWith: (p) => (answer = p),
    } satisfies WorkerFetchEvent);
    return answer ? (await (answer as Promise<Response>)).text() : null;
  }
  return { network, caches, lifecycle, get };
}

const SHELL: Shell = {
  build: "b2",
  urls: ["/", "/_next/static/chunks/app.js", "/img/field.svg", "/manifest.webmanifest"],
  pages: ["/"],
  timeoutMs: 30,
};

describe("OF-1, OF-7, OF-8: how the service worker answers", () => {
  it("OF-5: install keeps the whole shell, fetched fresh from the server", async () => {
    const w = worker(SHELL);
    await w.lifecycle("install");
    expect(w.network.fetched).toEqual(SHELL.urls.map((u) => `${u} (reload)`));
    expect([...(w.caches.get("spot-shell-b2")?.entries.keys() ?? [])]).toEqual(
      SHELL.urls.map((u) => ORIGIN + u),
    );
  });

  it("activate deletes the caches of earlier builds, and no one else's", async () => {
    const w = worker(SHELL);
    const open = (name: string) => w.caches.set(name, new FakeCache(async () => new Response("")));
    open("spot-shell-b1");
    open("other-app");
    await w.lifecycle("install");
    await w.lifecycle("activate");
    expect([...w.caches.keys()].sort()).toEqual(["other-app", "spot-shell-b2"]);
  });

  it("an install that cannot fetch every file fails, so the next load tries again", async () => {
    const w = worker({ ...SHELL, urls: [...SHELL.urls, "/img/missing.svg"] });
    await expect(w.lifecycle("install")).rejects.toThrow(/failed/);
  });

  it("OF-1: with no connection, the page opens from the cache, whatever its query", async () => {
    const w = worker(SHELL);
    await w.lifecycle("install");
    w.network.online = false;
    expect(await w.get(request("/?join=K7QF2M", { mode: "navigate" }))).toBe("/ from build b2");
    expect(await w.get(request("/_next/static/chunks/app.js"))).toBe(
      "/_next/static/chunks/app.js from build b2",
    );
    expect(await w.get(request("/img/field.svg?v=1"))).toBe("/img/field.svg from build b2");
  });

  it("online, the page comes from the server, so a new build is found on the next load", async () => {
    const w = worker(SHELL);
    await w.lifecycle("install");
    w.network.build = "b3";
    expect(await w.get(request("/", { mode: "navigate" }))).toBe("/ from build b3");
  });

  it("OF-7: a server that does not answer in time is not waited for", async () => {
    const w = worker(SHELL);
    await w.lifecycle("install");
    w.network.build = "b3";
    w.network.slowMs = 500;
    const started = Date.now();
    expect(await w.get(request("/", { mode: "navigate" }))).toBe("/ from build b2");
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("a built file from a newer build comes from the server, and is kept", async () => {
    const w = worker(SHELL);
    await w.lifecycle("install");
    w.network.build = "b3";
    expect(await w.get(request("/_next/static/chunks/new.js"))).toBe(
      "/_next/static/chunks/new.js from build b3",
    );
    w.network.online = false;
    expect(await w.get(request("/_next/static/chunks/new.js"))).toBe(
      "/_next/static/chunks/new.js from build b3",
    );
  });

  it("OF-8: the configuration, the API, the stream, other pages and other sites go to the network", async () => {
    const w = worker(SHELL);
    await w.lifecycle("install");
    for (const r of [
      request("/api/config/match-scouting"),
      request("/api/scouter/stream?scouter=1&device=d"),
      request("/api/scouter/performances", { method: "POST" }),
      request("/admin", { mode: "navigate" }),
      request("https://cdn.example/lib.js"),
    ])
      expect(await w.get(r)).toBeNull();
  });
});
