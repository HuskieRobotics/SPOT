"use client";

/**
 * The scouting-screen preview's controls around the real scouting screen (#322, gate K-5): the
 * alliance and field orientation (SC-28), a faster clock and a skip to the next period, a fresh
 * match, the grid's cells, and the recorded actions as analysis receives them.
 */
import { useMemo, useState } from "react";
import { RecordedActions } from "@/components/scouting/recorded-actions";
import { ScoutingScreen } from "@/components/scouting/scouting-screen";
import { useScoutingSession } from "@/components/scouting/use-scouting-session";
import { Button } from "@/components/ui/button";
import type { MatchScoutingConfig } from "@/config/types";
import { cn } from "@/lib/utils";
import { recordedActions, type ScoutingSettings } from "@/scouting/session";

const SPEEDS = [1, 2, 5, 10];
/** Width over height of the screen, in landscape. */
const SHAPES = { phone: 19.5 / 9, tablet: 4 / 3 } as const;
type Shape = keyof typeof SHAPES;

function Choice<const T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange(value: NoInfer<T>): void;
  format?: (value: NoInfer<T>) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <span className="text-muted-foreground mr-1 text-sm">{label}</span>
      {options.map((option) => (
        <Button
          key={String(option)}
          size="sm"
          variant={option === value ? "default" : "outline"}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {format ? format(option) : String(option)}
        </Button>
      ))}
    </div>
  );
}

export function ScoutingPreview({ config }: { config: MatchScoutingConfig }) {
  const [alliance, setAlliance] = useState<ScoutingSettings["alliance"]>("red");
  const [field, setField] = useState<"normal" | "flipped">("normal");
  const settings = useMemo(
    () => ({ alliance, fieldFlipped: field === "flipped" }),
    [alliance, field],
  );
  const session = useScoutingSession(config, settings);
  const [shape, setShape] = useState<Shape>("phone");
  const [showGrid, setShowGrid] = useState(false);

  const { state } = session;
  const actions = recordedActions(state);
  const ratio = SHAPES[shape];
  const screen = state.screens[state.screens.length - 1]?.layer ?? "";
  const variables = Object.entries(state.variables);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Choice
          label="Alliance"
          options={["red", "blue"] as const}
          value={alliance}
          onChange={setAlliance}
          format={(a) => (a === "red" ? "Red" : "Blue")}
        />
        <Choice
          label="Field"
          options={["normal", "flipped"] as const}
          value={field}
          onChange={setField}
          format={(f) => (f === "normal" ? "Normal" : "Flipped")}
        />
        <Choice
          label="Speed"
          options={SPEEDS}
          value={session.state.clock.speed}
          onChange={session.setSpeed}
          format={(s) => `${s}×`}
        />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={state.status !== "running"}
            onClick={session.skip}
          >
            Skip to next period
          </Button>
          <Button size="sm" variant="outline" onClick={session.restart}>
            New match
          </Button>
        </div>
        <Choice
          label="Screen"
          options={["phone", "tablet"] as const}
          value={shape}
          onChange={setShape}
          format={(s) => (s === "phone" ? "Phone" : "Tablet")}
        />
        <Button
          size="sm"
          variant={showGrid ? "default" : "outline"}
          aria-pressed={showGrid}
          onClick={() => setShowGrid((g) => !g)}
        >
          Show grid
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,36rem)]">
        <div
          className={cn(
            "mx-auto overflow-hidden rounded-xl border-4 shadow-md xl:mx-0",
            alliance === "red" ? "border-alliance-red" : "border-alliance-blue",
          )}
          style={{
            aspectRatio: ratio,
            width: `min(100%, calc((100dvh - 10rem) * ${ratio}))`,
          }}
        >
          <ScoutingScreen session={session} showGrid={showGrid} status={screen} />
        </div>

        <aside className="flex min-w-0 flex-col gap-2">
          <h2 className="font-semibold">
            Recorded actions <span className="text-muted-foreground">({actions.length})</span>
          </h2>
          {state.status === "submitted" && (
            <p role="status" className="text-sm">
              Submitted. A real match would send these {actions.length} actions.{" "}
              <button type="button" className="underline" onClick={session.restart}>
                Scout another
              </button>
            </p>
          )}
          <RecordedActions actions={actions} />
          {variables.length > 0 && (
            <p className="text-muted-foreground font-mono text-xs">
              variables:{" "}
              {variables.map(([name, value]) => `${name} = ${JSON.stringify(value)}`).join(", ")}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
