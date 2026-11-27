"use client";

/**
 * Simulate Match (#389; docs/spec/08 AN-23), when `simulateMatch` turns it on: choose a match from
 * the event's schedule, or up to three red and three blue teams, and the match-view modules show
 * each alliance. A `wholeMatch` module is also given the other alliance, for the chance of winning.
 *
 * As in v5, a match fills the six choices, a team the dashboard has no data for is left empty, and
 * choosing a team clears the match. An alliance with no team chosen shows no modules. v5 changed
 * the alliances it was given when it added the other alliance (F-18); nothing here does.
 */
import { useEffect, useState } from "react";
import type { TeamKey } from "@/data/team";
import { matchLabel } from "@/schedule/labels";
import { cn } from "@/lib/utils";
import { loadSchedule, type LoadedEvent, type ScheduleMatch } from "./data";
import { AnalysisModule } from "./modules";
import { brokenModules } from "./team-view";

type Side = "red" | "blue";
const SIDES: Side[] = ["red", "blue"];
const EMPTY: (TeamKey | "")[] = ["", "", ""];

function AllianceColumn({
  loaded,
  side,
  teams,
  opponents,
}: {
  loaded: LoadedEvent;
  side: Side;
  teams: TeamKey[];
  opponents: TeamKey[];
}) {
  const modules = loaded.modules.modules.filter((m) => m.view === "match");
  const broken = brokenModules(loaded);
  const name = side === "red" ? "Red alliance" : "Blue alliance";
  return (
    <section aria-label={name} className="flex min-w-0 flex-col gap-4">
      <h3
        className={cn(
          "rounded-md px-3 py-1 text-lg font-semibold text-black",
          side === "red" ? "bg-alliance-red" : "bg-alliance-blue",
        )}
      >
        {name}
        {teams.length > 0 && <span className="font-normal"> · {teams.join(", ")}</span>}
      </h3>
      {teams.length === 0 ? (
        <p className="text-muted-foreground text-sm">Choose a team for this alliance.</p>
      ) : modules.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          The season&apos;s analysis-modules.json has no match-view modules.
        </p>
      ) : (
        modules.map((m) => {
          const index = loaded.modules.modules.indexOf(m);
          return (
            <AnalysisModule
              key={index}
              module={m}
              teams={teams}
              opponents={m.wholeMatch ? opponents : undefined}
              dataset={loaded.analysis.dataset}
              matchScouting={loaded.matchScouting}
              broken={broken.has(index)}
            />
          );
        })
      )}
    </section>
  );
}

export function SimulateView({ loaded }: { loaded: LoadedEvent }) {
  const { teams } = loaded.analysis;
  const [schedule, setSchedule] = useState<ScheduleMatch[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [match, setMatch] = useState("");
  const [chosen, setChosen] = useState<Record<Side, (TeamKey | "")[]>>({
    red: EMPTY,
    blue: EMPTY,
  });

  useEffect(() => {
    let cancelled = false;
    void loadSchedule(loaded.event).then((result) => {
      if (cancelled) return;
      if (result.ok) setSchedule(result.value);
      else setScheduleError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [loaded.event]);

  const known = new Set(teams.map((t) => t.team));
  const label = (m: ScheduleMatch) => matchLabel(m.level, m.number, m.key);
  const chooseMatch = (key: string) => {
    setMatch(key);
    const m = schedule?.find((x) => x.key === key);
    if (!m) return;
    const fill = (alliance: (TeamKey | null)[]) =>
      alliance.map((t) => (t && known.has(t) ? t : ""));
    setChosen({ red: fill(m.red), blue: fill(m.blue) });
  };
  const chooseTeam = (side: Side, slot: number, team: TeamKey | "") => {
    setMatch("");
    setChosen((c) => ({ ...c, [side]: c[side].map((t, i) => (i === slot ? team : t)) }));
  };
  const alliance = (side: Side) => chosen[side].filter((t): t is TeamKey => t !== "");

  return (
    <section aria-labelledby="simulate-heading" className="flex flex-col gap-4">
      <h2 id="simulate-heading" className="text-2xl font-bold tracking-tight">
        Simulate Match
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        {/* A label of its own: wrapped round the select, its name would include the options. */}
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="simulate-match">Match</label>
          <select
            id="simulate-match"
            className="bg-background h-9 rounded-md border px-2"
            value={match}
            disabled={!schedule || schedule.length === 0}
            onChange={(e) => chooseMatch(e.target.value)}
          >
            <option value="">
              {schedule === null
                ? scheduleError
                  ? "Matches could not be loaded"
                  : "Loading…"
                : schedule.length === 0
                  ? "No schedule yet"
                  : "Choose a match"}
            </option>
            {schedule?.map((m) => (
              <option key={m.key} value={m.key}>
                {label(m)}
              </option>
            ))}
          </select>
        </div>
        {SIDES.map((side) => (
          <fieldset key={side} className="flex flex-wrap gap-2">
            <legend className="mb-1 text-sm">{side === "red" ? "Red" : "Blue"}</legend>
            {chosen[side].map((team, slot) => (
              <select
                key={slot}
                aria-label={`${side === "red" ? "Red" : "Blue"} ${slot + 1}`}
                className={cn(
                  "bg-background h-9 w-28 rounded-md border px-2",
                  team && (side === "red" ? "border-alliance-red" : "border-alliance-blue"),
                  team && "border-2",
                )}
                value={team}
                onChange={(e) => chooseTeam(side, slot, e.target.value)}
              >
                <option value="">—</option>
                {teams.map((t) => (
                  <option key={t.team} value={t.team}>
                    {t.team}
                    {t.nickname ? ` ${t.nickname}` : ""}
                  </option>
                ))}
              </select>
            ))}
          </fieldset>
        ))}
      </div>
      {scheduleError && (
        <p className="text-muted-foreground text-sm">{scheduleError} Choose the teams instead.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {SIDES.map((side) => (
          <AllianceColumn
            key={side}
            loaded={loaded}
            side={side}
            teams={alliance(side)}
            opponents={alliance(side === "red" ? "blue" : "red")}
          />
        ))}
      </div>
    </section>
  );
}
