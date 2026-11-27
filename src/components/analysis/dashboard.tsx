"use client";

/**
 * The analysis dashboard (#383; docs/spec/08 AN-1 to AN-4, AN-11a to AN-15): a header with the
 * event, a sidebar with the team list and its search, and a welcome view or one team's view.
 *
 * The address keeps the event and the team (`/analysis?event=2026mnwi_official&team=3061`), or
 * the view across teams (`&view=compare`, `filter`, `simulate` or `pick`, #387, #389), so a link
 * or a reload opens the same view. On a narrow screen (1100 px or less, as in v5) the team list takes the screen when
 * opened, and choosing a team or a view closes it.
 */
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csvFileName, teamsCsv } from "@/analysis/csv";
import { searchTeams } from "@/analysis/search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventSummary } from "@/public-data";
import { CompareView } from "./compare-view";
import { AutoPickView } from "./auto-pick-view";
import { loadEvent, loadEvents, type LoadedEvent } from "./data";
import { FilterView } from "./filter-view";
import { Problems, TbaNotice } from "./notices";
import { SimulateView } from "./simulate-view";
import { TeamView } from "./team-view";

/**
 * A view across the event's teams (#387, #389), or null for the event or a team. Simulate Match
 * and the Auto Pick List show only when the season's analysis-modules.json turns them on.
 */
type View = "compare" | "filter" | "simulate" | "pick";
const VIEWS: { view: View; name: string; on?: (loaded: LoadedEvent) => boolean }[] = [
  { view: "simulate", name: "Simulate Match", on: (l) => l.modules.simulateMatch === true },
  { view: "pick", name: "Auto Pick List", on: (l) => l.modules.autoPickList === true },
  { view: "compare", name: "Compare Team Scores" },
  { view: "filter", name: "Filter Teams" },
];
const isView = (v: string | null): v is View => VIEWS.some((x) => x.view === v);
const viewOn = (view: View | null, loaded: LoadedEvent | null) =>
  view !== null && !!loaded && (VIEWS.find((v) => v.view === view)?.on?.(loaded) ?? true);

type State =
  | { kind: "loading"; what: string }
  /** `again` is the event to load again, or null to load the list of events again. */
  | {
      kind: "error";
      message: string;
      again: { event: EventSummary; team: string | null; view: View | null } | null;
    }
  | { kind: "ready"; loaded: LoadedEvent };

function readAddress(): { event: string | null; team: string | null; view: View | null } {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  return { event: params.get("event"), team: params.get("team"), view: isView(view) ? view : null };
}

