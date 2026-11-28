/**
 * The QR scanner (#411; document 07 AD-19 to AD-21, OF-4, AN-8, DV-5): reading a code against the
 * seasons the scanner keeps, the unsent records analysis shows, sending what the device holds,
 * and the scanner's two routes on a real MongoDB (T-5). The browser test is
 * `tests/e2e/scanner.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { DELETE as deleteRoute } from "@/app/api/admin/performances/[id]/route";
import { POST as scannedRoute } from "@/app/api/admin/scanned/route";
import { GET as scannerRoute } from "@/app/api/admin/scanner/route";
import type { MatchScoutingConfig } from "@/config/types";
import { createEvent } from "@/db/events";
import { performanceCollection } from "@/db/performances";
import { updateSettings } from "@/db/settings";
import { NOT_FLAGGED, type PublicPerformance, type SpotEvent } from "@/data/types";
import { encodePerformance, type QrInput } from "@/qr/codec";
import { qrLayout } from "@/qr/layout";
import {
  describe as named,
  readCode,
  withUnsent,
  type ScannedRecord,
  type ScannerInputs,
} from "@/scanner/scan";
import { memoryScannerStore } from "@/scanner/store";
import { sendScans } from "@/scanner/sync";
import { resetRuntime } from "@/sessions/runtime";
import type { Submission } from "@/submissions/submission";
import { startMongo, type TestMongo } from "../support/mongo";

const read = (...p: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8")) as MatchScoutingConfig;
const season2026 = read("config", "match-scouting.json");
const season2025 = read("config", "seasons", "2025", "match-scouting.json");

const layout2026 = qrLayout(season2026);
const EVENT_2026 = "a".repeat(24);
const EVENT_2025 = "b".repeat(24);

const inputs: ScannerInputs = {
  events: [
    { id: EVENT_2026, code: "2026mnwi_official", season: "active" },
    { id: EVENT_2025, code: "2025ilch_official", season: "2025" },
  ],
  seasons: { active: season2026, "2025": season2025 },
  savedAt: 1,
};

let n = 0;
const nonce = () => `s${String(++n).padStart(11, "0")}`;

const performance = (over: Partial<QrInput> = {}): QrInput => ({
  eventId: EVENT_2026,
  level: "qual",
  matchNumber: 3,
  team: "3061",
  clientVersion: "6.0.0",
  submittedAt: 1_772_809_355_374,
  nonce: nonce(),
  coverage: "full",
  // A real 2026 button, in a period the layout has.
  actions: [{ id: layout2026.buttons[0], ts: 100_000, ...layout2026.placements[1] }],
  ...over,
});

/** A code as a phone with no connection shows it (SC-41). */
const codeFor = (p: QrInput, config: MatchScoutingConfig = season2026) =>
  encodePerformance(p, qrLayout(config));

// --------------------------------------------------------------------- reading a code

describe("AD-19, DM-15a: reading a scanned code", () => {
  it("reads a code into the record a phone would have sent, naming no scouter (DV-5)", () => {
    const p = performance();
    const result = readCode(codeFor(p), inputs, 42);
    expect(result).toEqual({
      ok: true,
      scanned: {
        eventId: EVENT_2026,
        eventCode: "2026mnwi_official",
        record: {
          level: "qual",
          matchNumber: 3,
          team: "3061",
          scouterId: null,
          nonce: p.nonce,
          submittedAt: p.submittedAt,
          clientVersion: "6.0.0",
          coverage: "full",
          actions: p.actions,
        },
        scannedAt: 42,
        problem: null,
      },
    });
    expect(named(p)).toBe("Qual 3, team 3061");
  });

  it("reads a code from any season the scanner keeps, by the layout it was made with", () => {
    const old = performance({
      eventId: EVENT_2025,
      actions: [
        {
          id: "aStop",
          ts: 140_000,
          phase: "auto",
          segment: null,
          segmentKind: null,
          segmentIndex: null,
        },
      ],
    });
    const result = readCode(codeFor(old, season2025), inputs, 1);
    expect(result.ok && result.scanned.eventCode).toBe("2025ilch_official");
  });

  it("refuses a code from a configuration it doesn't keep, from an unknown event, or damaged", () => {
    const only2026 = { ...inputs, seasons: { active: season2026 } };
    const old = readCode(
      codeFor(performance({ eventId: EVENT_2025, actions: [] }), season2025),
      only2026,
      1,
    );
    expect(old).toMatchObject({
      ok: false,
      message: expect.stringMatching(/different scouting configuration/),
    });
    const elsewhere = readCode(codeFor(performance({ eventId: "c".repeat(24) })), inputs, 1);
    expect(elsewhere).toMatchObject({
      ok: false,
      message: expect.stringMatching(/event this server does not have/),
    });
    const code = codeFor(performance());
    expect(readCode(code.slice(0, 20), inputs, 1)).toMatchObject({ ok: false });
    expect(readCode("https://example.com", inputs, 1)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not a SPOT match code/),
    });
    expect(readCode(code, { ...inputs, seasons: {} }, 1)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Open this page once online/),
    });
  });
});

