"use client";

/**
 * The scouting grid (docs/spec/05 SC-14 to SC-16): the buttons of the screen shown now, placed by
 * their `gridArea` on a grid of `rows` × `columns` cells. The grid fills its container, whose
 * width sets the text size, so the preview shows the proportions a scouter's screen has.
 */
import { useEffect, useRef, useState } from "react";
import type { GridArea } from "@/config/types";
import { cn } from "@/lib/utils";
import type { ButtonView } from "@/scouting/view";

/** v5's colors: a highlighted button, its ring, and the position lock's flash (SC-32, SC-34). */
const HIGHLIGHT = "#2f5f77";
const HIGHLIGHT_RING = "#fff6c1";
const POSITION_LOCK = "#00ffa5";
/** A button with no color of its own, and the press feedback's outline (SC-16). */
const DEFAULT_COLOR = "#707070";
const PRESSED_RING = "rgba(76, 136, 3, 0.9)";
/** How long the press feedback stays after the finger lifts (SC-16). */
const PRESSED_MS = 90;

const areaOf = ([rowStart, columnStart, rowEnd, columnEnd]: GridArea) =>
  `${rowStart} / ${columnStart} / ${rowEnd} / ${columnEnd}`;

export interface ScoutingGridProps {
  rows: number;
  columns: number;
  buttons: ButtonView[];
  onPress(button: ButtonView): void;
  /** Draw every cell with its row and column, and each button's id and gridArea. */
  showGrid?: boolean;
}

export function ScoutingGrid({ rows, columns, buttons, onPress, showGrid }: ScoutingGridProps) {
  const cells: { row: number; column: number }[] = [];
  if (showGrid) {
    for (let row = 1; row <= rows; row++) {
      for (let column = 1; column <= columns; column++) cells.push({ row, column });
    }
  }
  return (
    <div
      className="grid size-full gap-[1.2cqw] p-[1.2cqmin]"
      style={{
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {cells.map(({ row, column }) => (
        <div
          key={`cell-${row}-${column}`}
          aria-hidden
          className="text-muted-foreground border-muted-foreground/40 flex items-center justify-center rounded-md border border-dashed font-mono text-[max(8px,1.1cqw)]"
          style={{ gridArea: `${row} / ${column} / ${row + 1} / ${column + 1}` }}
        >
          {row},{column}
        </div>
      ))}
      {buttons.map((button) => (
        <GridButton key={button.key} button={button} onPress={onPress} showGrid={showGrid} />
      ))}
    </div>
  );
}

function GridButton({
  button,
  onPress,
  showGrid,
}: {
  button: ButtonView;
  onPress(button: ButtonView): void;
  showGrid?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (release.current) clearTimeout(release.current);
    },
    [],
  );
  const down = () => {
    if (release.current) clearTimeout(release.current);
    setPressed(true);
  };
  const up = () => {
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => setPressed(false), PRESSED_MS);
  };

  const rings: string[] = [];
  if (pressed) rings.push(`inset 0 0 0 0.5cqmin ${PRESSED_RING}`);
  else if (button.positionLocked) rings.push(`inset 0 0 0 0.5cqw ${POSITION_LOCK}`);
  else if (button.highlighted) rings.push(`inset 0 0 0 0.4cqmin ${HIGHLIGHT_RING}`);
  rings.push("0 0 0.6cqmin 0 rgb(0 0 0 / 0.35)");

  const style = {
    gridArea: areaOf(button.gridArea),
    backgroundColor: button.highlighted ? HIGHLIGHT : (button.color ?? DEFAULT_COLOR),
    color: button.textColor ?? "#ffffff",
    boxShadow: rings.join(", "),
  };
  const content = (
    <>
      <span className="whitespace-pre-line">{button.label}</span>
      {showGrid && (
        <span className="mt-[0.3cqmin] font-mono text-[max(8px,1cqw)] opacity-80">
          {button.id} [{button.gridArea.join(", ")}]
        </span>
      )}
    </>
  );
  const className = cn(
    "flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.2cqmin] p-[0.4cqmin] text-center text-[max(9px,2.6cqw)] leading-none select-none",
    "transition-[filter,transform,box-shadow] duration-100",
    pressed && "translate-y-px brightness-90",
  );

  if (button.type === "label") {
    return (
      <div className={className} style={style} data-button={button.id} data-layer={button.layer}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(className, "cursor-pointer touch-manipulation disabled:opacity-60")}
      style={style}
      disabled={button.disabled}
      aria-pressed={button.highlighted || undefined}
      data-button={button.id}
      data-layer={button.layer}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onClick={() => onPress(button)}
    >
      {content}
    </button>
  );
}
