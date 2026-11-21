/**
 * The match clock (docs/spec/05 SC-19 to SC-21, BL-298, BL-230, NF-3).
 *
 * The clock counts down from `timing.totalMs`. Time remaining is derived from the real time that
 * has passed since the start, never accumulated tick by tick, so a slow device cannot drift
 * (NF-3). A phase with `pauseMs` holds the clock at its start for that long, the way the field
 * timer pauses between auto and teleop (BL-298).
 *
 * Progress is how far the match has advanced, in milliseconds at normal speed, holds included.
 * A speed other than 1 plays the match faster (the scouting-screen preview, and later the guarded
 * 2x control for scouting from video, BL-230). Everything here is pure: the caller passes the
 * real time, so tests need no timers.
 */
import type { MatchScoutingConfig } from "@/config/types";

export interface Clock {
  /** Real time (ms) at which `progress` was last set; null while the clock is stopped. */
  since: number | null;
  /** Match progress at `since`, in ms at speed 1, holds included. */
  progress: number;
  /** How many match milliseconds pass per real millisecond. */
  speed: number;
}

export const STOPPED: Clock = { since: null, progress: 0, speed: 1 };

export function startClock(now: number, speed = 1): Clock {
  return { since: now, progress: 0, speed };
}

/** Match progress at real time `now`. */
export function progressOf(clock: Clock, now: number): number {
  if (clock.since === null) return clock.progress;
  return clock.progress + Math.max(0, now - clock.since) * clock.speed;
}

/** The same clock running at another speed from `now` on. */
export function withSpeed(clock: Clock, now: number, speed: number): Clock {
  return { since: clock.since === null ? null : now, progress: progressOf(clock, now), speed };
}

/** The same clock moved to `progress` at `now`. */
export function withProgress(clock: Clock, now: number, progress: number): Clock {
  return { ...clock, since: clock.since === null ? null : now, progress };
}

interface Hold {
  atMs: number;
  pauseMs: number;
}

/** The phases that hold the clock, in the order the match reaches them. */
function holds(config: MatchScoutingConfig): Hold[] {
  return config.timing.phases
    .filter((p) => (p.pauseMs ?? 0) > 0)
    .map((p) => ({ atMs: p.startMs, pauseMs: p.pauseMs! }))
    .sort((a, b) => b.atMs - a.atMs);
}

export interface ClockReading {
  /** Match time remaining, in ms (DM-3). Never below 0. */
  remaining: number;
  /** While a phase's hold is running: how much of it is left, in match ms. */
  holding: number | null;
}

/** What the clock shows after `progress` (SC-20, BL-298). */
export function readClock(config: MatchScoutingConfig, progress: number): ClockReading {
  let remaining = config.timing.totalMs;
  let left = progress;
  for (const hold of holds(config)) {
    const toHold = remaining - hold.atMs;
    if (left < toHold) break;
    left -= toHold;
    remaining = hold.atMs;
    if (left < hold.pauseMs) return { remaining, holding: hold.pauseMs - left };
    left -= hold.pauseMs;
  }
  return { remaining: Math.max(0, remaining - left), holding: null };
}

/** The progress at which the clock first shows `ts` remaining: the inverse of `readClock`. */
export function progressFor(config: MatchScoutingConfig, ts: number): number {
  let progress = config.timing.totalMs - Math.max(0, ts);
  for (const hold of holds(config)) if (hold.atMs > ts) progress += hold.pauseMs;
  return progress;
}

/**
 * Every time remaining at which something begins: a phase, a segment, a segment's repeat, and the
 * end of the match at 0. Highest first.
 */
export function boundaries(config: MatchScoutingConfig): number[] {
  const out = new Set<number>([0]);
  for (const phase of config.timing.phases) {
    out.add(phase.startMs);
    for (const segment of phase.segments ?? []) {
      out.add(segment.startMs);
      for (let i = 1; i < (segment.repeat?.count ?? 0); i++) {
        out.add(segment.startMs - i * segment.repeat!.intervalMs);
      }
    }
  }
  return [...out].filter((t) => t >= 0 && t <= config.timing.totalMs).sort((a, b) => b - a);
}

/** The next boundary after `ts` remaining, or 0 when none is left before the end. */
export function nextBoundary(config: MatchScoutingConfig, ts: number): number {
  return boundaries(config).find((t) => t < ts) ?? 0;
}
