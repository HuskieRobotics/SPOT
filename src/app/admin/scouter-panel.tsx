"use client";

/**
 * One card per signed-in scouter (AD-4, AD-4a, AD-4b, RT-29, RT-32): name, robot, status, and
 * whether they are connected. A disconnected scouter holding a robot stands out, because that is
 * the cue to release it. Labelled controls replace v5's click-anywhere card (AD-5, BL-116).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { matchLabel } from "@/schedule/labels";
import type { AdminEntry, AdminSnapshot } from "@/sessions/runtime";
import { field, panel } from "./styles";

interface Props {
  snapshot: AdminSnapshot | null;
  release: (entry: AdminEntry, to: AdminEntry | null) => Promise<boolean>;
  remove: (entry: AdminEntry) => Promise<boolean>;
}

/** Whether the entry holds a robot of the current match. */
function holdsCurrent(snapshot: AdminSnapshot, e: AdminEntry): boolean {
  const m = snapshot.match;
  return e.team !== null && m !== null && e.matchLevel === m.level && e.matchNumber === m.number;
}

function statusText(e: AdminEntry): string {
  if (e.status === "complete") return "Finished";
  if (e.status === "scouting") return "Scouting";
  if (e.team === null) return "Waiting for a robot";
  if (e.entered) return "Sent in";
  return e.accepted ? "Ready, waiting for the start" : "Assigned";
}

export function ScouterPanel({ snapshot, release, remove }: Props) {
  const entries = snapshot?.entries ?? [];
  const connected = entries.filter((e) => e.connected).length;
  return (
    <section aria-labelledby="scouters-heading" className={panel}>
      <h2 id="scouters-heading" className="text-xl font-semibold">
        Scouters
      </h2>
      <p className="text-muted-foreground text-sm">
        {entries.length === 0
          ? "No one is signed in."
          : `${entries.length} signed in, ${connected} connected.`}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Signed-in scouters">
        {entries.map((e) => (
          <ScouterCard
            key={e.scouterId}
            entry={e}
            snapshot={snapshot!}
            release={release}
            remove={remove}
          />
        ))}
      </ul>
    </section>
  );
}

function ScouterCard({
  entry: e,
  snapshot,
  release,
  remove,
}: Props & { entry: AdminEntry; snapshot: AdminSnapshot }) {
  const [releasing, setReleasing] = useState(false);
  const [to, setTo] = useState("");
  const holds = holdsCurrent(snapshot, e);
  const stranded = holds && !e.connected && e.status !== "complete";
  const robot =
    e.team === null
      ? "No robot"
      : `Team ${e.team}${e.alliance ? ` (${e.alliance})` : ""} · ${matchLabel(e.matchLevel!, e.matchNumber!)}`;
  // A named replacement must be connected and hold no robot in this match (RT-32).
  const candidates = snapshot.entries.filter(
    (c) =>
      c.scouterId !== e.scouterId &&
      c.connected &&
      c.status !== "scouting" &&
      !holdsCurrent(snapshot, c),
  );
  const removeLabel = e.connected ? "Sign out" : "Remove";

  async function onRemove() {
    const freed =
      e.team !== null && e.status !== "complete" ? ` Team ${e.team} goes to someone else.` : "";
    const question = e.connected
      ? `Sign ${e.name} out? Their device goes back to the sign-in screen.${freed}`
      : `Remove ${e.name}? They can sign in again.${freed}`;
    if (window.confirm(question)) await remove(e);
  }

  return (
    <li
      aria-label={e.name}
      className={cn(
        "bg-background flex flex-col gap-1 rounded-lg border p-3",
        stranded && "border-destructive border-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{e.name}</p>
          <p className="text-muted-foreground text-xs">ID {e.scouterId}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            e.connected ? "text-success" : "text-destructive",
          )}
        >
          {e.connected ? "● Connected" : "○ Disconnected"}
        </span>
      </div>
      <p className="text-sm font-medium">{robot}</p>
      <p className="text-sm">{statusText(e)}</p>
      {stranded && (
        <p className="text-destructive text-sm font-medium">
          Disconnected while holding Team {e.team}. Release the robot if they are not coming back.
        </p>
      )}
      {releasing ? (
        <div className="flex flex-col gap-2 border-t pt-2 text-sm">
          <label className="flex flex-col gap-1">
            Give Team {e.team} to
            <select value={to} onChange={(ev) => setTo(ev.target.value)} className={field}>
              <option value="">The next scouter waiting</option>
              {candidates.map((c) => (
                <option key={c.scouterId} value={c.scouterId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const ok = await release(e, candidates.find((c) => c.scouterId === to) ?? null);
                if (ok) setReleasing(false);
              }}
            >
              Release
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReleasing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {holds && (
            <Button
              size="sm"
              variant={stranded ? "destructive" : "outline"}
              aria-label={`Release ${e.name}'s robot`}
              onClick={() => {
                setTo("");
                setReleasing(true);
              }}
            >
              Release robot
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${removeLabel} ${e.name}`}
            onClick={onRemove}
          >
            {removeLabel}
          </Button>
        </div>
      )}
    </li>
  );
}
