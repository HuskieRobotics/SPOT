/**
 * What the analysis dashboard reads from the server (#382; docs/spec/08 AN-6, AN-9, AN-11a, AN-12;
 * SEC-1, SEC-3, SEC-8; NF-6; F-6; DV-19; T-5, T-9): the routes, against the in-memory MongoDB, with
 * TBA answered from the recorded 2025ilch and 2026mnwi responses.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as analysisModulesRoute from "@/app/api/config/analysis-modules/route";
import * as analysisPipelineRoute from "@/app/api/config/analysis-pipeline/route";
import * as datasetRoute from "@/app/api/analysis/dataset/route";
import * as eventsRoute from "@/app/api/analysis/events/route";
import * as tbaRoute from "@/app/api/analysis/tba/route";
import { buildEnrichedDataset } from "@/analysis/enrichment/tba";
import { teamList } from "@/analysis/teams";
import * as matchScoutingRoute from "@/app/api/config/match-scouting/route";
import { ACTIVE_SEASON, findSeason } from "@/config/load";
import { analysisFile, checkAnalysisFile } from "@/config/serve";
import type { AnalysisPipelineConfig } from "@/config/types";
import { validateDocument } from "@/data/validate";
import {
  DEFAULT_TENANT,
  NOT_FLAGGED,
  type SpotEvent,
  type TbaData,
  type TeamMatchPerformance,
} from "@/data/types";
import { ensureCollections } from "@/db/collections";
import { createEvent } from "@/db/events";
import { insertPerformance } from "@/db/performances";
import { forgetCachedSettings, updateSettings } from "@/db/settings";
import { getTbaData } from "@/db/tba-data";
import { seasonFor } from "@/public-data";
import { TBA_DATA_STALE_MS, tbaDataFor } from "@/public-data/tba";
import { startMongo, type TestMongo } from "../support/mongo";

const ORIGIN = "http://localhost:3000";
const recorded = (event: string, file: string) =>
  readFileSync(join(process.cwd(), "tools", "oracle", "fixtures", "tba", event, `${file}.json`));

/** TBA, answering from the recordings; it can be cut off, and counts what it was asked. */
const tba = { up: true, asked: [] as string[] };
const fetchMock = vi.fn(async (url: string) => {
  tba.asked.push(url);
  if (!tba.up) throw new TypeError("fetch failed");
  const m = /\/event\/(\w+)\/(matches|coprs|teams\/simple)$/.exec(url);
  if (!m || !["2025ilch", "2026mnwi"].includes(m[1])) return new Response("{}", { status: 404 });
  const file = m[2] === "teams/simple" ? "teams" : m[2];
  return new Response(recorded(m[1], file), { status: 200 });
});

let mongo: TestMongo;
let db: Db;
let mnwi: SpotEvent;
let ilch: SpotEvent;
const saved = { ...process.env };

let n = 0;
function record(event: SpotEvent, fields: Partial<TeamMatchPerformance>): TeamMatchPerformance {
  n += 1;
  const nonce = `n${n}`;
  return {
    _id: n.toString(16).padStart(24, "0"),
    tenantId: DEFAULT_TENANT,
    eventId: event._id,
    level: "qual",
    matchNumber: 1,
    team: "3061",
    scouterId: "700001",
    source: "app",
    clientVersion: "6.0.0",
    submittedAt: 1772809355374 + n,
    matchKey: `q1-3061-${nonce}`,
    nonce,
    coverage: "full",
    superseded: false,
    flag: { ...NOT_FLAGGED },
    notes: null,
    tags: [],
    actions: [],
    ...fields,
  };
}

async function get(
  route: { GET: (r: Request) => Response | Promise<Response> },
  path: string,
  headers: Record<string, string> = {},
) {
  const r = await route.GET(new Request(`${ORIGIN}${path}`, { headers }));
  return { status: r.status, headers: r.headers, json: r.status === 304 ? null : await r.json() };
}

