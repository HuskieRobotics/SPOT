"use client";

/**
 * The modules the dashboard can draw, by name (#384; docs/spec/09; MO-2 is replaced by this
 * registry). A built-in module not drawn yet shows what it will read (#385, #386); a name that is
 * not a built-in module is an extension module, which come in #391.
 */
import type { ComponentType } from "react";
import type { ModuleEntry } from "@/config/types";
import { ColumnDisplay } from "./column-display";
import { Divider } from "./divider";
import { ModuleFrame } from "./frame";
import { Grid } from "./grid";
import { SingleDisplay } from "./single-display";
import { Stats } from "./stats";
import type { ModuleProps } from "./types";

export type { ModuleProps } from "./types";

/** Every built-in module (analysis-modules.schema.json; a test checks), drawn or not yet. */
export const BUILT_IN_MODULES: Record<string, ComponentType<ModuleProps> | null> = {
  Bar: null,
  ColumnDisplay,
  Divider,
  Grid,
  HeatmapScatterPlot: null,
  PerformanceTimePlot: null,
  Pie: null,
  RadarChart: null,
  SingleDisplay,
  Stats,
};

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

function Note({ module, children }: { module: ModuleEntry; children: React.ReactNode }) {
  return (
    <ModuleFrame module={module}>
      <p className="text-muted-foreground text-center text-sm">{children}</p>
    </ModuleFrame>
  );
}

/**
 * Draw one module. `broken` is set when config:check found errors in its options: the module is
 * not drawn, and the configuration problems say why (TR-10).
 */
export function AnalysisModule(props: ModuleProps & { broken?: boolean }) {
  const { module, broken } = props;
  if (broken)
    return (
      <Note module={module}>
        This module&apos;s options have errors, listed under the event&apos;s configuration
        problems.
      </Note>
    );
  if (!(module.module in BUILT_IN_MODULES))
    return <Note module={module}>There is no {module.module} module.</Note>;
  const Drawn = BUILT_IN_MODULES[module.module];
  if (!Drawn) {
    const paths = modulePaths(module.options);
    return (
      <Note module={module}>
        {module.module}
        {paths.length > 0 && ` · ${paths.join(", ")}`}. Shown here once the {module.module} module
        is built.
      </Note>
    );
  }
  return <Drawn {...props} />;
}
