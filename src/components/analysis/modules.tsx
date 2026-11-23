"use client";
/* Dashboard modules. Each renders one ModuleConfig for one team (team view) or an alliance (match view). */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, ModuleConfig } from "@/lib/types";
import { getPath } from "@/lib/analysis/path";
import { cx } from "@/components/ui";
import { normalizeImageSrc } from "@/lib/fieldMaps";

// ---------------------------------------------------------------- data helpers

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function teamValue(dataset: Dataset, team: string, path: string): unknown {
  try {
    return getPath(dataset.teams[team], path, undefined);
  } catch {
    return undefined;
  }
}

/** Average (default) or sum of a numeric path across teams; null when no team has a number. */
export function aggregate(dataset: Dataset, teams: string[], path: string, method?: string): number | null {
  const vals = teams.map((t) => num(teamValue(dataset, t, path))).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return method === "sum" ? sum : sum / vals.length;
}

interface NumFmt {
  decimals?: number;
  unit?: string;
  multiplier?: number;
  addend?: number;
  hideIfValue?: unknown;
}
export function formatValue(v: number | null, o: NumFmt): string {
  if (v === null || (o.hideIfValue !== undefined && v === o.hideIfValue)) return "No data";
  const x = v * (o.multiplier ?? 1) + (o.addend ?? 0);
  if (o.hideIfValue !== undefined && x === o.hideIfValue) return "No data";
  return `${x.toFixed(o.decimals ?? 2)}${o.unit ? ` ${o.unit}` : ""}`;
}

/** Rank of `team` among all teams with a number at `path` (1 = best). */
export function rankOf(dataset: Dataset, team: string, path: string, sort: number): { rank: number; of: number } | null {
  if (!sort) return null;
  const all = Object.keys(dataset.teams)
    .map((t) => ({ t, v: num(teamValue(dataset, t, path)) }))
    .filter((x): x is { t: string; v: number } => x.v !== null)
    .sort((a, b) => (sort > 0 ? b.v - a.v : a.v - b.v));
  const i = all.findIndex((x) => x.t === team);
  return i < 0 ? null : { rank: i + 1, of: all.length };
}

function RankBadge({ r }: { r: { rank: number; of: number } | null }) {
  if (!r) return null;
  const pct = r.rank / r.of;
  const tone = pct <= 0.05 ? "bg-success text-white" : pct <= 0.25 ? "bg-success-soft text-success" : pct <= 0.5 ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted";
  return (
    <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", tone)} title={`Rank ${r.rank} of ${r.of}`}>
      #{r.rank}
    </span>
  );
}

function erf(x: number) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** P(alliance A outscores alliance B) from mean and standard-deviation paths. */
export function winProbability(dataset: Dataset, a: string[], b: string[], path: string, stdPath = "standardDeviation") {
  const stat = (teams: string[]) => {
    let mean = 0;
    let variance = 0;
    for (const t of teams) {
      mean += num(teamValue(dataset, t, path)) ?? 0;
      variance += (num(teamValue(dataset, t, stdPath)) ?? 0) ** 2;
    }
    return { mean, variance };
  };
  const A = stat(a);
  const B = stat(b);
  const sd = Math.max(Math.sqrt(A.variance + B.variance), 0.01);
  return 1 - normalCdf((0 - (A.mean - B.mean)) / sd);
}

// ---------------------------------------------------------------- Plotly wrapper

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export const seriesColor = (i: number) => (typeof document === "undefined" ? "#2a78d6" : cssVar(`--series-${(i % 8) + 1}`));

function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const h = () => setV((x) => x + 1);
    window.addEventListener("spot-theme", h);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", h);
    return () => {
      window.removeEventListener("spot-theme", h);
      mq.removeEventListener("change", h);
    };
  }, []);
  return v;
}

