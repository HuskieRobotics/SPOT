/**
 * Synthetic scouting data: drives the real ScoutingEngine with random (seeded) button presses so
 * pipelines and dashboards can be built and tested before any real match has been scouted.
 */
import type { Match, ScoutingConfig, TeamMatchPerformance } from "../types";
import { ScoutingEngine } from "./engine";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function synthesizeMatch(cfg: ScoutingConfig, opts: { matchNumber: number; robotNumber: number; skill: number; seed: number; alliance?: "red" | "blue" }): TeamMatchPerformance {
  const rand = rng(opts.seed);
  const engine = new ScoutingEngine(cfg, { swapZones: false, alliance: opts.alliance ?? null });
  let now = 1_000_000;
  // Optional pre-match presses (e.g. preload), then start.
  const pre = engine.visibleButtons().filter((b) => b.type === "action");
  if (pre.length && rand() < 0.8) engine.press(pre[Math.floor(rand() * pre.length)].uid, now);
  const start = engine.visibleButtons().find((b) => b.type === "match-control");
  if (!start) throw new Error("Layer 0 has no match-control button");
  engine.press(start.uid, now);

  let guard = 0;
  while (engine.status === "running" && guard++ < 2000) {
    // Better robots act more often.
    now += 1500 + rand() * (9000 - opts.skill * 6000);
    engine.tick(now);
    if (engine.status !== "running") break;
    const choices = engine.visibleButtons().filter((b) => !b.disabled && (b.type === "action" || b.type === "none") && !engine.isAStopButton(b));
    if (!choices.length) continue;
    const weighted = choices.flatMap((b) => {
      // Prefer "good" outcomes for skilled robots: ratings ending in a higher digit, ids without miss/fail.
      const id = b.id.toLowerCase();
      let w = 1;
      const digit = id.match(/(\d)$/);
      if (digit) w = 1 + (Number(digit[1]) - 2.5) * (opts.skill - 0.5) * 1.5;
      if (/miss|fail|drop|fall|broken|disabled/.test(id)) w *= 0.35 + (1 - opts.skill) * 0.5;
      return Array(Math.max(1, Math.round(w * 3))).fill(b);
    });
    const b = weighted[Math.floor(rand() * weighted.length)];
    const effects = engine.press(b.uid, now);
    for (const e of effects) if (e.type === "requestPosition") engine.setPosition(e.entryIndex, { x: Math.round(rand() * 100), y: Math.round(rand() * 100) }, now);
  }
  const r = Math.floor(rand() * 2 ** 32).toString(32);
  return {
    matchId: `${opts.matchNumber}-${opts.robotNumber}-synthetic-${r}`,
    matchId_rand: r,
    timestamp: 1_700_000_000_000 + opts.matchNumber * 600_000,
    clientVersion: "synthetic",
    scouterId: "synthetic",
    robotNumber: opts.robotNumber,
    matchNumber: opts.matchNumber,
    eventNumber: "synthetic",
    flagged: false,
    actionQueue: engine.submittedActions(),
  };
}

/** A small fake event: `teams` teams, `matches` qualification matches, six robots each. */
export function synthesizeEvent(cfg: ScoutingConfig, teams = 18, matches = 24, seed = 3061): { tmps: TeamMatchPerformance[]; schedule: Match[] } {
  const rand = rng(seed);
  const numbers = Array.from({ length: teams }, (_, i) => 100 + Math.floor(rand() * 9000) + i);
  const skill = new Map(numbers.map((n) => [n, 0.15 + rand() * 0.8]));
  const tmps: TeamMatchPerformance[] = [];
  const schedule: Match[] = [];
  for (let m = 1; m <= matches; m++) {
    const pool = [...numbers].sort(() => rand() - 0.5).slice(0, 6);
    schedule.push({ number: m, match_string: `synthetic_qm${m}`, robots: { red: pool.slice(0, 3).map(String), blue: pool.slice(3).map(String) } });
    pool.forEach((robot, i) =>
      tmps.push(synthesizeMatch(cfg, { matchNumber: m, robotNumber: robot, skill: skill.get(robot)!, seed: seed * 1000 + m * 10 + i, alliance: i < 3 ? "red" : "blue" })),
    );
  }
  return { tmps, schedule };
}
