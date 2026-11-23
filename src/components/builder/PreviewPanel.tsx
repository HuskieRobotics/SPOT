"use client";
import { useMemo, useState } from "react";
import { Button, Select, Switch } from "@/components/ui";
import { ScoutGrid, useScoutingEngine } from "@/components/scout/ScoutGrid";
import type { ScoutingConfig } from "@/lib/types";

/** Runs the real scouting engine on the draft layout, inside a phone-shaped frame. */
export function PreviewPanel({ cfg, onClose }: { cfg: ScoutingConfig; onClose: () => void }) {
  const [alliance, setAlliance] = useState<"red" | "blue">("red");
  const [swap, setSwap] = useState(false);
  const [nonce, setNonce] = useState(0);
  const ctx = useMemo(() => ({ alliance, swapZones: swap }), [alliance, swap]);
  // Remount the engine when the layout changes or on reset.
  const key = useMemo(() => JSON.stringify(cfg) + ":" + nonce, [cfg, nonce]);
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-border bg-surface shadow-2xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="mr-auto text-sm font-semibold">Live preview</h2>
        <Select value={alliance} onChange={(e) => setAlliance(e.target.value as "red" | "blue")} className="h-8 w-28">
          <option value="red">Red robot</option>
          <option value="blue">Blue robot</option>
        </Select>
        <Switch checked={swap} onChange={setSwap} label="Flipped field" />
        <Button size="sm" onClick={() => setNonce((n) => n + 1)}>
          Reset
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close preview">
          ✕
        </Button>
      </div>
      <PreviewBody key={key} cfg={cfg} ctx={ctx} />
    </div>
  );
}

function PreviewBody({ cfg, ctx }: { cfg: ScoutingConfig; ctx: { alliance: "red" | "blue"; swapZones: boolean } }) {
  const { engine, rerender } = useScoutingEngine(cfg, ctx);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const phases = [...cfg.phases].sort((a, b) => b.at - a.at);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Jump to:</span>
        {phases.map((p) => (
          <Button
            key={p.at}
            size="sm"
            disabled={engine.status !== "running"}
            onClick={() => {
              engine.skipTo(p.at - 1, Date.now());
              rerender();
            }}
          >
            {p.label}
          </Button>
        ))}
        {cfg.shifts.enabled && (
          <Button size="sm" disabled={engine.status !== "running"} onClick={() => (engine.skipTo(cfg.shifts.endsAt - 1, Date.now()), rerender())}>
            {cfg.shifts.endLabel}
          </Button>
        )}
        <Button size="sm" disabled={engine.status !== "running"} onClick={() => (engine.skipTo(1, Date.now()), rerender())}>
          End
        </Button>
        <Button size="sm" variant={engine.speed > 1 ? "subtle" : "secondary"} onClick={() => ((engine.speed = engine.speed > 1 ? 1 : 10), rerender())}>
          {engine.speed > 1 ? "10× on" : "10× clock"}
        </Button>
      </div>
      <div className="mx-auto flex aspect-[19.5/9] w-full max-w-full flex-col overflow-hidden rounded-[1.6rem] border-[6px] border-text/80 bg-bg">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-2 py-1 text-[10px]">
          <span className={`rounded px-1.5 py-0.5 font-semibold text-white ${ctx.alliance === "red" ? "bg-red-alliance" : "bg-blue-alliance"}`}>M1 · 3061</span>
          <span className="truncate font-mono text-muted">{engine.lastActions() || "—"}</span>
        </div>
        <ScoutGrid engine={engine} rerender={rerender} swapZones={ctx.swapZones} contained onEffect={(e) => e.type === "submit" && setSubmitted(JSON.stringify(engine.submittedActions(), null, 1))} />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="min-h-0 overflow-y-auto rounded-lg bg-surface-2 p-2">
          <div className="mb-1 text-xs font-semibold">Recorded actions ({engine.queue.length})</div>
          <ol className="list-decimal pl-5 font-mono text-[11px]">
            {engine.queue.map((a, i) => (
              <li key={i} className={a.temp ? "text-muted" : ""}>
                {a.id} @{(a.ts / 1000).toFixed(1)}s{a.temp ? " (not saved)" : ""}
                {a.other?.pos ? ` (${a.other.pos.x},${a.other.pos.y})` : ""}
              </li>
            ))}
          </ol>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-lg bg-surface-2 p-2 text-xs">
          <div className="mb-1 font-semibold">State</div>
          <div>Layer: {engine.currentLayerIndex} · {cfg.layers[engine.currentLayerIndex]?.name}</div>
          <div>Phase: {engine.displayLabel || "pre-match"}</div>
          <div>Variables: {JSON.stringify(engine.getVariables())}</div>
          {submitted && (
            <>
              <div className="mt-2 font-semibold text-success">Submit pressed — this would be uploaded:</div>
              <pre className="max-h-40 overflow-auto font-mono text-[10px]">{submitted}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
