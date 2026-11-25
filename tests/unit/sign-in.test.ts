/**
 * Signing in by student ID (#356): the device's memory (RT-26), the sign-in flow on a device
 * (SEC-6, SEC-7, OF-1), and the roster and sign-in routes (SEC-2, SEC-8) against the in-memory
 * MongoDB.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import * as rosterRoute from "@/app/api/scouter/roster/route";
import * as scheduleRoute from "@/app/api/scouter/schedule/route";
import * as signInRoute from "@/app/api/scouter/sign-in/route";
import { createEvent } from "@/db/events";
import { updateSchedule } from "@/db/schedules";
import { getScouter, saveScouter } from "@/db/scouters";
import { forgetCachedSettings, updateSettings } from "@/db/settings";
import { DEFAULT_TENANT } from "@/data/types";
import type { Reply, ScouterApi } from "@/scouter/api";
import { DeviceStore, joinCodeFromUrl, memoryStore, type RosterEntry } from "@/scouter/device";
import type { ScheduleRow } from "@/scouter/match";
import {
  refreshRoster,
  refreshSchedule,
  sendPendingScouters,
  signIn,
  signOut,
} from "@/scouter/sign-in";
import { resetRuntime } from "@/sessions/runtime";
import { startMongo, type TestMongo } from "../support/mongo";

const OFFLINE = { ok: false, offline: true } as const;

/** A server held in memory, which can be cut off. */
class FakeServer implements ScouterApi {
  online = true;
  joinCode = "K7QF2M";
  scouters: RosterEntry[] = [
    { id: "100001", name: "Alex Rivera" },
    { id: "100002", name: "Zoe Park" },
  ];
  signedIn: string[] = [];
  eventId = "0123456789abcdef01234567";
  matches: ScheduleRow[] = [
    { level: "qual", number: 1, red: ["101", "102", "103"], blue: ["104", "105", "106"] },
  ];

  private refuse(code: string | null): Reply<never> | null {
    if (!this.online) return OFFLINE;
    if (code !== this.joinCode)
      return { ok: false, offline: false, status: 403, error: "join-code", message: "wrong code" };
    return null;
  }

  async roster(joinCode: string) {
    return this.refuse(joinCode) ?? { ok: true as const, value: { scouters: [...this.scouters] } };
  }

  async schedule(joinCode: string) {
    return (
      this.refuse(joinCode) ?? {
        ok: true as const,
        value: { eventId: this.eventId, matches: structuredClone(this.matches) },
      }
    );
  }

  async addScouters(joinCode: string, scouters: RosterEntry[]) {
    const no = this.refuse(joinCode);
    if (no) return no;
    const results = scouters.map((s) => {
      const existing = this.scouters.find((r) => r.id === s.id);
      if (!existing) this.scouters.push(s);
      return existing && existing.name !== s.name
        ? {
            id: s.id,
            status: "conflict",
            name: existing.name,
            message: `taken by ${existing.name}`,
          }
        : { id: s.id, status: existing ? "exists" : "created", name: s.name };
    });
    return { ok: true as const, value: { results } };
  }

  async signIn(body: { scouterId: string; deviceId: string; joinCode: string; name?: string }) {
    const no = this.refuse(body.joinCode);
    if (no) return no;
    let s = this.scouters.find((r) => r.id === body.scouterId);
    if (!s && body.name) this.scouters.push((s = { id: body.scouterId, name: body.name }));
    if (!s)
      return {
        ok: false as const,
        offline: false as const,
        status: 404,
        error: "not-on-roster",
        message: "not on the roster",
      };
    this.signedIn.push(s.id);
    return { ok: true as const, value: { view: {} as never, name: s.name } };
  }

  async signOut(scouterId: string) {
    if (!this.online) return OFFLINE;
    this.signedIn = this.signedIn.filter((id) => id !== scouterId);
    return { ok: true as const, value: {} };
  }

  async submit() {
    return OFFLINE;
  }

  async act() {
    return OFFLINE;
  }
}

describe("RT-26: what a device remembers", () => {
  it("keeps its device id, join code and signed-in scouter across a reload", () => {
    const storage = memoryStore();
    const before = new DeviceStore(storage);
    const id = before.deviceId();
    before.setJoinCode(" k7q-f2m ");
    before.setSignedIn({ scouterId: "100001", name: "Alex Rivera", at: 1 });
    const after = new DeviceStore(storage); // a reload reads the same storage
    expect(after.deviceId()).toBe(id);
    expect(after.joinCode()).toBe("K7QF2M");
    expect(after.signedIn()?.name).toBe("Alex Rivera");
    after.signOut();
    expect(new DeviceStore(storage).signedIn()).toBeNull();
    expect(new DeviceStore(storage).joinCode()).toBe("K7QF2M"); // sign-out keeps the code
  });

  it("SEC-3b: reads a join code from the admin page's QR link", () => {
    expect(joinCodeFromUrl("?join=k7qf2m")).toBe("K7QF2M");
    expect(joinCodeFromUrl("?join=")).toBeNull();
    expect(joinCodeFromUrl("")).toBeNull();
  });

  it("works on when storage is refused, forgetting at the next reload", () => {
    const refused = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const store = new DeviceStore(refused);
    expect(() => store.setJoinCode("K7QF2M")).not.toThrow();
  });
});

