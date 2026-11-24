/**
 * The admin page's routes (#357): the settings (the active event, start rules, field
 * orientation), names on the scouter cards, and correcting a name on the roster. Admin routes go
 * through `src/proxy.ts` first, as in the running app.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { Db } from "mongodb";
import { ADMIN_COOKIE, createAdminSession } from "@/auth/admin-session";
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import { proxy } from "@/proxy";
import * as settingsRoute from "@/app/api/admin/settings/route";
import * as scoutersRoute from "@/app/api/admin/scouters/route";
import * as registryRoute from "@/app/api/admin/registry/route";
import * as rosterRoute from "@/app/api/scouter/roster/route";
import { createEvent } from "@/db/events";
import { updateSchedule } from "@/db/schedules";
import { addScouter, getScouter } from "@/db/scouters";
import { forgetCachedSettings, updateSettings } from "@/db/settings";
import type { ScheduledMatch, SpotEvent } from "@/data/types";
import { getRuntime, resetRuntime, type AdminSnapshot } from "@/sessions/runtime";
import { startMongo, type TestMongo } from "../support/mongo";
import { StreamReader } from "../support/sse";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "admin page test password";

const matches: ScheduledMatch[] = [1, 2].map((n) => ({
  level: "qual",
  number: n,
  key: `2026mnwi_qm${n}`,
  red: [`${n}01`, `${n}02`, `${n}03`],
  blue: [`${n}04`, `${n}05`, `${n}06`],
}));

let mongo: TestMongo;
let db: Db;
let event: SpotEvent;
let cookie = "";
const saved = { ...process.env };

type Handler = (request: Request) => Promise<Response>;

/** Call an admin route through the proxy, as the browser would. */
async function admin<T = Record<string, unknown>>(
  path: string,
  handlers: { GET?: () => Promise<Response>; POST?: Handler },
  body?: object,
  { signedIn = true } = {},
): Promise<{ status: number; json: T }> {
  const init = {
    method: body ? "POST" : "GET",
    headers: {
      ...(signedIn ? { cookie: `${ADMIN_COOKIE}=${cookie}` } : {}),
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  const gate = await proxy(new NextRequest(`${ORIGIN}${path}`, init));
  if (gate.headers.get("x-middleware-next") !== "1")
    return { status: gate.status, json: (await gate.json()) as T };
  const r = body
    ? await handlers.POST!(new Request(`${ORIGIN}${path}`, init))
    : await handlers.GET!();
  return { status: r.status, json: (await r.json()) as T };
}

const settings = (body?: object) => admin("/api/admin/settings", settingsRoute, body);
const scouters = (body?: object) => admin("/api/admin/scouters", scoutersRoute, body);
const registry = (body?: object) =>
  admin<{ snapshot: AdminSnapshot | null }>("/api/admin/registry", registryRoute, body);

/** Sign a device in and open its stream, as the scouting client does. */
async function device(scouterId: string, name: string) {
  const runtime = await getRuntime();
  await runtime.signIn(scouterId, `device-${scouterId}-0001`, event.joinCode, name);
  const response = await runtime.openStream(
    scouterId,
    `device-${scouterId}-0001`,
    new AbortController().signal,
  );
  return new StreamReader(response.body!);
}

beforeAll(async () => {
  mongo = await startMongo("spot-admin-page-test");
  db = mongo.db;
  process.env.MONGODB_URI = mongo.uri;
  process.env.SPOT_ADMIN_PASSWORD = PASSWORD;
  cookie = await createAdminSession();
  event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
  await updateSchedule(db, event._id, { manual: matches });
  await updateSettings(db, { activeEventId: event._id });
  resetRuntime();
}, 180_000);

afterAll(async () => {
  resetRuntime();
  await mongo?.stop();
  process.env = saved;
});

describe("SEC-5a: the admin page's routes", () => {
  it("refuse a request without the admin session", async () => {
    expect(
      (await admin("/api/admin/settings", settingsRoute, {}, { signedIn: false })).status,
    ).toBe(401);
    expect(
      (
        await admin(
          "/api/admin/scouters",
          scoutersRoute,
          { action: "rename", scouterId: "1", name: "Someone Else" },
          { signedIn: false },
        )
      ).status,
    ).toBe(401);
  });
});

describe("DV-12a, DV-12b: the active event", () => {
  it("shows the active event with its join code", async () => {
    const { status, json } = await settings();
    expect(status).toBe(200);
    expect(json).toMatchObject({
      settings: { activeEventId: event._id },
      event: { code: "2026mnwi_official", joinCode: event.joinCode },
    });
  });

  it("is chosen by its code; every device signs in again to the new one", async () => {
    const stream = await device("600001", "Morgan Diaz");
    expect((await stream.next())?.event).toBe("state");
    expect((await stream.next())?.event).toBe("settings");
    const other = await createEvent(db, { tbaKey: "2026wila", label: "practice" });

    const { status, json } = await settings({ activeEvent: "2026wila_practice" });
    expect(status).toBe(200);
    expect(json).toMatchObject({
      settings: { activeEventId: other._id },
      event: { code: "2026wila_practice" },
    });
    expect(await stream.next()).toMatchObject({ event: "signed-out" });
    expect((await registry()).json.snapshot).toMatchObject({ eventId: other._id, entries: [] });

    expect((await settings({ activeEvent: null })).json).toMatchObject({ event: null });
    expect((await registry()).json.snapshot).toBeNull();
    expect((await settings({ activeEvent: "2026mnwi_official" })).status).toBe(200);
  });

  it("refuses an event code that does not exist", async () => {
    const { status, json } = await settings({ activeEvent: "2026xxxx_nope" });
    expect(status).toBe(404);
    expect(json.message).toMatch(/2026xxxx_nope/);
  });
});

describe("RT-12a, RT-14b: start rules", () => {
  it("are changed by an admin and used at once", async () => {
    const { json } = await settings({ startRules: { quorum: 2 } });
    expect(json).toMatchObject({
      settings: { startRules: { quorum: 2, startOnFirstScouter: false } },
    });
    expect((await registry()).json.snapshot?.rules).toEqual({
      quorum: 2,
      startOnFirstScouter: false,
    });
    await settings({ startRules: { startOnFirstScouter: true } });
    expect((await registry()).json.snapshot?.rules).toEqual({
      quorum: 2,
      startOnFirstScouter: true,
    });
    await settings({ startRules: { quorum: 6, startOnFirstScouter: false } });
  });

  it("refuse a quorum outside 1 to 6", async () => {
    for (const quorum of [0, 7, 2.5, "3"]) {
      const { status, json } = await settings({ startRules: { quorum } });
      expect(status).toBe(400);
      expect(json.message).toMatch(/1 to 6/);
    }
  });
});

describe("A-19, SC-28: the field orientation", () => {
  it("reaches every open stream when it changes, and a new stream gets it after its state", async () => {
    const stream = await device("600002", "Riley Chen");
    await stream.drain();
    expect((await settings({ fieldFlipped: true })).json).toMatchObject({
      settings: { fieldFlipped: true },
    });
    expect(await stream.next()).toMatchObject({
      event: "settings",
      data: { kind: "settings", fieldFlipped: true },
    });

    forgetCachedSettings();
    const later = await device("600003", "Sam Okafor");
    expect((await later.next())?.event).toBe("state");
    expect(await later.next()).toMatchObject({ data: { fieldFlipped: true } });

    await settings({ fieldFlipped: false });
    expect((await settings({ fieldFlipped: "yes" })).status).toBe(400);
  });
});

describe("AD-4: scouter cards", () => {
  it("name each scouter from the roster", async () => {
    const { json } = await registry();
    expect(json.snapshot?.entries.find((e) => e.scouterId === "600002")).toMatchObject({
      name: "Riley Chen",
      connected: true,
    });
  });
});

describe("SEC-6a: correcting a name on the roster", () => {
  it("lists the roster for admins, by name", async () => {
    const { json } = await scouters();
    const names = (json.scouters as { name: string }[]).map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(json.scouters).toContainEqual({ id: "600002", name: "Riley Chen" });
  });

  it("renames the scouter, and devices and cards see the new name", async () => {
    await addScouter(db, { id: "600010", name: "Jamie Lnnister" });
    const { status, json } = await scouters({
      action: "rename",
      scouterId: "600010",
      name: "  Jamie   Lannister ",
    });
    expect(status).toBe(200);
    expect(json).toEqual({ scouter: { id: "600010", name: "Jamie Lannister" } });
    expect((await getScouter(db, "600010"))?.displayName).toBe("Jamie Lannister");

    const roster = await rosterRoute.GET(
      new Request(`${ORIGIN}/api/scouter/roster`, {
        headers: { [JOIN_CODE_HEADER]: event.joinCode! },
      }),
    );
    expect((await roster.json()).scouters).toContainEqual({
      id: "600010",
      name: "Jamie Lannister",
    });

    await device("600010", "ignored");
    const { json: cards } = await registry();
    expect(cards.snapshot?.entries.find((e) => e.scouterId === "600010")?.name).toBe(
      "Jamie Lannister",
    );
  });

  it("refuses a student ID not on the roster, a name too short, and an unknown action", async () => {
    expect(
      (await scouters({ action: "rename", scouterId: "699999", name: "Nobody Here" })).status,
    ).toBe(404);
    expect((await scouters({ action: "rename", scouterId: "600010", name: "J" })).status).toBe(400);
    expect((await scouters({ action: "merge", scouterId: "600010" })).status).toBe(400);
  });
});
