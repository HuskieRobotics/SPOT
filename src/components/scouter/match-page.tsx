"use client";

/**
 * The match screen in the scouting client (#359): the scouting screen from #322, filling the
 * device's screen in landscape, with the status line's connection, match and team (SC-1). Each
 * press is saved on the device as it happens, so a reload resumes the same presses and clock
 * (RT-26). The alliance comes from the schedule and the field orientation from the admin
 * setting, which place the alliance-relative buttons and turn the map (SC-28).
 */
import { useCallback, useMemo, type ReactNode } from "react";
import { ScoutingScreen } from "@/components/scouting/scouting-screen";
import { useScoutingSession } from "@/components/scouting/use-scouting-session";
import type { MatchScoutingConfig } from "@/config/types";
import type { ActiveMatch } from "@/scouter/match";
import type { SessionState } from "@/scouting/session";

export function MatchPage({
  match,
  config,
  fieldFlipped,
  onChange,
  status,
}: {
  match: ActiveMatch;
  config: MatchScoutingConfig;
  fieldFlipped: boolean;
  /** After every press, with the new state: save it, and act on a start or a submit. */
  onChange(state: SessionState): void;
  /** The status line's left side, given the clock's speed control (BL-230). */
  status(speed: { value: number; set(speed: number): void }): ReactNode;
}) {
  const settings = useMemo(
    () => ({ alliance: match.alliance, fieldFlipped }),
    [match.alliance, fieldFlipped],
  );
  const session = useScoutingSession(config, settings, {
    initial: match.state,
    onChange: useCallback((state: SessionState) => onChange(state), [onChange]),
  });
  const speed = { value: session.state.clock.speed, set: session.setSpeed };
  return (
    <div className="fixed inset-0">
      <ScoutingScreen session={session} status={status(speed)} />
    </div>
  );
}
