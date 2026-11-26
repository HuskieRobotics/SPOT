/**
 * The match schedule (#355): TBA's (RT-22, RT-22a, RT-23, RT-23a, RT-23b) and the manual one
 * (D-4, AD-22 to AD-25a, F-12), and the admin route that serves both. TBA's answers are the
 * recorded fixtures in tools/oracle (T-9); no test calls TBA.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import type { Db } from "mongodb";
import { ADMIN_COOKIE, createAdminSession } from "@/auth/admin-session";
import { proxy } from "@/proxy";
import * as scheduleRoute from "@/app/api/admin/schedule/route";
import { createEvent } from "@/db/events";
import { getSchedule } from "@/db/schedules";
import { forgetCachedSettings, updateSettings } from "@/db/settings";
import type { SpotEvent } from "@/data/types";
import { parseManualSchedule, scheduleTeams, ScheduleError } from "@/schedule/manual";
import { scheduleView, TBA_STALE_MS, type ScheduleView } from "@/schedule/service";
import { matchLabel } from "@/schedule/labels";
import { fetchTbaMatches, scheduleFromTba, TbaError, type TbaMatch } from "@/schedule/tba";
import { getRuntime, resetRuntime } from "@/sessions/runtime";
import { startMongo, type TestMongo } from "../support/mongo";

const fixture = (event: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), "tools/oracle/fixtures/tba", event, "matches.json"), "utf8"),
  ) as TbaMatch[];

describe("RT-22, RT-22a: TBA's schedule", () => {
  const mnwi = scheduleFromTba(fixture("2026mnwi"));

  it("a qualification match keeps TBA's number, and its teams are team keys, red 1 to 3 then blue 1 to 3", () => {
    const tba = fixture("2026mnwi").find((m) => m.key === "2026mnwi_qm12")!;
    const m = mnwi.find((x) => x.key === "2026mnwi_qm12")!;
    expect(m.number).toBe(12);
    expect(m.red).toEqual(tba.alliances.red.team_keys.map((k) => k.slice(3)));
    expect(m.blue).toEqual(tba.alliances.blue.team_keys.map((k) => k.slice(3)));
  });

  it("RT-22a, DV-17: qualifications are 1 to N; playoffs are 1 to 13, then the finals 14 to 16, as the field shows them", () => {
    const quals = mnwi.filter((m) => m.level === "qual");
    const playoffs = mnwi.filter((m) => m.level === "playoff");
    expect(quals.map((m) => m.number)).toEqual(Array.from({ length: 76 }, (_, i) => i + 1));
    expect(playoffs.map((m) => [m.key.split("_")[1], m.number])).toEqual([
      ...Array.from({ length: 13 }, (_, i) => [`sf${i + 1}m1`, i + 1]),
      ["f1m1", 14],
      ["f1m2", 15],
    ]);
    expect(playoffs.map((m) => matchLabel("playoff", m.number, m.key)).slice(12)).toEqual([
      "Playoff 13",
      "Final 1",
      "Final 2",
    ]);
  });

  it("numbers the 2025 event the same way", () => {
    const ilch = scheduleFromTba(fixture("2025ilch"));
    for (const level of ["qual", "playoff"])
      expect(new Set(ilch.filter((m) => m.level === level).map((m) => m.number)).size).toBe(
        ilch.filter((m) => m.level === level).length,
      );
    for (const m of ilch.filter((x) => x.level === "qual"))
      expect(m.key).toBe(`2025ilch_qm${m.number}`);
  });

  it("RT-22a: a playoff that is not FRC's double elimination is numbered from 1 in TBA's order", () => {
    const m = (key: string, comp_level: string, set_number: number, match_number: number) => ({
      key,
      comp_level,
      set_number,
      match_number,
      alliances: { red: { team_keys: [] }, blue: { team_keys: [] } },
    });
    const old = scheduleFromTba([
      m("x_f1m1", "f", 1, 1),
      m("x_qf1m2", "qf", 1, 2),
      m("x_qf1m1", "qf", 1, 1),
      m("x_sf1m1", "sf", 1, 1),
    ]);
    expect(old.map((x) => [x.key, x.number])).toEqual([
      ["x_qf1m1", 1],
      ["x_qf1m2", 2],
      ["x_sf1m1", 3],
      ["x_f1m1", 4],
    ]);
    expect(matchLabel("playoff", 4, "x_f1m1")).toBe("Final 1");
    expect(matchLabel("playoff", 3, "x_sf1m1")).toBe("Playoff 3");
  });

  it("DV-17: names a match as the field does", () => {
    expect(matchLabel("qual", 12)).toBe("Qual 12");
    expect(matchLabel("playoff", 5)).toBe("Playoff 5");
    expect(matchLabel("playoff", 16)).toBe("Final 3");
  });

  it("RT-23b, BL-308: a B robot keeps its letter", () => {
    const [m] = scheduleFromTba([
      {
        key: "2026x_qm1",
        comp_level: "qm",
        set_number: 1,
        match_number: 1,
        alliances: {
          red: { team_keys: ["frc2338B", "frc2338", "frc3061"] },
          blue: { team_keys: ["frc1", "frc2", "frc3"] },
        },
      },
    ]);
    expect(m.red).toEqual(["2338B", "2338", "3061"]);
  });

  it("an event whose schedule TBA has not published yet has no matches", () => {
    expect(scheduleFromTba([])).toEqual([]);
  });
});

describe("RT-23, RT-23a: reading TBA", () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("sends the key and asks for the event's matches", async () => {
    const f = ok([]);
    await fetchTbaMatches("2026mnwi", "k", f);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe("https://www.thebluealliance.com/api/v3/event/2026mnwi/matches");
    expect((init.headers as Record<string, string>)["X-TBA-Auth-Key"]).toBe("k");
    expect(init.signal).toBeDefined(); // OF-7: it cannot hang
  });

  it("T-9: TBA_API_URL points the server at recorded responses, for the browser tests", async () => {
    const f = ok([]);
    vi.stubEnv("TBA_API_URL", "http://127.0.0.1:4999/api/v3/");
    try {
      await fetchTbaMatches("2026mnwi", "k", f);
    } finally {
      vi.unstubAllEnvs();
    }
    const [url] = (f as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4999/api/v3/event/2026mnwi/matches");
  });

  it("says what is wrong, for an admin to act on", async () => {
    await expect(fetchTbaMatches("2026mnwi", undefined, ok([]))).rejects.toThrow(/TBA_API_KEY/);
    await expect(fetchTbaMatches("2026mnwi", "k", ok({}, 401))).rejects.toThrow(/refused/);
    await expect(fetchTbaMatches("2026xxxx", "k", ok({}, 404))).rejects.toThrow(
      /no event 2026xxxx/,
    );
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchTbaMatches("2026mnwi", "k", down)).rejects.toThrow(TbaError);
  });
});

describe("D-4, AD-22 to AD-25a: a typed schedule", () => {
  const row = (
    number: number,
    red: unknown[],
    blue: unknown[] = ["", "", ""],
    locked?: boolean,
  ) => ({
    number,
    red,
    blue,
    locked,
  });

  it("RT-23b: reads team numbers as an admin types them", () => {
    const [m] = parseManualSchedule([row(1, ["3061", " frc254 ", "2338b"], ["", null, "1"], true)]);
    expect(m).toEqual({
      level: "qual",
      number: 1,
      key: "manual_qm1",
      red: ["3061", "254", "2338B"],
      blue: [null, null, "1"],
      locked: true,
    });
  });

  it("refuses what is not a team number, naming the match and the slot", () => {
    expect(() => parseManualSchedule([row(4, ["3061", "abc", ""])])).toThrow(
      /Qual 4, Red 2: "abc" is not a team number/,
    );
    expect(() =>
      parseManualSchedule([
        { level: "playoff", number: 15, red: ["x", "", ""], blue: ["", "", ""] },
      ]),
    ).toThrow(/Final 2, Red 1/);
    expect(() => parseManualSchedule([row(1, ["0", "", ""])])).toThrow(ScheduleError);
  });

  it("refuses a team twice in one match, a match twice, and a short alliance", () => {
    expect(() => parseManualSchedule([row(1, ["3061", "", ""], ["3061", "", ""])])).toThrow(
      /team 3061 is in it twice/,
    );
    expect(() => parseManualSchedule([row(1, ["", "", ""]), row(1, ["", "", ""])])).toThrow(
      /Qual 1 appears twice/,
    );
    // DV-17: Qual 1 and Playoff 1 are different matches.
    expect(
      parseManualSchedule([
        row(1, ["", "", ""]),
        { level: "playoff", number: 1, red: ["", "", ""], blue: ["", "", ""] },
      ]).map((m) => `${m.level}:${m.number}`),
    ).toEqual(["qual:1", "playoff:1"]);
    expect(() => parseManualSchedule([row(1, ["1", "2"])])).toThrow(/three teams/);
  });

  it("F-12: the schedule's teams, once each, in team order", () => {
    const matches = parseManualSchedule([
      row(1, ["3061", "2338B", "254"], ["2338", "", ""]),
      row(2, ["254", "3061", ""], ["", "", ""]),
    ]);
    expect(scheduleTeams(matches)).toEqual(["254", "2338", "2338B", "3061"]);
  });
});

describe("the schedule route (T-5)", () => {
  const ORIGIN = "http://localhost:3000";
  const saved = { ...process.env };
  let mongo: TestMongo;
  let db: Db;
  let event: SpotEvent;
  let cookie: string;
  let tbaUp = true;
  const fetchMock = vi.fn(async (url: string) => {
    if (!tbaUp) throw new TypeError("fetch failed");
    if (url.includes("/event/2026mnwi/matches"))
      return new Response(JSON.stringify(fixture("2026mnwi")), { status: 200 });
    return new Response("{}", { status: 404 });
  });

  async function call(body?: object) {
    const init = {
      method: body ? "POST" : "GET",
      headers: { cookie: `${ADMIN_COOKIE}=${cookie}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    };
    const gate = await proxy(new NextRequest(`${ORIGIN}/api/admin/schedule`, init));
    expect(gate.headers.get("x-middleware-next")).toBe("1");
    const r = body
      ? await scheduleRoute.POST(new Request(`${ORIGIN}/api/admin/schedule`, init))
      : await scheduleRoute.GET();
    const json = (await r.json()) as { schedule?: ScheduleView; message?: string };
    return { status: r.status, ...json };
  }

  beforeAll(async () => {
    mongo = await startMongo("spot-schedule-test");
    db = mongo.db;
    process.env.MONGODB_URI = mongo.uri;
    process.env.SPOT_ADMIN_PASSWORD = "schedule test password";
    process.env.TBA_API_KEY = "test-key-not-real";
    cookie = await createAdminSession();
    vi.stubGlobal("fetch", fetchMock);
    resetRuntime();
  }, 180_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    resetRuntime();
    await mongo?.stop();
    process.env = saved;
  });

  it("says so when no event is active", async () => {
    const r = await call();
    expect(r.status).toBe(409);
    expect(r.message).toMatch(/No event is active/);
  });

  it("RT-22: reads TBA's schedule for the active event and keeps it", async () => {
    event = await createEvent(db, { tbaKey: "2026mnwi", label: "official" });
    await updateSettings(db, { activeEventId: event._id });
    forgetCachedSettings(); // the route reads through its own connection
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.schedule).toMatchObject({
      source: { qual: "tba", playoff: "tba" },
      tbaKey: "2026mnwi",
      tbaError: null,
    });
    expect(r.schedule!.matches).toHaveLength(91);
    expect((await getSchedule(db, event._id)).tba?.matches).toHaveLength(91);
  });

  it("TBA's copy is re-read only when it is old, or when an admin asks", async () => {
    fetchMock.mockClear();
    await call();
    expect(fetchMock).not.toHaveBeenCalled();
    await call({ action: "refresh" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchedAt = (await getSchedule(db, event._id)).tba!.fetchedAt;
    await scheduleView(db, event._id, { now: fetchedAt + TBA_STALE_MS });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("if TBA cannot be read, the last copy stays and the admin is told why", async () => {
    tbaUp = false;
    const r = await call({ action: "refresh" });
    tbaUp = true;
    expect(r.schedule!.matches).toHaveLength(91);
    expect(r.schedule!.tbaError).toMatch(/could not be reached/);
  });

  it("RT-23: without TBA_API_KEY the admin is told, and a typed schedule still works", async () => {
    delete process.env.TBA_API_KEY;
    const r = await call({ action: "refresh" });
    process.env.TBA_API_KEY = "test-key-not-real";
    expect(r.schedule).toMatchObject({ tbaKeyConfigured: false });
    expect(r.schedule!.tbaError).toMatch(/TBA_API_KEY/);
  });

  it("AD-8a: typed playoffs replace only TBA's playoffs", async () => {
    const r = await call({
      action: "save-manual",
      matches: [{ level: "playoff", number: 1, red: ["1", "2", "3"], blue: ["4", "5", "6"] }],
    });
    expect(r.schedule!.source).toEqual({ qual: "tba", playoff: "manual" });
    expect(r.schedule!.matches.filter((m) => m.level === "qual")).toHaveLength(76);
    expect(r.schedule!.matches.filter((m) => m.level === "playoff")).toHaveLength(1);
  });

  it("AD-8: typed qualifications are used instead of TBA's, and survive a restart", async () => {
    const r = await call({
      action: "save-manual",
      matches: [
        { number: 1, red: ["frc3061", "2338b", "254"], blue: ["1", "2", ""], locked: true },
        { number: 2, red: ["", "", ""], blue: ["", "", ""] },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.schedule!.source).toEqual({ qual: "manual", playoff: "tba" });
    expect(r.schedule!.teams).toEqual(expect.arrayContaining(["1", "2", "254", "2338B", "3061"]));
    expect(r.schedule!.matches[0]).toMatchObject({ red: ["3061", "2338B", "254"], locked: true });
    resetRuntime();
    expect((await call()).schedule!.source.qual).toBe("manual");
  });

  it("refuses a typed team that is not a team number, saying where, and saves nothing", async () => {
    const r = await call({
      action: "save-manual",
      matches: [{ number: 1, red: ["3061", "", ""], blue: ["", "seven", ""] }],
    });
    expect(r.status).toBe(400);
    expect(r.message).toMatch(/Qual 1, Blue 2: "seven"/);
    expect((await call()).schedule!.matches[0].red[0]).toBe("3061");
  });

  it("the registry follows the schedule: corrected teams, and a current match that left it", async () => {
    const runtime = await getRuntime();
    await runtime.setMatch({ level: "qual", number: 1 });
    let snapshot = (await runtime.snapshot())!;
    expect(snapshot.match?.red).toEqual(["3061", "2338B", "254"]);
    await call({
      action: "save-manual",
      matches: [{ number: 1, red: ["3061", "2338B", "9999"], blue: ["1", "2", "3"] }],
    });
    snapshot = (await runtime.snapshot())!;
    expect(snapshot.match?.red).toEqual(["3061", "2338B", "9999"]);
    await call({
      action: "save-manual",
      matches: [{ number: 5, red: ["1", "", ""], blue: ["", "", ""] }],
    });
    expect((await runtime.snapshot())!.match).toBeNull();
    expect((await getSchedule(db, event._id)).currentMatch).toBeNull();
  });

  it("DV-17: a playoff match is chosen by level and number, separate from the qualification of that number", async () => {
    await call({ action: "save-manual", matches: [] });
    const runtime = await getRuntime();
    await runtime.setMatch({ level: "playoff", number: 15 });
    const tbaFinal2 = fixture("2026mnwi").find((m) => m.key === "2026mnwi_f1m2")!;
    const match = (await runtime.snapshot())!.match!;
    expect(match.level).toBe("playoff");
    expect(match.red).toEqual(tbaFinal2.alliances.red.team_keys.map((k) => k.slice(3)));
    await expect(runtime.setMatch({ level: "playoff", number: 77 })).rejects.toMatchObject({
      status: 404,
      message: "Playoff 77 is not in the schedule.",
    });
  });

  it("AD-8: an empty typed schedule goes back to TBA's", async () => {
    const r = await call({ action: "save-manual", matches: [] });
    expect(r.schedule).toMatchObject({ source: { qual: "tba", playoff: "tba" }, manual: [] });
  });

  it("refuses an unknown action", async () => {
    expect((await call({ action: "dance" })).status).toBe(400);
  });
});
