"use client";
import { Button, Card, Field, Input, NumberInput, Select, Switch, cx } from "@/components/ui";
import type { Phase, Project } from "@/lib/types";
import { camelCase } from "@/lib/analysis/path";
import { JsonInput, KeyValueEditor, TagInput } from "./fields";

type Update = (fn: (p: Project) => void) => void;
const sec = (ms: number | null | undefined) => (ms === null || ms === undefined ? null : Math.round(ms) / 1000);
const ms = (s: number | null) => (s === null ? 0 : Math.round(s * 1000));

const PHASE_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#ea580c", "#db2777", "#65a30d", "#0891b2"];

export function TimingEditor({ project, update }: { project: Project; update: Update }) {
  const s = project.scouting;
  const phases = [...s.phases].map((p, i) => ({ p, i })).sort((a, b) => b.p.at - a.p.at);
  const setPhase = (i: number, fn: (p: Phase) => void) => update((pr) => fn(pr.scouting.phases[i]));
  const ids = [...new Set(s.layers.flatMap((l) => l.buttons.map((b) => b.id)))];

  // Timeline segments (elapsed time left → right).
  const segs = phases.map(({ p }, k) => {
    const start = s.totalTime - p.at;
    const end = k + 1 < phases.length ? s.totalTime - phases[k + 1].p.at : s.totalTime;
    return { label: p.label, start, end, color: PHASE_COLORS[k % PHASE_COLORS.length] };
  });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Match clock" description="The clock counts down. Phases begin when the clock reaches their time." className="xl:col-span-2">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Match length (seconds)">
              <NumberInput value={sec(s.totalTime)} onChange={(n) => n && n > 0 && update((p) => (p.scouting.totalTime = ms(n)))} className="w-28" />
            </Field>
            <p className="pb-2 text-xs text-muted">2026: 160 s (20 s auto + 140 s teleop). Most earlier games: 150–153 s.</p>
          </div>
          <div>
            <div className="relative h-10 overflow-hidden rounded-lg bg-surface-2">
              {segs.map((g, k) => (
                <div
                  key={k}
                  className="absolute inset-y-0 flex items-center overflow-hidden border-r-2 border-surface px-2 text-[11px] font-semibold whitespace-nowrap text-white"
                  style={{ left: `${(g.start / s.totalTime) * 100}%`, width: `${((g.end - g.start) / s.totalTime) * 100}%`, background: g.color }}
                  title={`${g.label}: ${sec(s.totalTime - g.start)}s → ${sec(s.totalTime - g.end)}s`}
                >
                  {g.label}
                </div>
              ))}
              {s.shifts.enabled && (
                <div
                  className="absolute bottom-0 h-1.5 bg-[repeating-linear-gradient(90deg,#facc15_0_12px,#1f2937_12px_24px)]"
                  style={{ left: `${((s.totalTime - s.shifts.startsAt) / s.totalTime) * 100}%`, width: `${((s.shifts.startsAt - s.shifts.endsAt) / s.totalTime) * 100}%` }}
                  title="Shifts"
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{sec(s.totalTime)} s</span>
              <span>0 s</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Phase name (timer + id prefix)</th>
                  <th className="px-2 font-medium">Starts at clock (s)</th>
                  <th className="px-2 font-medium">Show layer</th>
                  <th className="px-2 font-medium">Pause clock (s)</th>
                  <th className="px-2 font-medium">Set variables</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {phases.map(({ p, i }, k) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: PHASE_COLORS[k % PHASE_COLORS.length] }} />
                        <Input value={p.label} onChange={(e) => setPhase(i, (x) => (x.label = e.target.value))} />
                      </div>
                      {s.prefixActionIds && <div className="mt-0.5 pl-5 font-mono text-[11px] text-muted">{camelCase(p.label)}…</div>}
                    </td>
                    <td className="px-2 py-1">
                      <NumberInput value={sec(p.at)} onChange={(n) => n !== null && setPhase(i, (x) => (x.at = ms(n)))} className="w-24" />
                      <div className="mt-0.5 text-[11px] text-muted">{sec(s.totalTime - p.at)} s in</div>
                    </td>
                    <td className="px-2 py-1">
                      <Select value={String(p.layer)} onChange={(e) => setPhase(i, (x) => (x.layer = Number(e.target.value)))} className="w-44">
                        <option value="-1">Keep current</option>
                        {s.layers.map((l, li) => (
                          <option key={li} value={li}>
                            {li} · {l.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <NumberInput value={sec(p.holdMs ?? 0)} onChange={(n) => setPhase(i, (x) => (n ? (x.holdMs = ms(n)) : delete x.holdMs))} className="w-20" />
                    </td>
                    <td className="px-2 py-1">
                      <KeyValueEditor value={p.variables ?? {}} onChange={(v) => setPhase(i, (x) => (Object.keys(v).length ? (x.variables = v as Phase["variables"]) : delete x.variables))} keyLabel="Variable" valueLabel="Value" keySuggestions={Object.keys(s.variables)} />
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-muted">Filter layer by variables (advanced)</summary>
                        <div className="mt-1 text-[11px] text-muted">Conditional: {"{ variable: { value: [buttonIds] } }"}</div>
                        <JsonInput value={p.conditional} onChange={(v) => setPhase(i, (x) => (v ? (x.conditional = v as Phase["conditional"]) : delete x.conditional))} rows={3} />
                        <div className="mt-1 text-[11px] text-muted">Always show</div>
                        <TagInput value={p.always ?? []} onChange={(v) => setPhase(i, (x) => (v.length ? (x.always = v) : delete x.always))} suggestions={ids} />
                      </details>
                    </td>
                    <td className="py-1 pl-2">
                      <Button size="icon" variant="ghost" onClick={() => update((pr) => pr.scouting.phases.splice(i, 1))} aria-label="Remove phase">
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            size="sm"
            className="self-start"
            onClick={() => update((p) => p.scouting.phases.push({ at: Math.max(0, (phases.at(-1)?.p.at ?? s.totalTime) - 30000), label: "Endgame", layer: -1 }))}
          >
            + Add phase
          </Button>
        </div>
      </Card>

      <Card title="Action ids" description="How button presses are named in the data.">
        <div className="flex flex-col gap-4 p-4">
          <Switch
            checked={s.prefixActionIds}
            onChange={(v) => update((p) => (p.scouting.prefixActionIds = v))}
            label="Put the phase in front of every action id"
            help={`e.g. "Score" pressed in Auto records "${camelCase(phases[0]?.p.label ?? "auto")}Score". Lets one button count separately per phase (2026 style). Off: the id is recorded as-is.`}
          />
          <Field label="Extra known action ids" help="Ids not produced by buttons that analysis should still list (e.g. TBA climb results like endGameTowerRobot_Level2).">
            <TagInput value={s.knownActionIds} onChange={(v) => update((p) => (p.scouting.knownActionIds = v))} />
          </Field>
        </div>
      </Card>

      <Card title="Shifts" description="Alternating active/inactive periods (2026 hub shifts).">
        <div className="flex flex-col gap-4 p-4">
          <Switch checked={s.shifts.enabled} onChange={(v) => update((p) => (p.scouting.shifts.enabled = v))} label="Use shifts" help="After the scouter presses the active or inactive button, the label alternates every interval." />
          {s.shifts.enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="'Active' button id">
                <Select value={s.shifts.activeButtonId} onChange={(e) => update((p) => (p.scouting.shifts.activeButtonId = e.target.value))}>
                  {ids.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </Select>
              </Field>
              <Field label="'Inactive' button id">
                <Select value={s.shifts.inactiveButtonId} onChange={(e) => update((p) => (p.scouting.shifts.inactiveButtonId = e.target.value))}>
                  {ids.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Shifts start at clock (s)">
                <NumberInput value={sec(s.shifts.startsAt)} onChange={(n) => n !== null && update((p) => (p.scouting.shifts.startsAt = ms(n)))} />
              </Field>
              <Field label="Shifts end at clock (s)">
                <NumberInput value={sec(s.shifts.endsAt)} onChange={(n) => n !== null && update((p) => (p.scouting.shifts.endsAt = ms(n)))} />
              </Field>
              <Field label="Shift length (s)">
                <NumberInput value={sec(s.shifts.interval)} onChange={(n) => n && update((p) => (p.scouting.shifts.interval = ms(n)))} />
              </Field>
              <Field label="Label after shifts end">
                <Input value={s.shifts.endLabel} onChange={(e) => update((p) => (p.scouting.shifts.endLabel = e.target.value))} />
              </Field>
              <Field label="Active label">
                <Input value={s.shifts.activeLabel} onChange={(e) => update((p) => (p.scouting.shifts.activeLabel = e.target.value))} />
              </Field>
              <Field label="Inactive label">
                <Input value={s.shifts.inactiveLabel} onChange={(e) => update((p) => (p.scouting.shifts.inactiveLabel = e.target.value))} />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Card title="A-Stop lock" description="Lock every button (except Undo and the timer) after A-Stop is pressed, until auto ends.">
        <div className="flex flex-col gap-4 p-4">
          <Switch checked={s.aStop.enabled} onChange={(v) => update((p) => (p.scouting.aStop.enabled = v))} label="Enable A-Stop lock" />
          {s.aStop.enabled && (
            <>
              <Field label="A-Stop button ids" help='Leave empty to treat any button whose id or label contains "astop" as A-Stop.'>
                <TagInput value={s.aStop.buttonIds} onChange={(v) => update((p) => (p.scouting.aStop.buttonIds = v))} suggestions={ids} />
              </Field>
              <Field label="Unlock at clock (s)" help={`Empty = when the second phase starts (${sec(phases[1]?.p.at ?? 0)} s).`}>
                <NumberInput value={sec(s.aStop.until)} onChange={(n) => update((p) => (p.scouting.aStop.until = n === null ? null : ms(n)))} className="w-28" />
              </Field>
              <Field label="Message shown while locked">
                <Input value={s.aStop.message} onChange={(e) => update((p) => (p.scouting.aStop.message = e.target.value))} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card title="Timer messages" description="Text on the timer / match-control button.">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {(
            [
              ["start", "Before the match"],
              ["running", "While running — {time} and {phase} are filled in"],
              ["hold", "While the clock is paused"],
              ["complete", "When time runs out (2 s)"],
              ["submit", "Then, to submit"],
              ["submitting", "While uploading"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input value={s.messages[k]} onChange={(e) => update((p) => (p.scouting.messages[k] = e.target.value))} />
            </Field>
          ))}
          <div className={cx("rounded-lg bg-surface-2 px-3 py-2 text-xs sm:col-span-2")}>
            Preview: <b>{s.messages.running.replace("{time}", (s.totalTime / 1000 - 12.34).toFixed(2)).replace("{phase}", phases[0]?.p.label ?? "Auto")}</b>
          </div>
        </div>
      </Card>

      <Card title="Variables" description="Starting values for variables used by 'Set variable' and filtered layers.">
        <div className="p-4">
          <KeyValueEditor value={s.variables} onChange={(v) => update((p) => (p.scouting.variables = v as typeof s.variables))} keyLabel="Variable" valueLabel="Starting value" />
        </div>
      </Card>

      <Card title="Behavior">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Undo protects the first N entries" help="Counts the Start press. 2 = scouters can't undo Start (or a pre-match pick).">
            <NumberInput value={s.minQueueLength} onChange={(n) => update((p) => (p.scouting.minQueueLength = Math.max(0, n ?? 0)))} />
          </Field>
          <Field label="Position lock (ms)" help="Re-use the last field tap for this long instead of asking again. 0 = always ask.">
            <NumberInput value={s.positionLockMs} onChange={(n) => update((p) => (p.scouting.positionLockMs = Math.max(0, n ?? 0)))} />
          </Field>
          <Field label="Field map" help="Choose or add maps in the Field map tab.">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex items-center gap-3 rounded-lg border border-border p-2">
              <img src={s.field.image || "/img/field.svg"} alt="" className="h-12 w-20 rounded bg-black object-contain" />
              <span className="min-w-0 truncate font-mono text-xs text-muted">{s.field.image}</span>
            </div>
          </Field>
          <Field label="Alliance-zone buttons" help="These two swap with field orientation, and are recorded relative to the scouted robot's alliance.">
            <div className="grid grid-cols-2 gap-1">
              {[0, 1].map((k) => (
                <Select
                  key={k}
                  value={s.field.zoneButtons?.[k] ?? ""}
                  onChange={(e) =>
                    update((p) => {
                      const z = [...(p.scouting.field.zoneButtons ?? ["", ""])] as [string, string];
                      z[k] = e.target.value;
                      p.scouting.field.zoneButtons = z[0] || z[1] ? z : null;
                    })
                  }
                >
                  <option value="">{k === 0 ? "Own zone…" : "Opponent zone…"}</option>
                  {ids.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </Select>
              ))}
            </div>
          </Field>
          <Switch checked={s.allowFastClock} onChange={(v) => update((p) => (p.scouting.allowFastClock = v))} label="Allow 2× clock" help="For re-scouting from video at double speed." />
        </div>
      </Card>
    </div>
  );
}
