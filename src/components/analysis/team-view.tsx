"use client";

/**
 * One team's view (#383; docs/spec/08 AN-14, AN-15, AN-18a): the team, what its data says about
 * itself, and the team-view modules in a main column and, when a module asks for one, a side
 * column. Until the modules are built (#384 to #386), each shows its name and the values it reads.
 */
import { teamNotes, teamViewModules } from "@/analysis/dashboard";
import type { ListedTeam } from "@/analysis/teams";
import type { ModuleEntry } from "@/config/types";
import { cn } from "@/lib/utils";
import type { LoadedEvent } from "./data";

/** The values a module reads, from its options: every `path`, `…Path` and `trackedStats`. */
export function modulePaths(options: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (key === "path" || key.endsWith("Path") || key === "trackedStats") out.push(value);
    } else if (Array.isArray(value)) {
      for (const v of value) walk(v, key);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(options, "");
  return [...new Set(out)];
}

function ModuleCard({ module }: { module: ModuleEntry }) {
  const paths = modulePaths(module.options);
  return (
    <section
      aria-label={module.name}
      data-module={module.module}
      className="bg-card flex flex-col gap-1 rounded-lg border p-4"
    >
      <h3 className="font-semibold">{module.name}</h3>
      <p className="text-muted-foreground text-sm">
        {module.module}
        {paths.length > 0 && ` · ${paths.join(", ")}`}
      </p>
      <p className="text-muted-foreground text-xs">
        Shown here once the {module.module} module is built.
      </p>
    </section>
  );
}

export function TeamView({ loaded, team }: { loaded: LoadedEvent; team: ListedTeam }) {
  const notes = teamNotes(loaded.performances, team.team);
  const { main, side } = teamViewModules(loaded.modules);
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
          {main.map((m, i) => (
            <ModuleCard key={i} module={m} />
          ))}
        </div>
        {side.length > 0 && (
          <div className="flex min-w-0 flex-col gap-4" data-testid="side-column">
            {side.map((m, i) => (
              <ModuleCard key={i} module={m} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
