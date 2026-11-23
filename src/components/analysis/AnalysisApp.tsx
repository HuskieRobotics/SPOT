"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Field, Select, Spinner, Switch, ThemeToggle, cx } from "@/components/ui";
import { runPipeline, type PipelineRun, type TbaData } from "@/lib/analysis/pipeline";
import { listPaths } from "@/lib/analysis/path";
import type { Dataset, EventDoc, Match, ModuleConfig, Project, TeamMatchPerformance } from "@/lib/types";
import { ModuleRenderer, Plot, aggregate, seriesColor, teamHasData, teamValue, winProbability } from "./modules";

interface Data {
  project: Project;
  projects: { _id: string; name: string }[];
  events: EventDoc[];
  eventId: string;
  tbaEventKey: string;
  activeProjectId: string;
  demo: boolean;
  tmps: TeamMatchPerformance[];
  tba: TbaData;
  schedule: Match[];
}
type View = { kind: "home" } | { kind: "team"; team: string } | { kind: "compare" } | { kind: "filter" } | { kind: "match" } | { kind: "picklist" };

const title = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function AnalysisApp() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [onlyThisProject, setOnlyThisProject] = useState(false);
  const [menu, setMenu] = useState(false);

  const params = typeof window !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (params.get("event")) qs.set("event", params.get("event")!);
    if (params.get("project")) qs.set("project", params.get("project")!);
    fetch(`/api/analysis/data?${qs}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  const tmps = useMemo(() => (data ? (onlyThisProject ? data.tmps.filter((t) => !t.projectId || t.projectId === data.project._id) : data.tmps) : []), [data, onlyThisProject]);
  const run: PipelineRun | null = useMemo(() => (data ? runPipeline(data.project, tmps, { tba: data.tba }) : null), [data, tmps]);
  const dataset = run?.dataset ?? null;
  const names = useMemo(() => new Map((data?.tba.teams ?? []).map((t) => [String(t.team_number), t.nickname])), [data]);
  const flagged = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data?.tmps ?? []) if (t.flagged) m.set(String(t.robotNumber), (m.get(String(t.robotNumber)) ?? 0) + 1);
    return m;
  }, [data]);

  const teams = useMemo(() => (dataset ? Object.keys(dataset.teams).sort((a, b) => Number(a) - Number(b)) : []), [dataset]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    const score = (t: string) => {
      const n = (names.get(t) ?? "").toLowerCase();
      if (t.startsWith(q)) return 0;
      if (t.includes(q)) return 1;
      if (n.includes(q)) return 2;
      // subsequence (typo-tolerant-ish)
      let i = 0;
      for (const c of t) if (c === q[i]) i++;
      return i === q.length ? 3 : 9;
    };
    return teams.filter((t) => score(t) < 9).sort((a, b) => score(a) - score(b));
  }, [teams, query, names]);

  const switchParam = (k: string, v: string) => {
    const p = new URLSearchParams(location.search);
    p.set(k, v);
    location.search = p.toString();
  };

  if (error)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Button onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  if (!data || !dataset || !run)
    return (
      <div className="flex h-dvh items-center justify-center gap-2 text-sm text-muted">
        <Spinner /> Loading analysis…
      </div>
    );

  const f = data.project.analysis.features;
  const navBtn = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => {
        setView(v);
        setMenu(false);
      }}
      className={cx("rounded-lg px-3 py-1.5 text-left text-sm transition", view.kind === v.kind ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-text")}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-surface transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0", menu ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-2.5 px-4 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="" className="h-8 w-8 dark:invert" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-none">SPOT Analysis</div>
            <div className="truncate text-[11px] text-muted">{data.project.name}</div>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-col gap-2 p-4">
          <Select value={data.eventId ?? ""} onChange={(e) => switchParam("event", e.target.value)} aria-label="Event">
            {data.events.map((e) => (
              <option key={e._id} value={e._id}>
                {e.code}
              </option>
            ))}
          </Select>
          {data.projects.length > 1 && (
            <Select value={data.project._id} onChange={(e) => switchParam("project", e.target.value)} aria-label="Project">
              {data.projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                  {p._id === data.activeProjectId ? " (active)" : ""}
                </option>
              ))}
            </Select>
          )}
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {navBtn({ kind: "home" }, "Overview")}
          {f.compare && navBtn({ kind: "compare" }, "Compare teams")}
          {f.filter && navBtn({ kind: "filter" }, "Filter teams")}
          {f.simulateMatch && navBtn({ kind: "match" }, "Match simulation")}
          {f.pickList && navBtn({ kind: "picklist" }, "Pick list")}
        </nav>
        <div className="px-4 pt-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${teams.length} teams…`} className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-accent" />
        </div>
        <ul className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
          {shown.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => {
                  setView({ kind: "team", team: t });
                  setMenu(false);
                }}
                className={cx("flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition", view.kind === "team" && view.team === t ? "bg-accent text-accent-contrast" : "hover:bg-surface-2")}
              >
                <span className="w-12 font-semibold tabular-nums">{t}</span>
                <span className="min-w-0 flex-1 truncate text-xs opacity-75">{names.get(t) ?? ""}</span>
                {flagged.has(t) && <span title={`${flagged.get(t)} flagged match(es)`}>⚑</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 border-t border-border p-3 text-xs">
          <a href="/" className="text-muted hover:text-text">
            Scouting
          </a>
          <a href="/admin" className="text-muted hover:text-text">
            Admin
          </a>
          <button type="button" className="ml-auto text-muted hover:text-text" onClick={() => exportCsv(dataset, names)}>
            Export CSV
          </button>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenu(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-2.5 backdrop-blur lg:hidden">
          <Button size="icon" variant="ghost" onClick={() => setMenu(true)} aria-label="Menu">
            ☰
          </Button>
          <span className="text-sm font-semibold">SPOT Analysis</span>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6">
          {data.demo && <Badge tone="warning">DEMO</Badge>}
          {view.kind === "home" && <Overview data={data} run={run} tmps={tmps} onlyThisProject={onlyThisProject} setOnlyThisProject={setOnlyThisProject} />}
          {view.kind === "team" && <TeamView team={view.team} name={names.get(view.team)} dataset={dataset} modules={data.project.modules} fieldImage={data.project.scouting.field.image} flagged={data.tmps.filter((t) => t.flagged && String(t.robotNumber) === view.team)} />}
          {view.kind === "compare" && <Compare dataset={dataset} paths={data.project.analysis.comparePaths} />}
          {view.kind === "filter" && <FilterTeams dataset={dataset} bands={data.project.analysis.filterBands} names={names} open={(t) => setView({ kind: "team", team: t })} />}
          {view.kind === "match" && <MatchSim dataset={dataset} modules={data.project.modules} schedule={data.schedule} teams={teams} fieldImage={data.project.scouting.field.image} />}
          {view.kind === "picklist" && <PickList dataset={dataset} names={names} open={(t) => setView({ kind: "team", team: t })} />}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- views

function Overview({ data, run, tmps, onlyThisProject, setOnlyThisProject }: { data: Data; run: PipelineRun; tmps: TeamMatchPerformance[]; onlyThisProject: boolean; setOnlyThisProject: (v: boolean) => void }) {
  const other = data.tmps.filter((t) => t.projectId && t.projectId !== data.project._id).length;
  const failed = run.steps.filter((s) => !s.ok);
  const matches = new Set(tmps.map((t) => t.matchNumber)).size;
  const scouters = new Set(tmps.map((t) => t.scouterId)).size;
  const stats = [
    { label: "Scouted robot-matches", value: tmps.length },
    { label: "Matches", value: matches },
    { label: "Teams", value: Object.keys(run.dataset.teams).length },
    { label: "Scouters", value: scouters },
  ];
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{data.events.find((e) => e._id === data.eventId)?.code ?? "Analysis"}</h1>
        <p className="text-sm text-muted">Pick a team on the left, or use the tools above it.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      {other > 0 && (
        <Card>
          <div className="p-4">
            <Switch
              checked={onlyThisProject}
              onChange={setOnlyThisProject}
              label={`Only use matches scouted with "${data.project.name}"`}
              help={`${other} match${other > 1 ? "es were" : " was"} scouted with a different project; their action ids may not fit this pipeline.`}
            />
          </div>
        </Card>
      )}
      {failed.length > 0 && (
        <Card title="Pipeline problems" description="Fix these in Admin → Projects → Pipeline.">
          <ul className="p-4 text-sm text-danger">
            {failed.map((s) => (
              <li key={s.index}>
                Step {s.index + 1} ({data.project.pipeline[s.index]?.name}): {s.error}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tmps.length === 0 && (
        <Card>
          <Empty title="No scouted matches for this event yet">Data appears here as soon as scouters submit matches.</Empty>
        </Card>
      )}
    </div>
  );
}

function TeamView({ team, name, dataset, modules, flagged, fieldImage }: { team: string; name?: string; dataset: Dataset; modules: ModuleConfig[]; flagged: TeamMatchPerformance[]; fieldImage?: string }) {
  const has = teamHasData(dataset, team);
  const visible = modules.filter((m) => m.view === "team" && !m.disabled && (has || m.separate));
  const main = visible.filter((m) => m.position !== "side");
  const side = visible.filter((m) => m.position === "side");
  const count = dataset.tmps.filter((t) => String(t.robotNumber) === team).length;
  return (
    <div className="fade-in flex flex-col gap-5" key={team}>
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-3xl font-bold tabular-nums">{team}</h1>
        {name && <span className="pb-1 text-lg text-muted">{name}</span>}
        <span className="pb-1.5 text-xs text-muted">{count} matches scouted</span>
      </div>
      {flagged.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          ⚑ {flagged.length} flagged match{flagged.length > 1 ? "es" : ""} ({flagged.map((t) => `M${t.matchNumber}${t.flagReason ? `: ${t.flagReason}` : ""}`).join("; ")}). Treat this team&apos;s numbers with care.
        </div>
      )}
      {!has && visible.length === 0 && (
        <Card>
          <Empty title="No scouting data for this team" />
        </Card>
      )}
      <div className={cx("grid gap-5", side.length > 0 && "xl:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          {main.map((m, i) => (
            <ModuleRenderer key={`${team}-${i}`} config={m} teams={[team]} dataset={dataset} fieldImage={fieldImage} />
          ))}
        </div>
        {side.length > 0 && (
          <div className="flex flex-col gap-5">
            {side.map((m, i) => (
              <ModuleRenderer key={`${team}-s${i}`} config={m} teams={[team]} dataset={dataset} fieldImage={fieldImage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function numericPaths(dataset: Dataset): string[] {
  const out = new Set<string>();
  for (const t of Object.values(dataset.teams).slice(0, 15)) for (const [p, v] of listPaths(t)) if (typeof v === "number" && (p.startsWith("averageScores.") || p.startsWith("opr.") || p.startsWith("averages."))) out.add(p);
  return [...out].sort();
}

function Compare({ dataset, paths }: { dataset: Dataset; paths: string[] }) {
  const options = useMemo(() => {
    const all = paths.length ? paths : numericPaths(dataset);
    return all.length ? all : ["constant"];
  }, [dataset, paths]);
  // Prefer overall values (short names like averageScores.total) over per-phase ones.
  const pref = options.filter((p) => p.startsWith("averageScores.")).sort((a, b) => a.length - b.length);
  const [x, setX] = useState(pref[0] ?? options[0]);
  const [y, setY] = useState(pref[1] ?? options[1] ?? options[0]);
  const [z, setZ] = useState("constant");
  const teams = Object.keys(dataset.teams);
  const val = (t: string, p: string) => (p === "constant" ? 1 : Number(teamValue(dataset, t, p)) || 0);
  const plot = useMemo(() => {
    const zs = teams.map((t) => val(t, z));
    const zmax = Math.max(...zs.map(Math.abs), 1e-9);
    const xs = teams.map((t) => val(t, x));
    const ys = teams.map((t) => val(t, y));
    // Label a team only where it won't collide with another label; hover shows every team.
    const span = (a: number[]) => Math.max(...a) - Math.min(...a) || 1;
    const sx = span(xs);
    const sy = span(ys);
    const placed: [number, number][] = [];
    const labels = teams.map((t, i) => {
      const clash = placed.some(([px, py]) => Math.abs(px - xs[i]) / sx < 0.05 && Math.abs(py - ys[i]) / sy < 0.04);
      if (clash) return "";
      placed.push([xs[i], ys[i]]);
      return t;
    });
    return [
      {
        type: "scatter",
        mode: "markers+text",
        x: xs,
        y: ys,
        text: labels,
        hovertext: teams,
        textposition: "top center",
        textfont: { size: 10 },
        marker: { size: zs.map((v) => (z === "constant" ? 11 : 8 + 28 * Math.sqrt(Math.abs(v) / zmax))), color: seriesColor(0), opacity: 0.8, line: { width: 2, color: "#ffffff" } },
        hovertemplate: `<b>%{hovertext}</b><br>${title(x)}: %{x:.2f}<br>${title(y)}: %{y:.2f}${z !== "constant" ? `<br>${title(z)}: %{customdata:.2f}` : ""}<extra></extra>`,
        customdata: zs,
      },
    ];
  }, [dataset, x, y, z]); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useMemo(() => ({ xaxis: { title: { text: title(x) } }, yaxis: { title: { text: title(y) } }, showlegend: false, margin: { l: 60, r: 20, t: 20, b: 60 } }), [x, y]);
  const sel = (v: string, set: (s: string) => void, label: string, withConst = false) => (
    <Field label={label}>
      <Select value={v} onChange={(e) => set(e.target.value)}>
        {withConst && <option value="constant">Same size</option>}
        {options.map((p) => (
          <option key={p} value={p}>
            {title(p)}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Compare teams</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {sel(x, setX, "Horizontal")}
        {sel(y, setY, "Vertical")}
        {sel(z, setZ, "Dot size", true)}
      </div>
      <Card>
        <div className="p-2">
          <Plot data={plot} layout={layout} height={560} />
        </div>
      </Card>
    </div>
  );
}

function FilterTeams({ dataset, bands, names, open }: { dataset: Dataset; bands: Project["analysis"]["filterBands"]; names: Map<string, string>; open: (t: string) => void }) {
  const keys = useMemo(() => {
    const s = new Set<string>();
    for (const t of Object.values(dataset.teams)) {
      for (const k of Object.keys((t.averageScores as object) ?? {})) s.add(`averageScores.${k}`);
      for (const k of Object.keys((t.opr as object) ?? {})) s.add(`opr.${k}`);
    }
    return [...s].sort();
  }, [dataset]);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedBands, setPickedBands] = useState<number[]>([]);
  const inBand = (v: number, b: (typeof bands)[number]) => (b.min === null || v >= b.min) && (b.max === null || v <= b.max);
  const result = Object.keys(dataset.teams).filter((t) => {
    const selBands = pickedBands.map((i) => bands[i]);
    const ok = (path: string, v: unknown) =>
      typeof v === "number" && (selBands.length === 0 ? v > 0 : selBands.some((b) => (b.source === "any" || (b.source === "opr") === path.startsWith("opr.")) && inBand(v, b)));
    if (picked.length) return picked.every((p) => ok(p, teamValue(dataset, t, p)));
    if (selBands.length) return keys.some((p) => ok(p, teamValue(dataset, t, p)));
    return true;
  });
  const chip = (on: boolean, label: string, toggle: () => void) => (
    <button key={label} type="button" onClick={toggle} className={cx("rounded-full border px-3 py-1 text-xs transition", on ? "border-accent bg-accent text-accent-contrast" : "border-border hover:bg-surface-2")}>
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Filter teams</h1>
      <Card title="Values" description="Teams must have every selected value (above 0, or inside a selected band).">
        <div className="flex flex-wrap gap-1.5 p-4">{keys.map((k) => chip(picked.includes(k), title(k.replace(/^(averageScores|opr)\./, "")) + (k.startsWith("opr.") ? " (OPR)" : ""), () => setPicked(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k])))}</div>
      </Card>
      <Card title="Bands">
        <div className="flex flex-wrap gap-1.5 p-4">{bands.map((b, i) => chip(pickedBands.includes(i), b.label, () => setPickedBands(pickedBands.includes(i) ? pickedBands.filter((x) => x !== i) : [...pickedBands, i])))}</div>
      </Card>
      <div className="text-sm text-muted">{result.length} teams</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {result.map((t) => (
          <button key={t} type="button" onClick={() => open(t)} className="rounded-xl border border-border bg-surface p-3 text-left transition hover:border-accent">
            <div className="text-lg font-bold tabular-nums">{t}</div>
            <div className="truncate text-xs text-muted">{names.get(t) ?? ""}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchSim({ dataset, modules, schedule, teams, fieldImage }: { dataset: Dataset; modules: ModuleConfig[]; schedule: Match[]; teams: string[]; fieldImage?: string }) {
  const [sel, setSel] = useState<string[]>(["", "", "", "", "", ""]);
  const mods = modules.filter((m) => m.view === "match" && !m.disabled);
  const red = sel.slice(0, 3).filter((t) => t && dataset.teams[t]);
  const blue = sel.slice(3).filter((t) => t && dataset.teams[t]);
  const side = (own: string[], opp: string[], color: "red" | "blue") => (
    <div className="flex flex-col gap-4">
      <h2 className={cx("text-sm font-semibold", color === "red" ? "text-red-alliance" : "text-blue-alliance")}>{color === "red" ? "Red" : "Blue"} alliance</h2>
      {own.length === 0 ? (
        <p className="text-sm text-muted">Pick teams with scouting data.</p>
      ) : (
        mods.map((m, i) => <ModuleRenderer key={`${color}${i}${own.join()}`} config={m} teams={m.wholeMatch ? [...own, "|", ...opp] : own} dataset={dataset} fieldImage={fieldImage} />)
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Match simulation</h1>
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <Field label="Scheduled match">
          <Select
            value=""
            onChange={(e) => {
              const m = schedule.find((x) => String(x.number) === e.target.value);
              if (m) setSel([...m.robots.red, ...m.robots.blue].map(String));
            }}
          >
            <option value="">Choose…</option>
            {schedule.map((m) => (
              <option key={m.number} value={m.number}>
                Match {m.number}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {sel.map((t, i) => (
            <Field key={i} label={i < 3 ? `Red ${i + 1}` : `Blue ${i - 2}`}>
              <Select value={t} onChange={(e) => setSel(sel.map((x, j) => (j === i ? e.target.value : x)))} className={i < 3 ? "border-red-alliance/50" : "border-blue-alliance/50"}>
                <option value="">—</option>
                {teams.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      </div>
      {mods.length === 0 ? (
        <Card>
          <Empty title="No match-simulation modules">Add some in the project builder&apos;s Dashboard tab.</Empty>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {side(red, blue, "red")}
          {side(blue, red, "blue")}
        </div>
      )}
    </div>
  );
}

function PickList({ dataset, names, open }: { dataset: Dataset; names: Map<string, string>; open: (t: string) => void }) {
  const [path, setPath] = useState("averageScores.total");
  const options = numericPaths(dataset);
  const ranked = useMemo(() => {
    const teams = Object.keys(dataset.teams).filter((t) => typeof teamValue(dataset, t, path) === "number");
    return teams
      .map((t) => {
        const others = teams.filter((o) => o !== t);
        const p = others.length ? others.reduce((acc, o) => acc + winProbability(dataset, [t], [o], path), 0) / others.length : 0;
        return { t, p, mean: aggregate(dataset, [t], path) ?? 0 };
      })
      .sort((a, b) => b.p - a.p);
  }, [dataset, path]);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-bold">Pick list</h1>
      <p className="text-sm text-muted">Each team&apos;s average chance of outscoring every other team one-on-one, using its average and standard deviation.</p>
      <Field label="Ranked by" className="max-w-xs">
        <Select value={path} onChange={(e) => setPath(e.target.value)}>
          {[path, ...options.filter((o) => o !== path)].map((o) => (
            <option key={o} value={o}>
              {title(o)}
            </option>
          ))}
        </Select>
      </Field>
      {ranked.length === 0 ? (
        <Card>
          <Empty title={`No team has ${path}`}>Add point steps in the builder&apos;s Scoring tab (“Add point steps to pipeline”).</Empty>
        </Card>
      ) : (
        <Card>
          <ol className="divide-y divide-border">
            {ranked.map((r, i) => (
              <li key={r.t}>
                <button type="button" onClick={() => open(r.t)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-2">
                  <span className="w-8 text-right text-muted tabular-nums">{i + 1}</span>
                  <span className="w-14 font-semibold tabular-nums">{r.t}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{names.get(r.t) ?? ""}</span>
                  <span className="w-20 text-right tabular-nums text-muted">{r.mean.toFixed(1)}</span>
                  <span className="flex w-36 items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${r.p * 100}%` }} />
                    </span>
                    <span className="w-10 text-right tabular-nums">{(r.p * 100).toFixed(0)}%</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

/** Client-side CSV of every numeric team value (spreadsheet escape hatch). */
function exportCsv(dataset: Dataset, names: Map<string, string>) {
  const cols = new Set<string>();
  const rows = Object.entries(dataset.teams).map(([t, obj]) => {
    const flat = new Map<string, unknown>();
    for (const [p, v] of listPaths(obj)) if (typeof v === "number" || typeof v === "string") flat.set(p, v);
    flat.forEach((_, k) => cols.add(k));
    return { t, flat };
  });
  const headers = [...cols].sort();
  const esc = (v: unknown) => {
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [["Team", "Name", ...headers].map(esc).join(","), ...rows.map((r) => [r.t, names.get(r.t) ?? "", ...headers.map((h) => r.flat.get(h))].map(esc).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "teams.csv" }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
