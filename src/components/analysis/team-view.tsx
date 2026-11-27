"use client";

/**
 * One team's view (#383; docs/spec/08 AN-14, AN-15, AN-18a): the team, what its data says about
 * itself, and the team-view modules in a main column and, when a module asks for one, a side
 * column.
 */
import { teamNotes, teamViewModules } from "@/analysis/dashboard";
import type { ListedTeam } from "@/analysis/teams";
import type { ModuleEntry } from "@/config/types";
import { cn } from "@/lib/utils";
import type { LoadedEvent } from "./data";
import { AnalysisModule } from "./modules";

/** Indexes of the modules whose options config:check finds errors in (TR-10). */
function brokenModules(loaded: LoadedEvent): Set<number> {
  return new Set(
    loaded.findings
      .filter((f) => f.file === "analysis-modules" && f.severity === "error")
      .filter((f) => f.keys[0] === "modules" && typeof f.keys[1] === "number")
      .map((f) => f.keys[1] as number),
  );
}

export function TeamView({ loaded, team }: { loaded: LoadedEvent; team: ListedTeam }) {
  const notes = teamNotes(loaded.performances, team.team);
  const { main, side } = teamViewModules(loaded.modules);
  const broken = brokenModules(loaded);
  const draw = (m: ModuleEntry) => (
    <AnalysisModule
      key={loaded.modules.modules.indexOf(m)}
      module={m}
      teams={[team.team]}
      dataset={loaded.analysis.dataset}
      matchScouting={loaded.matchScouting}
      broken={broken.has(loaded.modules.modules.indexOf(m))}
    />
  );
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "es"}`;
  return (
    <article aria-labelledby="team-heading" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 id="team-heading" className="text-2xl font-bold tracking-tight">
          Team {team.team}
          {team.nickname && (
            <span className="text-muted-foreground font-normal"> · {team.nickname}</span>
          )}
        </h2>
        <p data-testid="team-notes" className="text-sm">
          {plural(notes.matches, "match")} scouted
          {(notes.flagged > 0 || notes.partial > 0) && (
            <span className="text-destructive font-medium">
              {notes.flagged > 0 && ` · ${notes.flagged} flagged for review`}
              {notes.partial > 0 && ` · ${notes.partial} covering only part of the match`}
            </span>
          )}
        </p>
      </header>
      <div className={cn("grid gap-4", side.length > 0 && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
        <div className="flex min-w-0 flex-col gap-4" data-testid="main-column">
          {main.map(draw)}
        </div>
        {side.length > 0 && (
          <div className="flex min-w-0 flex-col gap-4" data-testid="side-column">
            {side.map(draw)}
          </div>
        )}
      </div>
    </article>
  );
}