beforeAll(async () => {
  mongo = await startMongo("spot-analysis-data-test");
  db = mongo.db;
  await ensureCollections(db);
  process.env.MONGODB_URI = mongo.uri;
  process.env.TBA_API_KEY = "test-key-not-real";
  vi.stubGlobal("fetch", fetchMock);
  mnwi = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
  ilch = await createEvent(db, { tbaKey: "2025ilch", label: "official" });
  await updateSettings(db, { activeEventId: mnwi._id });
  for (const r of [
    record(mnwi, { team: "3061", matchNumber: 2 }),
    record(mnwi, {
      team: "111",
      matchNumber: 1,
      flag: { ...NOT_FLAGGED, flagged: true, reason: "check", source: "human", at: 1 },
    }),
    record(mnwi, { team: "2338B", matchNumber: 1, coverage: "partial" }),
    record(mnwi, { team: "3061", matchNumber: 1, superseded: true }),
    record(mnwi, { team: "3061", level: "playoff", matchNumber: 1 }),
    record(ilch, { team: "254", matchNumber: 4 }),
  ])
    await insertPerformance(db, r);
}, 180_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongo?.stop();
  process.env = saved;
});

beforeEach(() => {
  forgetCachedSettings(); // the routes read through their own connection
  tba.up = true;
  tba.asked = [];
});

describe("SEC-1, SEC-3, DV-12b, AN-11a: anyone may list the events, by code", () => {
  it("lists every event, newest code first, with no join code, saying which is active", async () => {
    const r = await get(eventsRoute, "/api/analysis/events");
    expect(r.status).toBe(200);
    expect(r.json.events).toEqual([
      {
        code: "2026mnwi_official",
        tbaKey: "2026mnwi",
        label: "official",
        active: true,
        season: "active",
      },
      {
        code: "2025ilch_official",
        tbaKey: "2025ilch",
        label: "official",
        active: false,
        season: "2025",
      },
    ]);
    expect(JSON.stringify(r.json)).not.toContain(mnwi.joinCode!);
  });
});

describe("AN-6, SEC-1, SEC-8: an event's scouting data", () => {
  it("the active event's current records, without scouter ids, qualifications first", async () => {
    const r = await get(datasetRoute, "/api/analysis/dataset");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(r.json.event).toMatchObject({ code: "2026mnwi_official", active: true });
    const ps = r.json.performances as TeamMatchPerformance[];
    // RT-14a, TR-5: the superseded record is not sent; AN-18a, RT-34: flagged and partial are.
    expect(ps.map((p) => [p.level, p.matchNumber, p.team])).toEqual([
      ["qual", 1, "111"],
      ["qual", 1, "2338B"],
      ["qual", 2, "3061"],
      ["playoff", 1, "3061"],
    ]);
    expect(ps.find((p) => p.team === "111")?.flag.flagged).toBe(true);
    expect(ps.find((p) => p.team === "2338B")?.coverage).toBe("partial");
    expect(JSON.stringify(r.json)).not.toContain("700001");
    for (const p of ps) expect(p).not.toHaveProperty("scouterId");
  });

  it("AN-11a: any event by its code, not only the active one", async () => {
    const r = await get(datasetRoute, "/api/analysis/dataset?event=2025ilch_official");
    expect(r.json.event).toMatchObject({ code: "2025ilch_official", active: false });
    expect(r.json.performances.map((p: TeamMatchPerformance) => p.team)).toEqual(["254"]);
  });

  it("says what is wrong for an unknown code, and when no event is active", async () => {
    let r = await get(datasetRoute, "/api/analysis/dataset?event=2026xxxx_official");
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "no-event", message: "There is no event 2026xxxx_official." });
    await updateSettings(db, { activeEventId: null });
    forgetCachedSettings();
    r = await get(datasetRoute, "/api/analysis/dataset");
    expect(r.status).toBe(404);
    expect(r.json.message).toBe("No event is active. Choose an event.");
    await updateSettings(db, { activeEventId: mnwi._id });
  });

  it("D-5, #90: the server reads MongoDB only; it never asks TBA or itself for the dataset", async () => {
    await get(datasetRoute, "/api/analysis/dataset");
    expect(tba.asked).toEqual([]);
  });
});

