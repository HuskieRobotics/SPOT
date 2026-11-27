"use client";

/** Divider (docs/spec/09): a titled line between modules. */
import type { ModuleProps } from "./types";

export function Divider({ module }: ModuleProps) {
  return (
    <section
      aria-label={module.name}
      data-module="Divider"
      className="flex items-center gap-3 py-1"
    >
      <span className="bg-border h-px flex-1" />
      <h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {module.name}
      </h3>
      <span className="bg-border h-px flex-1" />
    </section>
  );
}
