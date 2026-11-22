"use client";

/**
 * What a scouter sees during a match (docs/spec/05): a status line with the last-actions readout
 * (SC-2), the grid of the screen shown now (SC-14), a lock's message (SC-27b), and the field map
 * when a button asks for a position (SC-32). It fills its container, which the preview sizes like
 * a phone or a tablet and the Phase 2 client will size to the whole screen.
 */
import type { ReactNode } from "react";
import { lockMessage, readout, screenButtons } from "@/scouting/view";
import { FieldMap } from "./field-map";
import { ScoutingGrid } from "./scouting-grid";
import type { ScoutingSession } from "./use-scouting-session";

export interface ScoutingScreenProps {
  session: ScoutingSession;
  /** Shown at the left of the status line. */
  status?: ReactNode;
  showGrid?: boolean;
}

export function ScoutingScreen({ session, status, showGrid }: ScoutingScreenProps) {
  const { state, context, now } = session;
  const { layout, rules } = context.config;
  const buttons = screenButtons(state, context, now);
  const lock = lockMessage(state);
  return (
    <section
      aria-label="Scouting screen"
      data-status={state.status}
      className="bg-background [container-type:size] relative flex size-full flex-col overflow-hidden"
    >
      <div className="flex h-[7cqh] min-h-5 shrink-0 items-center justify-between gap-2 px-[1cqw] text-[max(10px,3.2cqh)] leading-none">
        <span className="text-muted-foreground truncate">{status}</span>
        <span data-testid="last-actions" className="truncate font-medium">
          {readout(state).join(" ➔ ")}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ScoutingGrid
          rows={layout.rows}
          columns={layout.columns}
          buttons={buttons}
          showGrid={showGrid}
          onPress={(b) => session.press({ layer: b.layer, button: b.id })}
        />
      </div>
      {lock && (
        <div
          role="status"
          className="bg-destructive pointer-events-none absolute top-1/2 left-1/2 z-10 max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-xl px-[2cqw] py-[1.5cqh] text-center text-[max(11px,1.8cqw)] font-semibold text-white shadow-lg"
        >
          {lock}
        </div>
      )}
      {state.awaitingPosition !== null && (
        <FieldMap
          image={rules.fieldMap.image}
          turned={context.settings.fieldFlipped}
          onTap={session.placePosition}
        />
      )}
    </section>
  );
}
