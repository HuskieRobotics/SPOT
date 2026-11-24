/**
 * T-6 over HTTP (#354): simulated devices sign in, open their server-sent event streams, and act
 * through the route handlers, against the in-memory MongoDB. Admin routes go through
 * `src/proxy.ts` first, as in the running app.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { Db } from "mongodb";
import { ADMIN_COOKIE, createAdminSession } from "@/auth/admin-session";
import { proxy } from "@/proxy";
import * as signInRoute from "@/app/api/scouter/sign-in/route";
import * as actionRoute from "@/app/api/scouter/action/route";
import * as streamRoute from "@/app/api/scouter/stream/route";
import * as registryRoute from "@/app/api/admin/registry/route";
import { createEvent } from "@/db/events";
import { updateSchedule } from "@/db/schedules";
import { sessionCollection } from "@/db/sessions";
import { updateSettings } from "@/db/settings";
import type { ScheduledMatch, SpotEvent } from "@/data/types";
import { resetRuntime, Runtime, type AdminSnapshot } from "@/sessions/runtime";
import type { DeviceMessage } from "@/sessions/registry";
import { startMongo, type TestMongo } from "../support/mongo";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "transport test password";

const matches: ScheduledMatch[] = [1, 2].map((n) => ({
  number: n,
  key: `2026mnwi_qm${n}`,
  red: [`${n}01`, `${n}02`, `${n}03`],
  blue: [`${n}04`, `${n}05`, `${n}06`],
}));

interface SseEvent {
  event: string;
  data: DeviceMessage;
}

/** Reads a server-sent event stream as it arrives. */
class StreamReader {
  private buffer = "";
  readonly raw: string[] = [];
  private readonly events: SseEvent[] = [];
  done = false;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();

  constructor(body: ReadableStream<Uint8Array>) {
    this.reader = body.getReader();
  }

  private async pull(): Promise<boolean> {
    if (this.done) return false;
    const { value, done } = await this.reader.read();
    if (done) {
      this.done = true;
      return false;
    }
    const text = this.decoder.decode(value);
    this.raw.push(text);
    this.buffer += text;
    let i: number;
    while ((i = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) this.events.push({ event, data: JSON.parse(data) });
    }
    return true;
  }

  /** The next event, waiting for it to arrive; null once the stream has ended. */
  async next(timeoutMs = 2000): Promise<SseEvent | null> {
    const deadline = Date.now() + timeoutMs;
    while (this.events.length === 0) {
      if (Date.now() > deadline) throw new Error("no event arrived");
      if (!(await Promise.race([this.pull(), sleep(timeoutMs).then(() => true)]))) return null;
    }
    return this.events.shift()!;
  }