export function Plot({ data, layout = {}, height = 300 }: { data: object[]; layout?: Record<string, unknown>; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useThemeVersion();
  useEffect(() => {
    let alive = true;
    let plotly: any;
    import("plotly.js-dist-min").then((m) => {
      if (!alive || !ref.current) return;
      plotly = m.default ?? m;
      const text = cssVar("--text");
      const muted = cssVar("--muted");
      const grid = cssVar("--border");
      plotly.react(
        ref.current,
        data,
        {
          height,
          autosize: true,
          margin: { l: 44, r: 16, t: 12, b: 40 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { family: "ui-sans-serif, system-ui, sans-serif", size: 12, color: muted },
          hoverlabel: { bgcolor: cssVar("--surface"), bordercolor: grid, font: { color: text } },
          legend: { orientation: "h", y: -0.18, font: { color: text } },
          xaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid, automargin: true },
          yaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid, automargin: true, rangemode: "tozero" },
          ...layout,
        },
        { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["zoom2d", "pan2d", "select2d", "lasso2d", "zoomIn2d", "zoomOut2d", "autoScale2d", "resetScale2d"] },
      );
    });
    return () => {
      alive = false;
    };
  }, [data, layout, height, theme]);
  useEffect(() => {
    const el = ref.current;
    return () => {
      import("plotly.js-dist-min").then((m) => el && (m.default ?? m).purge(el));
    };
  }, []);
  return <div ref={ref} className="w-full" style={{ minHeight: height }} />;
}

// ---------------------------------------------------------------- modules

export interface ModuleProps {
  config: ModuleConfig;
  /** Teams to show; in whole-match mode: [...own, "|", ...opponents]. */
  teams: string[];
  dataset: Dataset;
  /** The project's scouting field map; heatmaps without their own map use it. */
  fieldImage?: string;
}

export function ModuleRenderer(props: ModuleProps) {
  const { config } = props;
  if (config.module === "Divider")
    return (
      <div className="flex items-center gap-3 pt-2 sm:col-span-full">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{config.name}</h3>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  const Body = BODIES[config.module];
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
      <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold">{config.name}</h3>
      <div className="min-w-0 p-3">{Body ? <Body {...props} /> : <p className="text-sm text-muted">Unknown module “{config.module}”.</p>}</div>
    </section>
  );
}

const ownTeams = (teams: string[]) => (teams.includes("|") ? teams.slice(0, teams.indexOf("|")) : teams);
type Item = { name?: string; path: string; aggrMethod?: string } & NumFmt & { sort?: number };