describe("SEC-6, SEC-7, SEC-7a: signing in on a device", () => {
  const setup = () => {
    const server = new FakeServer();
    const store = new DeviceStore(memoryStore());
    store.setJoinCode("K7QF2M");
    return { server, store };
  };

  it("SEC-7: picks a name from the roster and signs in to the registry", async () => {
    const { server, store } = setup();
    expect(await refreshRoster(store, server)).toEqual({ ok: true });
    expect(store.pickList().map((s) => s.name)).toEqual(["Alex Rivera", "Zoe Park"]);
    const outcome = await signIn(store, server, { id: "100002", name: "Zoe Park" });
    expect(outcome).toMatchObject({ status: "online", name: "Zoe Park" });
    expect(server.signedIn).toEqual(["100002"]);
    expect(store.signedIn()?.scouterId).toBe("100002");
  });

  it("OF-1, SEC-7: signs in offline from the roster the device last read", async () => {
    const { server, store } = setup();
    await refreshRoster(store, server);
    server.online = false;
    expect(await refreshRoster(store, server)).toEqual({ ok: false, offline: true });
    expect(store.pickList()).toHaveLength(2);
    expect(await signIn(store, server, { id: "100001", name: "Alex Rivera" })).toEqual({
      status: "offline",
      name: "Alex Rivera",
    });
    expect(store.signedIn()).toMatchObject({ name: "Alex Rivera", offline: true });
  });

  it("OF-1, SC-28: keeps the event and its schedule for a match typed with no connection", async () => {
    const { server, store } = setup();
    expect(await refreshSchedule(store, server, 5)).toBe(true);
    expect(store.schedule()).toEqual({
      eventId: server.eventId,
      matches: server.matches,
      readAt: 5,
    });
    expect(store.settings().eventId).toBe(server.eventId);
    // Offline, or refused: what the device has stays.
    server.online = false;
    server.matches = [];
    expect(await refreshSchedule(store, server, 9)).toBe(false);
    server.online = true;
    store.setJoinCode("WRONG1");
    expect(await refreshSchedule(store, server, 9)).toBe(false);
    expect(store.schedule()?.matches).toHaveLength(1);
  });

  it("SEC-7: a scouter added offline is kept on the device and created with the next sync", async () => {
    const { server, store } = setup();
    server.online = false;
    await signIn(store, server, { id: "100009", name: "Sam New", added: true });
    expect(store.pending()).toEqual([{ id: "100009", name: "Sam New" }]);
    expect(store.pickList().find((s) => s.id === "100009")).toMatchObject({ pending: true });
    server.online = true;
    expect(await sendPendingScouters(store, server)).toEqual([]);
    expect(store.pending()).toEqual([]);
    expect(server.scouters.some((s) => s.id === "100009")).toBe(true);
  });

  it("SEC-7: a scouter added online signs in and is created at once", async () => {
    const { server, store } = setup();
    expect(
      await signIn(store, server, { id: "100010", name: "Ana New", added: true }),
    ).toMatchObject({
      status: "online",
    });
    expect(store.pending()).toEqual([]);
  });

  it("an added student ID already on the roster under another name is reported, not renamed", async () => {
    const { server, store } = setup();
    store.addPending({ id: "100001", name: "Alexis Rivers" });
    expect(await sendPendingScouters(store, server)).toEqual([{ message: "taken by Alex Rivera" }]);
    expect(server.scouters.find((s) => s.id === "100001")?.name).toBe("Alex Rivera");
  });

  it("SEC-2: a wrong join code sends the scouter back to enter it", async () => {
    const { server, store } = setup();
    store.setJoinCode("AAAAAA");
    expect(await refreshRoster(store, server)).toMatchObject({ ok: false, error: "join-code" });
    expect(await signIn(store, server, { id: "100001", name: "Alex Rivera" })).toMatchObject({
      status: "join-code",
    });
    expect(store.signedIn()).toBeNull();
  });

  it("a student ID not on the roster is refused with the server's message", async () => {
    const { server, store } = setup();
    expect(await signIn(store, server, { id: "999999", name: "Nobody" })).toEqual({
      status: "refused",
      message: "not on the roster",
    });
  });

  it("ADR 0006: sign-out ends the session on the device and in the registry", async () => {
    const { server, store } = setup();
    await signIn(store, server, { id: "100001", name: "Alex Rivera" });
    await signOut(store, server);
    expect(store.signedIn()).toBeNull();
    expect(server.signedIn).toEqual([]);
  });
});

