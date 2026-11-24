"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ScheduleView } from "@/schedule/service";
import { cn } from "@/lib/utils";

/** A row as typed: six text boxes and a lock (AD-24, AD-25a). */
interface Row {
  number: number;
  slots: string[];
  locked: boolean;
}

const SLOT_NAMES = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"];

function rowsOf(schedule: ScheduleView): Row[] {
  return schedule.manual.map((m) => ({
    number: m.number,
    slots: [...m.red, ...m.blue].map((t) => t ?? ""),
    locked: m.locked === true,
  }));
}

function resize(rows: Row[], count: number): Row[] {
  const out = rows.slice(0, count);
  for (let n = out.length + 1; n <= count; n++)
    out.push({ number: n, slots: ["", "", "", "", "", ""], locked: false });
  return out;
}

async function post(body: object): Promise<{ schedule?: ScheduleView; message?: string }> {
  const response = await fetch("/api/admin/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export function ScheduleEditor() {
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((s: ScheduleView) => {
    setSchedule(s);
    setRows(rowsOf(s));
    setCount(String(s.manual.length));
  }, []);

  useEffect(() => {
    fetch("/api/admin/schedule")
      .then((r) => r.json())
      .then((body: { schedule?: ScheduleView; message?: string }) =>
        body.schedule ? show(body.schedule) : setMessage({ text: body.message ?? "", error: true }),
      )
      .catch(() => setMessage({ text: "SPOT's server cannot be reached.", error: true }));
  }, [show]);

  async function run(body: object, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await post(body);
      if (result.schedule) {
        show(result.schedule);
        // Reading TBA is what "refresh" does, so its error is the result; after a save, TBA's
        // trouble is shown beside TBA's status instead, and the save's result here.
        const failed = "action" in body && body.action === "refresh" && result.schedule.tbaError;
        setMessage(failed ? { text: failed, error: true } : { text: done, error: false });
      } else setMessage({ text: result.message ?? "That did not work.", error: true });
    } catch {
      setMessage({ text: "SPOT's server cannot be reached. Nothing was saved.", error: true });
    }
    setBusy(false);
  }

  const save = () =>
    run(
      {
        action: "save-manual",
        matches: rows.map((r) => ({
          number: r.number,
          red: r.slots.slice(0, 3),
          blue: r.slots.slice(3),
          locked: r.locked,
        })),
      },
      rows.length > 0
        ? "Saved. Scouters are assigned from this schedule."
        : "Saved. TBA's schedule is used.",
    );

  const setSlot = (i: number, s: number, value: string) =>
    setRows((rs) =>
      rs.map((r, j) =>
        j === i ? { ...r, slots: r.slots.map((v, k) => (k === s ? value : v)) } : r,
      ),
    );

  if (!schedule)
    return message ? <p className="text-destructive">{message.text}</p> : <p>Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <section
        className="bg-card flex flex-col gap-2 rounded-md border p-4"
        aria-label="Schedule in use"
      >
        <p>
          {schedule.source === "manual" && "Scouters are assigned from the schedule typed below."}
          {schedule.source === "tba" &&
            `Scouters are assigned from TBA's schedule for ${schedule.tbaKey} (${schedule.matches.length} matches).`}
          {schedule.source === "none" && `There is no schedule for ${schedule.tbaKey} yet.`}
        </p>
        <p className="text-muted-foreground text-sm">
          {schedule.tba
            ? `TBA's schedule was read at ${new Date(schedule.tba.fetchedAt).toLocaleTimeString()}.`
            : "TBA's schedule has not been read."}{" "}
        </p>
        {schedule.tbaError && <p className="text-destructive text-sm">{schedule.tbaError}</p>}
        <div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run({ action: "refresh" }, "TBA's schedule was read.")}
          >
            Read TBA&apos;s schedule now
          </Button>
        </div>
      </section>

      {message && (
        <p role="status" className={cn("text-sm", message.error && "text-destructive")}>
          {message.text}
        </p>
      )}

      <section className="flex flex-col gap-3" aria-label="Typed schedule">
        <h2 className="text-xl font-semibold">Typed schedule</h2>
        <p className="text-muted-foreground text-sm">
          For an event TBA does not cover. While it has matches, it is used instead of TBA&apos;s.
          Type team numbers such as 3061, or 2338B for a team&apos;s second robot. Lock a row to
          keep it from being changed by mistake.
        </p>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Number of matches
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="bg-background w-28 rounded-md border px-2 py-1"
            />
          </label>
          <Button
            variant="outline"
            disabled={busy || !/^\d+$/.test(count)}
            onClick={() => setRows((rs) => resize(rs, Number(count)))}
          >
            Set
          </Button>
        </div>
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={row.number} className="flex flex-wrap items-center gap-2">
              <span className="w-20 font-mono text-sm">Match {row.number}</span>
              {row.slots.map((value, s) => (
                <input
                  key={s}
                  aria-label={`Match ${row.number} ${SLOT_NAMES[s]}`}
                  value={value}
                  disabled={row.locked}
                  onChange={(e) => setSlot(i, s, e.target.value)}
                  className={cn(
                    "w-16 rounded-md border px-1 py-1 text-center font-mono text-sm disabled:opacity-60",
                    s < 3
                      ? "border-red-400 bg-red-50 dark:bg-red-950"
                      : "border-blue-400 bg-blue-50 dark:bg-blue-950",
                  )}
                />
              ))}
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={row.locked}
                onClick={() =>
                  setRows((rs) => rs.map((r, j) => (j === i ? { ...r, locked: !r.locked } : r)))
                }
              >
                {row.locked ? "Unlock" : "Lock"}
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={save}>
            Save
          </Button>
          {schedule.manual.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run({ action: "save-manual", matches: [] }, "TBA's schedule is used again.")
              }
            >
              Use TBA&apos;s schedule instead
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
