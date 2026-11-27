/**
 * The edit page (#410; document 07 AD-10 to AD-15, AD-13a, RT-35, SEC-5, DV-20): the rules an
 * admin's edits follow, what the page shows and filters, and the routes on a real MongoDB (T-5).
 * The browser test is `tests/e2e/edit-page.spec.ts`; `admin-auth.test.ts` checks that proxy guards
 * the page and its routes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { GET as listRoute } from "@/app/api/admin/performances/route";
import {
  DELETE as deleteRoute,
  GET as recordRoute,
  POST as editRoute,
} from "@/app/api/admin/performances/[id]/route";
import { POST as submitRoute } from "@/app/api/scouter/performances/route";
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import { createEvent } from "@/db/events";
import { deletedCollection, performanceCollection } from "@/db/performances";
import { updateSchedule } from "@/db/schedules";
import { addScouter } from "@/db/scouters";
import { updateSettings } from "@/db/settings";
import { NOT_FLAGGED, type Assignment, type Flag, type SpotEvent } from "@/data/types";
import { actionCounts, editRows, filterRows, NO_FILTERS, type EditRow } from "@/edit/records";
import type { PerformanceSummary } from "@/db/performances";
import { resetRuntime } from "@/sessions/runtime";
import {
  afterDelete,
  promote,
  REPLACEMENT_MID_MATCH,
  resolve,
  type RobotRecord,
} from "@/submissions/rules";
import type { Submission } from "@/submissions/submission";
import { startMongo, type TestMongo } from "../support/mongo";

// --------------------------------------------------------------------- the rules

const record = (id: string, submittedAt: number, over: Partial<RobotRecord> = {}): RobotRecord => ({
  _id: id,
  nonce: id,
  scouterId: id.toUpperCase(),
  submittedAt,
  superseded: false,
  coverage: "full",
  flag: NOT_FLAGGED,
  ...over,
});

describe("AD-15, RT-35: an admin's edits and the records that count", () => {
  it("AD-15: deleting the record that counted lets the rules pick from those left", () => {
    const left = [record("a", 100, { superseded: true }), record("b", 200, { superseded: true })];
    expect(afterDelete(left, null)).toEqual(new Map([["b", { superseded: false }]]));
    // Deleting a superseded record changes nothing: another still counts.
    expect(afterDelete([record("a", 100, { superseded: true }), record("b", 200)], null)).toEqual(
      new Map(),
    );
    expect(afterDelete([], null)).toEqual(new Map());
  });

  it("AD-15: the pick follows RT-35, so a released scouter's record still loses", () => {
    const released: Assignment = {
      _id: "e:qual:12:3061",
      tenantId: "default",
      eventId: "e".repeat(24),
      level: "qual",
      matchNumber: 12,
      team: "3061",
      holders: [
        { scouterId: "A", from: 0, until: 10, ended: "released", afterStart: false },
        { scouterId: "B", from: 10, until: null, ended: null, afterStart: false },
      ],
    };
    const left = [
      record("a", 900, { superseded: true }), // the released scouter's, sent last
      record("b", 100, { superseded: true }),
    ];
    expect(afterDelete(left, released)).toEqual(new Map([["b", { superseded: false }]]));
  });

  it("RT-35: promoting a record makes it count, and supersedes the one that did", () => {
    const all = [record("a", 100, { superseded: true }), record("b", 200), record("c", 50)];
    expect(promote(all, "a")).toEqual(
      new Map([
        ["a", { superseded: false }],
        ["b", { superseded: true }],
        ["c", { superseded: true }],
      ]),
    );
    expect(promote([record("b", 200)], "b")).toEqual(new Map()); // already counts
  });

  it("AD-13a, RT-36: a flag an admin cleared is never set again by a rule", () => {
    const midMatch: Assignment = {
      _id: "e:qual:12:3061",
      tenantId: "default",
      eventId: "e".repeat(24),
      level: "qual",
      matchNumber: 12,
      team: "3061",
      holders: [
        { scouterId: "A", from: 0, until: 10, ended: "released", afterStart: false },
        { scouterId: "B", from: 10, until: null, ended: null, afterStart: true },
      ],
    };
    const b = record("b", 100);
    expect(resolve([b], midMatch, 5).get("b")?.flag?.reason).toBe(REPLACEMENT_MID_MATCH);
    const cleared: Flag = { flagged: false, reason: null, source: "human", at: 1 };
    expect(resolve([{ ...b, flag: cleared }], midMatch, 5).get("b")).toBeUndefined();
  });
});

// --------------------------------------------------------------------- the page

const summary = (over: Partial<PerformanceSummary>): PerformanceSummary => ({
  _id: "0".repeat(24),
  tenantId: "default",
  eventId: "e".repeat(24),
  level: "qual",
  matchNumber: 1,
  team: "3061",
  scouterId: "700001",
  source: "app",
  clientVersion: "6.0.0",
  submittedAt: 1,
  matchKey: "q1-3061-n00000000001",
  nonce: "n00000000001",
  coverage: "full",
  superseded: false,
  flag: NOT_FLAGGED,
  notes: null,
  tags: [],
  actionCount: 3,
  ...over,
});

describe("AD-11 to AD-13: what the edit page shows", () => {
  const names = new Map([
    ["700001", "Alex Rivera"],
    ["700002", "Jordan Lee"],
  ]);
  const matches = [
    {
      level: "qual" as const,
      number: 12,
      key: "2026mnwi_qm12",
      red: ["3061", "2338B", "111"] as [string, string, string],
      blue: ["254", "1678", "118"] as [string, string, string],
    },
    {
      level: "playoff" as const,
      number: 14,
      key: "2026mnwi_f1m1",
      red: ["3061", "254", "1678"] as [string, string, string],
      blue: ["111", "118", "2338B"] as [string, string, string],
    },
  ];
  const rows = editRows(
    [
      summary({ _id: "a".repeat(24), matchNumber: 12, team: "3061", submittedAt: 100 }),
      summary({
        _id: "b".repeat(24),
        matchNumber: 12,
        team: "254",
        scouterId: "700002",
        submittedAt: 300,
      }),
      summary({
        _id: "c".repeat(24),
        level: "playoff",
        matchNumber: 14,
        team: "2338B",
        scouterId: "v5name",
        submittedAt: 200,
      }),
      summary({ _id: "d".repeat(24), matchNumber: 40, scouterId: null, submittedAt: 50 }),
    ],
    names,
    matches,
  );
  const ids = (list: EditRow[]) => list.map((r) => r.id[0]);

  it("AD-11: newest first; AD-12: the match by its name, the alliance, the scouter by name", () => {
    expect(ids(rows)).toEqual(["b", "c", "a", "d"]);
    expect(rows.map((r) => [r.match, r.alliance, r.scouterName])).toEqual([
      ["Qual 12", "blue", "Jordan Lee"],
      ["Final 1", "blue", null], // a migrated v5 id is not on the roster: the page shows the id
      ["Qual 12", "red", "Alex Rivera"],
      ["Qual 40", null, null], // not on the schedule, no scouter
    ]);
  });

  it("AD-11: filters by part of a scouter's name or ID, a match number, and a team as typed", () => {
    expect(filterRows(rows, NO_FILTERS)).toHaveLength(4);
    expect(ids(filterRows(rows, { ...NO_FILTERS, scouter: "riv" }))).toEqual(["a"]);
    expect(ids(filterRows(rows, { ...NO_FILTERS, scouter: "V5N" }))).toEqual(["c"]);
    expect(ids(filterRows(rows, { ...NO_FILTERS, match: "12" }))).toEqual(["b", "a"]);
    expect(ids(filterRows(rows, { ...NO_FILTERS, match: "014" }))).toEqual(["c"]);
    expect(ids(filterRows(rows, { ...NO_FILTERS, team: "frc2338b" }))).toEqual(["c"]);
    expect(ids(filterRows(rows, { ...NO_FILTERS, team: "3061", match: "40" }))).toEqual(["d"]);
    expect(filterRows(rows, { ...NO_FILTERS, team: "not a team" })).toEqual([]);
  });

  it("AD-13: counts each action, in the order first pressed", () => {
    const pressed = ["startGame", "score", "miss", "score", "score"].map((id) => ({ id }));
    expect(actionCounts(pressed)).toEqual([
      ["startGame", 1],
      ["score", 3],
      ["miss", 1],
    ]);
    expect(actionCounts([])).toEqual([]);
  });
});

// --------------------------------------------------------------------- the routes

let mongo: TestMongo;
let db: Db;
let event: SpotEvent;
let other: SpotEvent;
const saved = { ...process.env };

beforeAll(async () => {
  mongo = await startMongo("spot-edit-test");
  db = mongo.db;
  process.env.MONGODB_URI = mongo.uri;
  const { getDb } = await import("@/db/client");
  await getDb(); // creates the collections and their indexes
  event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
  other = await createEvent(db, { tbaKey: "2026wila", label: "official" });
  await updateSettings(db, { activeEventId: event._id });
  await addScouter(db, { id: "700001", name: "Alex Rivera" });
  await updateSchedule(db, event._id, {
    manual: [
      {
        level: "qual",
        number: 12,
        key: "manual_q12",
        red: ["3061", "1", "2"],
        blue: ["3", "4", "5"],
      },
    ],
  });
  resetRuntime();
}, 180_000);

afterAll(async () => {
  resetRuntime();
  await mongo?.stop();
  process.env = saved;
});

beforeEach(async () => {
  await performanceCollection(db).deleteMany({});
  await deletedCollection(db).deleteMany({});
});

let n = 0;
const submission = (over: Partial<Submission> = {}): Submission => ({
  level: "qual",
  matchNumber: 12,
  team: "3061",
  scouterId: "700001",
  nonce: `e${String(++n).padStart(11, "0")}`,
  submittedAt: 1_000,
  clientVersion: "6.0.0",
  coverage: "full",
  actions: ["startGame", "score", "score"].map((id, i) => ({
    id,
    ts: 150_000 - i,
    phase: "auto",
    segment: null,
    segmentKind: null,
    segmentIndex: null,
  })),
  ...over,
});

async function submit(...records: Submission[]) {
  const r = await submitRoute(
    new Request("http://localhost/api/scouter/performances", {
      method: "POST",
      headers: { "content-type": "application/json", [JOIN_CODE_HEADER]: event.joinCode! },
      body: JSON.stringify({ eventId: event._id, records }),
    }),
  );
  return ((await r.json()) as { results: { status: string }[] }).results.map((x) => x.status);
}

async function list(query = "") {
  const r = await listRoute(new Request(`http://localhost/api/admin/performances${query}`));
  return { status: r.status, json: (await r.json()) as { rows: EditRow[]; message?: string } };
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (id: string) => `http://localhost/api/admin/performances/${id}`;

async function edit(id: string, body: unknown) {
  const r = await editRoute(
    new Request(url(id), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    context(id),
  );
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

async function remove(id: string) {
  const r = await deleteRoute(new Request(url(id), { method: "DELETE" }), context(id));
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

const byNonce = (nonce: string) => performanceCollection(db).findOne({ nonce });

describe("T-5, AD-10 to AD-13: the edit page's routes", () => {
  it("AD-10, AD-12: lists the active event's records with names and alliances, newest first", async () => {
    const early = submission({ submittedAt: 100 });
    const late = submission({ submittedAt: 200, scouterId: "999999" });
    await submit(early, late);
    const { status, json } = await list();
    expect(status).toBe(200);
    expect(
      json.rows.map((r) => [r.match, r.team, r.alliance, r.scouterName, r.superseded]),
    ).toEqual([
      ["Qual 12", "3061", "red", null, false], // 999999 is not on the roster
      ["Qual 12", "3061", "red", "Alex Rivera", true], // replaced by the re-scout (RT-14a)
    ]);
    expect(json.rows[0]).toMatchObject({ actionCount: 3, scouterId: "999999" });
    expect(json.rows[0]).not.toHaveProperty("actions");
  });

  it("AD-10: any event by its id; refuses an id that is not one, or an event it lacks", async () => {
    await submit(submission());
    expect((await list(`?event=${other._id}`)).json.rows).toEqual([]);
    expect((await list("?event=nope")).status).toBe(400);
    expect((await list(`?event=${"f".repeat(24)}`)).status).toBe(404);
  });

  it("AD-13: a record's actions, in order", async () => {
    const s = submission();
    await submit(s);
    const id = (await byNonce(s.nonce))!._id;
    const r = await recordRoute(new Request(url(id)), context(id));
    const { actions } = (await r.json()) as { actions: { id: string }[] };
    expect(actions.map((a) => a.id)).toEqual(["startGame", "score", "score"]);
    expect(
      (await recordRoute(new Request(url("f".repeat(24))), context("f".repeat(24)))).status,
    ).toBe(404);
  });
});

describe("T-5, AD-13a, AD-14: flagging a record for review", () => {
  it("AD-14: flags with a reason, and clears it; a cleared flag remembers an admin cleared it", async () => {
    const s = submission();
    await submit(s);
    const id = (await byNonce(s.nonce))!._id;
    expect(
      (await edit(id, { action: "flag", reason: "  Robot   number looks wrong " })).json,
    ).toEqual({ ok: true });
    expect((await byNonce(s.nonce))!.flag).toMatchObject({
      flagged: true,
      reason: "Robot number looks wrong",
      source: "human",
    });
    expect((await list()).json.rows[0].flag.reason).toBe("Robot number looks wrong");
    await edit(id, { action: "unflag" });
    expect((await byNonce(s.nonce))!.flag).toMatchObject({
      flagged: false,
      reason: null,
      source: "human",
    });
  });

  it("AD-13a: a reason is optional, and a long one is refused with the limit", async () => {
    const s = submission();
    await submit(s);
    const id = (await byNonce(s.nonce))!._id;
    await edit(id, { action: "flag", reason: "" });
    expect((await byNonce(s.nonce))!.flag).toMatchObject({ flagged: true, reason: null });
    const long = await edit(id, { action: "flag", reason: "x".repeat(301) });
    expect(long.status).toBe(400);
    expect(long.json.message).toMatch(/300 characters/);
    expect((await edit(id, { action: "rename" })).status).toBe(400);
    expect((await edit("f".repeat(24), { action: "flag" })).status).toBe(404);
  });
});

describe("T-5, AD-15, RT-35, DV-20: deleting a record, and choosing the one that counts", () => {
  it("AD-15: deleting the record that counted makes the robot's other record count", async () => {
    const first = submission({ submittedAt: 100 });
    const rescout = submission({ submittedAt: 200 });
    await submit(first, rescout);
    expect((await byNonce(first.nonce))!.superseded).toBe(true);
    expect((await remove((await byNonce(rescout.nonce))!._id)).json).toEqual({ ok: true });
    expect(await byNonce(rescout.nonce)).toBeNull();
    expect((await byNonce(first.nonce))!.superseded).toBe(false);
    expect((await list()).json.rows).toHaveLength(1);
  });

  it("DV-20: a deleted record is kept apart, and a copy sent again is a duplicate, not stored", async () => {
    const s = submission();
    await submit(s);
    const id = (await byNonce(s.nonce))!._id;
    await remove(id);
    const kept = await deletedCollection(db).findOne({ _id: id });
    expect(kept).toMatchObject({ nonce: s.nonce, team: "3061", scouterId: "700001" });
    expect(typeof kept!.deletedAt).toBe("number");
    expect(await submit(s)).toEqual(["duplicate"]);
    expect(await byNonce(s.nonce)).toBeNull();
    expect((await remove(id)).status).toBe(404); // already deleted
  });

  it("RT-35: an admin makes a superseded record the one that counts, until a new one arrives", async () => {
    const first = submission({ submittedAt: 100 });
    const rescout = submission({ submittedAt: 200 });
    await submit(first, rescout);
    await edit((await byNonce(first.nonce))!._id, { action: "promote" });
    expect((await byNonce(first.nonce))!.superseded).toBe(false);
    expect((await byNonce(rescout.nonce))!.superseded).toBe(true);
    // A record sent late, scouted before the promoted one, does not overrule the admin...
    await submit(submission({ submittedAt: 50 }));
    expect((await byNonce(first.nonce))!.superseded).toBe(false);
    // ...but a new re-scout does (RT-14a).
    const another = submission({ submittedAt: 300 });
    await submit(another);
    expect((await byNonce(another.nonce))!.superseded).toBe(false);
    expect((await byNonce(first.nonce))!.superseded).toBe(true);
  });
});
