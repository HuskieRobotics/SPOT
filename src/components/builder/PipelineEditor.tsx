"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Switch, cx } from "@/components/ui";
import { TRANSFORMERS, getTransformer, type TransformerDef } from "@/lib/analysis/transformers";
import { getPath } from "@/lib/analysis/path";
import type { PipelineRun } from "@/lib/analysis/pipeline";
import type { PipelineStep, Project } from "@/lib/types";
import { JsonInput, OptionEditor, PathInput, setOrDelete } from "./fields";

type Update = (fn: (p: Project) => void) => void;

export function PipelineEditor({ project, update, run }: { project: Project; update: Update; run: PipelineRun | null }) {
  const [sel, setSel] = useState<number | null>(project.pipeline.length ? 0 : null);
  const [adding, setAdding] = useState(false);
  const steps = project.pipeline;
  const step = sel !== null ? steps[sel] : null;
  const status = (i: number) => run?.steps.find((s) => s.index === i);
  const setStep = (fn: (s: PipelineStep) => void) => update((p) => sel !== null && fn(p.pipeline[sel]));
  const move = (i: number, d: number) => {
    update((p) => {
      const [x] = p.pipeline.splice(i, 1);
      p.pipeline.splice(i + d, 0, x);
    });
    setSel(i + d);
  };
  const errors = run?.steps.filter((s) => !s.ok).length ?? 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <Card
        title={`Steps (${steps.length})`}
        description="Run top to bottom. 'Per match' steps add values to each scouted match; 'Per team' steps combine a team's matches."
        actions={
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            + Add step
          </Button>
        }
      >
        {errors > 0 && <div className="border-b border-border bg-danger-soft px-4 py-2 text-xs font-medium text-danger">{errors} step(s) failed on the current data.</div>}
        {steps.length === 0 ? (
          <Empty title="No steps yet">Add a step such as “Count actions” to get started.</Empty>
        ) : (
          <ol className="max-h-[70dvh] divide-y divide-border overflow-y-auto">
            {steps.map((s, i) => {
              const def = getTransformer(s.name);
              const st = status(i);
              return (
                <li key={i}>
                  <button type="button" onClick={() => setSel(i)} className={cx("flex w-full items-center gap-2 px-3 py-2 text-left transition", sel === i ? "bg-accent-soft" : "hover:bg-surface-2", s.disabled && "opacity-50")}>
                    <span className="w-6 text-right text-xs text-muted">{i + 1}</span>
                    <Badge tone={s.type === "tmp" ? "accent" : "success"}>{s.type === "tmp" ? "match" : "team"}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{def?.label ?? s.name}</span>
                      <span className="block truncate font-mono text-[11px] text-muted">→ {s.outputPath || "—"}</span>
                    </span>
                    {st && !st.ok && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" title={st.error} />}
                    {st?.ok && <span className="h-2 w-2 shrink-0 rounded-full bg-success" />}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {step && sel !== null ? (
        <StepEditor
          key={sel}
          index={sel}
          step={step}
          setStep={setStep}
          run={run}
          onMove={(d) => move(sel, d)}
          canUp={sel > 0}
          canDown={sel < steps.length - 1}
          onDelete={() => {
            update((p) => p.pipeline.splice(sel, 1));
            setSel(steps.length > 1 ? Math.max(0, sel - 1) : null);
          }}
          onDuplicate={() => {
            update((p) => p.pipeline.splice(sel + 1, 0, structuredClone(step)));
            setSel(sel + 1);
          }}
        />
      ) : (
        <Card>
          <Empty title="Select a step to edit it" />
        </Card>
      )}

      <AddStep
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(def, type) => {
          const at = sel !== null ? sel + 1 : steps.length;
          update((p) =>
            p.pipeline.splice(at, 0, {
              type,
              name: def.name,
              outputPath: def.noOutput ? "" : type === "tmp" ? `${def.name}Result` : `${def.name}Result`,
              options: Object.fromEntries((def.types[type]?.options ?? []).filter((o) => o.default !== undefined).map((o) => [o.key, o.default])),
            }),
          );
          setSel(at);
          setAdding(false);
        }}
      />
    </div>
  );
}

function StepEditor({
  index,
  step,
  setStep,
  run,
  onMove,
  canUp,
  canDown,
  onDelete,
  onDuplicate,
}: {
  index: number;
  step: PipelineStep;
  setStep: (fn: (s: PipelineStep) => void) => void;
  run: PipelineRun | null;
  onMove: (d: number) => void;
  canUp: boolean;
  canDown: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const def = getTransformer(step.name);
  const impl = def?.types[step.type];
  const [raw, setRaw] = useState(false);
  const st = run?.steps.find((s) => s.index === index);

  const sample = useMemo(() => {
    if (!run || !step.outputPath || def?.noOutput) return [];
    if (step.type === "tmp")
      return run.dataset.tmps.slice(0, 4).map((t) => ({ who: `M${t.matchNumber} · ${t.robotNumber}`, v: safeGet(t, step.outputPath) }));
    return Object.entries(run.dataset.teams)
      .slice(0, 5)
      .map(([n, t]) => ({ who: n, v: safeGet(t, step.outputPath) }));
  }, [run, step]);

  return (
    <Card
      title={`Step ${index + 1}: ${def?.label ?? step.name}`}
      description={def?.description}
      actions={
        <>
          <Button size="sm" variant="ghost" disabled={!canUp} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" disabled={!canDown} onClick={() => onMove(1)}>
            ↓
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete}>
            Delete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Transformer">
            <Select
              value={def?.name ?? step.name}
              onChange={(e) =>
                setStep((s) => {
                  s.name = e.target.value;
                  const d = getTransformer(s.name)!;
                  if (!d.types[s.type]) s.type = Object.keys(d.types)[0] as PipelineStep["type"];
                })
              }
            >
              {TRANSFORMERS.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label}
                </option>
              ))}
              {!def && <option value={step.name}>{step.name} (unknown)</option>}
            </Select>
          </Field>
          <Field label="Runs">
            <Select value={step.type} onChange={(e) => setStep((s) => (s.type = e.target.value as PipelineStep["type"]))}>
              {def?.types.tmp && <option value="tmp">Per match</option>}
              {def?.types.team && <option value="team">Per team</option>}
            </Select>
          </Field>
          {!def?.noOutput && (
            <Field label={`Save result to (${step.type === "tmp" ? "match" : "team"} path)`}>
              <PathInput value={step.outputPath} onChange={(v) => setStep((s) => (s.outputPath = v))} scope={step.type} placeholder="e.g. scores.auto" />
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Options</h4>
          <Button size="sm" variant="ghost" onClick={() => setRaw(!raw)}>
            {raw ? "Form" : "Edit as JSON"}
          </Button>
        </div>
        {raw || !impl ? (
          <JsonInput key={`raw${index}`} value={step.options ?? {}} onChange={(v) => setStep((s) => (s.options = (v as Record<string, unknown>) ?? {}))} rows={10} />
        ) : impl.options.length === 0 ? (
          <p className="text-sm text-muted">No options.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {impl.options.map((o) => (
              <OptionEditor key={o.key} spec={o} value={step.options?.[o.key]} defaultScope={step.type} onChange={(v) => setStep((s) => (s.options = setOrDelete(s.options ?? {}, o.key, v)))} />
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Note (for your team)">
            <Input value={step.comment ?? ""} onChange={(e) => setStep((s) => (e.target.value ? (s.comment = e.target.value) : delete s.comment))} />
          </Field>
          <div className="pt-5">
            <Switch checked={!step.disabled} onChange={(v) => setStep((s) => (v ? delete s.disabled : (s.disabled = true)))} label="Enabled" />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-2/60 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">Result on current data</span>
            {st && (st.ok ? <Badge tone="success">OK · {st.ms.toFixed(1)} ms</Badge> : <Badge tone="danger">Failed</Badge>)}
          </div>
          {st && !st.ok && <p className="mb-2 font-mono text-xs text-danger">{st.error}</p>}
          {!run ? (
            <p className="text-xs text-muted">Load data (top right) to see results.</p>
          ) : def?.noOutput ? (
            <p className="text-xs text-muted">{run.dataset.tmps.length} matches kept.</p>
          ) : (
            <ul className="flex flex-col gap-1 font-mono text-[11px]">
              {sample.map((x) => (
                <li key={x.who} className="flex gap-2">
                  <span className="w-24 shrink-0 text-muted">{x.who}</span>
                  <span className="truncate">{preview(x.v)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

const safeGet = (o: unknown, p: string) => {
  try {
    return getPath(o, p, undefined);
  } catch {
    return undefined;
  }
};
function preview(v: unknown): string {
  if (v === undefined) return "— (missing)";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  const s = JSON.stringify(v);
  return s.length > 220 ? s.slice(0, 220) + "…" : s;
}

function AddStep({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (d: TransformerDef, type: PipelineStep["type"]) => void }) {
  const cats = [...new Set(TRANSFORMERS.map((t) => t.category))];
  return (
    <Modal open={open} onClose={onClose} title="Add a pipeline step" wide>
      <div className="flex flex-col gap-5">
        {cats.map((c) => (
          <div key={c}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{c}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRANSFORMERS.filter((t) => t.category === c).map((t) => (
                <div key={t.name} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-semibold">{t.label}</div>
                  <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                  <div className="mt-2 flex gap-1.5">
                    {t.types.tmp && (
                      <Button size="sm" variant="subtle" onClick={() => onAdd(t, "tmp")}>
                        Per match
                      </Button>
                    )}
                    {t.types.team && (
                      <Button size="sm" variant="subtle" onClick={() => onAdd(t, "team")}>
                        Per team
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
