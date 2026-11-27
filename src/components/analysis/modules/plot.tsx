"use client";

/**
 * A Plotly chart in the app's theme (#385; docs/spec/09 MO-5, docs/spec/15).
 *
 * Plotly is about 5 MB, so it is loaded on first use, from the app's own files (OF-6): a page
 * with no chart never downloads it. A chart names the theme's colours as CSS variables
 * (`"var(--primary)"`); they are read when the chart is drawn, and the chart is drawn again when
 * the theme changes, so dark mode works. Dragging scrolls the page, as on a phone it must: there
 * is no zoom or pan.
 *
 * The values are also in a table only a screen reader reads, since the chart itself is a picture.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Config, Data, Layout } from "plotly.js-dist-min";
import { currentTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** What a chart draws. Any string `var(--name)` in it is the theme's colour of that name. */
export interface Figure {
  data: Data[];
  layout?: Partial<Layout>;
}

const SERIES = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];

/** An axis in the theme, fixed so a drag scrolls the page instead of zooming. */
export const AXIS = {
  gridcolor: "var(--border)",
  linecolor: "var(--border)",
  zerolinecolor: "var(--muted-foreground)",
  automargin: true,
  fixedrange: true,
} as const;

const LAYOUT: Partial<Layout> = {
  autosize: true,
  dragmode: false,
  font: { color: "var(--foreground)", size: 14 },
  paper_bgcolor: "var(--card)",
  plot_bgcolor: "var(--card)",
  colorway: SERIES.map((name) => `var(${name})`),
  margin: { t: 16, r: 16, b: 16, l: 16, pad: 4 },
  legend: { orientation: "h", x: 0.5, xanchor: "center", y: -0.15, yanchor: "top" },
  hoverlabel: { font: { size: 14 } },
};

/**
 * MO-5: v5 removed the zoom and pan buttons. The rest of Plotly's toolbar goes too: on a phone it
 * stays over the chart, and a picture of the screen does what its camera did.
 */
const CONFIG: Partial<Config> = { responsive: true, displayModeBar: false };

/** Replace every `var(--name)` string in `value` with `color(name)`. The input is not changed. */
export function resolveColors<T>(value: T, color: (name: string) => string): T {
  if (typeof value === "string") {
    const match = /^var\((--[\w-]+)\)$/.exec(value);
    return (match ? color(match[1]) : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveColors(v, color)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveColors(v, color)]),
    ) as T;
  return value;
}

/**
 * A theme colour as Plotly reads it. The theme's colours are `oklch()`, which a canvas turns into
 * plain red, green and blue.
 */
function themeColor(element: Element, name: string, canvas: CanvasRenderingContext2D | null) {
  const css = getComputedStyle(element).getPropertyValue(name).trim();
  if (!canvas || !css) return css;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = css;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/** The figure in the page's theme and font, ready for Plotly. */
function themed(figure: Figure, element: HTMLElement): { data: Data[]; layout: Partial<Layout> } {
  const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const color = (name: string) => themeColor(element, name, canvas);
  const layout = figure.layout ?? {};
  return {
    data: resolveColors(figure.data, color),
    layout: resolveColors(
      {
        ...LAYOUT,
        ...layout,
        font: { ...LAYOUT.font, family: getComputedStyle(element).fontFamily, ...layout.font },
      },
      color,
    ),
  };
}

const lightOnServer = (): Theme => "light";

export function Plot({
  figure,
  label,
  className,
}: {
  figure: Figure;
  /** What the chart shows, for a screen reader. */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, lightOnServer);
  const [failed, setFailed] = useState(false);
  // Drawn again only when what it draws changes, not each time the page renders.
  const json = JSON.stringify(figure);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    let purge: ((root: HTMLElement) => void) | undefined;
    import("plotly.js-dist-min")
      .then(async ({ default: Plotly }) => {
        if (cancelled) return;
        purge = Plotly.purge;
        const { data, layout } = themed(JSON.parse(json) as Figure, element);
        await Plotly.react(element, data, layout, CONFIG);
        // For tests and the curious: which theme the chart was last drawn in.
        if (!cancelled) element.dataset.drawn = theme;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      purge?.(element);
      delete element.dataset.drawn;
    };
  }, [json, theme]);

  if (failed)
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        The chart could not load. It needs a connection the first time.
      </p>
    );
  return <div ref={ref} role="img" aria-label={label} className={cn("h-80 w-full", className)} />;
}

/** A chart's values as a table only a screen reader reads. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  /** The header of the label column, then of each value column. */
  columns: string[];
  rows: { label: string; cells: string[] }[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <th scope="row">{row.label}</th>
            {row.cells.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
