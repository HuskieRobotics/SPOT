"use client";

/**
 * The Auto Pick List (#389; docs/spec/08 AN-24), when `autoPickList` turns it on: the event's
 * teams ranked by their average chance of beating each other team one on one
 * (`src/analysis/win-chance.ts`). A team opens its view; v5 drew the team's modules beside the
 * list instead.
 */
import { autoPickList } from "@/analysis/win-chance";
import type { LoadedEvent } from "./data";

export function AutoPickView({
  loaded,
  onOpenTeam,
}: {
  loaded: LoadedEvent;
  onOpenTeam: (team: string) => void;
}) {
  const { dataset, teams } = loaded.analysis;
  const { ranked, unranked } = autoPickList(
    dataset,
    teams.map((t) => t.team),
  );
  const nickname = new Map(teams.map((t) => [t.team, t.nickname]));
  return (
    <section aria-labelledby="auto-pick-heading" className="flex flex-col gap-4">
      <h2 id="auto-pick-heading" className="text-2xl font-bold tracking-tight">
        Auto Pick List
      </h2>
      <p className="text-muted-foreground text-sm">
        Each team&apos;s average chance of beating each other team, one on one, from its average
        total score and how much that score varies.
      </p>
      {ranked.length === 0 ? (
        <p className="text-muted-foreground italic">
          No Data: the list needs at least two teams with an average total score.
        </p>
      ) : (
        <ol aria-label="Ranked teams" className="flex max-w-xl flex-col gap-1">
          {ranked.map((p, i) => (
            <li key={p.team}>
              <button
                type="button"
                onClick={() => onOpenTeam(p.team)}
                className="bg-card hover:bg-accent flex w-full items-baseline gap-3 rounded-md border px-3 py-2 text-left"
              >
                <span className="text-muted-foreground w-8 shrink-0 text-right">{i + 1}</span>
                <span className="w-14 shrink-0 font-semibold">{p.team}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                  {nickname.get(p.team)}
                </span>
                <span className="font-medium tabular-nums" data-testid="pick-chance">
                  {(p.chance * 100).toFixed(1)}%
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {ranked.length > 0 && unranked.length > 0 && (
        <p className="text-muted-foreground text-sm" data-testid="unranked">
          Not ranked, with no average total score: {unranked.join(", ")}.
        </p>
      )}
    </section>
  );
}