// --------------------------------------------------------------------- AN-8

const scanned = (over: Partial<Submission> = {}): ScannedRecord => ({
  eventId: EVENT_2026,
  eventCode: "2026mnwi_official",
  record: {
    level: "qual",
    matchNumber: 3,
    team: "3061",
    scouterId: null,
    nonce: nonce(),
    submittedAt: 500,
    clientVersion: "6.0.0",
    coverage: "full",
    actions: [],
    ...over,
  },
  scannedAt: 1,
  problem: null,
});

const stored = (over: Partial<PublicPerformance>): PublicPerformance => ({
  _id: "f".repeat(24),
  tenantId: "default",
  eventId: EVENT_2026,
  level: "qual",
  matchNumber: 3,
  team: "3061",
  source: "app",
  clientVersion: "6.0.0",
  submittedAt: 100,
  matchKey: "q3-3061-x",
  nonce: "x",
  coverage: "full",
  superseded: false,
  flag: NOT_FLAGGED,
  notes: null,
  tags: [],
  actions: [],
  ...over,
});

describe("AN-8: analysis shows what this device scanned and has not sent", () => {
  it("adds an unsent record as the server would store it", () => {
    const s = scanned({ team: "254" });
    const { performances, added } = withUnsent([stored({})], [s]);
    expect(added).toBe(1);
    expect(performances[1]).toMatchObject({
      team: "254",
      source: "qr",
      nonce: s.record.nonce,
      matchKey: `q3-254-${s.record.nonce}`,
      superseded: false,
    });
  });

  it("leaves out a record the server has, and lets the later record of a robot count (RT-14a)", () => {
    const s = scanned({ nonce: "x" });
    expect(withUnsent([stored({})], [s]).added).toBe(0);
    // Scanned later than the server's record: it counts, and the server's is superseded.
    const later = withUnsent([stored({ submittedAt: 100 })], [scanned({ submittedAt: 500 })]);
    expect(later.performances.map((p) => p.superseded)).toEqual([true, false]);
    // Scanned earlier: the server's re-scout still counts.
    const earlier = withUnsent([stored({ submittedAt: 900 })], [scanned({ submittedAt: 500 })]);
    expect(earlier.performances.map((p) => p.superseded)).toEqual([false, true]);
    expect(earlier.added).toBe(0);
  });
});

// --------------------------------------------------------------------- sending

