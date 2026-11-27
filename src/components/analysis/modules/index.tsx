"use client";

/**
 * The modules the dashboard can draw, by name (#384 to #386, #391; docs/spec/09; MO-2 is replaced
 * by this registry): the built-in modules here, and the extension modules registered in
 * `src/components/analysis/extensions/` (`extension-modules.ts`).
 */
import { Component, type ComponentType, type ReactNode } from "react";
import type { ModuleEntry } from "@/config/types";
import type { ExtensionModule } from "../extension-api";
import { appModules } from "../extension-modules";
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

/** An extension's drawing that throws shows a note in its place, not a broken dashboard. */
class Contained extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    console.error(`The extension module "${this.props.name}" failed:`, error);
  }
  render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <p className="text-muted-foreground text-center text-sm" data-testid="module-failed">
        This module could not be drawn: {this.state.error}
      </p>
    );
  }
}

function Extension({ extension, ...props }: ModuleProps & { extension: ExtensionModule }) {
  const Drawing = extension.component;
  return (
    <ModuleFrame module={props.module}>
      <Contained name={extension.name}>
        <Drawing {...props} options={props.module.options} />
      </Contained>
    </ModuleFrame>
  );
}

/**
 * Draw one module. `broken` is set when config:check found errors in its options: the module is
 * not drawn, and the configuration problems say why (TR-10).
 */
export function AnalysisModule(props: ModuleProps & { broken?: boolean }) {
  const { module, broken, ...rest } = props;
  const Drawn = Object.hasOwn(BUILT_IN_MODULES, module.module)
    ? BUILT_IN_MODULES[module.module]
    : undefined;
  const extension = Drawn ? undefined : appModules().get(module.module);
  if (!Drawn && !extension) return <Note module={module}>There is no {module.module} module.</Note>;
  if (broken)
    return (
      <Note module={module}>
        This module&apos;s options have errors, listed under the event&apos;s configuration
        problems.
      </Note>
    );
  if (extension) return <Extension module={module} {...rest} extension={extension} />;
  return Drawn ? <Drawn module={module} {...rest} /> : null;
}
