"use client";

/**
 * A message the scouter must answer before going on: an assignment (SC-13), a withdrawn robot
 * (BL-54), a confirmation. Drawn over every page, including the match screen.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the first action, so a keyboard or a screen reader lands on the answer.
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="bg-card text-card-foreground flex w-full max-w-sm flex-col gap-3 rounded-xl border p-5 shadow-xl"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <div id={`${id}-body`} className="text-sm">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
