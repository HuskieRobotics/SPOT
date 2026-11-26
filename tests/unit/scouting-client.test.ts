/**
 * The scouting client's rules (#359), without a browser: reading the registry's stream and
 * reconnecting (RT-5 to RT-8, OF-7, F-17), when a match opens, closes or is kept (RT-6, RT-27,
 * RT-28, BL-54), a match typed with no connection (OF-1, SC-10), what a device remembers across
 * a reload (RT-26, F-23), and the configuration route (CS-17, OF-8).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getConfig } from "@/app/api/config/match-scouting/route";
import type { MatchScoutingConfig } from "@/config/types";
import type { ScouterApi } from "@/scouter/api";
import { Connection, parseSse, type ConnectionStatus } from "@/scouter/connection";
import { DeviceStore, memoryStore } from "@/scouter/device";
import {
  allianceIn,
  assignmentPrompt,
  beginManualMatch,
  beginMatch,
  checkManualMatch,
  closesUnstarted,
  finishMatch,
  keyOf,
  reconcile,
  registryHas,
  shouldEnter,
  toSubmission,
  type ActiveMatch,
} from "@/scouter/match";
import { advance, press, recordedActions, setSpeed } from "@/scouting/session";
import type { DeviceMessage, DeviceView } from "@/sessions/registry";

const config: MatchScoutingConfig = JSON.parse(
  readFileSync(join(process.cwd(), "config", "match-scouting.json"), "utf8"),
);

const view = (over: Partial<DeviceView> = {}): DeviceView => ({
  status: "waiting",
  matchLevel: "qual",
  matchNumber: 12,
  team: "3061",
  alliance: "blue",
  accepted: false,
  entered: false,
  ...over,
});

function begin(v: DeviceView = view({ entered: true }), now = 1_000): ActiveMatch {
  return beginMatch(v, {
    scouterId: "700001",
    eventId: "69a5ac455b39b683634e795e",
    config,
    configVersion: "abc123",
    nonce: "k3j9x0a2mq7c",
    now,
  });
}

const context = { config, settings: { alliance: "blue" as const, fieldFlipped: false } };
const startButton = () => {
  const layer = config.layout.layers.find((l) => l.id === config.layout.initialLayer)!;
  return { layer: layer.id, button: layer.buttons.find((b) => b.type === "match-control")!.id };
};

describe("SC-1, RT-5: reading the registry's event stream", () => {
  it("splits messages, keeps an unfinished one, and drops heartbeat comments", () => {
    const { messages, rest } = parseSse(
      'event: state\ndata: {"a":1}\n\n: heartbeat\n\nevent: assigned\r\ndata: {"b"\r\ndata: :2}\r\n\r\nevent: unassi',
    );
    expect(messages).toEqual([
      { event: "state", data: '{"a":1}' },
      { event: "assigned", data: '{"b"\n:2}' },
    ]);
    expect(rest).toBe("event: unassi");
  });
});

// --------------------------------------------------------------------- the connection

class FakeStream {
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  readonly response: Response;
  constructor() {
    const body = new ReadableStream<Uint8Array>({ start: (c) => (this.controller = c) });
    this.response = new Response(body, { headers: { "content-type": "text/event-stream" } });
  }
  send(message: DeviceMessage) {
    this.controller.enqueue(
      new TextEncoder().encode(`event: ${message.kind}\ndata: ${JSON.stringify(message)}\n\n`),
    );
  }
  end() {
    this.controller.close();
  }
}

/** A server whose stream route answers each request with the next reply queued. */
function harness(replies: (() => Response | Promise<Response>)[], signedInOffline = false) {
  const store = new DeviceStore(memoryStore());
  store.setJoinCode("TSTCDE");
  store.setSignedIn({
    scouterId: "700001",
    name: "Alex Rivera",
    at: 1,
    ...(signedInOffline ? { offline: true as const } : {}),
  });
  const statuses: ConnectionStatus[] = [];
  const messages: DeviceMessage[] = [];
  const signedOut: string[] = [];
  const signIns: string[] = [];
  const api = {
    signIn: async (body: { scouterId: string }) => {
      signIns.push(body.scouterId);
      return { ok: true as const, value: { view: view(), name: "Alex Rivera" } };
    },
  } as unknown as ScouterApi;
  let requests = 0;
  const fetch = (async () => {
    const reply = replies[requests++];
    if (!reply) return new Promise<Response>(() => {}); // the last attempt hangs: the test is over
    return reply();
  }) as unknown as typeof globalThis.fetch;
  const connection = new Connection({
    store,
    api,
    fetch,
    backoff: { firstMs: 1, maxMs: 4 },
    refusedMs: 1,
    staleMs: 200,
    handlers: {
      status: (s) => {
        if (statuses.at(-1) !== s) statuses.push(s);
      },
      message: (m) => messages.push(m),
      signedOut: (reason) => signedOut.push(reason),
    },
  });
  const done = connection.run();
  return {
    store,
    statuses,
    messages,
    signedOut,
    signIns,
    connection,
    done,
    requests: () => requests,
  };
}

