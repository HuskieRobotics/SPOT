"use client";

/**
 * Scouting without an assignment (OF-1, SC-10, SC-11, #361): with no connection, no one can send
 * the scouter into a match, so they type the match and the team they are watching. A B team
 * ("3061B") is allowed. The alliance comes from the schedule the device last read; when the
 * schedule does not have the team in that match, the scouter chooses it by the robot's bumpers.
 *
 * A robot the registry gave the scouter before the connection dropped is filled in.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MatchLevel } from "@/data/types";
import { cn } from "@/lib/utils";
import {
  allianceIn,
  checkManualMatch,
  keyOf,
  type MatchKey,
  type ScheduleRow,
} from "@/scouter/match";
import { matchLabel } from "@/schedule/labels";
import type { Alliance } from "@/sessions/registry";

const input = "bg-background h-10 rounded-md border px-3";

export function ManualMatchForm({
  assigned,
  assignedAlliance,
  schedule,
  eventKnown,
  onScout,
}: {
  /** The robot the registry last gave the scouter, if any. */
  assigned: MatchKey | null;
  assignedAlliance: Alliance | null;
  schedule: readonly ScheduleRow[];
  /** Whether the device knows its event; without it the match has no QR code. */
  eventKnown: boolean;
  onScout(key: MatchKey, alliance: Alliance): void;
}) {
  const [level, setLevel] = useState<MatchLevel>(assigned?.level ?? "qual");
  const [number, setNumber] = useState(assigned ? String(assigned.number) : "");
  const [team, setTeam] = useState(assigned?.team ?? "");
  // The alliance the scouter chose; cleared when the match or team changes.
  const [picked, setPicked] = useState<Alliance | null>(null);
  const [tried, setTried] = useState(false);

  const checked = checkManualMatch({ level, number, team });
  const key = checked.ok ? checked.key : null;
  const fromAssignment =
    key && assigned && keyOf(key) === keyOf(assigned) ? assignedAlliance : null;
  const fromSchedule = key ? (fromAssignment ?? allianceIn(schedule, key)) : null;
  const alliance = picked ?? fromSchedule;
  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPicked(null);
    };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    if (key && alliance) onScout(key, alliance);
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby="manual-match-title"
      className="flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4 text-left"
    >
      <h2 id="manual-match-title" className="text-lg font-semibold">
        Scout without an assignment
      </h2>
      <p className="text-muted-foreground text-sm">
        No connection, so no one can assign you a robot. Type the match and the team you are
        watching. The match is kept on this device and sent when the connection returns.
      </p>
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Match
          <select
            value={level}
            onChange={(e) => changed(setLevel)(e.target.value as MatchLevel)}
            className={input}
          >
            <option value="qual">Qual</option>
            <option value="playoff">Playoff</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Match number
          <input
            value={number}
            onChange={(e) => changed(setNumber)(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className={input}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Team
        <input
          value={team}
          onChange={(e) => changed(setTeam)(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={input}
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Alliance</legend>
        <div className="flex gap-2">
          {(["red", "blue"] as const).map((a) => (
            <Button
              key={a}
              type="button"
              variant="outline"
              aria-pressed={alliance === a}
              onClick={() => setPicked(a)}
              className={cn(
                "flex-1",
                alliance === a && a === "red" && "bg-alliance-red text-black",
                alliance === a && a === "blue" && "bg-alliance-blue text-black",
              )}
            >
              {a === "red" ? "Red" : "Blue"}
            </Button>
          ))}
        </div>
        {key && !picked && fromSchedule && (
          <span className="text-muted-foreground">
            From {fromAssignment ? "your assignment" : "the schedule on this device"}.
          </span>
        )}
        {key && !fromSchedule && (
          <span className="text-muted-foreground" data-testid="not-in-schedule">
            Team {key.team} is not in {matchLabel(key.level, key.number)} on the schedule this
            device has. Check the numbers, and choose the alliance by the robot&apos;s bumpers.
          </span>
        )}
      </fieldset>
      {!eventKnown && (
        <p className="text-sm">
          This device does not know the event yet, so the match will have no QR code. It is sent
          when the device connects.
        </p>
      )}
      <Button type="submit">Scout this match</Button>
      {tried && (!checked.ok || !alliance) && (
        <p role="alert" className="text-destructive text-sm">
          {checked.ok ? "Choose the robot's alliance." : checked.message}
        </p>
      )}
    </form>
  );
}
