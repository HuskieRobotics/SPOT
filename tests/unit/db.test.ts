/**
 * T-5: the database layer (docs/spec/21 §6, #351) against the in-memory MongoDB.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ObjectId, type Db } from "mongodb";
import { generate } from "@/generate/synthetic";
import type { MatchScoutingConfig } from "@/config/types";
import {
  DEFAULT_TENANT,
  sessionId,
  type Schedule,
  type ScouterSession,
  type TeamMatchPerformance,
} from "@/data/types";
import { COLLECTIONS, dataSchemas, DOCUMENT_KINDS, validateDocument } from "@/data/validate";
import { ensureCollections, INDEXES } from "@/db/collections";
import { toMongoJsonSchema } from "@/db/mongo-schema";
import { adminPerformances, insertPerformance, publicPerformances } from "@/db/performances";
import { createEvent, findEventByCode, getEvent, publicEvents } from "@/db/events";
import { getScouter, listScouters, saveScouter } from "@/db/scouters";
import {
  defaultSettings,
  getSettings,
  settingsCollection,
  SETTINGS_CACHE_MS,
  updateSettings,
} from "@/db/settings";
import { effectiveMatches, getSchedule, updateSchedule } from "@/db/schedules";
import { createSessionStore, sessionCollection, type SessionCollection } from "@/db/sessions";
import { startMongo, type TestMongo } from "../support/mongo";

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;

const oid = () => new ObjectId().toHexString();

const session = (eventId: string, scouterId: string, over: Partial<ScouterSession> = {}) => ({
  _id: sessionId(eventId, scouterId),
  tenantId: DEFAULT_TENANT,
  eventId,
  scouterId,
  deviceId: null,
  status: "waiting" as const,
  matchLevel: "qual" as const,
  matchNumber: 4,
  team: "3061",
  accepted: false,
  entered: false,
  signedInAt: 1772809355374,
  updatedAt: 1772809355374,
  ...over,
});

describe("toMongoJsonSchema", () => {
  it("inlines $defs references and maps integer to number", () => {
    const out = toMongoJsonSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { n: { $ref: "#/$defs/count" }, m: { type: ["integer", "null"] } },
      $defs: { count: { type: "integer", minimum: 0 } },
    });
    expect(out).toEqual({
      type: "object",
      properties: { n: { type: "number", minimum: 0 }, m: { type: ["number", "null"] } },
    });
  });

  it("refuses a keyword MongoDB does not have, so a schema cannot weaken silently", () => {
    expect(() => toMongoJsonSchema({ type: "string", format: "email" })).toThrow(/format/);
    expect(() => toMongoJsonSchema({ const: 1 })).toThrow(/const/);
  });

  it("converts every stored-document schema", () => {
    for (const kind of DOCUMENT_KINDS)
      expect(() => toMongoJsonSchema(dataSchemas[kind]), kind).not.toThrow();
  });
});

describe("database layer", () => {
  let mongo: TestMongo;
  let db: Db;

  beforeAll(async () => {
    mongo = await startMongo("spot-db-test");
    db = mongo.db;
    await ensureCollections(db);
  }, 180_000); // the first run downloads mongod

  afterAll(async () => {
    await mongo?.stop();
  });

  it("creates every collection with its validator, and running it again changes nothing", async () => {
    const warn = vi.fn();
    await ensureCollections(db, warn);
    expect(warn).not.toHaveBeenCalled();
    const collections = await db.listCollections().toArray();
    for (const kind of DOCUMENT_KINDS) {
      const c = collections.find((x) => x.name === COLLECTIONS[kind]) as
        { options?: { validator?: unknown; validationLevel?: string } } | undefined;
      expect(c?.options?.validator, kind).toBeDefined();
      expect(c?.options?.validationLevel, kind).toBe("strict");
    }
  });

  it("DV-8: every index leads with tenantId", async () => {
    for (const kind of DOCUMENT_KINDS) {
      const indexes = await db.collection(COLLECTIONS[kind]).indexes();
      expect(indexes.length).toBe(INDEXES[kind].length + 1); // plus _id
      for (const index of indexes.filter((i) => i.name !== "_id_"))
        expect(Object.keys(index.key)[0], `${kind} ${index.name}`).toBe("tenantId");
    }
  });

  it("the database refuses an invalid document even when written around the application", async () => {
    const [p] = generate({ config, seed: "db-invalid", matches: 1 }).performances;
    await expect(
      db
        .collection<{ _id: string }>(COLLECTIONS["team-match-performance"])
        .insertOne({ ...p, team: 3061 } as never),
    ).rejects.toThrow(/validation/i);
    await expect(
      db.collection(COLLECTIONS.settings).insertOne({ _id: "x" } as never),
    ).rejects.toThrow(/validation/i);
  });

  it("the application refuses an invalid document before it reaches the database", async () => {
    const [p] = generate({ config, seed: "db-invalid-app", matches: 1 }).performances;
    await expect(
      insertPerformance(db, { ...p, team: "frc3061" } as TeamMatchPerformance),
    ).rejects.toThrow(/team/);
  });

  describe("performances", () => {
    const dataset = generate({ config, seed: "db", matches: 6, bTeams: 2 });
    const eventId = dataset.performances[0].eventId;

    beforeAll(async () => {
      for (const p of dataset.performances) await insertPerformance(db, p);
    });

    it("round-trip, still valid", async () => {
      const stored = await adminPerformances(db, eventId);
      expect(stored).toHaveLength(dataset.performances.length);
      const byId = new Map(dataset.performances.map((p) => [p._id, p]));
      for (const p of stored) {
        expect(p).toEqual(byId.get(p._id));
        expect(validateDocument("team-match-performance", p).issues).toEqual([]);
      }
    });

    it("SEC-8: a public read never contains scouterId; an admin read does", async () => {
      const pub = await publicPerformances(db, eventId);
      expect(pub).toHaveLength(dataset.performances.length);
      for (const p of pub) expect(Object.hasOwn(p, "scouterId")).toBe(false);
      const admin = await adminPerformances(db, eventId);
      expect(admin.some((p) => typeof p.scouterId === "string")).toBe(true);
    });

    it("a nonce is unique among current records of an event, not among superseded ones", async () => {
      const [p] = dataset.performances;
      const twin = { ...p, _id: oid() };
      await expect(insertPerformance(db, twin)).rejects.toThrow(/duplicate key/);
      await insertPerformance(db, { ...twin, superseded: true });
      await insertPerformance(db, { ...twin, _id: oid(), eventId: oid() });
    });
  });

  describe("events", () => {
    it("round-trip, found by code", async () => {
      const e = await createEvent(db, { tbaKey: "2026mnwi", label: "official", joinCode: "K9X4" });
      expect(e.code).toBe("2026mnwi_official");
      expect(await getEvent(db, e._id)).toEqual(e);
      expect(await findEventByCode(db, "2026mnwi_official")).toEqual(e);
    });

    it("an event code names one event", async () => {
      await createEvent(db, { tbaKey: "2025ilch", label: "official" });
      await expect(createEvent(db, { tbaKey: "2025ilch", label: "official" })).rejects.toThrow(
        /duplicate key/,
      );
    });

    it("SEC-3: a public read never contains the join code", async () => {
      const events = await publicEvents(db);
      expect(events.length).toBeGreaterThanOrEqual(2);
      for (const e of events) expect(Object.hasOwn(e, "joinCode")).toBe(false);
    });
  });

  it("scouters round-trip and list by name (SEC-6)", async () => {
    const base = { tenantId: DEFAULT_TENANT, aliases: [], legacy: false, createdAt: 1 };
    await saveScouter(db, { ...base, _id: "200002", displayName: "Zoe Park" });
    await saveScouter(db, { ...base, _id: "200001", displayName: "Alex Rivera" });
    await saveScouter(db, { ...base, _id: "200002", displayName: "Zoë Park" });
    expect((await getScouter(db, "200002"))?.displayName).toBe("Zoë Park");
    expect((await listScouters(db)).map((s) => s._id)).toEqual(["200001", "200002"]);
  });

  describe("DV-13: settings", () => {
    it("are the defaults until an admin changes one", async () => {
      expect(await getSettings(db, { tenantId: "fresh" })).toEqual(defaultSettings("fresh"));
    });

    it("a change through updateSettings is seen at once, without a restart", async () => {
      const eventId = oid();
      await getSettings(db, { now: 1000 }); // cached
      await updateSettings(
        db,
        { activeEventId: eventId, startRules: { quorum: 4 } },
        { now: 1001 },
      );
      const s = await getSettings(db, { now: 1002 });
      expect(s.activeEventId).toBe(eventId);
      expect(s.startRules).toEqual({ quorum: 4, startOnFirstScouter: false });
      expect(validateDocument("settings", s).issues).toEqual([]);
    });

    it("a change made elsewhere is seen once the short cache expires", async () => {
      const t = 50_000;
      await updateSettings(db, { fieldFlipped: false }, { now: t });
      await settingsCollection(db).updateOne(
        { _id: DEFAULT_TENANT },
        { $set: { fieldFlipped: true } },
      );
      expect((await getSettings(db, { now: t + 1 })).fieldFlipped).toBe(false);
      expect((await getSettings(db, { now: t + SETTINGS_CACHE_MS })).fieldFlipped).toBe(true);
    });

    it("refuses a quorum the start rules cannot use (RT-12a)", async () => {
      await expect(updateSettings(db, { startRules: { quorum: 7 } })).rejects.toThrow(/quorum/);
    });
  });

  describe("DV-14: schedules", () => {
    it("keep the matches and the current match, and prefer the manual schedule (AD-8)", async () => {
      const eventId = oid();
      const match = (n: number, red: Schedule["manual"][0]["red"]) => ({
        level: "qual" as const,
        number: n,
        key: `2026mnwi_qm${n}`,
        red,
        blue: ["111", "222", "333"] as Schedule["manual"][0]["blue"],
      });
      expect(effectiveMatches(await getSchedule(db, eventId))).toEqual([]);
      await updateSchedule(db, eventId, {
        tba: { matches: [match(1, ["3061", "2338B", "4"])], fetchedAt: 5 },
      });
      expect(effectiveMatches(await getSchedule(db, eventId))[0].red[1]).toBe("2338B");
      await updateSchedule(db, eventId, {
        manual: [match(1, ["9", null, null])],
        currentMatch: { level: "qual", number: 1 },
      });
      const s = await getSchedule(db, eventId);
      expect(effectiveMatches(s)[0].red).toEqual(["9", null, null]);
      expect(s.currentMatch).toEqual({ level: "qual", number: 1 });
      expect(s.tba?.matches).toHaveLength(1);
    });

    it("refuses a team that is not a team key (DM-1a)", async () => {
      await expect(
        updateSchedule(db, oid(), {
          manual: [
            {
              level: "qual",
              number: 1,
              key: "m1",
              red: ["frc3061", null, null],
              blue: [null, null, null],
            },
          ],
        }),
      ).rejects.toThrow(/red/);
    });
  });

  describe("DV-15: the saved scouter registry", () => {
    it("RT-24: save returns before the write, and the latest state of an entry wins", async () => {
      const store = createSessionStore(sessionCollection(db));
      const eventId = oid();
      store.save(session(eventId, "100001", { status: "waiting" }));
      store.save(session(eventId, "100001", { status: "scouting", accepted: true }));
      store.save(session(eventId, "100002", { team: "2338B" }));
      await store.flush();
      const saved = await store.load(eventId);
      expect(saved.map((s) => [s.scouterId, s.status, s.team])).toEqual([
        ["100001", "scouting", "3061"],
        ["100002", "waiting", "2338B"],
      ]);
    });

    it("stores no connection state: a restored scouter is disconnected until they reconnect", () => {
      expect(Object.keys(session(oid(), "1"))).not.toContain("connected");
      expect(
        validateDocument("scouter-session", { ...session(oid(), "1"), connected: true }).ok,
      ).toBe(false);
    });

    it("RT-29: an admin can remove one entry, and an event's entries go together", async () => {
      const store = createSessionStore(sessionCollection(db));
      const a = oid();
      const b = oid();
      for (const id of ["1", "2", "3"]) store.save(session(a, id));
      store.save(session(b, "1"));
      await store.flush();
      store.remove(sessionId(a, "2"));
      await store.flush();
      expect((await store.load(a)).map((s) => s.scouterId)).toEqual(["1", "3"]);
      store.removeEvent(a);
      await store.flush();
      expect(await store.load(a)).toEqual([]);
      expect(await store.load(b)).toHaveLength(1);
    });

    it("keeps retrying a failed write while the database is down, and never blocks the caller", async () => {
      const real = sessionCollection(db);
      let failures = 2;
      const flaky: SessionCollection = {
        replaceOne: ((...args: Parameters<typeof real.replaceOne>) =>
          failures-- > 0
            ? Promise.reject(new Error("database unreachable"))
            : real.replaceOne(...args)) as typeof real.replaceOne,
        deleteOne: real.deleteOne.bind(real),
        deleteMany: real.deleteMany.bind(real),
        find: real.find.bind(real),
      };
      const onError = vi.fn();
      const store = createSessionStore(flaky, { retryMs: 5, onError });
      const eventId = oid();
      store.save(session(eventId, "100009"));
      await store.flush();
      expect(onError).toHaveBeenCalledTimes(2);
      expect(await store.load(eventId)).toHaveLength(1);
    });

    it("refuses an invalid entry when it is saved, not later in the background", () => {
      const store = createSessionStore(sessionCollection(db));
      expect(() => store.save(session(oid(), "1", { team: "frc3061" }))).toThrow(/team/);
    });
  });
});