const refused =
  (status: number, error: string, message = error) =>
  () =>
    Response.json({ error, message }, { status });
const offline = () => Promise.reject(new TypeError("Failed to fetch"));
const until = async (check: () => boolean, ms = 2_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 2));
  }
};

describe("OF-7, F-17: the connection's status, and reconnecting", () => {
  it("says Not connected until it first connects, then Disconnected, without a message per attempt", async () => {
    const first = new FakeStream();
    const second = new FakeStream();
    const h = harness([offline, offline, () => first.response, offline, () => second.response]);
    await until(() => h.statuses.includes("connected"));
    first.send({ kind: "state", view: view() });
    await until(() => h.messages.length === 1);
    first.end();
    await until(() => h.statuses.at(-1) === "connected" && h.requests() === 5);
    expect(h.statuses).toEqual(["not-connected", "connected", "disconnected", "connected"]);
    expect(h.signedOut).toEqual([]);
    h.connection.stop();
  });

  it("reopens a stream that has gone silent, as after a Wi-Fi change", async () => {
    const silent = new FakeStream();
    const next = new FakeStream();
    const h = harness([() => silent.response, () => next.response]);
    await until(() => h.requests() === 2, 2_000);
    next.send({ kind: "state", view: view() });
    await until(() => h.messages.length === 1);
    h.connection.stop();
  });

  it("RT-26: signs in again when the registry no longer knows the scouter, as after an offline sign-in", async () => {
    const stream = new FakeStream();
    const h = harness([refused(401, "not-signed-in"), () => stream.response]);
    await until(() => h.statuses.includes("connected"));
    expect(h.signIns).toEqual(["700001"]);
    expect(h.messages[0]).toMatchObject({ kind: "state" }); // the sign-in's view
    h.connection.stop();
  });

  it("OF-1: a sign-in made offline takes over a session the registry still binds to an older device", async () => {
    const stream = new FakeStream();
    const h = harness([refused(401, "other-device"), () => stream.response], true);
    await until(() => h.statuses.includes("connected"));
    expect(h.signIns).toEqual(["700001"]);
    expect(h.signedOut).toEqual([]);
    // Now the registry has heard of it: another device taking the session signs this one out.
    expect(h.store.signedIn()).not.toHaveProperty("offline");
    h.connection.stop();
  });

  it("signs the device out when another device took the session, or the registry says so", async () => {
    const other = harness([refused(401, "other-device", "You signed in on another device.")]);
    await other.done;
    expect(other.signedOut).toEqual(["You signed in on another device."]);

    const stream = new FakeStream();
    const removed = harness([() => stream.response]);
    await until(() => removed.statuses.includes("connected"));
    stream.send({ kind: "signed-out" });
    await removed.done;
    expect(removed.signedOut).toHaveLength(1);
    expect(removed.messages).toEqual([]);
  });

  it("waits, still signed in, while no event is active", async () => {
    const stream = new FakeStream();
    const h = harness([refused(409, "no-active-event"), () => stream.response]);
    await until(() => h.statuses.includes("connected"));
    expect(h.statuses[0]).toBe("not-connected");
    expect(h.signedOut).toEqual([]);
    h.connection.stop();
  });
});

// --------------------------------------------------------------------- the match

