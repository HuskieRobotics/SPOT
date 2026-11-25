/**
 * Submission and sync (#360): the rules that settle a robot's records (RT-14a, RT-34 to RT-36),
 * the route that stores them (T-5; SEC-2, SEC-3a, DV-18), and the device's sync (T-6a; RT-21,
 * RT-28, OF-2).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { POST as submitRoute } from "@/app/api/scouter/performances/route";
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import type { MatchScoutingConfig } from "@/config/types";
import { createEvent } from "@/db/events";
import { insertPerformance, performanceCollection } from "@/db/performances";
import { updateSettings } from "@/db/settings";
import {
  NOT_FLAGGED,
  performanceKey,
  type Assignment,
  type Holder,
  type SpotEvent,
  type TeamMatchPerformance,
} from "@/data/types";
import type { Reply, ScouterApi } from "@/scouter/api";
import type { FinishedMatch } from "@/scouter/match";
import { memoryRecords } from "@/scouter/records";
import { NO_JOIN_CODE, Syncer } from "@/scouter/sync";
import { resetRuntime } from "@/sessions/runtime";
import {
  coverageOf,
  REPLACEMENT_MID_MATCH,
  REPLACEMENT_TWO_RECORDS,
  replacementReason,
  winner,
  type RobotRecord,
} from "@/submissions/rules";
import { submitPerformances } from "@/submissions/service";
import type { Submission, SubmissionResult } from "@/submissions/submission";
import { startMongo, type TestMongo } from "../support/mongo";

const config: MatchScoutingConfig = JSON.parse(
  readFileSync(join(process.cwd(), "config", "match-scouting.json"), "utf8"),
);

// --------------------------------------------------------------------- fixtures

const holder = (scouterId: string, over: Partial<Holder> = {}): Holder => ({
  scouterId,
  from: 0,
  until: null,
  ended: null,
  afterStart: false,
  ...over,
});

const assignment = (...holders: Holder[]): Assignment => ({
  _id: "e:qual:12:3061",
  tenantId: "default",
  eventId: "e".repeat(24),
  level: "qual",
  matchNumber: 12,
  team: "3061",
  holders,
});

/** A scouter released from the robot (RT-31), then a replacement who finished it. */
const released = (afterStart: boolean) =>
  assignment(holder("A", { until: 10, ended: "released" }), holder("B", { from: 10, afterStart }));

const record = (nonce: string, scouterId: string | null, submittedAt: number): RobotRecord => ({
  _id: nonce,
  nonce,
  scouterId,
  submittedAt,
  superseded: false,
  coverage: "full",
  flag: NOT_FLAGGED,
});

let n = 0;
const nonce = () => `n${String(++n).padStart(11, "0")}`;

const submission = (over: Partial<Submission> = {}): Submission => ({
  level: "qual",
  matchNumber: 12,
  team: "3061",
  scouterId: "700001",
  nonce: nonce(),
  submittedAt: 1_000,
  clientVersion: "6.0.0",
  coverage: "full",
  actions: [
    {
      id: "startGame",
      ts: 150_000,
      phase: "auto",
      segment: null,
      segmentKind: null,
      segmentIndex: null,
    },
  ],
  ...over,
});

// --------------------------------------------------------------------- the rules

describe("RT-14a, RT-35: which record counts", () => {
  it("RT-14a: a re-scout replaces the earlier record, by when it was submitted", () => {
    expect(winner([record("a", "1", 100), record("b", "2", 200)], null).nonce).toBe("b");
    // A device that syncs late cannot replace a re-scout made after it.
    expect(winner([record("b", "2", 200), record("a", "1", 100)], null).nonce).toBe("b");
  });

  it("RT-35: whoever held the robot at the end wins over the released scouter, in either order", () => {
    const a = released(false);
    expect(winner([record("a", "A", 500), record("b", "B", 100)], a).nonce).toBe("b");
    expect(winner([record("b", "B", 100), record("a", "A", 500)], a).nonce).toBe("b");
    // Without the replacement's record, the released scouter's is all there is.
    expect(winner([record("a", "A", 500)], a).nonce).toBe("a");
    // A later re-scout by someone else still replaces it (RT-14a).
    expect(
      winner([record("b", "B", 100), record("a", "A", 500), record("c", "C", 900)], a).nonce,
    ).toBe("c");
  });

  it("RT-34: a replacement who took the robot mid-match covers only part of it", () => {
    expect(coverageOf("full", "B", released(true))).toBe("partial");
    expect(coverageOf("full", "B", released(false))).toBe("full");
    expect(coverageOf("partial", "A", released(false))).toBe("partial"); // released on the device
    expect(coverageOf("full", null, null)).toBe("full");
  });

  it("RT-36: a replacement's record is flagged mid-match, or beside the released scouter's", () => {
    expect(replacementReason("B", released(true), [{ scouterId: "B" }])).toBe(
      REPLACEMENT_MID_MATCH,
    );
    expect(replacementReason("B", released(false), [{ scouterId: "B" }])).toBeNull(); // clean
    expect(replacementReason("B", released(false), [{ scouterId: "B" }, { scouterId: "A" }])).toBe(
      REPLACEMENT_TWO_RECORDS,
    );
    expect(replacementReason("A", released(true), [{ scouterId: "A" }])).toBeNull();
    expect(replacementReason("B", null, [{ scouterId: "B" }])).toBeNull();
  });
});

