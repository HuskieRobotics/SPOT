/**
 * Deploying SPOT (#412; deploy/aws/README.md, ADR 0001, ADR 0002, AR-21, DV-15): the files the EC2
 * recipe installs keep the settings SPOT depends on, the server stops cleanly, the health check
 * says what it finds, and `npm run deploy:check` tells a good proxy from a bad one.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as health from "@/app/api/health/route";
import * as streamCheck from "@/app/api/scouter/stream/check/route";
import * as session from "@/app/api/admin/session/route";
import { HEARTBEAT_MS } from "@/sessions/hub";
import { MAX_SUBMISSIONS } from "@/submissions/submission";
import { checkServer } from "@/deploy/check";
import { installShutdown, SHUTDOWN_TIMEOUT_MS, stopRuntime } from "@/server/shutdown";
import { startMongo, type TestMongo } from "../support/mongo";

const root = process.cwd();
const aws = (...p: string[]) => join(root, "deploy", "aws", ...p);
const store = globalThis as typeof globalThis & {
  __spotRuntime?: Promise<{ shutdown(): Promise<void> }>;
  __spotMongo?: unknown;
};

// --------------------------------------------------------------------- the recipe's files

describe("ADR 0002, AR-21: pm2's settings", () => {
  const { apps } = createRequire(import.meta.url)(aws("ecosystem.config.cjs")) as {
    apps: Record<string, unknown>[];
  };
  const app = apps[0];

  it("one process, never a cluster, which owns the registry (AR-21)", () => {
    expect(apps).toHaveLength(1);
    expect(app).toMatchObject({ name: "spot", exec_mode: "fork", instances: 1 });
  });

  it("DV-15: SPOT handles the stop signal, and pm2 waits longer than SPOT takes to save", () => {
    expect(app.env).toMatchObject({ NODE_ENV: "production", NEXT_MANUAL_SIG_HANDLE: "true" });
    expect(app.kill_timeout).toBeGreaterThan(SHUTDOWN_TIMEOUT_MS);
  });

  it("ADR 0003: secrets from a file outside the releases; only nginx can reach SPOT", () => {
    expect(app.node_args).toBe("--env-file=/srv/spot/shared/spot.env");
    expect(app.cwd).toBe("/srv/spot/current");
    expect(app.args).toContain("--hostname 127.0.0.1");
  });
});

describe("ADR 0001, SEC-4a: nginx's settings", () => {
  const conf = readFileSync(aws("nginx", "spot.conf"), "utf8").replace(/#.*$/gm, "");
  const block = (start: string) => {
    const at = conf.indexOf(start);
    let depth = 0;
    for (let i = conf.indexOf("{", at); i < conf.length; i++) {
      if (conf[i] === "{") depth++;
      if (conf[i] === "}" && --depth === 0) return conf.slice(at, i);
    }
    throw new Error(`no ${start}`);
  };

  it("the scouters' streams are unbuffered, and outlast the heartbeat many times over", () => {
    const stream = block("location /api/scouter/stream");
    expect(stream).toMatch(/proxy_buffering off;/);
    expect(stream).toMatch(/proxy_read_timeout 1h;/);
    expect(60 * 60 * 1000).toBeGreaterThan(10 * HEARTBEAT_MS);
  });

  it("every location sends X-Forwarded-Proto: none sets headers of its own, which would drop it", () => {
    expect(conf).toMatch(/proxy_set_header X-Forwarded-Proto \$scheme;/);
    for (const m of conf.matchAll(/location [^{]+\{[^}]*\}/g))
      expect(m[0]).not.toMatch(/proxy_set_header/);
  });

  it("HTTP goes to HTTPS, except certbot's renewal checks; a full batch of records fits", () => {
    const http = conf.slice(conf.lastIndexOf("server {", conf.indexOf("listen 80;")));
    const port80 = block(http.slice(0, http.indexOf("{") + 1));
    expect(port80).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
    expect(port80).toMatch(/\.well-known\/acme-challenge/);
    expect(conf).toMatch(/client_max_body_size 5m;/);
    expect(MAX_SUBMISSIONS).toBe(50); // 5 MB is 100 KB a record
  });
});

describe("the recipe's scripts", () => {
  for (const script of ["update.sh", "rollback.sh"])
    it(`${script} is executable, valid bash, and stops at the first error`, () => {
      accessSync(aws(script), constants.X_OK);
      expect(spawnSync("bash", ["-n", aws(script)]).status).toBe(0);
      expect(readFileSync(aws(script), "utf8")).toMatch(/^set -euo pipefail$/m);
    });

  it("the recipe's commands exist", () => {
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
    expect(scripts["deploy:check"]).toBe("tsx scripts/check-deploy.ts");
    const readme = readFileSync(aws("README.md"), "utf8");
    for (const m of readme.matchAll(/\/srv\/spot\/repo\/(deploy\/aws\/[\w./-]+)/g))
      accessSync(join(root, m[1]));
  });
});

// --------------------------------------------------------------------- stopping cleanly

describe("DV-15, #412: stopping saves the registry first", () => {
  const signals = () => {
    const proc = new EventEmitter();
    const exits: number[] = [];
    const lines: string[] = [];
    installShutdown({
      process: proc as unknown as NodeJS.Process,
      exit: (code) => void exits.push(code),
      log: (line) => void lines.push(line),
      timeoutMs: 50,
    });
    return { proc, exits, lines };
  };
  const settle = () => new Promise((r) => setTimeout(r, 80));

  afterAll(() => {
    delete store.__spotRuntime;
  });

  it("on SIGINT or SIGTERM, saves, then exits; a second signal changes nothing", async () => {
    const order: string[] = [];
    store.__spotRuntime = Promise.resolve({ shutdown: async () => void order.push("saved") });
    const { proc, exits, lines } = signals();
    proc.emit("SIGINT");
    proc.emit("SIGTERM");
    await settle();
    expect(order).toEqual(["saved"]);
    expect(exits).toEqual([0]);
    expect(lines.at(-1)).toBe("SPOT stopped: the registry is saved.");
  });

  it("exits anyway when the database does not answer in time, saying so", async () => {
    store.__spotRuntime = Promise.resolve({ shutdown: () => new Promise<void>(() => undefined) });
    const { proc, exits, lines } = signals();
    proc.emit("SIGTERM");
    await settle();
    expect(exits).toEqual([0]);
    expect(lines.at(-1)).toMatch(/gave up after 0.05 s/);
  });

  it("with no registry yet, has nothing to save", async () => {
    delete store.__spotRuntime;
    expect(await stopRuntime(10)).toMatch(/nothing to save/);
  });
});

// --------------------------------------------------------------------- the health check

describe("#412: the health check", () => {
  let mongo: TestMongo;
  const saved = { ...process.env };

  beforeAll(async () => {
    mongo = await startMongo("spot-deploy-test");
  }, 180_000);

  afterAll(async () => {
    delete store.__spotMongo;
    process.env = saved;
    await mongo?.stop();
  });

  const answer = async () => {
    const r = await health.GET();
    return { status: r.status, body: (await r.json()) as Record<string, unknown>, r };
  };

  it("says when MONGODB_URI is not set, or the database does not answer", async () => {
    delete store.__spotMongo;
    delete process.env.MONGODB_URI;
    expect(await answer()).toMatchObject({
      status: 503,
      body: { status: "unavailable", database: "not set" },
    });
    delete store.__spotMongo;
    process.env.MONGODB_URI = "mongodb://127.0.0.1:9/spot?serverSelectionTimeoutMS=200";
    expect(await answer()).toMatchObject({ status: 503, body: { database: "unreachable" } });
  });

  it("answers ok when the database answers, and is never cached", async () => {
    delete store.__spotMongo;
    process.env.MONGODB_URI = mongo.uri;
    const { status, body, r } = await answer();
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", database: "ok", build: null }); // no build under tests
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

// --------------------------------------------------------------------- npm run deploy:check

const BASE = "https://spot.test";

/** A server in this process: the real routes behind a proxy that behaves as `proxy` says. */
function server(
  proxy: { buffered?: boolean; cutAfterMs?: number; redirect?: boolean; secure?: boolean } = {},
) {
  const fetchImpl = (async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (url.protocol === "http:")
      return proxy.redirect === false
        ? new Response("SPOT", { status: 200 })
        : new Response(null, { status: 301, headers: { location: `${BASE}${url.pathname}` } });
    // nginx tells SPOT how the request came: over HTTPS, unless the setting is missing.
    const request = new NextRequest(url, {
      method: init.method,
      body: init.body,
      headers: {
        ...(init.headers as Record<string, string>),
        "x-forwarded-proto": proxy.secure === false ? "http" : "https",
      },
    });
    if (url.pathname === "/api/health") return health.GET();
    if (url.pathname === "/api/admin/session")
      return init.method === "DELETE" ? session.DELETE(request) : session.POST(request);
    if (url.pathname !== "/api/scouter/stream/check") return new Response(null, { status: 404 });
    const response = streamCheck.GET(request);
    if (!proxy.buffered && !proxy.cutAfterMs) return response;
    // A buffering proxy passes the stream on only once it ends; a short timeout cuts it.
    const reader = response.body!.getReader();
    return new Response(
      new ReadableStream({
        async start(controller) {
          const started = Date.now();
          const chunks: Uint8Array[] = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done || (proxy.cutAfterMs && Date.now() - started > proxy.cutAfterMs)) break;
            if (proxy.buffered) chunks.push(value);
            else controller.enqueue(value);
          }
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      }),
      { headers: response.headers },
    );
  }) as typeof fetch;
  return fetchImpl;
}

