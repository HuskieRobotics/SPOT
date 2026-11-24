"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MatchLevel } from "@/data/types";
import { matchLabel } from "@/schedule/labels";
import type { ScheduleView } from "@/schedule/service";
import { cn } from "@/lib/utils";

/** A row as typed: six text boxes and a lock (AD-24, AD-25a). */
interface Row {
  number: number;
  slots: string[];
  locked: boolean;
}

type Rows = Record<MatchLevel, Row[]>;

const LEVELS: { level: MatchLevel; title: string; plural: string }[] = [
  { level: "qual", title: "Qualification matches", plural: "qualifications" },
  { level: "playoff", title: "Playoff matches", plural: "playoffs" },
];

const SLOT_NAMES = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"];

function rowsOf(schedule: ScheduleView): Rows {
  const of = (level: MatchLevel) =>
    schedule.manual
      .filter((m) => m.level === level)
      .map((m) => ({
        number: m.number,
        slots: [...m.red, ...m.blue].map((t) => t ?? ""),
        locked: m.locked === true,
      }));
  return { qual: of("qual"), playoff: of("playoff") };
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

function sourceText(schedule: ScheduleView, level: MatchLevel, plural: string): string {
  const count = schedule.matches.filter((m) => m.level === level).length;
  const name = plural[0].toUpperCase() + plural.slice(1);
  if (schedule.source[level] === "manual") return `${name}: the ${count} typed below.`;
  if (schedule.source[level] === "tba") return `${name}: ${count} from TBA (${schedule.tbaKey}).`;
  return `${name}: none yet.`;
}

export function ScheduleEditor() {
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [rows, setRows] = useState<Rows>({ qual: [], playoff: [] });
  const [counts, setCounts] = useState<Record<MatchLevel, string>>({ qual: "", playoff: "" });
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((s: ScheduleView) => {
    const r = rowsOf(s);
    setSchedule(s);
    setRows(r);
    setCounts({ qual: String(r.qual.length), playoff: String(r.playoff.length) });
  }, []);

  useEffect(() => {
    fetch("/api/admin/schedule")
      .then((r) => r.json())
      .then((body: { schedule?: ScheduleView; message?: string }) =>
        body.schedule ? show(body.schedule) : setMessage({ text: body.message ?? "", error: true }),
      )
      .catch(() => setMessage({ text: "SPOT's server cannot be reached.", error: true }));
  }, [show]);

  async function run(body: { action: string }, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await post(body);
      if (result.schedule) {
        show(result.schedule);
        // Reading TBA is what "refresh" does, so its error is the result; after a save, TBA's
        // trouble is shown beside TBA's status instead, and the save's result here.
        const failed = body.action === "refresh" && result.schedule.tbaError;
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
        matches: LEVELS.flatMap(({ level }) =>
          rows[level].map((r) => ({
            level,
            number: r.number,
            red: r.slots.slice(0, 3),
            blue: r.slots.slice(3),
            locked: r.locked,
          })),
        ),
      } as { action: string },
      "Saved.",
    );

  const update = (level: MatchLevel, i: number, change: (r: Row) => Row) =>
    setRows((rs) => ({ ...rs, [level]: rs[level].map((r, j) => (j === i ? change(r) : r)) }));

  if (!schedule)
    return message ? <p className="text-destructive">{message.text}</p> : <p>Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <section
        className="bg-card flex flex-col gap-2 rounded-md border p-4"
        aria-label="Schedule in use"
      >
        <p className="font-medium">Scouters are assigned from:</p>
        <ul className="text-sm">
          {LEVELS.map(({ level, plural }) => (
            <li key={level}>{sourceText(schedule, level, plural)}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          {schedule.tba
            ? `TBA's schedule was read at ${new Date(schedule.tba.fetchedAt).toLocaleTimeString()}. Playoff matches appear as TBA adds them.`
            : "TBA's schedule has not been read."}
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

      <p className="text-muted-foreground text-sm">
        Type matches only when TBA does not have them. Typed qualifications are used instead of
        TBA&apos;s qualifications, and typed playoffs instead of TBA&apos;s playoffs; set a count to
        0 and save to go back to TBA&apos;s. Type team numbers such as 3061, or 2338B for a
        team&apos;s second robot. Playoff matches are numbered as the field shows them: 1 to 13,
        then the finals 14 to 16. Lock a row to keep it from being changed by mistake.
      </p>

      {LEVELS.map(({ level, title }) => (
        <section key={level} className="flex flex-col gap-3" aria-label={title}>
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Number of {level === "qual" ? "qualification" : "playoff"} matches
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={counts[level]}
                onChange={(e) => setCounts((c) => ({ ...c, [level]: e.target.value }))}
                className="bg-background w-28 rounded-md border px-2 py-1"
              />
            </label>
            <Button
              variant="outline"
              aria-label={`Set the number of ${level === "qual" ? "qualification" : "playoff"} matches`}
              disabled={busy || !/^\d+$/.test(counts[level])}
              onClick={() =>
                setRows((rs) => ({ ...rs, [level]: resize(rs[level], Number(counts[level])) }))
              }
            >
              Set
            </Button>
          </div>
          <ol className="flex flex-col gap-2">
            {rows[level].map((row, i) => {
              const label = matchLabel(level, row.number);
              return (
                <li key={row.number} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 font-mono text-sm">{label}</span>
                  {row.slots.map((value, s) => (
                    <input
                      key={s}
                      aria-label={`${label} ${SLOT_NAMES[s]}`}
                      value={value}
                      disabled={row.locked}
                      onChange={(e) =>
                        update(level, i, (r) => ({
                          ...r,
                          slots: r.slots.map((v, k) => (k === s ? e.target.value : v)),
                        }))
                      }
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
                    aria-label={`${row.locked ? "Unlock" : "Lock"} ${label}`}
                    aria-pressed={row.locked}
                    onClick={() => update(level, i, (r) => ({ ...r, locked: !r.locked }))}
                  >
                    {row.locked ? "Unlock" : "Lock"}
                  </Button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <div>
        <Button disabled={busy} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