// --------------------------------------------------------------------- the server

let mongo: TestMongo;
let db: Db;
let event: SpotEvent;
let other: SpotEvent;
const saved = { ...process.env };

beforeAll(async () => {
  mongo = await startMongo("spot-submission-test");
  db = mongo.db;
  process.env.MONGODB_URI = mongo.uri;
  const { getDb } = await import("@/db/client");
  await getDb(); // creates the collections and their indexes
  event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
  other = await createEvent(db, { tbaKey: "2026wila", label: "official" });
  await updateSettings(db, { activeEventId: event._id });
  resetRuntime();
}, 180_000);

afterAll(async () => {
  resetRuntime();
  await mongo?.stop();
  process.env = saved;
});

beforeEach(async () => {
  await performanceCollection(db).deleteMany({});
});

async function post(body: unknown, code: string | null = event.joinCode) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (code) headers[JOIN_CODE_HEADER] = code;
  const r = await submitRoute(
    new Request("http://localhost/api/scouter/performances", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

const stored = () =>
  performanceCollection(db)
    .find({}, { sort: { submittedAt: 1 } })
    .toArray();

describe("T-5: the submission route", () => {
  it("SC-39, DV-18: stores a record once, however many times it is sent", async () => {
    const s = submission();
    const first = await post({ eventId: event._id, records: [s] });
    expect(first.status).toBe(200);
    expect(first.json.results).toEqual([{ nonce: s.nonce, status: "stored" }]);
    const again = await post({ eventId: event._id, records: [s, s] });
    expect(again.json.results).toEqual([
      { nonce: s.nonce, status: "duplicate" },
      { nonce: s.nonce, status: "duplicate" },
    ]);
    const docs = await stored();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      eventId: event._id,
      source: "app",
      scouterId: "700001",
      matchKey: performanceKey("qual", 12, "3061", s.nonce),
      superseded: false,
      flag: NOT_FLAGGED,
    });
  });

  it("DV-18: a record already scanned from its QR code is a duplicate", async () => {
    const s = submission();
    const scanned: TeamMatchPerformance = {
      _id: "f".repeat(24),
      tenantId: "default",
      eventId: event._id,
      level: s.level,
      matchNumber: s.matchNumber,
      team: s.team,
      scouterId: null,
      source: "qr",
      clientVersion: s.clientVersion,
      submittedAt: s.submittedAt,
      matchKey: performanceKey(s.level, s.matchNumber, s.team, s.nonce),
      nonce: s.nonce,
      coverage: "full",
      superseded: false,
      flag: NOT_FLAGGED,
      notes: null,
      tags: [],
      actions: s.actions,
    };
    await insertPerformance(db, scanned);
    expect((await post({ eventId: event._id, records: [s] })).json.results).toEqual([
      { nonce: s.nonce, status: "duplicate" },
    ]);
    expect(await stored()).toHaveLength(1);
  });

  it("RT-14a: a re-scout supersedes the earlier record, whichever arrives first", async () => {
    const early = submission({ scouterId: "700001", submittedAt: 1_000 });
    const late = submission({ scouterId: "700002", submittedAt: 5_000 });
    await post({ eventId: event._id, records: [late] });
    await post({ eventId: event._id, records: [early] });
    const docs = await stored();
    expect(docs.map((d) => [d.scouterId, d.superseded])).toEqual([
      ["700001", true],
      ["700002", false],
    ]);
  });

  it("SEC-2, SEC-3a, SEC-9: a wrong or missing join code is refused with its reason", async () => {
    const wrong = await post({ eventId: event._id, records: [submission()] }, "WRONG1");
    expect(wrong.status).toBe(403);
    expect(wrong.json).toMatchObject({ error: "join-code", reason: "wrong" });
    expect(wrong.json.message).toContain("Your matches are kept on this device");
    const missing = await post({ eventId: event._id, records: [submission()] }, null);
    expect(missing.json).toMatchObject({ error: "join-code", reason: "missing" });
    // Another event's code does not open this one.
    const crossed = await post({ eventId: event._id, records: [submission()] }, other.joinCode);
    expect(crossed.status).toBe(403);
    expect(await stored()).toHaveLength(0);
  });

  it("files a late sync at the event it was scouted at, with that event's code", async () => {
    const s = submission();
    const r = await post({ eventId: other._id, records: [s] }, other.joinCode);
    expect(r.json.results).toEqual([{ nonce: s.nonce, status: "stored" }]);
    expect((await stored())[0].eventId).toBe(other._id);
    // No event id: the active one.
    const t = submission();
    await post({ eventId: null, records: [t] });
    expect((await stored()).find((d) => d.nonce === t.nonce)!.eventId).toBe(event._id);
  });

  it("refuses an unknown event, a malformed request, and a record the data model rejects", async () => {
    expect((await post({ eventId: "0".repeat(24), records: [] })).status).toBe(404);
    expect((await post({ eventId: event._id })).status).toBe(400);
    expect((await post({ eventId: "nope", records: [] })).status).toBe(400);
    const bad = submission({ team: "03061" as never });
    const r = await post({ eventId: event._id, records: [bad, submission()] });
    const results = r.json.results as SubmissionResult[];
    expect(results[0]).toMatchObject({ nonce: bad.nonce, status: "invalid" });
    expect(results[0].message).toContain("team");
    expect(results[1].status).toBe("stored");
    expect(
      (await post({ eventId: event._id, records: [{ ...submission(), nonce: "" }] })).json.results,
    ).toEqual([expect.objectContaining({ nonce: "", status: "invalid" })]);
  });
});

