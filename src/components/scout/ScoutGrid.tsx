"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoutingEngine, type EngineContext, type EngineEffect } from "@/lib/scouting/engine";
import type { ScoutingConfig } from "@/lib/types";
import { contrastText, cx } from "@/components/ui";

/** Owns a ScoutingEngine and re-renders while the clock runs. */
export function useScoutingEngine(cfg: ScoutingConfig, ctx: EngineContext) {
  const engine = useMemo(() => new ScoutingEngine(cfg, ctx), [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    engine.ctx = ctx;
    rerender();
  }, [engine, ctx.alliance, ctx.swapZones]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      if (engine.status === "running" || engine.status === "done") {
        engine.tick(Date.now());
        rerender();
      }
    }, 50);
    return () => clearInterval(id);
  }, [engine, rerender]);

  return { engine, rerender };
}

interface Props {
  engine: ScoutingEngine;
  rerender: () => void;
  swapZones: boolean;
  /** Called for effects the host handles (started, submit, reset). */
  onEffect?: (e: EngineEffect) => void;
  className?: string;
  /** Builder preview: fill the parent instead of the viewport. */
  contained?: boolean;
}

export function ScoutGrid({ engine, rerender, swapZones, onEffect, className, contained }: Props) {
  const cfg = engine.cfg;
  const [positionFor, setPositionFor] = useState<number | null>(null);
  const [lockFlash, setLockFlash] = useState(false);
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const now = Date.now();
  const buttons = engine.visibleButtons();

  const flash = () => {
    setLockFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setLockFlash(false), cfg.positionLockMs);
  };

  const press = (uid: string) => {
    if (navigator.vibrate) navigator.vibrate(8);
    const effects = engine.press(uid, Date.now());
    for (const e of effects) {
      if (e.type === "requestPosition") setPositionFor(e.entryIndex);
      else if (e.type === "positionReused") flash();
      else onEffect?.(e);
    }
    rerender();
  };

  const pickPosition = (ev: React.MouseEvent<HTMLImageElement>) => {
    const img = ev.currentTarget;
    const r = img.getBoundingClientRect();
    let x = Math.round(Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)));
    let y = Math.round(Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100)));
    if (swapZones) {
      x = 100 - x;
      y = 100 - y;
    }
    engine.setPosition(positionFor!, { x, y }, Date.now());
    setDot({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    setTimeout(() => {
      setDot(null);
      setPositionFor(null);
    }, 250);
    if (cfg.positionLockMs > 0) flash();
    rerender();
  };

  return (
    <div className={cx("relative flex min-h-0 flex-1 flex-col", className)}>
      <div
        className="grid min-h-0 flex-1 gap-1.5 p-1.5"
        style={{ gridAutoRows: "minmax(0, 1fr)", gridTemplateRows: `repeat(${cfg.grid.rows}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${cfg.grid.columns}, minmax(0, 1fr))` }}
      >
        {buttons.map((b) => {
          const [r1, c1, r2, c2] = b.effectiveArea;
          const isLabel = b.type === "label";
          const text = b.type === "match-control" ? engine.controlLabel(now) : b.effectiveLabel;
          const bg = b.type === "match-control" && engine.holding ? "#c27c0e" : b.color;
          return (
            <button
              key={b.uid}
              type="button"
              disabled={b.disabled || isLabel}
              onClick={() => press(b.uid)}
              aria-label={text}
              className={cx(
                "scout-btn flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg px-1 text-center font-semibold leading-tight shadow-sm",
                contained ? "text-[clamp(8px,1.4vw,13px)]" : "text-[clamp(12px,3.4vmin,24px)]",
                b.highlighted && "highlighted",
                lockFlash && b.usesPosition && "position-lock",
                b.disabled && "opacity-45",
                b.type === "undo" && !engine.canUndo && "opacity-60",
                isLabel && "shadow-none",
              )}
              style={{ gridArea: `${r1} / ${c1} / ${r2} / ${c2}`, background: bg, color: b.textColor || contrastText(bg) }}
            >
              <span className="whitespace-pre-line">{text}</span>
              {b.hint && <span className="mt-0.5 text-[0.7em] font-normal opacity-85">{b.hint}</span>}
            </button>
          );
        })}
      </div>

      {engine.aStopLocked && (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-danger/95 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
          {cfg.aStop.message}
        </div>
      )}

      {positionFor !== null && (
        <div className={cx("z-40 flex flex-col items-center justify-center gap-2 bg-black/90 p-3", contained ? "absolute inset-0" : "fixed inset-0")}>
          <p className="text-sm font-medium text-white">Tap where the robot is</p>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cfg.field.image || "/img/field.svg"}
              alt="Field map"
              onClick={pickPosition}
              className="max-h-[80dvh] max-w-full cursor-crosshair select-none rounded-md bg-black"
              style={{ transform: swapZones ? "rotate(180deg)" : undefined }}
              draggable={false}
            />
            {dot && <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent" style={{ left: dot.x, top: dot.y }} />}
          </div>
          <button type="button" className="text-xs text-white/70 underline" onClick={() => setPositionFor(null)}>
            Skip position
          </button>
        </div>
      )}
    </div>
  );
}
