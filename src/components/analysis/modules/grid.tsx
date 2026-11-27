"use client";

/** Grid (docs/spec/09): cells on a grid, each coloured by its value between `min` and `max`. */
import { gridCells, type GridOptions } from "@/analysis/modules/values";
import { ModuleFrame } from "./frame";
import type { ModuleProps } from "./types";

export function Grid({ module, teams, dataset }: ModuleProps) {
  const options = module.options as unknown as GridOptions;
  const cells = gridCells(dataset, teams, options);
  return (
    <ModuleFrame module={module}>
      <div
        className="grid gap-1"
        style={{
          gridTemplateRows: `repeat(${options.rows}, minmax(2.5rem, 1fr))`,
          gridTemplateColumns: `repeat(${options.cols}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            data-cell={`${c.x},${c.y}`}
            className="flex items-center justify-center rounded text-sm font-medium text-black"
            style={{
              gridArea: `${c.y} / ${c.x} / ${c.y + 1} / ${c.x + 1}`,
              backgroundColor: c.color,
            }}
          >
            {c.text}
          </div>
        ))}
      </div>
    </ModuleFrame>
  );
}