function writeAddress(event: string, team: string | null, view: View | null = null) {
  const params = new URLSearchParams({ event });
  if (team) params.set("team", team);
  else if (view) params.set("view", view);
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

/**
 * The event's teams as a spreadsheet (#388, AN-26), made in the browser from the data on the page,
 * so it works offline too.
 */
function downloadCsv(loaded: LoadedEvent) {
  const blob = new Blob([teamsCsv(loaded.analysis.dataset)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(loaded.event.code);
  document.body.append(link);
  link.click();
  link.remove();
  // Later, so the browser has the file before its address goes.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function Welcome({ loaded }: { loaded: LoadedEvent }) {
  const { teams } = loaded.analysis;
  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col gap-3">
      <h2 id="welcome-heading" className="text-2xl font-bold tracking-tight">
        {loaded.event.code}
      </h2>
      <p data-testid="event-summary">
        {loaded.performances.length} scouting{" "}
        {loaded.performances.length === 1 ? "record" : "records"}, {teams.length}{" "}
        {teams.length === 1 ? "team" : "teams"}.
      </p>
      <p className="text-muted-foreground">
        {teams.length > 0
          ? "Choose a team from the list."
          : "No matches have been scouted at this event yet."}
      </p>
      <Problems loaded={loaded} />
    </section>
  );
}

export function Dashboard() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [state, setState] = useState<State>({ kind: "loading", what: "the events" });
  const [team, setTeam] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState("");
  const [teamsOpen, setTeamsOpen] = useState(false);
  // Only the last event asked for is shown, however the loads finish.
  const asked = useRef(0);

  const open = useCallback(
    async (event: EventSummary, keepTeam: string | null, keepView: View | null = null) => {
      const ask = ++asked.current;
      setState({ kind: "loading", what: event.code });
      setTeam(keepTeam);
      setView(keepTeam ? null : keepView);
      writeAddress(event.code, keepTeam, keepView);
      const result = await loadEvent(event);
      if (ask !== asked.current) return;
      setState(
        result.ok
          ? { kind: "ready", loaded: result.value }
          : {
              kind: "error",
              message: result.message,
              again: { event, team: keepTeam, view: keepView },
            },
      );
    },
    [],
  );

  /** With the list of events: open the one the address names, else the active one. */
  const chooseEvent = useCallback(
    (result: Awaited<ReturnType<typeof loadEvents>>) => {
      if (!result.ok) {
        setState({ kind: "error", message: result.message, again: null });
        return;
      }
      setEvents(result.value);
      const wanted = readAddress();
      const event =
        result.value.find((e) => e.code === wanted.event) ??
        result.value.find((e) => e.active) ??
        result.value[0];
      if (!event) {
        setState({
          kind: "error",
          message: "There are no events yet. An admin creates one on the admin page.",
          again: null,
        });
        return;
      }
      const same = event.code === wanted.event;
      void open(event, same ? wanted.team : null, same ? wanted.view : null);
    },
    [open],
  );

  useEffect(() => {
    let cancelled = false;
    void loadEvents().then((result) => {
      if (!cancelled) chooseEvent(result);
    });
    return () => {
      cancelled = true;
    };
  }, [chooseEvent]);

  const loaded = state.kind === "ready" ? state.loaded : null;
  const shown = useMemo(
    () => (loaded ? searchTeams(loaded.analysis.teams, query) : []),
    [loaded, query],
  );
  const selected = loaded?.analysis.teams.find((t) => t.team === team) ?? null;
  const current =
    state.kind === "ready" ? state.loaded.event.code : state.kind === "loading" ? state.what : "";

  function chooseTeam(next: string | null) {
    setTeam(next);
    setView(null);
    setTeamsOpen(false);
    if (loaded) writeAddress(loaded.event.code, next);
  }

  function chooseView(next: View) {
    setTeam(null);
    setView(next);
    setTeamsOpen(false);
    if (loaded) writeAddress(loaded.event.code, null, next);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-card flex flex-wrap items-center gap-3 border-b px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="min-[1101px]:hidden"
          aria-expanded={teamsOpen}
          aria-controls="team-list"
          onClick={() => setTeamsOpen((o) => !o)}
        >
          Teams
        </Button>
        <button
          type="button"
          className="flex items-center gap-2"
          onClick={() => chooseTeam(null)}
          aria-label="SPOT Analysis: back to the event"
        >
          <Image src="/img/logo.svg" alt="" width={32} height={32} className="dark:invert" />
          <h1 className="text-xl font-bold tracking-tight">SPOT Analysis</h1>
        </button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label htmlFor="event">Event</label>
          <select
            id="event"
            className="bg-background h-9 rounded-md border px-2"
            value={events?.some((e) => e.code === current) ? current : ""}
            disabled={!events}
            onChange={(e) => {
              const event = events?.find((x) => x.code === e.target.value);
              if (event) void open(event, null);
            }}
          >
            {!events && <option value="">Loading…</option>}
            {events?.map((e) => (
              <option key={e.code} value={e.code}>
                {e.code}
                {e.active ? " (scouting now)" : ""}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          id="team-list"
          className={cn(
            "bg-card shrink-0 flex-col gap-2 border-r p-3 min-[1101px]:flex min-[1101px]:w-72",
            teamsOpen ? "flex w-full" : "hidden",
          )}
        >
          <nav aria-label="Views" className="flex flex-col">
            {VIEWS.filter((v) => !v.on || (loaded && v.on(loaded))).map((v) => (
              <button
                key={v.view}
                type="button"
                aria-current={view === v.view ? "page" : undefined}
                onClick={() => chooseView(v.view)}
                disabled={!loaded}
                className={cn(
                  "hover:bg-accent rounded-md px-2 py-1.5 text-left font-medium",
                  view === v.view && "bg-accent",
                )}
              >
                {v.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => loaded && downloadCsv(loaded)}
              disabled={!loaded}
              className="hover:bg-accent rounded-md px-2 py-1.5 text-left font-medium"
            >
              Download CSV
            </button>
          </nav>
          <input
            type="search"
            aria-label="Find a team"
            placeholder="Team number or name"
            className="bg-background h-9 rounded-md border px-3 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul aria-label="Teams" className="flex flex-col overflow-y-auto">
            {shown.map((t) => (
              <li key={t.team}>
                <button
                  type="button"
                  aria-current={t.team === team ? "page" : undefined}
                  aria-label={t.nickname ? `${t.team} ${t.nickname}` : t.team}
                  onClick={() => chooseTeam(t.team)}
                  className={cn(
                    "hover:bg-accent flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left",
                    t.team === team && "bg-accent",
                  )}
                >
                  <span className="w-14 shrink-0 font-semibold">{t.team}</span>
                  <span className="text-muted-foreground truncate text-sm">{t.nickname}</span>
                </button>
              </li>
            ))}
          </ul>
          {loaded && shown.length === 0 && (
            <p className="text-muted-foreground px-2 text-sm">
              {query.trim() ? `No team matches “${query.trim()}”.` : "No teams yet."}
            </p>
          )}
        </aside>

        <main className={cn("flex min-w-0 flex-1 flex-col gap-4 p-4", teamsOpen && "hidden")}>
          {state.kind === "loading" && (
            <div role="status" className="flex flex-col gap-2">
              <p>Loading {state.what}…</p>
              <div className="bg-muted h-1 w-48 overflow-hidden rounded">
                <div className="bg-primary h-full w-1/3 animate-pulse" />
              </div>
            </div>
          )}
          {state.kind === "error" && (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p>{state.message}</p>
              <Button
                onClick={() =>
                  state.again
                    ? void open(state.again.event, state.again.team, state.again.view)
                    : void loadEvents().then(chooseEvent)
                }
              >
                Try again
              </Button>
            </div>
          )}
          {loaded && (
            <>
              <TbaNotice tba={loaded.tba} />
              {selected ? (
                <TeamView loaded={loaded} team={selected} />
              ) : !viewOn(view, loaded) ? (
                <Welcome loaded={loaded} />
              ) : view === "simulate" ? (
                <SimulateView key={loaded.event.code} loaded={loaded} />
              ) : view === "pick" ? (
                <AutoPickView key={loaded.event.code} loaded={loaded} onOpenTeam={chooseTeam} />
              ) : view === "compare" ? (
                <CompareView key={loaded.event.code} loaded={loaded} />
              ) : view === "filter" ? (
                <FilterView key={loaded.event.code} loaded={loaded} onOpenTeam={chooseTeam} />
              ) : (
                <Welcome loaded={loaded} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
