"use client";

/**
 * Filter Teams (#387; docs/spec/08 AN-19 to AN-22): pick values and bands, see the teams that
 * match (`src/analysis/filter-teams.ts`, AN-21). The two lists open one at a time and close on a
 * click outside or Escape; each pick shows as a chip that removes it. A team's card opens its
 * view.
 */
import { useEffect, useRef, useState } from "react";
import { filterChoices, filterTeams, type FilterChoice } from "@/analysis/filter-teams";
import type { RatingBand } from "@/config/types";
import { cn } from "@/lib/utils";
import type { LoadedEvent } from "./data";

type Menu = "values" | "bands";

function CheckList({
  id,
  name,
  choices,
  picked,
  open,
  onOpen,
  onToggle,
}: {
  id: Menu;
  name: string;
  choices: FilterChoice[];
  picked: readonly string[];
  open: boolean;
  onOpen: (menu: Menu | null) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`filter-${id}`}
        onClick={() => onOpen(open ? null : id)}
        className={cn(
          "bg-background flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
          open && "ring-ring ring-2",
        )}
      >
        {name}
        {picked.length > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">
            {picked.length}
          </span>
        )}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div
          id={`filter-${id}`}
          role="group"
          aria-label={name}
          className="bg-popover text-popover-foreground absolute z-20 mt-1 flex max-h-80 w-72 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-md border p-2 shadow-md"
        >
          {choices.length === 0 && (
            <p className="text-muted-foreground p-2 text-sm">Nothing to choose at this event.</p>
          )}
          {choices.map((c) => (
            <label
              key={c.id}
              className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                onChange={() => onToggle(c.id)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterView({
  loaded,
  onOpenTeam,
}: {
  loaded: LoadedEvent;
  onOpenTeam: (team: string) => void;
}) {
  const { dataset, teams } = loaded.analysis;
  const bands = loaded.modules.filterTeams.ratingBands;
  const [values, setValues] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  // A click outside the lists, or Escape, closes the one open.
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  const valueChoices = filterChoices(dataset);
  const bandChoices = bands.map((b) => ({ id: b.id, label: b.label }));
  const chosenBands = picked
    .map((id) => bands.find((b) => b.id === id))
    .filter((b): b is RatingBand => b !== undefined);
  const matching = new Set(
    filterTeams(
      dataset,
      teams.map((t) => t.team),
      values,
      chosenBands,
    ),
  );
  const shown = teams.filter((t) => matching.has(t.team));
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const chips = [
    ...values.map((id) => ({
      key: `v:${id}`,
      label: valueChoices.find((c) => c.id === id)?.label ?? id,
      remove: () => setValues((v) => v.filter((x) => x !== id)),
    })),
    ...chosenBands.map((b) => ({
      key: `b:${b.id}`,
      label: b.label,
      remove: () => setPicked((p) => p.filter((x) => x !== b.id)),
    })),
  ];

  return (
    <section aria-labelledby="filter-heading" className="flex flex-col gap-4">
      <h2 id="filter-heading" className="text-2xl font-bold tracking-tight">
        Filter Teams
      </h2>
      <div ref={bar} className="flex flex-wrap gap-3">
        <CheckList
          id="values"
          name="Value"
          choices={valueChoices}
          picked={values}
          open={menu === "values"}
          onOpen={setMenu}
          onToggle={(id) => setValues((v) => toggle(v, id))}
        />
        <CheckList
          id="bands"
          name="Band"
          choices={bandChoices}
          picked={picked}
          open={menu === "bands"}
          onOpen={setMenu}
          onToggle={(id) => setPicked((p) => toggle(p, id))}
        />
      </div>
      {chips.length > 0 && (
        <ul aria-label="Filters" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <li
              key={c.key}
              className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-sm"
            >
              {c.label}
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                onClick={c.remove}
                className="hover:bg-background rounded-full px-1.5"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p data-testid="filter-count" className="text-sm">
        {chips.length === 0
          ? `All ${teams.length} teams.`
          : `${shown.length} of ${teams.length} teams match.`}
      </p>
      <ul
        aria-label="Matching teams"
        className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2"
      >
        {shown.map((t) => (
          <li key={t.team}>
            <button
              type="button"
              onClick={() => onOpenTeam(t.team)}
              className="bg-card hover:bg-accent flex h-full w-full flex-col items-start rounded-lg border p-3 text-left"
            >
              <span className="text-lg font-semibold">{t.team}</span>
              {t.nickname && <span className="text-muted-foreground text-sm">{t.nickname}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
