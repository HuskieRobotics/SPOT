/**
 * Who may write (ADR 0004, #352): the admin password and its session cookie (SEC-4), the one
 * place admin requests are checked (SEC-5, #120), and the event code (SEC-2, SEC-3, SEC-9).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest, NextResponse } from "next/server";
// Next 16.3 still exports this under its middleware name (its docs say unstable_doesProxyMatch).
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { ADMIN_API, ADMIN_PAGES, needsAdmin } from "@/auth/admin-paths";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  createAdminSession,
  isAdminPassword,
  verifyAdminSession,
} from "@/auth/admin-session";
import {
  checkEventCode,
  EVENT_CODE_LENGTH,
  eventCodeRefusal,
  newEventCode,
  normalizeEventCode,
} from "@/auth/event-code";
import { config as proxyConfig, proxy } from "@/proxy";
import * as sessionRoute from "@/app/api/admin/session/route";
import * as eventsRoute from "@/app/api/admin/events/route";
import * as eventCodeRoute from "@/app/api/admin/events/[id]/event-code/route";
import { createEvent, getEvent, publicEvents } from "@/db/events";
import type { SpotEvent } from "@/data/types";
import { startMongo, type TestMongo } from "../support/mongo";

const PASSWORD = "correct horse battery staple";
const ORIGIN = "http://localhost:3000";

const saved = { ...process.env };

function setPassword(p: string | undefined) {
  if (p === undefined) delete process.env.SPOT_ADMIN_PASSWORD;
  else process.env.SPOT_ADMIN_PASSWORD = p;
}

const passed = (r: Response) => r.headers.get("x-middleware-next") === "1";

function request(path: string, init: { method?: string; cookie?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", `${ADMIN_COOKIE}=${init.cookie}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

// `never` accepts each route's own params type; `call` supplies the params the test names.
type Handler = (req: NextRequest, ctx: never) => Promise<Response>;

/** Run a request the way Next does: proxy first, and the handler only if proxy lets it through. */
async function call(
  handler: Handler,
  path: string,
  init: Parameters<typeof request>[1] & { params?: Record<string, string> } = {},
): Promise<Response> {
  const gate = await proxy(request(path, init));
  if (!passed(gate)) return gate;
  return handler(request(path, init), { params: Promise.resolve(init.params ?? {}) } as never);
}

beforeAll(() => setPassword(PASSWORD));
afterAll(() => {
  process.env = saved;
});

describe("SEC-4, SEC-4a: the admin session", () => {
  it("accepts the password and nothing else", async () => {
    expect(await isAdminPassword(PASSWORD)).toBe(true);
    for (const guess of ["", "correct horse", `${PASSWORD} `, PASSWORD.toUpperCase(), 42, null])
      expect(await isAdminPassword(guess)).toBe(false);
  });

  it("refuses every password when none is set", async () => {
    setPassword(undefined);
    expect(await isAdminPassword("")).toBe(false);
    expect(await verifyAdminSession("x.y")).toBe(false);
    await expect(createAdminSession()).rejects.toThrow(/SPOT_ADMIN_PASSWORD/);
    setPassword(PASSWORD);
  });

  it("a session verifies until it expires, and does not contain the password", async () => {
    const now = 1_800_000_000_000;
    const cookie = await createAdminSession(now);
    expect(cookie).not.toContain(PASSWORD);
    expect(Buffer.from(cookie.split(".")[0], "base64url").toString()).not.toContain(PASSWORD);
    expect(await verifyAdminSession(cookie, now + 1)).toBe(true);
    expect(await verifyAdminSession(cookie, now + ADMIN_SESSION_MS - 1)).toBe(true);
    expect(await verifyAdminSession(cookie, now + ADMIN_SESSION_MS)).toBe(false);
  });

  it("SEC-9: a session lasts well beyond a multi-day event", () => {
    expect(ADMIN_SESSION_MS).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000);
  });

  it("refuses a changed or forged session", async () => {
    const cookie = await createAdminSession();
    const [body, sig] = cookie.split(".");
    const longer = Buffer.from(
      JSON.stringify({ v: 1, iat: 0, exp: Number.MAX_SAFE_INTEGER }),
    ).toString("base64url");
    for (const bad of [`${longer}.${sig}`, `${body}.${sig.slice(1)}A`, body, `${cookie}.x`, ""])
      expect(await verifyAdminSession(bad)).toBe(false);
  });

  it("changing the password signs every admin out", async () => {
    const cookie = await createAdminSession();
    setPassword("a new password");
    expect(await verifyAdminSession(cookie)).toBe(false);
    setPassword(PASSWORD);
    expect(await verifyAdminSession(cookie)).toBe(true);
  });
});

