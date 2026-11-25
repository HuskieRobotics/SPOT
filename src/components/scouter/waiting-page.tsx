"use client";

/**
 * The waiting page (SC-12): a turning gear and a hint that changes every 7 s, until the registry
 * sends the scouter into a match (RT-6). Once assigned, it says which robot and match to wait for.
 */
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { matchText, type MatchKey } from "@/scouter/match";

/** v5's hints (SC-12), shown in a shuffled order. */
export const HINTS = [
  "If you misclick a button, you can always press UNDO to undo your mistake!",
  "Show up to scout on time! Try to be there a few minutes in advance.",
  "Stay focused when scouting. Data you collect helps your team greatly.",
  "If you ever have an issue, make sure to notify the scouting team.",
  "Before you leave, let the scouting team know so they can replace you.",
];

const HINT_MS = 7_000;
const FADE_MS = 400;

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function Hint() {
  const [hints] = useState(() => shuffled(HINTS));
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let fade: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setShown(false);
      fade = setTimeout(() => {
        setI((n) => (n + 1) % hints.length);
        setShown(true);
      }, FADE_MS);
    }, HINT_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(fade);
    };
  }, [hints.length]);
  return (
    <p
      data-testid="hint"
      className="text-muted-foreground max-w-md text-center text-balance transition-opacity duration-400"
      style={{ opacity: shown ? 1 : 0 }}
    >
      {hints[i]}
    </p>
  );
}

export function WaitingPage({
  statusLine,
  name,
  assigned,
  children,
}: {
  statusLine: ReactNode;
  name: string;
  /** The robot the scouter holds and waits to scout, if any. */
  assigned: MatchKey | null;
  /** Messages and the matches kept on the device. */
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {statusLine}
      <main className="flex flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
        <Image
          src="/img/gear.svg"
          alt=""
          width={96}
          height={96}
          priority
          className="animate-[spin_6s_linear_infinite] dark:invert"
        />
        {assigned ? (
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{matchText(assigned)}</h1>
            <p className="text-muted-foreground">Waiting for the match to start…</p>
          </div>
        ) : (
          <h1 className="text-2xl font-bold">Waiting to be assigned…</h1>
        )}
        <Hint />
        <p className="text-sm">
          Signed in as <strong>{name}</strong>
        </p>
        {children}
      </main>
    </div>
  );
}