describe("RT-6, RT-27: when the match screen opens", () => {
  it("opens when the registry sends the scouter in, and not for a match already finished", () => {
    expect(shouldEnter(view(), null, [])).toBe(false); // assigned, not yet sent in
    expect(shouldEnter(view({ entered: true }), null, [])).toBe(true);
    expect(shouldEnter(view({ entered: true, status: "scouting" }), null, [])).toBe(true);
    const done = keyOf(finishMatch(begin(), 5_000));
    expect(shouldEnter(view({ entered: true, status: "scouting" }), null, [done])).toBe(false);
    expect(shouldEnter(view({ entered: true, status: "complete" }), null, [])).toBe(false);
  });

  it("never replaces a started match; a match not started gives way to the new robot", () => {
    const waiting = begin();
    const running = { ...waiting, state: press(waiting.state, context, startButton(), 2_000) };
    const qual13 = view({ entered: true, matchNumber: 13, team: "254" });
    expect(shouldEnter(qual13, waiting, [])).toBe(true);
    expect(shouldEnter(qual13, running, [])).toBe(false);
    expect(shouldEnter(view({ entered: true }), waiting, [])).toBe(false); // already open
  });

  it("SC-13, RT-27: asks once per assignment, never for one pressed OK on here or there", () => {
    expect(assignmentPrompt(view(), null)).toBe("You have been assigned team 3061 in Qual 12.");
    expect(assignmentPrompt(view({ matchLevel: "playoff", matchNumber: 15 }), null)).toBe(
      "You have been assigned team 3061 in Final 2.",
    );
    expect(assignmentPrompt(view({ accepted: true }), null)).toBeNull();
    expect(assignmentPrompt(view(), keyOf(begin()))).toBeNull(); // OK pressed offline
    expect(assignmentPrompt(view({ team: null }), null)).toBeNull();
  });
});

describe("RT-27, RT-28: catching the registry up after a lost connection", () => {
  it("sends the OK, the start and the finish it missed, and nothing it already has", () => {
    const m = begin();
    const running = { ...m, state: press(m.state, context, startButton(), 2_000) };
    const done = keyOf(finishMatch(running, 9_000));
    expect(reconcile(view(), null, [], keyOf(m))).toEqual(["accept"]);
    expect(reconcile(view({ accepted: true, entered: true }), running, [], null)).toEqual([
      "start",
    ]);
    expect(reconcile(view({ status: "scouting", accepted: true }), null, [done], null)).toEqual([
      "finish",
      "ready",
    ]);
    expect(reconcile(view({ status: "complete", accepted: true }), null, [done], null)).toEqual([
      "ready",
    ]);
    expect(reconcile(view({ status: "scouting", accepted: true }), running, [], null)).toEqual([]);
    expect(reconcile(view({ team: null }), null, [done], null)).toEqual([]);
  });
});