describe("AN-6, AN-9, AN-12, NF-6, F-6, T-9: an event's TBA data", () => {
  it("reads matches, COPRs and teams for the event, keeps them under it, and gives the enrichment what it needs", async () => {
    const r = await get(tbaRoute, "/api/analysis/tba?event=2026mnwi_official");
    expect(r.status).toBe(200);
    expect(r.json.error).toBeNull();
    expect(tba.asked.map((u) => u.replace(/^.*\/api\/v3/, ""))).toEqual([
      "/event/2026mnwi/matches",
      "/event/2026mnwi/coprs",
      "/event/2026mnwi/teams/simple",
    ]);
    const { matches, coprs, teams, fetchedAt } = r.json.tba;
    expect(matches).toHaveLength(91);
    expect(Object.keys(coprs)).toContain("Hub Auto Fuel Count");
    expect(teams).toContainEqual({ team: "111", nickname: "WildStang" });
    expect(fetchedAt).toBeGreaterThan(0);
    // Only what enrichment reads is kept (DV-19).
    expect(Object.keys(matches[0]).sort()).toEqual(
      ["alliances", "comp_level", "match_number", "score_breakdown"].sort(),
    );
    const kept = (await getTbaData(db, mnwi._id)) as TbaData;
    expect(validateDocument("tba-data", kept).issues).toEqual([]);

    // DM-11a, DM-13a: the browser's enrichment runs on it as on the recorded responses.
    const pipeline = JSON.parse(
      readFileSync(join(process.cwd(), "config", "analysis-pipeline.json"), "utf8"),
    ) as AnalysisPipelineConfig;
    const live = buildEnrichedDataset([], pipeline.enrichment.tba, { matches, coprs });
    const fromFiles = buildEnrichedDataset([], pipeline.enrichment.tba, {
      matches: JSON.parse(recorded("2026mnwi", "matches").toString()),
      coprs: JSON.parse(recorded("2026mnwi", "coprs").toString()),
    });
    expect(live.scoreBreakdownIds).toEqual(fromFiles.scoreBreakdownIds);
  });

  it("F-6: each event keeps its own copy", async () => {
    const r = await get(tbaRoute, "/api/analysis/tba?event=2025ilch_official");
    expect(r.json.tba.teams).toContainEqual({ team: "10214", nickname: "Team Doritos" });
    expect((await getTbaData(db, ilch._id))?.tbaKey).toBe("2025ilch");
    expect((await getTbaData(db, mnwi._id))?.tbaKey).toBe("2026mnwi");
  });

  it("NF-6: TBA is read again only when the copy is more than five minutes old", async () => {
    const kept = (await getTbaData(db, mnwi._id))!;
    await tbaDataFor(db, mnwi, { now: kept.fetchedAt + TBA_DATA_STALE_MS - 1 });
    expect(tba.asked).toEqual([]);
    await tbaDataFor(db, mnwi, { now: kept.fetchedAt + TBA_DATA_STALE_MS });
    expect(tba.asked).toHaveLength(3);
  });

  it("when TBA can't be read, the last copy is used and the answer says why", async () => {
    const kept = (await getTbaData(db, mnwi._id))!;
    tba.up = false;
    const later = kept.fetchedAt + TBA_DATA_STALE_MS + 1;
    const view = await tbaDataFor(db, mnwi, { now: later });
    expect(view.error).toBe("The Blue Alliance could not be reached.");
    expect(view.data?.fetchedAt).toBe(kept.fetchedAt);
    expect(view.data?.matches).toHaveLength(91);
  });

  it("RT-23: with no key, or an event TBA doesn't know, it says so and has no data", async () => {
    const other = await createEvent(db, { tbaKey: "2026xxxx", label: "practice" });
    expect(await tbaDataFor(db, other, { apiKey: "" })).toEqual({
      data: null,
      error:
        "This server has no TBA_API_KEY, so the dashboard shows scouting data without TBA's results and OPRs.",
    });
    expect(await tbaDataFor(db, other)).toEqual({
      data: null,
      error: "TBA has no event 2026xxxx.",
    });
  });

  it("two requests at once share one read of TBA", async () => {
    const kept = (await getTbaData(db, ilch._id))!;
    const later = kept.fetchedAt + TBA_DATA_STALE_MS;
    await Promise.all([tbaDataFor(db, ilch, { now: later }), tbaDataFor(db, ilch, { now: later })]);
    expect(tba.asked).toHaveLength(3);
  });
});