/** A server that answers each batch from `answer`, or no connection when it returns null. */
function server(answer: (records: { nonce: string }[]) => Response | null) {
  const calls: number[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const { records } = JSON.parse(init.body as string) as { records: { nonce: string }[] };
    calls.push(records.length);
    const response = answer(records);
    if (!response) throw new TypeError("Failed to fetch");
    return response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("OF-4, AD-20: sending what the scanner holds", () => {
  it("forgets a record once the server has it, and keeps a refused one with the reason", async () => {
    const store = memoryScannerStore();
    const [a, b, c] = [scanned(), scanned(), scanned()];
    for (const r of [a, b, c]) await store.put(r);
    const { fetchImpl } = server((records) =>
      Response.json({
        results: records.map((r, i) =>
          i === 2
            ? { nonce: r.nonce, status: "invalid", message: "Not a team." }
            : { nonce: r.nonce, status: i === 0 ? "stored" : "duplicate", id: "1" },
        ),
      }),
    );
    const outcome = await sendScans(store, fetchImpl);
    expect(outcome.stopped).toBeNull();
    expect(outcome.results.get(a.record.nonce)).toMatchObject({ status: "stored" });
    expect(await store.pending()).toEqual([{ ...c, problem: "Not a team." }]);
  });

  it("with no connection keeps everything, and sends in batches of 50 when it returns", async () => {
    const store = memoryScannerStore();
    for (let i = 0; i < 60; i++) await store.put({ ...scanned(), scannedAt: i });
    let online = false;
    const { fetchImpl, calls } = server((records) =>
      online
        ? Response.json({ results: records.map((r) => ({ nonce: r.nonce, status: "stored" })) })
        : null,
    );
    expect((await sendScans(store, fetchImpl)).stopped).toEqual({ ok: false, offline: true });
    expect(await store.pending()).toHaveLength(60);
    online = true;
    await sendScans(store, fetchImpl);
    expect(calls.slice(1)).toEqual([50, 10]);
    expect(await store.pending()).toEqual([]);
  });
});

// --------------------------------------------------------------------- the routes

let mongo: TestMongo;
let db: Db;
let event: SpotEvent;
let past: SpotEvent;
const saved = { ...process.env };

beforeAll(async () => {
  mongo = await startMongo("spot-scanner-test");
  db = mongo.db;
  process.env.MONGODB_URI = mongo.uri;
  const { getDb } = await import("@/db/client");
  await getDb();
  event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
  past = await createEvent(db, { tbaKey: "2025ilch", label: "official" });
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

async function post(records: unknown[]) {
  const r = await scannedRoute(
    new Request("http://localhost/api/admin/scanned", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records }),
    }),
  );
  return { status: r.status, json: (await r.json()) as { results: Record<string, unknown>[] } };
}

describe("T-5, AD-20, AD-21: the scanner's routes", () => {
  it("AD-19: the events, each with its season, and each season's scouting configuration", async () => {
    const r = await scannerRoute();
    const body = (await r.json()) as ScannerInputs;
    expect(body.events).toEqual(
      expect.arrayContaining([
        { id: event._id, code: "2026mnwi_official", season: "active" },
        { id: past._id, code: "2025ilch_official", season: "2025" },
      ]),
    );
    expect(Object.keys(body.seasons).sort()).toEqual(["2025", "active"]);
    expect(qrLayout(body.seasons["2025"]).fingerprint).toBe(qrLayout(season2025).fingerprint);
  });

  it("AD-20: stores a scanned record with source qr and no scouter, and says its id", async () => {
    const s = scanned().record;
    const { status, json } = await post([{ eventId: event._id, ...s }]);
    expect(status).toBe(200);
    const doc = await performanceCollection(db).findOne({ nonce: s.nonce });
    expect(doc).toMatchObject({ source: "qr", scouterId: null, eventId: event._id, team: "3061" });
    expect(json.results).toEqual([{ nonce: s.nonce, status: "stored", id: doc!._id }]);
  });

  it("AD-21: a record already stored, from the phone or an earlier scan, is a duplicate", async () => {
    const s = scanned().record;
    await post([{ eventId: event._id, ...s }]);
    expect((await post([{ eventId: event._id, ...s }])).json.results).toEqual([
      { nonce: s.nonce, status: "duplicate" },
    ]);
    expect(await performanceCollection(db).countDocuments({ nonce: s.nonce })).toBe(1);
  });

  it("files each record at the event its code names, and refuses an event it lacks", async () => {
    const [a, b] = [scanned().record, scanned().record];
    const { json } = await post([
      { eventId: past._id, ...a },
      { eventId: "c".repeat(24), ...b },
    ]);
    expect(json.results.map((r) => r.status)).toEqual(["stored", "invalid"]);
    expect(json.results[1].message).toMatch(/event this server does not have/);
    expect((await performanceCollection(db).findOne({ nonce: a.nonce }))?.eventId).toBe(past._id);
  });

  it("SEC-5: undoing a scan deletes the record it stored", async () => {
    const s = scanned().record;
    const { json } = await post([{ eventId: event._id, ...s }]);
    const id = json.results[0].id as string;
    const r = await deleteRoute(
      new Request(`http://localhost/api/admin/performances/${id}`, { method: "DELETE" }),
      {
        params: Promise.resolve({ id }),
      },
    );
    expect(r.status).toBe(200);
    expect(await performanceCollection(db).findOne({ nonce: s.nonce })).toBeNull();
    // Scanned again, or sent by the phone, it stays deleted (DV-20).
    expect((await post([{ eventId: event._id, ...s }])).json.results[0].status).toBe("duplicate");
  });

  it("refuses a request that is not a list, or too long", async () => {
    expect((await post(Array.from({ length: 51 }, () => ({})))).status).toBe(413);
    const r = await scannedRoute(
      new Request("http://localhost/api/admin/scanned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: "no" }),
      }),
    );
    expect(r.status).toBe(400);
  });
});
