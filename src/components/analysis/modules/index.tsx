"use client";

/**
 * The modules the dashboard can draw, by name (#384 to #386; docs/spec/09; MO-2 is replaced by
 * this registry). A name that is not a built-in module is an extension module, which come in
 * #391.
 */
import type { ComponentType } from "react";
import type { ModuleEntry } from "@/config/types";
import { Bar } from "./bar";
import { ColumnDisplay } from "./column-display";
import { Divider } from "./divider";
import { ModuleFrame } from "./frame";
import { Grid } from "./grid";
import { HeatmapScatterPlot } from "./heatmap-scatter-plot";
import { PerformanceTimePlot } from "./performance-time-plot";
import { Pie } from "./pie";
import { RadarChart } from "./radar-chart";
import { SingleDisplay } from "./single-display";
import { Stats } from "./stats";
import type { ModuleProps } from "./types";

export type { ModuleProps } from "./types";

/** Every built-in module (analysis-modules.schema.json; a test checks). */
export const BUILT_IN_MODULES: Record<string, ComponentType<ModuleProps>> = {
  Bar,
  ColumnDisplay,
  Divider,
  Grid,
  HeatmapScatterPlot,
  PerformanceTimePlot,
  Pie,
  RadarChart,
  SingleDisplay,
  Stats,
};

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
  const Drawn = Object.hasOwn(BUILT_IN_MODULES, module.module)
    ? BUILT_IN_MODULES[module.module]
    : undefined;
  if (!Drawn) return <Note module={module}>There is no {module.module} module.</Note>;
  return <Drawn {...props} />;
}
