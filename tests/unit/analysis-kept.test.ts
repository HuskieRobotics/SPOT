/**
 * Offline analysis (#390; docs/spec/18 OF-3, OF-5, OF-7): the dashboard asks the network first,
 * keeps what it answers under each event, and shows the kept copy, saying so and from when, when
 * the network can't answer. The browser test does it with a service worker
 * (`tests/e2e/offline.spec.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEvent, loadEvents } from "@/components/analysis/data";
import { memoryKept, type KeptStore } from "@/components/analysis/kept";
import { NOT_FLAGGED } from "@/data/types";
import type { EventSummary } from "@/public-data";

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), "utf8"));
const season = (kind: string) => read("config", "seasons", "2025", `${kind}.json`);

const ilch: EventSummary = {
  code: "2025ilch_official",
  tbaKey: "2025ilch",
  label: "official",
  active: false,
  season: "2025",
} as EventSummary;

let n = 0;
const performance = (team: string) => ({
  _id: (++n).toString(16).padStart(24, "0"),
  eventId: "e".repeat(24),
  level: "qual",
  matchNumber: n,
  team,
  source: "app",
  clientVersion: "6.0.0",
  submittedAt: n,
  coverage: "full",
  superseded: false,
  flag: { ...NOT_FLAGGED },
  notes: null,
  tags: [],
  actions: [],
});

/** The server: what each route answers, or "down" for no connection. */
let server: {
  down: boolean;
  performances: unknown[];
  tba: unknown | "fail";
  schedule: unknown[];
  datasetStatus?: number;
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  if (server.down) throw new TypeError("Failed to fetch");
  const url = new URL(String(input), "http://spot.test");
  switch (url.pathname) {
    case "/api/analysis/events":
      return reply({ events: [ilch] });
    case "/api/analysis/dataset":
      return server.datasetStatus
        ? reply({ error: "broken", message: "The database is down." }, server.datasetStatus)
        : reply({ event: ilch, performances: server.performances });
    case "/api/analysis/tba":
      return server.tba === "fail"
        ? reply({ error: "tba", message: "TBA did not answer." }, 502)
        : reply({ tba: server.tba, error: null });
    case "/api/analysis/schedule":
      return reply({ event: ilch, matches: server.schedule });
    case "/api/config/match-scouting":
      return reply({ version: "m1", config: season("match-scouting") });
    case "/api/config/analysis-pipeline":
      return reply({ version: "p1", config: season("analysis-pipeline"), findings: [] });
    case "/api/config/analysis-modules":
      return reply({ version: "a1", config: season("analysis-modules"), findings: [] });
  }
  return reply({ error: "not-found", message: "No such route." }, 404);
});

const TBA = {
  matches: [],
  coprs: {},
  teams: [{ key: "frc3061", team: "3061", nickname: "Huskie Robotics" }],
  fetchedAt: 1,
};
const SCHEDULE = [
  {
    level: "qual",
    number: 1,
    key: "2025ilch_qm1",
    red: ["3061", null, null],
    blue: ["254", null, null],
  },
];

let store: KeptStore;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T09:00:00Z"));
  server = {
    down: false,
    performances: [performance("3061"), performance("254")],
    tba: TBA,
    schedule: SCHEDULE,
  };
  store = memoryKept();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OF-3, OF-5: every event viewed online opens offline", () => {
  it("online, the server's answer, kept under the event; offline, the kept copy, saying so", async () => {
    const online = await loadEvent(ilch, store);
    if (!online.ok) throw new Error(online.message);
    expect(online.value.kept).toBeNull();
    expect(online.value.analysis.teams.map((t) => t.team)).toEqual(["254", "3061"]);
    const kept = await store.event(ilch.code);
    expect(kept?.savedAt).toBe(Date.parse("2026-11-27T09:00:00Z"));
    expect(kept?.inputs.schedule).toEqual(SCHEDULE);

    vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
    server.down = true;
    const offline = await loadEvent(ilch, store);
    if (!offline.ok) throw new Error(offline.message);
    // OF-3: from when, and that there is no connection.
    expect(offline.value.kept).toEqual({
      savedAt: Date.parse("2026-11-27T09:00:00Z"),
      reason: null,
    });
    // The same analysis, the pipeline run on the kept inputs; TBA's names and the schedule too.
    expect(offline.value.analysis.teams).toEqual(online.value.analysis.teams);
    expect(offline.value.analysis.dataset).toEqual(online.value.analysis.dataset);
    expect(offline.value.schedule).toEqual(SCHEDULE);
    expect(offline.value.tba.error).toBeNull();
  });

  it("the dataset is read from the network first: an edit is never hidden by the kept copy", async () => {
    await loadEvent(ilch, store);
    server.performances = [...server.performances, performance("111")];
    const again = await loadEvent(ilch, store);
    if (!again.ok) throw new Error(again.message);
    expect(again.value.kept).toBeNull();
    expect(again.value.performances).toHaveLength(3);
    expect((await store.event(ilch.code))?.inputs.performances).toHaveLength(3);
  });

  it("an event never viewed on this device fails with a message, not a wait", async () => {
    server.down = true;
    const r = await loadEvent(ilch, store);
    expect(r).toEqual({
      ok: false,
      message:
        "No connection, and 2025ilch_official has not been opened on this device while online, so there is no copy of it here.",
    });
  });

  it("OF-7: a server that refuses the data shows the kept copy and says why", async () => {
    await loadEvent(ilch, store);
    server.datasetStatus = 503;
    const r = await loadEvent(ilch, store);
    if (!r.ok) throw new Error(r.message);
    expect(r.value.kept?.reason).toBe(
      "2025ilch_official's data could not be loaded. The database is down.",
    );
  });

  it("TBA's data that can't be refreshed: the kept data, and the reason; the copy keeps it", async () => {
    await loadEvent(ilch, store);
    server.tba = "fail";
    const r = await loadEvent(ilch, store);
    if (!r.ok) throw new Error(r.message);
    expect(r.value.kept).toBeNull();
    expect(r.value.tba).toEqual({
      error: "TBA's data could not be loaded. TBA did not answer.",
      fetchedAt: 1,
    });
    expect(r.value.analysis.teams.find((t) => t.team === "3061")?.nickname).toBe("Huskie Robotics");
    expect((await store.event(ilch.code))?.inputs.tba).toEqual(TBA);
  });
});

describe("OF-3: the list of events", () => {
  it("online, kept; offline, the kept list, saying from when; never online, a message", async () => {
    server.down = true;
    expect(await loadEvents(store)).toEqual({
      ok: false,
      message: "No connection: The list of events could not be loaded.",
    });
    server.down = false;
    expect(await loadEvents(store)).toEqual({ ok: true, value: { events: [ilch], kept: null } });
    server.down = true;
    expect(await loadEvents(store)).toEqual({
      ok: true,
      value: {
        events: [ilch],
        kept: { savedAt: Date.parse("2026-11-27T09:00:00Z"), reason: null },
      },
    });
  });
});
