"use client";

/**
 * The current match (AD-7, RT-16, DV-17), the start (AD-6, RT-12a) and its rules (RT-14b), and the
 * field orientation every device uses (A-19, SC-28).
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MatchRef, ScheduledMatch, Settings } from "@/data/types";
import { cn } from "@/lib/utils";
import { matchLabel } from "@/schedule/labels";
import type { ScheduleView } from "@/schedule/service";
import type { AdminSnapshot } from "@/sessions/runtime";
import { field, panel } from "./styles";

interface Props {
  snapshot: AdminSnapshot | null;
  schedule: ScheduleView | null;
  scheduleError: string | null;
  settings: Settings;
  setMatch: (match: MatchRef | null, label: string) => Promise<boolean>;
  start: () => Promise<boolean>;
  setSettings: (change: object) => Promise<boolean>;
}

function Teams({ match }: { match: Pick<ScheduledMatch, "red" | "blue"> }) {
  const side = (teams: (string | null)[], alliance: "red" | "blue") => (
    <span className="flex gap-1">
      {teams.map((t, i) => (
        <span
          key={i}
          className={cn(
            // Black text: white on the alliance colours is below 4.5:1.
            "min-w-12 rounded px-1.5 py-0.5 text-center font-mono text-sm text-black",
            alliance === "red" ? "bg-alliance-red" : "bg-alliance-blue",
          )}
        >
          {t ?? "—"}
        </span>
      ))}
    </span>
  );
  return (
    <span className="flex flex-wrap gap-2">
      {side(match.red, "red")}
      {side(match.blue, "blue")}
    </span>
  );
}

export function MatchPanel(props: Props) {
  const { snapshot, schedule, scheduleError, settings, setMatch, start, setSettings } = props;
  const current = snapshot?.match ?? null;
  const matches = schedule?.matches ?? [];
  const at = current
    ? matches.findIndex((m) => m.level === current.level && m.number === current.number)
    : -1;
  const labelOf = (m: Pick<ScheduledMatch, "level" | "number" | "key">) =>
    matchLabel(m.level, m.number, m.key);
  const currentLabel = current ? matchLabel(current.level, current.number, matches[at]?.key) : null;
  const go = (m: ScheduledMatch | undefined) =>
    m && setMatch({ level: m.level, number: m.number }, labelOf(m));
  const next = at >= 0 ? matches[at + 1] : matches[0];
  const previous = at > 0 ? matches[at - 1] : undefined;

  return (
    <section aria-labelledby="match-heading" className={panel}>
      <h2 id="match-heading" className="text-xl font-semibold">
        Match
      </h2>
      {current ? (
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold" aria-label="Current match">
            {currentLabel}
          </p>
          <Teams match={current} />
        </div>
      ) : (
        <p className="text-muted-foreground">No match is chosen, so no one is assigned a robot.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!previous} onClick={() => go(previous)}>
          Previous match
        </Button>
        <Button variant="outline" disabled={!next} onClick={() => go(next)}>
          {current ? "Next match" : "First match"}
        </Button>
        <Button variant="ghost" disabled={!current} onClick={() => setMatch(null, "No match")}>
          No match
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <div>
          <Button onClick={start} disabled={!current}>
            Start match
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Sends in every connected scouter waiting on this match. Without it, a match starts on its
          own when the quorum is waiting
          {settings.startRules.startOnFirstScouter ? ", or when one scouter starts" : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Quorum
            <select
              value={settings.startRules.quorum}
              onChange={(e) => setSettings({ startRules: { quorum: Number(e.target.value) } })}
              className={field}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.startRules.startOnFirstScouter}
              onChange={(e) =>
                setSettings({ startRules: { startOnFirstScouter: e.target.checked } })
              }
            />
            Start on first scouter
          </label>
        </div>
        <p className="text-muted-foreground text-xs">
          Set the quorum to the number of scouters staffed per match; anyone later waits for Start
          match. Start on first scouter sends in everyone waiting when one of them starts.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1 border-t pt-3 text-sm">
        <legend className="font-medium">Field orientation</legend>
        <div className="flex gap-4">
          {[false, true].map((flipped) => (
            <label key={String(flipped)} className="flex items-center gap-2">
              <input
                type="radio"
                name="field-orientation"
                checked={settings.fieldFlipped === flipped}
                onChange={() => setSettings({ fieldFlipped: flipped })}
              />
              {flipped ? "Flipped" : "Normal"}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Flipped turns the field map around and swaps the alliance buttons&apos; places. Choose the
          one where SPOT matches the field as scouters see it from their seats. Every device follows
          the change.
        </p>
      </fieldset>

      <div className="flex flex-col gap-2 border-t pt-3">
        <h3 className="font-medium">Schedule</h3>
        {scheduleError && <p className="text-destructive text-sm">{scheduleError}</p>}
        {/* TBA matters here only when nothing else gives matches; the schedule page says more. */}
        {schedule?.tbaError && matches.length === 0 && (
          <p className="text-destructive text-sm">{schedule.tbaError}</p>
        )}
        {matches.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No matches yet. TBA publishes the schedule shortly before an event, or{" "}
            <Link
              href="/admin/schedule"
              className="text-primary underline-offset-4 hover:underline"
            >
              type it
            </Link>
            .
          </p>
        ) : (
          <ol className="flex max-h-96 flex-col gap-1 overflow-y-auto" aria-label="Matches">
            {matches.map((m, i) => {
              const label = labelOf(m);
              return (
                <li
                  key={`${m.level}:${m.number}`}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-md px-2 py-1",
                    i === at && "bg-accent",
                  )}
                >
                  <span className="w-20 font-medium">{label}</span>
                  <Teams match={m} />
                  {i === at ? (
                    <span className="text-sm font-medium">Current</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Choose ${label}`}
                      onClick={() => go(m)}
                    >
                      Choose
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <Link
          href="/admin/schedule"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Match schedule: read TBA again, or type matches
        </Link>
      </div>
    </section>
  );
}