describe("ADR 0001, SEC-4a: npm run deploy:check", () => {
  const saved = { ...process.env };
  const options = { streamSeconds: 1.5, streamEvery: 1, firstWithinMs: 400 };

  beforeAll(() => {
    process.env.SPOT_ADMIN_PASSWORD = "correct horse battery";
  });
  afterAll(() => {
    process.env = saved;
  });

  const results = async (proxy: Parameters<typeof server>[0], password?: string) =>
    Object.fromEntries(
      (await checkServer(BASE, { ...options, fetch: server(proxy), password })).map((r) => [
        r.name.split(" ")[0] === "a" ? "stream" : r.name.split(" ")[0],
        r,
      ]),
    );

  it("passes a server set up as the recipe says", async () => {
    const r = await results({}, "correct horse battery");
    expect(r.HTTP).toMatchObject({ ok: true, detail: `301 to ${BASE}/` });
    expect(r.stream).toMatchObject({ ok: true });
    expect(r.the).toMatchObject({ ok: true, detail: "Secure" });
  }, 10_000);

  it("fails a proxy that buffers streams, or cuts them off, saying what to change", async () => {
    expect((await results({ buffered: true })).stream).toMatchObject({
      ok: false,
      detail: expect.stringMatching(/buffers streams.*proxy_buffering off/),
    });
    expect((await results({ cutAfterMs: 600 })).stream).toMatchObject({
      ok: false,
      detail: expect.stringMatching(/cut off.*proxy_read_timeout/),
    });
  }, 10_000);

  it("fails no redirect to HTTPS and a cookie sent over HTTP; skips the cookie without a password", async () => {
    const r = await results({ redirect: false, secure: false }, "correct horse battery");
    expect(r.HTTP).toMatchObject({ ok: false });
    expect(r.the).toMatchObject({ ok: false, detail: expect.stringMatching(/X-Forwarded-Proto/) });
    expect((await results({})).the).toMatchObject({ ok: null });
  }, 10_000);
});