describe("SEC-5, SEC-5a, #120: admin requests are checked in one place", () => {
  it("knows which paths are admin paths", () => {
    for (const p of ["/admin", "/admin/", "/admin/schedule", "/api/admin/events", "/api/admin/x/y"])
      expect(needsAdmin(p), p).toBe(true);
    for (const p of [
      "/",
      "/administrator",
      "/api/administer",
      "/admin/sign-in",
      "/api/admin/session",
      "/scouting-preview",
    ])
      expect(needsAdmin(p), p).toBe(false);
  });

  it("sends a page without a session to sign-in, and back afterwards", async () => {
    const r = await proxy(request("/admin/schedule?match=3"));
    expect(r.status).toBe(307);
    const to = new URL(r.headers.get("location")!);
    expect(to.pathname).toBe("/admin/sign-in");
    expect(to.searchParams.get("next")).toBe("/admin/schedule?match=3");
  });

  it("answers a route without a session with 401, not a redirect", async () => {
    const r = await proxy(request("/api/admin/events"));
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "admin-sign-in" });
  });

  it("lets a signed-in admin through, and everyone through to what is not admin", async () => {
    const cookie = await createAdminSession();
    expect(passed(await proxy(request("/admin", { cookie })))).toBe(true);
    expect(passed(await proxy(request("/api/admin/events", { cookie })))).toBe(true);
    expect(passed(await proxy(request("/admin/sign-in")))).toBe(true);
    expect(passed(await proxy(request("/api/admin/session", { method: "POST" })))).toBe(true);
  });

  // Every page and route under the admin folders, as URL paths ([id] → a sample value).
  const appDir = join(process.cwd(), "src", "app");
  const entries: { path: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(page|route)\.tsx?$/.test(name)) {
        const segments = relative(appDir, dir)
          .split(sep)
          .filter((s) => s !== "" && !/^\(.*\)$/.test(s))
          .map((s) => (/^\[.*\]$/.test(s) ? "0123456789abcdef01234567" : s));
        entries.push({ path: `/${segments.join("/")}`, file: relative(process.cwd(), full) });
      }
    }
  };
  walk(appDir);
  const admin = entries.filter(
    (e) => e.path.startsWith(`${ADMIN_PAGES}`) || e.path.startsWith(`${ADMIN_API}`),
  );

  it("every page and route under /admin and /api/admin is matched and guarded", async () => {
    expect(admin.length).toBeGreaterThanOrEqual(5);
    for (const { path, file } of admin) {
      expect(doesProxyMatch({ config: proxyConfig, url: path }), file).toBe(true);
      if (needsAdmin(path)) expect(passed(await proxy(request(path))), file).toBe(false);
    }
  });

  it("admin actions are route handlers, never Server Functions, which proxy does not see", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) scan(full);
        else if (/\.tsx?$/.test(name) && /^\s*["']use server["']/m.test(readFileSync(full, "utf8")))
          offenders.push(relative(process.cwd(), full));
      }
    };
    scan(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("SEC-2, SEC-3, SEC-3a, SEC-9: the event code", () => {
  it("is six characters that cannot be misread", () => {
    const codes = new Set(Array.from({ length: 500 }, () => newEventCode()));
    expect(codes.size).toBeGreaterThan(495);
    for (const c of codes) {
      expect(c).toHaveLength(EVENT_CODE_LENGTH);
      expect(c).toMatch(/^[A-Z2-9]+$/);
      expect(c).not.toMatch(/[01OILUV]/);
    }
  });

  it("accepts what a scouter types, in any case and with spaces or dashes", () => {
    expect(normalizeEventCode(" k7q-f2m ")).toBe("K7QF2M");
    expect(checkEventCode({ eventCode: "K7QF2M" }, "k7q f2m")).toEqual({ ok: true });
  });

  it("refuses a missing or wrong code, and an event with none, with a message to act on", async () => {
    const event = { eventCode: "K7QF2M" };
    for (const [supplied, reason] of [
      [undefined, "missing"],
      ["  ", "missing"],
      ["K7QF2N", "wrong"],
    ] as const) {
      const check = checkEventCode(event, supplied);
      expect(check).toMatchObject({ ok: false, reason });
      if (check.ok) continue;
      const r = eventCodeRefusal(check);
      expect(r.status).toBe(403);
      const body = await r.text();
      expect(body).not.toContain("K7QF2M");
      expect(JSON.parse(body).message).toMatch(/admin/);
    }
    expect(checkEventCode({ eventCode: null }, "K7QF2M")).toMatchObject({ reason: "no-code" });
  });

  it("SEC-9: a wrong code tells the scouter their matches are kept", () => {
    const check = checkEventCode({ eventCode: "K7QF2M" }, "AAAAAA");
    expect(!check.ok && check.message).toMatch(/kept on this device/);
  });
});

describe("admin routes (T-5)", () => {
  let mongo: TestMongo;
  let cookie: string;
  const bodies: string[] = [];
  const record = async (r: Response) => {
    bodies.push(await r.clone().text());
    return r;
  };

  beforeAll(async () => {
    mongo = await startMongo("spot-admin-test");
    process.env.MONGODB_URI = mongo.uri;
    cookie = await createAdminSession();
  }, 180_000);

  afterAll(async () => {
    await mongo?.stop();
  });

  it("signs in with the password, and only with it", async () => {
    const wrong = await record(
      await sessionRoute.POST(
        request("/api/admin/session", { method: "POST", body: { password: "nope" } }),
      ),
    );
    expect(wrong.status).toBe(401);
    const right = await record(
      await sessionRoute.POST(
        request("/api/admin/session", { method: "POST", body: { password: PASSWORD } }),
      ),
    );
    expect(right.status).toBe(204);
    const set = (right as NextResponse).cookies.get(ADMIN_COOKIE);
    expect(set?.httpOnly).toBe(true);
    expect(set?.sameSite).toBe("strict");
    expect(set?.secure).toBe(false); // http://localhost
    expect(await verifyAdminSession(set?.value)).toBe(true);
    const status = await record(
      await sessionRoute.GET(request("/api/admin/session", { cookie: set!.value })),
    );
    expect(await status.json()).toEqual({ signedIn: true, configured: true });
  });

  it("marks the cookie secure when the request came over HTTPS through a proxy", async () => {
    const req = new NextRequest(`${ORIGIN}/api/admin/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    const r = (await sessionRoute.POST(req)) as NextResponse;
    expect(r.cookies.get(ADMIN_COOKIE)?.secure).toBe(true);
  });

  it("says so when the server has no admin password", async () => {
    setPassword(undefined);
    const r = await record(
      await sessionRoute.POST(
        request("/api/admin/session", { method: "POST", body: { password: "" } }),
      ),
    );
    setPassword(PASSWORD);
    expect(r.status).toBe(503);
    expect((await r.json()).message).toMatch(/SPOT_ADMIN_PASSWORD/);
  });

  it("sign-out clears the cookie", async () => {
    const r = (await sessionRoute.DELETE(
      request("/api/admin/session", { method: "DELETE", cookie }),
    )) as NextResponse;
    expect(r.status).toBe(204);
    expect(r.cookies.get(ADMIN_COOKIE)?.value).toBe("");
  });

  it("each admin route refuses without a session and works with one", async () => {
    const create = { method: "POST", body: { tbaKey: "2026mnwi", label: "official" } };
    expect((await record(await call(eventsRoute.POST, "/api/admin/events", create))).status).toBe(
      401,
    );
    const created = await call(eventsRoute.POST, "/api/admin/events", { ...create, cookie });
    expect(created.status).toBe(201);
    const event = (await created.json()) as SpotEvent;
    expect(event.code).toBe("2026mnwi_official");
    expect(event.eventCode).toMatch(/^[A-Z2-9]{6}$/);

    expect((await record(await call(eventsRoute.GET, "/api/admin/events"))).status).toBe(401);
    const list = await call(eventsRoute.GET, "/api/admin/events", { cookie });
    expect(((await list.json()) as SpotEvent[]).map((e) => e.eventCode)).toEqual([event.eventCode]);

    const rotatePath = `/api/admin/events/${event._id}/event-code`;
    const params = { id: event._id };
    expect(
      (await record(await call(eventCodeRoute.POST, rotatePath, { method: "POST", params })))
        .status,
    ).toBe(401);
    const rotated = await call(eventCodeRoute.POST, rotatePath, { method: "POST", params, cookie });
    const { eventCode } = (await rotated.json()) as { eventCode: string };
    expect(eventCode).not.toBe(event.eventCode);
    expect((await getEvent(mongo.db, event._id))?.eventCode).toBe(eventCode);
  });

  it("SEC-2: a submission with the old code is refused once the code is rotated", async () => {
    const event = await createEvent(mongo.db, { tbaKey: "2025ilch", label: "official" });
    const old = event.eventCode!;
    expect(checkEventCode(event, old)).toEqual({ ok: true });
    await call(eventCodeRoute.POST, `/api/admin/events/${event._id}/event-code`, {
      method: "POST",
      params: { id: event._id },
      cookie,
    });
    const now = (await getEvent(mongo.db, event._id))!;
    expect(checkEventCode(now, old)).toMatchObject({ ok: false, reason: "wrong" });
    expect(checkEventCode(now, now.eventCode)).toEqual({ ok: true });
  });

  it("refuses what is not a TBA key or a label, and an event that exists, with messages", async () => {
    for (const body of [
      { tbaKey: "mnwi", label: "official" },
      { tbaKey: "2026mnwi", label: "has space" },
    ]) {
      const r = await call(eventsRoute.POST, "/api/admin/events", { method: "POST", body, cookie });
      expect(r.status).toBe(400);
      expect((await r.json()).message).toBeTruthy();
    }
    const again = await call(eventsRoute.POST, "/api/admin/events", {
      method: "POST",
      body: { tbaKey: "2026mnwi", label: "official" },
      cookie,
    });
    expect(again.status).toBe(409);
  });

  it("rotating an event that does not exist is 404", async () => {
    for (const id of ["0123456789abcdef01234567", "not-an-id"]) {
      const r = await call(eventCodeRoute.POST, `/api/admin/events/${id}/event-code`, {
        method: "POST",
        params: { id },
        cookie,
      });
      expect(r.status).toBe(404);
    }
  });

  it("SEC-3, SEC-4: no open response contains the password or an event code", async () => {
    const codes = (await mongo.db.collection<SpotEvent>("events").find().toArray()).map(
      (e) => e.eventCode!,
    );
    expect(codes.length).toBeGreaterThan(0);
    for (const e of await publicEvents(mongo.db)) expect(Object.hasOwn(e, "eventCode")).toBe(false);
    expect(bodies.length).toBeGreaterThan(5);
    for (const body of bodies) {
      expect(body).not.toContain(PASSWORD);
      for (const code of codes) expect(body).not.toContain(code);
    }
  });
});