  /** Every event up to now, without waiting for more than a moment. */
  async drain(): Promise<SseEvent[]> {
    const out: SseEvent[] = [];
    for (;;) {
      try {
        const e = await this.next(100);
        if (!e) return out;
        out.push(e);
      } catch {
        return out;
      }
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let joinCode = "";

class Device {
  readonly deviceId: string;
  stream: StreamReader | null = null;
  private abort: AbortController | null = null;

  constructor(
    readonly scouterId: string,
    deviceId?: string,
  ) {
    this.deviceId = deviceId ?? `device-${scouterId}-0001`;
  }

  async signIn(code = joinCode) {
    return signInRoute.POST(
      new Request(`${ORIGIN}/api/scouter/sign-in`, {
        method: "POST",
        body: JSON.stringify({
          scouterId: this.scouterId,
          deviceId: this.deviceId,
          joinCode: code,
        }),
      }),
    );
  }

  async open(): Promise<Response> {
    this.abort = new AbortController();
    const response = await streamRoute.GET(
      new Request(
        `${ORIGIN}/api/scouter/stream?scouter=${this.scouterId}&device=${this.deviceId}`,
        { signal: this.abort.signal },
      ),
    );
    this.stream = response.body && response.ok ? new StreamReader(response.body) : null;
    return response;
  }

  /** The network drops: the server sees the request aborted. */
  drop() {
    this.abort?.abort();
    this.stream = null;
  }

  async act(action: string) {
    return actionRoute.POST(
      new Request(`${ORIGIN}/api/scouter/action`, {
        method: "POST",
        body: JSON.stringify({ scouterId: this.scouterId, deviceId: this.deviceId, action }),
      }),
    );
  }

  async kinds(): Promise<string[]> {
    return (await this.stream!.drain()).map((e) => e.event);
  }
}

let cookie = "";

async function admin(body?: object): Promise<{ status: number; snapshot: AdminSnapshot | null }> {
  const init = {
    method: body ? "POST" : "GET",
    headers: { cookie: `${ADMIN_COOKIE}=${cookie}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  };
  const gate = await proxy(new NextRequest(`${ORIGIN}/api/admin/registry`, init));
  expect(gate.headers.get("x-middleware-next")).toBe("1");
  const request = new Request(`${ORIGIN}/api/admin/registry`, init);
  const r = body ? await registryRoute.POST(request) : await registryRoute.GET();
  const json = (await r.json()) as { snapshot?: AdminSnapshot | null; message?: string };
  return { status: r.status, snapshot: json.snapshot ?? null };
}

let mongo: TestMongo;
let db: Db;
let event: SpotEvent;
const saved = { ...process.env };

beforeAll(async () => {
  mongo = await startMongo("spot-transport-test");
  db = mongo.db;
  process.env.MONGODB_URI = mongo.uri;
  process.env.SPOT_ADMIN_PASSWORD = PASSWORD;
  cookie = await createAdminSession();
  event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
  joinCode = event.joinCode!;
  await updateSchedule(db, event._id, { manual: matches });
  await updateSettings(db, { activeEventId: event._id });
  resetRuntime();
}, 180_000);

afterAll(async () => {
  resetRuntime();
  await mongo?.stop();
  process.env = saved;
});

describe("T-6: devices over HTTP", () => {
  const devices = Array.from({ length: 6 }, (_, i) => new Device(`20000${i + 1}`));

  it("SEC-2: sign-in needs the join code, with a message to act on", async () => {
    const r = await devices[0].signIn("WRONG1");
    expect(r.status).toBe(403);
    expect((await r.json()).message).toMatch(/admin/);
  });

  it("RT-1, RT-5: a device signs in and its stream starts with its state", async () => {
    const r = await devices[0].signIn();
    expect(r.status).toBe(200);
    expect((await r.json()).view).toMatchObject({ status: "waiting", team: null });
    const s = await devices[0].open();
    expect(s.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(s.headers.get("x-accel-buffering")).toBe("no");
    expect(await devices[0].stream!.next()).toMatchObject({ event: "state" });
  });

  it("RT-16, RT-12a: the admin chooses a match, six devices are assigned, and the quorum sends them in", async () => {
    for (const d of devices.slice(1)) {
      expect((await d.signIn()).status).toBe(200);
      await d.open();
    }
    for (const d of devices) await d.stream!.drain();
    const { status, snapshot } = await admin({ action: "set-match", matchNumber: 1 });
    expect(status).toBe(200);
    expect(snapshot?.match?.number).toBe(1);
    expect(snapshot?.entries.map((e) => e.team)).toEqual([
      "101",
      "102",
      "103",
      "104",
      "105",
      "106",
    ]);
    for (const d of devices) expect(await d.kinds()).toEqual(["assigned", "enter-match"]);
  });

  it("RT-1: start and finish go through the action route", async () => {
    expect((await devices[0].act("accept")).status).toBe(200);
    const start = await devices[0].act("start");
    expect((await start.json()).view).toMatchObject({ status: "scouting", team: "101" });
    const finish = await devices[0].act("finish");
    expect((await finish.json()).view).toMatchObject({ status: "complete" });
    const bad = await devices[0].act("dance");
    expect(bad.status).toBe(400);
  });

  it("RT-29, T-6a: a dropped stream marks the scouter disconnected at once, and they keep the robot", async () => {
    devices[1].drop();
    await sleep(20);
    const { snapshot } = await admin();
    expect(snapshot?.entries.find((e) => e.scouterId === devices[1].scouterId)).toMatchObject({
      connected: false,
      team: "102",
    });
  });

  it("RT-27, T-6a: reconnecting resumes the same robot, with its state and no new assignment", async () => {
    await devices[1].open();
    const first = await devices[1].stream!.next();
    expect(first).toMatchObject({ event: "state", data: { view: { team: "102", entered: true } } });
    expect(await devices[1].kinds()).toEqual([]);
  });

  it("a reload opens the new stream before the old one closes, and the scouter stays connected", async () => {
    const old = devices[2];
    const reload = new Device(old.scouterId, old.deviceId);
    await reload.open();
    old.drop();
    await sleep(20);
    const { snapshot } = await admin();
    expect(snapshot?.entries.find((e) => e.scouterId === old.scouterId)?.connected).toBe(true);
    devices[2] = reload;
  });

  it("signing in on another device moves the session there and signs the old one out", async () => {
    const old = devices[3];
    const phone = new Device(old.scouterId, `device-${old.scouterId}-0002`);
    expect((await phone.signIn()).status).toBe(200);
    expect(await old.stream!.next()).toMatchObject({ event: "signed-out" });
    expect(await old.stream!.next()).toBeNull(); // closed
    const refused = await old.act("start");
    expect(refused.status).toBe(401);
    expect((await refused.json()).error).toBe("other-device");
    expect((await old.open()).status).toBe(401);
    await phone.open();
    expect(await phone.stream!.next()).toMatchObject({ data: { view: { team: "104" } } });
    devices[3] = phone;
  });

  it("docs/spec/15 condition 3: a removed scouter's stream is signed out, and reconnecting is refused", async () => {
    const d = devices[4];
    await admin({ action: "remove", scouterId: d.scouterId });
    expect((await d.stream!.drain()).map((e) => e.event)).toEqual(["signed-out"]);
    const again = await d.open();
    expect(again.status).toBe(401);
    expect((await again.json()).error).toBe("not-signed-in");
    expect((await d.act("ready")).status).toBe(401);
  });

  it("RT-31: an admin releases a robot, and a newcomer gets it", async () => {
    const newcomer = new Device("200099");
    await newcomer.signIn();
    await newcomer.open();
    await newcomer.stream!.drain();
    // 105 was freed by the removal above, so the newcomer has it already.
    let { snapshot } = await admin();
    expect(snapshot?.entries.find((e) => e.scouterId === "200099")?.team).toBe("105");
    await admin({ action: "release", scouterId: devices[5].scouterId, to: undefined });
    ({ snapshot } = await admin());
    expect(snapshot?.entries.find((e) => e.scouterId === devices[5].scouterId)?.team).toBeNull();
    expect(await devices[5].kinds()).toEqual(["unassigned"]);
  });

  it("refuses what the registry refuses, and a match the schedule lacks, with messages", async () => {
    const r1 = await admin({ action: "release", scouterId: "nobody" });
    expect(r1.status).toBe(409);
    const r2 = await admin({ action: "set-match", matchNumber: 9 });
    expect(r2.status).toBe(404);
    const r3 = await admin({ action: "dance" });
    expect(r3.status).toBe(400);
  });

  it("DV-15: the registry is saved behind, without connection state", async () => {
    const { getRuntime } = await import("@/sessions/runtime");
    await (await getRuntime()).flush();
    const saved = await sessionCollection(db).find({ eventId: event._id }).toArray();
    expect(saved.map((s) => s.scouterId).sort()).toEqual(
      [...devices.map((d) => d.scouterId).filter((id) => id !== "200005"), "200099"].sort(),
    );
    for (const s of saved) expect(Object.keys(s)).not.toContain("connected");
  });
});

describe("the runtime, directly", () => {
  it("heartbeats an idle stream (docs/spec/15, condition 1)", async () => {
    const runtime = new Runtime({ db, heartbeatMs: 10 });
    const d = new Device("300001");
    await runtime.signIn(d.scouterId, d.deviceId, joinCode);
    const abort = new AbortController();
    const r = await runtime.openStream(d.scouterId, d.deviceId, abort.signal);
    const reader = new StreamReader(r.body!);
    await reader.next();
    await sleep(40);
    await reader.drain();
    expect(reader.raw.join("")).toMatch(/^retry: \d+/);
    expect(reader.raw.join("")).toContain(": ping\n\n");
    abort.abort();
    await runtime.flush();
  });

  it("DV-15: after a restart, scouters are disconnected and keep their robots", async () => {
    const before = new Runtime({ db });
    for (const id of ["400001", "400002"]) await before.signIn(id, `device-${id}-0001`, joinCode);
    await before.flush();
    const held = (await before.snapshot())!.entries.filter((e) => e.team !== null);
    const after = new Runtime({ db });
    const snapshot = (await after.snapshot())!;
    expect(snapshot.match?.number).toBe(1);
    for (const e of snapshot.entries) expect(e.connected).toBe(false);
    for (const h of held)
      expect(snapshot.entries.find((e) => e.scouterId === h.scouterId)?.team).toBe(h.team);
  });

  it("changing the active event signs every device out and starts an empty registry", async () => {
    let t = 1_000_000;
    const runtime = new Runtime({ db, now: () => t });
    const d = new Device("500001");
    await runtime.signIn(d.scouterId, d.deviceId, joinCode);
    const r = await runtime.openStream(d.scouterId, d.deviceId, new AbortController().signal);
    const reader = new StreamReader(r.body!);
    await reader.next();
    const other = await createEvent(db, { tbaKey: "2026wila", label: "official" });
    await updateSettings(db, { activeEventId: other._id }, { now: t });
    t += 10_000;
    const snapshot = (await runtime.snapshot())!;
    expect(snapshot.eventId).toBe(other._id);
    expect(snapshot.entries).toEqual([]);
    expect(await reader.next()).toMatchObject({ event: "signed-out" });
    await updateSettings(db, { activeEventId: null }, { now: t });
    t += 10_000;
    expect(await runtime.snapshot()).toBeNull();
    await expect(runtime.signIn("1", "device-00000001", joinCode)).rejects.toMatchObject({
      status: 409,
      code: "no-active-event",
    });
    await runtime.flush();
    await updateSettings(db, { activeEventId: event._id }, { now: t });
  });
});