describe("OF-1, SC-10, SC-11: a match typed with no connection", () => {
  const args = {
    scouterId: "700003",
    eventId: "69a5ac455b39b683634e795e",
    config,
    configVersion: "abc123",
    nonce: "m4nual0000ab",
    now: 5_000,
  };
  const schedule = [
    { level: "qual" as const, number: 1, red: ["101", "102", "103"], blue: ["104", "3061B", null] },
  ];

  it("takes a match number and a team, a B team included, and says what to fix", () => {
    expect(checkManualMatch({ level: "qual", number: " 12 ", team: "3061b" })).toEqual({
      ok: true,
      key: { level: "qual", number: 12, team: "3061B" },
    });
    expect(checkManualMatch({ level: "playoff", number: "16", team: "frc254" })).toMatchObject({
      ok: true,
      key: { team: "254" },
    });
    for (const number of ["", "0", "1.5", "x", "1000"])
      expect(checkManualMatch({ level: "qual", number, team: "3061" })).toMatchObject({
        ok: false,
        message: "Type the match number the field shows.",
      });
    expect(checkManualMatch({ level: "playoff", number: "17", team: "3061" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/1 to 16/),
    });
    for (const team of ["", "0", "3061BB", "B3061"])
      expect(checkManualMatch({ level: "qual", number: "1", team })).toMatchObject({
        ok: false,
        message: expect.stringMatching(/3061B for a team's second robot/),
      });
  });

  it("SC-28: the alliance comes from the schedule the device keeps, when it has the team", () => {
    expect(allianceIn(schedule, { level: "qual", number: 1, team: "102" })).toBe("red");
    expect(allianceIn(schedule, { level: "qual", number: 1, team: "3061B" })).toBe("blue");
    expect(allianceIn(schedule, { level: "qual", number: 1, team: "3061" })).toBeNull();
    expect(allianceIn(schedule, { level: "qual", number: 2, team: "101" })).toBeNull();
    expect(allianceIn(schedule, { level: "playoff", number: 1, team: "101" })).toBeNull();
  });

  it("scouts with the full grid, and its record is filed like any other", () => {
    const key = { level: "qual" as const, number: 1, team: "3061B" };
    const m = beginManualMatch(key, "red", args);
    expect(m).toMatchObject({ ...key, alliance: "red", manual: true, scouterId: "700003" });
    expect(m.state).toEqual(begin().state);
    expect(toSubmission(finishMatch(m, 9_000))).toMatchObject({
      team: "3061B",
      matchNumber: 1,
      coverage: "full",
    });
  });

  it("the registry closes it before the start only for another robot, and hears only of its own", () => {
    const key = { level: "qual" as const, number: 12, team: "3061" };
    const typed = beginManualMatch(key, "blue", args);
    const other = beginManualMatch({ ...key, team: "254" }, "blue", args);
    const unassigned = view({ team: null, matchLevel: null, matchNumber: null, alliance: null });
    expect(closesUnstarted(unassigned, typed)).toBe(false);
    expect(closesUnstarted(null, typed)).toBe(false);
    expect(closesUnstarted(view(), typed)).toBe(false);
    expect(closesUnstarted(view(), other)).toBe(true);
    // A match the registry sent closes when the registry takes it back (BL-54).
    expect(closesUnstarted(unassigned, begin())).toBe(true);
    expect(closesUnstarted(view(), begin())).toBe(false);
    expect(registryHas(view(), typed)).toBe(true);
    expect(registryHas(view(), other)).toBe(false);
    expect(registryHas(unassigned, typed)).toBe(false);
    // Not opened again once finished, and the registry is caught up when it gave that robot.
    expect(shouldEnter(view({ entered: true }), null, [keyOf(typed)])).toBe(false);
  });
});

describe("RT-26, F-23: a reload mid-match resumes the same presses and clock", () => {
  it("keeps the match, its configuration, and the matches finished and on their way", () => {
    const storage = memoryStore();
    const store = new DeviceStore(storage);
    const cached = { version: "abc123", config };
    let m = begin();
    let state = press(m.state, context, startButton(), 10_000);
    state = setSpeed(state, context, 11_000, 2); // BL-230: twice as fast from here
    m = { ...m, state };
    store.setMatch(m, cached);
    const eleven = finishMatch(begin(view({ entered: true, matchNumber: 11 })), 9_000);
    store.addFinishing(eleven, cached);
    store.addDone(keyOf(eleven));

    const after = new DeviceStore(storage); // the reload
    const resumed = after.match()!;
    expect(resumed.match).toEqual(m);
    expect(resumed.config.version).toBe("abc123");
    // The clock is read from real time, so it stands where it would have without the reload.
    const t = 21_000;
    expect(advance(resumed.match.state, context, t)).toEqual(advance(state, context, t));
    const elapsed = config.timing.totalMs - advance(resumed.match.state, context, t).ts;
    expect(elapsed).toBe(1_000 + 2 * 10_000); // 1 s at 1×, then 10 s at 2×
    expect(after.finishing().map((f) => f.record.number)).toEqual([11]);
    expect(after.done()).toEqual([keyOf(eleven)]);
  });

  it("drops a saved match whose configuration is missing, and reset forgets everything", () => {
    const storage = memoryStore();
    const store = new DeviceStore(storage);
    store.setMatch(begin()); // no configuration saved with it
    expect(store.match()).toBeNull();
    store.setJoinCode("TSTCDE");
    store.addFinishing(finishMatch(begin(), 2), { version: "abc123", config });
    store.reset();
    expect(store.joinCode()).toBeNull();
    expect(store.finishing()).toEqual([]);
  });

  it("a finished record keeps what was recorded, as analysis receives it (DV-1)", () => {
    let m = begin();
    m = { ...m, state: press(m.state, context, startButton(), 2_000) };
    const done = finishMatch(m, 9_000, "released");
    expect(done).toMatchObject({
      level: "qual",
      number: 12,
      team: "3061",
      alliance: "blue",
      scouterId: "700001",
      nonce: "k3j9x0a2mq7c",
      submittedAt: 9_000,
      cutShort: "released",
    });
    expect(done.actions).toEqual(recordedActions(m.state));
  });
});

describe("CS-17, OF-8: the configuration route", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/config/match-scouting", { headers });

  it("sends the active match-scouting.json with its version as the ETag, never cached unchecked", async () => {
    const response = getConfig(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    const body = (await response.json()) as { version: string; config: MatchScoutingConfig };
    expect(body.config).toEqual(config);
    expect(response.headers.get("etag")).toBe(`"${body.version}"`);

    const again = getConfig(request({ "if-none-match": `W/"${body.version}"` }));
    expect(again.status).toBe(304);
    expect(getConfig(request({ "if-none-match": '"stale"' })).status).toBe(200);
  });
});
