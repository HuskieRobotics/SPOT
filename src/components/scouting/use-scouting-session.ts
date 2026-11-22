"use client";

/**
 * Runs one scouting session (src/scouting/session.ts) in React: holds the state, ticks the clock
 * on every animation frame while something on screen changes with time, and passes the real time
 * to every operation. The scouting-screen preview uses it, and so will the Phase 2 client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchScoutingConfig } from "@/config/types";
import {
  advance,
  initialState,
  placePosition,
  press,
  setSpeed,
  skip,
  type ButtonRef,
  type ScoutingContext,
  type ScoutingSettings,
  type SessionState,
} from "@/scouting/session";
import { MATCH_COMPLETE_MS } from "@/scouting/view";

export interface ScoutingSession {
  state: SessionState;
  context: ScoutingContext;
  /** The real time the state was last brought up to; what the screen shows depends on it. */
  now: number;
  press(ref: ButtonRef): void;
  placePosition(tap: { x: number; y: number }): void;
  /** Jump to the next phase, segment or shift (the preview's skip control). */
  skip(): void;
  setSpeed(speed: number): void;
  /** A fresh session at the same speed. */
  restart(): void;
}

/** Whether the screen still changes with time, so the clock must keep ticking. */
function changesWithTime(state: SessionState, now: number): boolean {
  if (state.status === "running") return true;
  if (state.status === "ended" && state.endedAt !== null) {
    if (now - state.endedAt < MATCH_COMPLETE_MS) return true;
  }
  return state.positionLock !== null && now <= state.positionLock.until;
}

export function useScoutingSession(
  config: MatchScoutingConfig,
  settings: ScoutingSettings,
): ScoutingSession {
  const context = useMemo(() => ({ config, settings }), [config, settings]);
  const [state, setState] = useState(() => initialState(config));
  const [now, setNow] = useState(0);

  // The ticker and the operations read the latest context without restarting.
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const ticking = changesWithTime(state, now);
  useEffect(() => {
    if (!ticking) return;
    let frame = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setState((s) => advance(s, contextRef.current, t));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ticking]);

  const run = useCallback(
    (operation: (s: SessionState, c: ScoutingContext, t: number) => SessionState) => {
      const t = Date.now();
      setNow(t);
      setState((s) => operation(s, contextRef.current, t));
    },
    [],
  );

  return {
    state,
    context,
    now,
    press: useCallback((ref: ButtonRef) => run((s, c, t) => press(s, c, ref, t)), [run]),
    placePosition: useCallback(
      (tap: { x: number; y: number }) => run((s, c, t) => placePosition(s, c, tap, t)),
      [run],
    ),
    skip: useCallback(() => run((s, c, t) => skip(s, c, t)), [run]),
    setSpeed: useCallback((speed: number) => run((s, c, t) => setSpeed(s, c, t, speed)), [run]),
    restart: useCallback(
      () => run((s, c, t) => setSpeed(initialState(c.config), c, t, s.clock.speed)),
      [run],
    ),
  };
}
