"use client";

/** The card every module is drawn in: its name over its content (docs/spec/09 MO-1). */
import type { ReactNode } from "react";
import { NO_DATA } from "@/analysis/modules/display";
import type { RankBand, Shown } from "@/analysis/modules/values";
import type { ModuleEntry } from "@/config/types";
import { cn } from "@/lib/utils";

export function ModuleFrame({
  module,
  children,
  className,
}: {
  module: ModuleEntry;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={module.name}
      data-module={module.module}
      className={cn("bg-card flex flex-col gap-2 rounded-lg border p-4", className)}
    >
      <h3 className="text-center text-lg font-semibold">{module.name}</h3>
      {children}
    </section>
  );
}

/** v5's rank colours (MO-4): accent, green, orange, then plain. */
const BAND: Record<RankBand, string> = {
  top5: "text-primary",
  top25: "text-success",
  top50: "text-chart-2",
  top100: "text-muted-foreground",
};

export function RankBadge({ rank }: { rank: NonNullable<Shown["rank"]> }) {
  return (
    <span
      className={cn("font-semibold", BAND[rank.band])}
      data-band={rank.band}
      title={`Rank ${rank.rank} of ${rank.of} teams with a value`}
    >
      #{rank.rank}
    </span>
  );
}

/** A value, or No Data shown as such (F-27). */
export function Value({ shown }: { shown: Shown }) {
  return (
    <span className={cn(shown.text === NO_DATA && "text-muted-foreground italic")}>
      {shown.text}
    </span>
  );
}
