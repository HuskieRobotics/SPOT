"use client";

/**
 * The analysis dashboard (#383; docs/spec/08 AN-1 to AN-4, AN-11a to AN-15): a header with the
 * event, a sidebar with the team list and its search, and a welcome view or one team's view.
 *
 * The address keeps the event and the team (`/analysis?event=2026mnwi_official&team=3061`), so a
 * link or a reload opens the same view. On a narrow screen (1100 px or less, as in v5) the team
 * list takes the screen when opened, and choosing a team closes it.
 */
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchTeams } from "@/analysis/search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventSummary } from "@/public-data";
import { loadEvent, loadEvents, type LoadedEvent } from "./data";
import { Problems, TbaNotice } from "./notices";
import { TeamView } from "./team-view";

type State =
  | { kind: "loading"; what: string }
  /** `again` is the event to load again, or null to load the list of events again. */
  | {
      kind: "error";
      message: string;
      again: { event: EventSummary; team: string | null } | null;
    }
  | { kind: "ready"; loaded: LoadedEvent };

function readAddress(): { event: string | null; team: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { event: params.get("event"), team: params.get("team") };
}

function writeAddress(event: string, team: string | null) {
  const params = new URLSearchParams({ event });
  if (team) params.set("team", team);
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
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
  const [query, setQuery] = useState("");
  const [teamsOpen, setTeamsOpen] = useState(false);
  // Only the last event asked for is shown, however the loads finish.
  const asked = useRef(0);

  const open = useCallback(async (event: EventSummary, keepTeam: string | null) => {
    const ask = ++asked.current;
    setState({ kind: "loading", what: event.code });
    setTeam(keepTeam);
    writeAddress(event.code, keepTeam);
    const result = await loadEvent(event);
    if (ask !== asked.current) return;
    setState(
      result.ok
        ? { kind: "ready", loaded: result.value }
        : { kind: "error", message: result.message, again: { event, team: keepTeam } },
    );
  }, []);

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
      void open(event, event.code === wanted.event ? wanted.team : null);
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
    setTeamsOpen(false);
    if (loaded) writeAddress(loaded.event.code, next);
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
                    ? void open(state.again.event, state.again.team)
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