describe("the roster and sign-in routes (T-5)", () => {
  const ORIGIN = "http://localhost:3000";
  const saved = { ...process.env };
  let mongo: TestMongo;
  let db: Db;
  let code = "";

  const roster = (joinCode: string | null, body?: object) =>
    (body ? rosterRoute.POST : rosterRoute.GET)(
      new Request(`${ORIGIN}/api/scouter/roster`, {
        method: body ? "POST" : "GET",
        headers: joinCode ? { [JOIN_CODE_HEADER]: joinCode } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const schedule = (joinCode: string | null) =>
    scheduleRoute.GET(
      new Request(`${ORIGIN}/api/scouter/schedule`, {
        headers: joinCode ? { [JOIN_CODE_HEADER]: joinCode } : {},
      }),
    );
  let eventId = "";
  const signInAs = (body: object) =>
    signInRoute.POST(
      new Request(`${ORIGIN}/api/scouter/sign-in`, {
        method: "POST",
        body: JSON.stringify({ deviceId: "device-sign-in-0001", joinCode: code, ...body }),
      }),
    );

  beforeAll(async () => {
    mongo = await startMongo("spot-sign-in-test");
    db = mongo.db;
    process.env.MONGODB_URI = mongo.uri;
    const event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
    code = event.joinCode!;
    eventId = event._id;
    await updateSchedule(db, event._id, {
      manual: [
        {
          level: "qual",
          number: 1,
          key: "manual_qm1",
          red: ["101", "102", "103"],
          blue: ["104", "3061B", null],
          locked: true,
        },
      ],
    });
    await updateSettings(db, { activeEventId: event._id });
    forgetCachedSettings();
    const base = { tenantId: DEFAULT_TENANT, aliases: [], createdAt: 1 };
    await saveScouter(db, { ...base, _id: "100002", displayName: "Zoe Park", legacy: false });
    await saveScouter(db, { ...base, _id: "100001", displayName: "Alex Rivera", legacy: false });
    await saveScouter(db, {
      ...base,
      _id: "FatemaMerchant",
      displayName: "Fatema Merchant",
      legacy: true,
    });
    resetRuntime();
  }, 180_000);

  afterAll(async () => {
    resetRuntime();
    await mongo?.stop();
    process.env = saved;
  });

  it("SEC-8, SEC-8a: the roster is refused without the join code", async () => {
    for (const joinCode of [null, "WRONG1"]) {
      const r = await roster(joinCode);
      expect(r.status).toBe(403);
      expect(await r.text()).not.toMatch(/Rivera|Park/);
    }
  });

  it("SEC-7: with the join code, the roster is student IDs and names by name, without v5's records", async () => {
    const r = await roster(code.toLowerCase());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      scouters: [
        { id: "100001", name: "Alex Rivera" },
        { id: "100002", name: "Zoe Park" },
      ],
    });
  });

  it("OF-1, SC-28: the schedule route sends the active event and who is on which alliance, with the join code", async () => {
    for (const joinCode of [null, "WRONG1"]) expect((await schedule(joinCode)).status).toBe(403);
    const r = await schedule(code);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      eventId,
      matches: [
        { level: "qual", number: 1, red: ["101", "102", "103"], blue: ["104", "3061B", null] },
      ],
    });
  });

  it("SEC-7: adds scouters a device added offline, and keeps a name already on the roster", async () => {
    const r = await roster(code, {
      scouters: [
        { id: "100003", name: "  Sam   New " },
        { id: "100001", name: "alex rivera" },
        { id: "100002", name: "Zed Park" },
      ],
    });
    expect((await r.json()).results).toEqual([
      { id: "100003", status: "created", name: "Sam New" },
      { id: "100001", status: "exists", name: "Alex Rivera" },
      {
        id: "100002",
        status: "conflict",
        name: "Zoe Park",
        message: expect.stringMatching(/already on the roster as Zoe Park/),
      },
    ]);
    expect((await getScouter(db, "100002"))?.displayName).toBe("Zoe Park");
  });

  it("SEC-6: sign-in needs a student ID on the roster, or a name to add it", async () => {
    const unknown = await signInAs({ scouterId: "100099" });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).message).toMatch(/not on the list/);
    const added = await signInAs({ scouterId: "100099", name: "Kim Lee" });
    expect(added.status).toBe(200);
    expect((await added.json()).name).toBe("Kim Lee");
    expect((await getScouter(db, "100099"))?.displayName).toBe("Kim Lee");
  });

  it("SEC-6: signing in answers with the name on the roster", async () => {
    const r = await signInAs({ scouterId: "100002", deviceId: "device-sign-in-0002" });
    expect(await r.json()).toMatchObject({ name: "Zoe Park", view: { status: "waiting" } });
  });

  it("refuses a name too short to be a full name", async () => {
    const r = await signInAs({ scouterId: "100098", name: "K" });
    expect(r.status).toBe(400);
  });
});