describe("AN-12, A-37: the team list", () => {
  it("every team with data, in team order, named by TBA when it knows the team", () => {
    expect(
      teamList(
        [{ team: "3061" }, { team: "2338B" }, { team: "111" }, { team: "3061" }, { team: "254" }],
        [
          { team: "111", nickname: "WildStang" },
          { team: "254", nickname: null },
          { team: "9999", nickname: "No data" },
        ],
      ),
    ).toEqual([
      { team: "111", nickname: "WildStang" },
      { team: "254", nickname: null },
      { team: "2338B", nickname: null },
      { team: "3061", nickname: null },
    ]);
    expect(teamList([{ team: "3061" }], null)).toEqual([{ team: "3061", nickname: null }]);
  });
});

describe("CS-17, OF-8: the analysis files, for the dashboard", () => {
  for (const [kind, route, list] of [
    ["analysis-pipeline", analysisPipelineRoute, "pipeline"],
    ["analysis-modules", analysisModulesRoute, "modules"],
  ] as const) {
    it(`${kind}: the file with its version as the ETag, 304 when unchanged, and what config:check finds`, async () => {
      const r = await get(route, `/api/config/${kind}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(r.json.version).toMatch(/^[0-9a-f]{12}$/);
      expect(Array.isArray(r.json.config[list])).toBe(true);
      // The active 2026 files have errors (#392 fixes them); they are served, with the findings.
      expect(Array.isArray(r.json.findings)).toBe(true);
      for (const f of r.json.findings) expect(f.file).toBe(kind);
      const again = await get(route, `/api/config/${kind}`, {
        "if-none-match": r.headers.get("etag")!,
      });
      expect(again.status).toBe(304);
    });
  }

  it("the findings are config:check's own, file by file", () => {
    const pipeline = analysisFile("analysis-pipeline", findSeason(ACTIVE_SEASON)!)!;
    expect(pipeline.findings.some((f) => /"attemptClimb" is not a button id/.test(f.message))).toBe(
      true,
    );
    expect(pipeline.problem).toBeNull();
  });

  it("CS-17: an event's season reads it: the season named for its year, else the active one", async () => {
    expect(seasonFor("2025ilch")).toBe("2025");
    expect(seasonFor("2026mnwi")).toBe(ACTIVE_SEASON);
    expect(seasonFor("2027week0")).toBe(ACTIVE_SEASON);
    for (const [route, kind] of [
      [analysisPipelineRoute, "analysis-pipeline"],
      [analysisModulesRoute, "analysis-modules"],
      [matchScoutingRoute, "match-scouting"],
    ] as const) {
      const r = await get(route, `/api/config/${kind}?season=2025`);
      const file = readFileSync(
        join(process.cwd(), "config", "seasons", "2025", `${kind}.json`),
        "utf8",
      );
      expect(r.status).toBe(200);
      expect(r.json.config).toEqual(JSON.parse(file));
      const missing = await get(route, `/api/config/${kind}?season=../secrets`);
      expect(missing.status).toBe(404);
      expect(missing.json.message).toBe("There is no season ../secrets.");
    }
  });

  it("a file that can't be used at all is refused, saying why", () => {
    expect(
      checkAnalysisFile("analysis-pipeline", { "analysis-pipeline": "{ not json" }),
    ).toMatchObject({
      config: null,
      problem: "config/analysis-pipeline.json is not valid JSON.",
    });
    expect(
      checkAnalysisFile("analysis-modules", { "analysis-modules": '{ "version": 2 }' }),
    ).toMatchObject({
      config: null,
      problem: 'config/analysis-modules.json has no "modules" list.',
    });
    expect(checkAnalysisFile("analysis-modules", {})).toBeNull();
  });
});