describe("T-5: settling a robot's records after a release (RT-34 to RT-36)", () => {
  const submit = (records: Submission[], a: Assignment | null) =>
    submitPerformances(db, event, records, {
      source: "app",
      assignmentOf: async () => a,
      now: () => 42,
    });

  it("RT-35: the replacement's record wins, in either order of arrival", async () => {
    for (const order of [
      ["A", "B"],
      ["B", "A"],
    ]) {
      await performanceCollection(db).deleteMany({});
      const sent = {
        A: submission({ scouterId: "A", submittedAt: 9_000, coverage: "partial" }),
        B: submission({ scouterId: "B", submittedAt: 1_000 }),
      } as Record<string, Submission>;
      for (const who of order) await submit([sent[who]], released(false));
      const docs = await stored();
      const by = (id: string) => docs.find((d) => d.scouterId === id)!;
      expect(by("A").superseded).toBe(true);
      expect(by("B").superseded).toBe(false);
      // RT-36: two records, so the replacement's is flagged for review, in either order.
      expect(by("B").flag).toEqual({
        flagged: true,
        reason: REPLACEMENT_TWO_RECORDS,
        source: "machine",
        at: 42,
      });
      expect(by("A").flag.flagged).toBe(false);
      expect(by("A").coverage).toBe("partial");
    }
  });

  it("RT-34, RT-36: a replacement who joined mid-match is partial and flagged; a clean one is not", async () => {
    await submit([submission({ scouterId: "B" })], released(true));
    expect((await stored())[0]).toMatchObject({
      coverage: "partial",
      flag: { flagged: true, reason: REPLACEMENT_MID_MATCH, source: "machine" },
    });
    await performanceCollection(db).deleteMany({});
    await submit([submission({ scouterId: "B" })], released(false));
    expect((await stored())[0]).toMatchObject({ coverage: "full", flag: NOT_FLAGGED });
  });

  it("never overwrites a flag an admin set", async () => {
    const [first] = await submit([submission({ scouterId: "B" })], released(false));
    const human = { flagged: true, reason: "Robot tipped", source: "human" as const, at: 7 };
    await performanceCollection(db).updateOne({ nonce: first.nonce! }, { $set: { flag: human } });
    await submit([submission({ scouterId: "A" })], released(false));
    expect((await stored()).find((d) => d.scouterId === "B")!.flag).toEqual(human);
  });
});

// --------------------------------------------------------------------- the device

const finished = (over: Partial<FinishedMatch> = {}): FinishedMatch => ({
  level: "qual",
  number: 12,
  team: "3061",
  alliance: "blue",
  scouterId: "700001",
  eventId: "a".repeat(24),
  nonce: nonce(),
  configVersion: "v1",
  clientVersion: "6.0.0",
  submittedAt: 1_000,
  actions: [],
  cutShort: null,
  ...over,
});