function Stats({ config, teams, dataset }: ModuleProps) {
  const list = ((config.options.list as Item[]) ?? []).filter((x) => x?.path);
  const own = ownTeams(teams);
  return (
    <ul className="divide-y divide-border">
      {list.map((s, i) => {
        const v = aggregate(dataset, own, s.path, s.aggrMethod);
        const raw = own.length === 1 ? teamValue(dataset, own[0], s.path) : null;
        const text = typeof raw === "string" ? raw : formatValue(v, s);
        return (
          <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="text-muted">{s.name ?? s.path}</span>
            <span className="flex items-center gap-2">
              {own.length === 1 && <RankBadge r={rankOf(dataset, own[0], s.path, Number(s.sort) || 0)} />}
              <span className={cx("font-semibold tabular-nums", text === "No data" && "font-normal text-muted")}>{text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Bar({ config, teams, dataset }: ModuleProps) {
  const bars = ((config.options.bars as Item[]) ?? []).filter((b) => b?.path);
  const own = ownTeams(teams);
  const data = useMemo(() => {
    const y = bars.map((b) => aggregate(dataset, own, b.path, b.aggrMethod) ?? 0);
    return [
      {
        type: "bar",
        x: bars.map((b) => b.name ?? b.path),
        y,
        marker: { color: seriesColor(0), line: { width: 0 } },
        hovertemplate: "%{x}: %{y:.2f}<extra></extra>",
        text: y.map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(2))),
        textposition: "outside",
        cliponaxis: false,
      },
    ];
  }, [bars, own, dataset]);
  const layout = useMemo(() => ({ bargap: 0.35, showlegend: false }), []);
  return <Plot data={data} layout={layout} height={260} />;
}

function Pie({ config, teams, dataset }: ModuleProps) {
  const slices = ((config.options.slices as Item[]) ?? []).filter((s) => s?.path);
  const own = ownTeams(teams);
  const unit = (config.options.unit as string) ?? "";
  const decimals = (config.options.decimals as number) ?? 2;
  const data = useMemo(() => {
    const values = slices.map((s) => Math.max(0, aggregate(dataset, own, s.path, s.aggrMethod) ?? 0));
    return [
      {
        type: "pie",
        hole: 0.55,
        sort: false,
        labels: slices.map((s) => s.name ?? s.path),
        values,
        marker: { colors: slices.map((_, i) => seriesColor(i)), line: { color: cssVarSafe("--surface"), width: 2 } },
        textinfo: "none",
        hovertemplate: `%{label}: %{value:.${decimals}f}${unit ? " " + unit : ""} (%{percent})<extra></extra>`,
      },
    ];
  }, [slices, own, dataset, unit, decimals]);
  const layout = useMemo(() => ({ showlegend: true, margin: { l: 8, r: 8, t: 8, b: 8 }, legend: { orientation: "v", x: 1, y: 0.5 } }), []);
  if (slices.every((s) => !aggregate(dataset, own, s.path, s.aggrMethod))) return <p className="py-8 text-center text-sm text-muted">No data</p>;
  return <Plot data={data} layout={layout} height={240} />;
}
const cssVarSafe = (n: string) => (typeof document === "undefined" ? "#fff" : cssVar(n));

function PerformanceTimePlot({ config, teams, dataset }: ModuleProps) {
  const stats = (config.options.trackedStats as string[]) ?? [];
  const team = ownTeams(teams)[0];
  const data = useMemo(() => {
    const tmps = dataset.tmps.filter((t) => String(t.robotNumber) === team).sort((a, b) => a.matchNumber - b.matchNumber);
    return stats.map((p, i) => ({
      type: "scatter",
      mode: "lines+markers",
      name: p.split(".").pop(),
      x: tmps.map((t) => `M${t.matchNumber}`),
      y: tmps.map((t) => {
        try {
          return num(getPath(t, p, null));
        } catch {
          return null;
        }
      }),
      line: { width: 2, color: seriesColor(i) },
      marker: { size: 8, color: seriesColor(i), line: { width: 2, color: cssVarSafe("--surface") } },
      hovertemplate: `%{x} · ${p.split(".").pop()}: %{y:.2f}<extra></extra>`,
    }));
  }, [stats, team, dataset]);
  const layout = useMemo(() => ({ showlegend: stats.length > 1, hovermode: "x unified", xaxis: { type: "category" } }), [stats.length]);
  return <Plot data={data} layout={layout} height={280} />;
}

/** Width / height of an image as the browser sees it (null until loaded). */
function useImageAspect(src: string) {
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    setAspect(null);
    const im = new Image();
    im.onload = () => im.naturalWidth > 0 && im.naturalHeight > 0 && setAspect(im.naturalWidth / im.naturalHeight);
    im.src = src;
  }, [src]);
  return aspect;
}

function HeatmapScatterPlot({ config, teams, dataset, fieldImage }: ModuleProps) {
  const o = config.options as { coordinatePath?: string; aggregatedActionsPath?: string; actionGroups?: { name: string; actions: string[] }[]; actionLabels?: Record<string, string>; imgPath?: string; halfField?: boolean };
  const own = ownTeams(teams);
  const img = normalizeImageSrc(o.imgPath || fieldImage || "/img/field.svg");
  const aspect = useImageAspect(img);
  const data = useMemo(() => {
    const actions: { id: string; other?: Record<string, unknown> }[] = own.flatMap((t) => {
      const v = teamValue(dataset, t, o.aggregatedActionsPath ?? "aggregatedActions");
      return Array.isArray(v) ? v : [];
    });
    const fold = (x: number, y: number): [number, number] | null => {
      if (!o.halfField) return [x, y];
      if (x > 69.5) return [(100 - x) * 2, 100 - y];
      if (x < 30.5) return [x * 2, y];
      return null;
    };
    const pts = (ids: string[]) =>
      actions
        .filter((a) => ids.includes(a.id))
        .map((a) => {
          try {
            const p = getPath(a, o.coordinatePath ?? "other.pos", null) as { x: number; y: number } | null;
            return p ? fold(p.x, p.y) : null;
          } catch {
            return null;
          }
        })
        .filter((p): p is [number, number] => !!p);
    const groups = o.actionGroups ?? [];
    const traces: object[] = [];
    if (groups[0]) {
      const p = pts(groups[0].actions);
      if (p.length > 2)
        traces.push({
          type: "histogram2dcontour",
          x: p.map((q) => q[0]),
          y: p.map((q) => q[1]),
          xbins: { start: 0, end: 100, size: 8 },
          ybins: { start: 0, end: 100, size: 8 },
          colorscale: [
            [0, "rgba(42,120,214,0)"],
            [0.3, "rgba(42,120,214,0.25)"],
            [1, "rgba(16,66,129,0.7)"],
          ],
          showscale: false,
          contours: { coloring: "fill", showlines: false },
          hoverinfo: "skip",
        });
    }
    const ids = [...new Set(groups.flatMap((g) => g.actions))];
    ids.slice(0, 8).forEach((id, i) => {
      const p = pts([id]);
      if (!p.length) return;
      traces.push({
        type: "scatter",
        mode: "markers",
        name: o.actionLabels?.[id] ?? id,
        x: p.map((q) => q[0]),
        y: p.map((q) => q[1]),
        marker: { size: 9, color: seriesColor(i), line: { width: 2, color: "#ffffff" } },
        hovertemplate: `${o.actionLabels?.[id] ?? id} (%{x}, %{y})<extra></extra>`,
      });
    });
    return traces;
  }, [own, dataset, o]);
  const layout = useMemo(
    () => ({
      showlegend: true,
      margin: { l: 4, r: 4, t: 4, b: 4 },
      xaxis: { range: [0, 100], visible: false, fixedrange: true },
      yaxis: { range: [100, 0], visible: false, fixedrange: true, scaleanchor: "x", scaleratio: aspect ? 1 / aspect : o.halfField ? 1 : 0.5 },
      images: [{ source: img, xref: "x", yref: "y", x: 0, y: 0, sizex: 100, sizey: 100, sizing: "stretch", layer: "below" }],
    }),
    [img, aspect, o.halfField],
  );
  if (!data.length) return <p className="py-8 text-center text-sm text-muted">No positions recorded</p>;
  return <Plot data={data} layout={layout} height={o.halfField ? 380 : 300} />;
}

function RadarChart({ config, teams, dataset }: ModuleProps) {
  const o = config.options as { sections?: { name: string }[]; lines?: { name: string; times: { name: string; path: string }[] }[]; max?: number };
  const own = ownTeams(teams);
  const data = useMemo(
    () =>
      (o.lines ?? []).map((line, i) => {
        const r = (line.times ?? []).map((t) => (t.path && t.path !== "none" ? aggregate(dataset, own, t.path) ?? 0 : 0));
        return {
          type: "scatterpolar",
          name: line.name,
          r,
          theta: (line.times ?? []).map((t) => t.name),
          fill: "toself",
          opacity: 0.85,
          line: { width: 2, color: seriesColor(i) },
          marker: { size: 6 },
          hovertemplate: `${line.name} · %{theta}: %{r:.2f}<extra></extra>`,
        };
      }),
    [o, own, dataset],
  );
  const layout = useMemo(
    () => ({
      showlegend: true,
      margin: { l: 40, r: 40, t: 20, b: 20 },
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        radialaxis: { range: [0, o.max ?? 4], gridcolor: cssVarSafe("--border"), linecolor: cssVarSafe("--border") },
        angularaxis: { direction: "clockwise", rotation: 90, gridcolor: cssVarSafe("--border"), linecolor: cssVarSafe("--border") },
      },
    }),
    [o.max],
  );
  return <Plot data={data} layout={layout} height={340} />;
}

function SingleDisplay({ config, teams, dataset }: ModuleProps) {
  const o = config.options as unknown as Item & { stdPath?: string };
  if (o.aggrMethod === "percentChanceOfWinning") {
    const i = teams.indexOf("|");
    if (i < 0) return <p className="text-sm text-muted">Turn on “Whole match” for win chance.</p>;
    const p = winProbability(dataset, teams.slice(0, i), teams.slice(i + 1), o.path, o.stdPath);
    return <div className="py-3 text-center text-4xl font-bold tabular-nums">{(p * 100).toFixed(o.decimals ?? 0)}%</div>;
  }
  const v = aggregate(dataset, ownTeams(teams), o.path, o.aggrMethod);
  return <div className="py-3 text-center text-4xl font-bold tabular-nums">{formatValue(v, o)}</div>;
}

function ColumnDisplay({ config, teams, dataset }: ModuleProps) {
  const o = config.options as unknown as Item & { string?: boolean };
  const own = ownTeams(teams);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, own.length)}, minmax(0, 1fr))` }}>
      {own.map((t) => {
        const raw = teamValue(dataset, t, o.path);
        return (
          <div key={t} className="flex flex-col items-center gap-1 rounded-lg bg-surface-2 p-2 text-center">
            <span className="text-lg font-bold tabular-nums">{o.string ? String(raw ?? "—") : formatValue(num(raw), o)}</span>
            <span className="text-xs text-muted">{t}</span>
            <RankBadge r={rankOf(dataset, t, o.path, Number(o.sort) || 0)} />
          </div>
        );
      })}
    </div>
  );
}

function Grid({ config, teams, dataset }: ModuleProps) {
  const o = config.options as { rows?: number; cols?: number; min?: number; max?: number; decimals?: number; cells?: { x: number; y: number; path: string; hex?: string }[] };
  const own = ownTeams(teams);
  const min = o.min ?? 0;
  const max = o.max ?? 1;
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${o.cols ?? 1}, minmax(0,1fr))`, gridTemplateRows: `repeat(${o.rows ?? 1}, 2.5rem)` }}>
      {(o.cells ?? []).map((c, i) => {
        const v = aggregate(dataset, own, c.path, "sum");
        const a = v === null ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
        const hex = c.hex || "#2a78d6";
        const alpha = Math.round((0.12 + a * 0.88) * 255)
          .toString(16)
          .padStart(2, "0");
        return (
          <div key={i} title={c.path} className="flex items-center justify-center rounded text-xs font-semibold tabular-nums" style={{ gridColumn: c.x, gridRow: c.y, background: `${hex}${alpha}`, color: a > 0.55 ? "#fff" : "var(--text)" }}>
            {v === null ? "–" : v.toFixed(o.decimals ?? 1)}
          </div>
        );
      })}
    </div>
  );
}

function Text({ config, teams, dataset }: ModuleProps) {
  const own = ownTeams(teams);
  const path = config.options.path as string;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {own.map((t) => {
        const v = teamValue(dataset, t, path);
        return (
          <li key={t}>
            {own.length > 1 && <span className="mr-2 text-muted">{t}</span>}
            {Array.isArray(v) ? v.join(", ") || "—" : v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
          </li>
        );
      })}
    </ul>
  );
}

const BODIES: Record<string, (p: ModuleProps) => React.ReactNode> = { Stats, Bar, Pie, PerformanceTimePlot, HeatmapScatterPlot, RadarChart, SingleDisplay, ColumnDisplay, Grid, Text };

/** Does this team have scouting data relevant to a module? (Modules hide for teams with no data.) */
export const teamHasData = (dataset: Dataset, team: string) => dataset.tmps.some((t) => String(t.robotNumber) === team);
