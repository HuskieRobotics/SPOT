/**
 * T-3/T-5: the v5 → v6 migration, run against the real event exports the behavioral oracle
 * uses (tools/oracle/fixtures/db). These are the two seasons the migration has to cover
 * (DM-7g), so "it works" means "it works on this data", not on a hand-made document.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate, scouterKey, type V5Event, type V5Performance } from "@/migrate/v5-to-v6";
import { validateDocument } from "@/data/validate";
import { DEFAULT_TENANT } from "@/data/types";
import type { MatchScoutingConfig } from "@/config/types";

const root = process.cwd();
const read = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
const NOW = 1758000000000;

const seasons = {
  2025: {
    dump: "2025Reefscape",
    config: ["config", "seasons", "2025", "match-scouting.json"],
    golden: null as string | null,
  },
  2026: {
    dump: "2026Rebuilt",
    config: ["config", "match-scouting.json"],
    golden: "2026mnwi_official-v5",
  },
};

const run = (season: keyof typeof seasons) => {
  const s = seasons[season];
  return migrate(
    {
      performances: read(
        "tools",
        "oracle",
        "fixtures",
        "db",
        `${s.dump}.teamMatchPerformances.json`,
      ) as V5Performance[],
      events: read("tools", "oracle", "fixtures", "db", `${s.dump}.events.json`) as V5Event[],
    },
    { config: read(...s.config) as MatchScoutingConfig, now: NOW },
  );
};

const migrated2025 = run(2025);
const migrated2026 = run(2026);

describe.each([
  ["2025", migrated2025],
  ["2026", migrated2026],
])("%s export migrates to valid v6 documents", (_name, result) => {
  it("produces documents that all pass their schema", () => {
    for (const kind of ["team-match-performance", "event", "scouter"] as const) {
      const documents =
        kind === "team-match-performance"
          ? result.performances
          : kind === "event"
            ? result.events
            : result.scouters;
      const bad = documents
        .map((d) => ({ id: (d as { _id: string })._id, issues: validateDocument(kind, d).issues }))
        .filter((r) => r.issues.length > 0);
      expect(bad).toEqual([]);
    }
  });

  it("carries the tenant on every document", () => {
    for (const d of [...result.performances, ...result.events, ...result.scouters]) {
      expect(d.tenantId).toBe(DEFAULT_TENANT);
    }
  });

  it("stores team numbers as numbers and drops per-action ids", () => {
    for (const p of result.performances) {
      expect(typeof p.robotNumber).toBe("number");
      expect(Number.isFinite(p.robotNumber)).toBe(true);
      expect(typeof p.matchNumber).toBe("number");
      for (const a of p.actions) expect(a).not.toHaveProperty("_id");
    }
  });

  it("places every action, or leaves it explicitly pre-match", () => {
    for (const p of result.performances) {
      for (const a of p.actions) {
        expect(a.phase === null || typeof a.phase === "string").toBe(true);
        expect(Number.isFinite(a.ts)).toBe(true);
      }
    }
  });

  it("keeps the v5 de-duplication key verbatim", () => {
    for (const p of result.performances) {
      expect(p.matchKey.endsWith(p.nonce)).toBe(true);
    }
  });
});

describe("2026 migration against the oracle", () => {
  const { report } = migrated2026;

  it("explains every action id in real data from the configuration alone", () => {
    // The catalog layer is gone, so this is the proof that derived ids cover reality (F-4).
    expect(report.unknownActionIds).toEqual([]);
  });

  it("marks exactly the duplicates the legacy pipeline collapsed", () => {
    const golden = read("tools", "oracle", "golden", seasons[2026].golden!, "report.json") as {
      tmpCount: number;
      derivedTmpCount: number;
    };
    expect(report.performances).toBe(golden.tmpCount);
    expect(report.performances - report.supersededPerformances).toBe(golden.derivedTmpCount);
  });

  it("finds the one action whose id and clock disagree", () => {
    // A rating recorded with the auto prefix at a teleop timestamp: one action in ten thousand,
    // reported rather than silently corrected.
    expect(report.placementMismatches).toHaveLength(1);
    expect(report.placementMismatches[0]).toMatchObject({
      fromId: "auto",
      fromClock: "teleop",
      count: 1,
    });
  });

  it("merges spelling variants of the same scouter and reports them", () => {
    expect(report.mergedScouters.length).toBeGreaterThan(0);
    for (const merged of report.mergedScouters) {
      expect(merged.spellings.length).toBeGreaterThan(1);
      for (const spelling of merged.spellings) expect(scouterKey(spelling)).toBe(merged.id);
    }
    expect(result2026Ids()).toContain("ishnapilgulwar");
  });

  function result2026Ids() {
    return migrated2026.scouters.map((s) => s._id);
  }

  it("resolves shift segments from the composite ids", () => {
    const shifts = migrated2026.performances
      .flatMap((p) => p.actions)
      .filter((a) => a.segment === "shift");
    expect(shifts.length).toBeGreaterThan(100);
    for (const a of shifts) {
      expect(["active", "inactive"]).toContain(a.segmentKind);
      expect(a.segmentIndex).toBeGreaterThanOrEqual(1);
      expect(a.segmentIndex).toBeLessThanOrEqual(4);
      expect(a.phase).toBe("teleop");
    }
  });
});

describe("2025 migration", () => {
  it("recovers phases from the clock, because 2025 ids carry no prefix", () => {
    const actions = migrated2025.performances.flatMap((p) => p.actions);
    const phases = new Set(actions.map((a) => a.phase));
    expect(phases).toContain("auto");
    expect(phases).toContain("teleop");
    // no segments existed in 2025
    expect(actions.every((a) => a.segment === null)).toBe(true);
  });

  it("keeps the hand-written period in the button id untouched", () => {
    const ids = new Set(migrated2025.performances.flatMap((p) => p.actions).map((a) => a.id));
    expect([...ids].some((id) => id.startsWith("teleop"))).toBe(true);
  });

  it("builds a scouter record per person", () => {
    expect(migrated2025.scouters.length).toBeGreaterThan(20);
    for (const s of migrated2025.scouters) {
      expect(s.legacy).toBe(true);
      expect(s._id).toBe(scouterKey(s.displayName));
      expect(s.createdAt).toBe(NOW);
    }
  });
});

describe("migration edge cases", () => {
  const base: V5Performance = {
    _id: { $oid: "a".repeat(24) },
    timestamp: { $numberLong: "1772809355374" },
    clientVersion: "1.0",
    scouterId: "qrcode",
    robotNumber: "3061" as unknown as number,
    matchNumber: 7,
    eventNumber: { $oid: "b".repeat(24) },
    matchId: "7-3061-qrcode-xyz",
    matchId_rand: "xyz",
    actionQueue: [{ id: "autoAttemptL1", ts: 150000 }],
  };

  it("treats a scanned QR record as sourced from QR, with no scouter", () => {
    const { performances } = migrate(
      { performances: [base], events: [] },
      { config: read("config", "match-scouting.json") as MatchScoutingConfig, now: NOW },
    );
    expect(performances[0].source).toBe("qr");
    expect(performances[0].scouterId).toBeNull();
    expect(performances[0].robotNumber).toBe(3061);
    expect(performances[0].submittedAt).toBe(1772809355374);
  });

  it("carries a v5 flag over as a human flag", () => {
    const { performances } = migrate(
      { performances: [{ ...base, flagged: true }], events: [] },
      { config: read("config", "match-scouting.json") as MatchScoutingConfig, now: NOW },
    );
    expect(performances[0].flag).toMatchObject({ flagged: true, source: "human" });
  });

  it("splits an event code that contains underscores in its label", () => {
    const { events } = migrate(
      {
        performances: [],
        events: [{ _id: { $oid: "c".repeat(24) }, code: "2025ilch_SPOT_TestData" }],
      },
      { config: read("config", "match-scouting.json") as MatchScoutingConfig, now: NOW },
    );
    expect(events[0]).toMatchObject({ tbaKey: "2025ilch", label: "SPOT_TestData" });
    expect(validateDocument("event", events[0]).issues).toEqual([]);
  });
});