/** A server that stores by nonce, and can be unreachable or refuse the code. */
class FakeServer implements Pick<ScouterApi, "submit"> {
  online = true;
  code = "TSTCDE";
  readonly stored = new Map<string, Submission>();
  readonly batches: string[][] = [];
  /** Store, but lose the reply: the device does not hear it. */
  loseReply = false;

  async submit(
    joinCode: string,
    _eventId: string | null,
    records: Submission[],
  ): Promise<Reply<{ results: SubmissionResult[] }>> {
    if (!this.online) return { ok: false, offline: true };
    if (joinCode !== this.code)
      return { ok: false, offline: false, status: 403, error: "join-code", message: "Wrong code." };
    this.batches.push(records.map((r) => r.nonce));
    const results = records.map((r): SubmissionResult => {
      const status = this.stored.has(r.nonce) ? "duplicate" : "stored";
      this.stored.set(r.nonce, r);
      return { nonce: r.nonce, status };
    });
    if (this.loseReply) return { ok: false, offline: true };
    return { ok: true, value: { results } };
  }
}

function device(server: FakeServer, code: string | null = "TSTCDE") {
  const records = memoryRecords();
  const changes: number[] = [];
  const syncer = new Syncer({
    records,
    api: server,
    joinCode: () => code,
    onChange: () => changes.push(1),
  });
  const keep = (f: FinishedMatch) => records.put(f, { version: f.configVersion, config });
  return { records, syncer, keep, changes };
}

describe("T-6a, RT-28, OF-2: the device sends what it holds, and keeps it until the server has it", () => {
  it("RT-28: matches submitted while disconnected all arrive after reconnecting, none twice", async () => {
    const server = new FakeServer();
    const d = device(server);
    server.online = false;
    for (let i = 1; i <= 3; i++) await d.keep(finished({ number: i, submittedAt: i }));
    expect(await d.syncer.sync()).toMatchObject({ sent: 0, left: 3, offline: true });
    expect((await d.records.all()).map((r) => r.number)).toEqual([1, 2, 3]);

    server.online = true;
    expect(await d.syncer.sync()).toMatchObject({ sent: 3, left: 0, offline: false });
    expect(server.stored.size).toBe(3);
    expect(server.batches).toEqual([[...server.stored.keys()]]); // one batch
    expect(await d.syncer.sync()).toMatchObject({ sent: 0, left: 0 });
    expect(server.batches).toHaveLength(1);
  });

  it("OF-2: a reply lost on the way back is sent again, and the server answers duplicate", async () => {
    const server = new FakeServer();
    const d = device(server);
    await d.keep(finished());
    server.loseReply = true;
    expect(await d.syncer.sync()).toMatchObject({ sent: 0, left: 1, offline: true });
    server.loseReply = false;
    expect(await d.syncer.sync()).toMatchObject({ sent: 1, left: 0 });
    expect(server.stored.size).toBe(1);
  });

  it("SEC-9: a refused join code keeps every record, with the reason beside it", async () => {
    const server = new FakeServer();
    const d = device(server, "WRONG1");
    await d.keep(finished());
    expect(await d.syncer.sync()).toMatchObject({ sent: 0, left: 1, message: "Wrong code." });
    expect((await d.records.all())[0].problem).toBe("Wrong code.");
    const none = device(server, null);
    await none.keep(finished());
    expect(await none.syncer.sync()).toMatchObject({ left: 1, message: NO_JOIN_CODE });
  });

  it("groups by event and batches, so a device holding a long offline event sends it all", async () => {
    const server = new FakeServer();
    const d = device(server);
    for (let i = 1; i <= 60; i++) await d.keep(finished({ number: i, submittedAt: i }));
    await d.keep(finished({ eventId: "b".repeat(24) }));
    expect(await d.syncer.sync()).toMatchObject({ sent: 61, left: 0 });
    expect(server.batches.map((b) => b.length)).toEqual([50, 10, 1]);
  });

  it("a sync asked for while one runs runs once more, so a new match is not left behind", async () => {
    const server = new FakeServer();
    const d = device(server);
    await d.keep(finished());
    const first = d.syncer.sync();
    await d.keep(finished());
    const second = d.syncer.sync();
    const third = d.syncer.sync();
    expect(third).toBe(second);
    await first;
    expect(await second).toMatchObject({ left: 0 });
    expect(server.stored.size).toBe(2);
  });

  it("keeps the configuration each record needs for its QR code, and drops it after", async () => {
    const server = new FakeServer();
    const d = device(server);
    server.online = false;
    await d.keep(finished({ configVersion: "v1" }));
    expect(await d.records.config("v1")).not.toBeNull();
    server.online = true;
    await d.syncer.sync();
    expect(await d.records.config("v1")).toBeNull();
  });
});
