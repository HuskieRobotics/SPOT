"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Switch, cx } from "@/components/ui";
import { MODULES, getModuleDef } from "@/lib/analysis/moduleDefs";
import type { PipelineRun } from "@/lib/analysis/pipeline";
import type { ModuleConfig, Project } from "@/lib/types";
import { FieldEditor, JsonInput, setOrDelete } from "./fields";
import { ModuleRenderer } from "@/components/analysis/modules";

type Update = (fn: (p: Project) => void) => void;

export function DashboardEditor({ project, update, run }: { project: Project; update: Update; run: PipelineRun | null }) {
  const [sel, setSel] = useState<number | null>(project.modules.length ? 0 : null);
  const [adding, setAdding] = useState(false);
  const mods = project.modules;
  const m = sel !== null ? mods[sel] : null;
  const setMod = (fn: (m: ModuleConfig) => void) => update((p) => sel !== null && fn(p.modules[sel]));

  const groups: { title: string; filter: (m: ModuleConfig) => boolean }[] = [
    { title: "Team page · main column", filter: (x) => x.view === "team" && x.position !== "side" },
    { title: "Team page · side column", filter: (x) => x.view === "team" && x.position === "side" },
    { title: "Match simulation (per alliance)", filter: (x) => x.view === "match" },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Card
        title="Modules"
        description="What the analysis dashboard shows, top to bottom."
        actions={
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            + Add module
          </Button>
        }
      >
        <div className="max-h-[72dvh] overflow-y-auto">
          {groups.map((g) => {
            const items = mods.map((x, i) => ({ x, i })).filter(({ x }) => g.filter(x));
            return (
              <div key={g.title}>
                <div className="bg-surface-2/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</div>
                {items.length === 0 && <div className="px-4 py-2 text-xs text-muted">None</div>}
                {items.map(({ x, i }) => (
                  <button key={i} type="button" onClick={() => setSel(i)} className={cx("flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition", sel === i ? "bg-accent-soft" : "hover:bg-surface-2", x.disabled && "opacity-50")}>
                    <span className="min-w-0 flex-1 truncate">{x.name || "(untitled)"}</span>
                    <Badge>{getModuleDef(x.module)?.label ?? x.module}</Badge>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      {m && sel !== null ? (
        <ModuleEditor
          key={sel}
          fieldImage={project.scouting.field.image}
          m={m}
          setMod={setMod}
          run={run}
          canUp={sel > 0}
          canDown={sel < mods.length - 1}
          onMove={(d) => {
            update((p) => p.modules.splice(sel + d, 0, ...p.modules.splice(sel, 1)));
            setSel(sel + d);
          }}
          onDelete={() => {
            update((p) => p.modules.splice(sel, 1));
            setSel(mods.length > 1 ? Math.max(0, sel - 1) : null);
          }}
          onDuplicate={() => {
            update((p) => p.modules.splice(sel + 1, 0, { ...structuredClone(m), name: `${m.name} copy` }));
            setSel(sel + 1);
          }}
        />
      ) : (
        <Card>
          <Empty title="Select a module" />
        </Card>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a module" wide>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULES.map((d) => (
            <div key={d.name} className="rounded-lg border border-border p-3">
              <div className="text-sm font-semibold">{d.label}</div>
              <p className="mt-0.5 text-xs text-muted">{d.description}</p>
              <div className="mt-2 flex gap-1.5">
                {d.views.map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      update((p) => p.modules.push({ view: v, module: d.name, position: d.name === "Stats" && v === "team" ? "side" : "main", name: d.label, options: structuredClone(d.defaults) }));
                      setSel(mods.length);
                      setAdding(false);
                    }}
                  >
                    {v === "team" ? "Team page" : "Match simulation"}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function ModuleEditor({
  fieldImage,
  m,
  setMod,
  run,
  canUp,
  canDown,
  onMove,
  onDelete,
  onDuplicate,
}: {
  fieldImage?: string;
  m: ModuleConfig;
  setMod: (fn: (m: ModuleConfig) => void) => void;
  run: PipelineRun | null;
  canUp: boolean;
  canDown: boolean;
  onMove: (d: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const def = getModuleDef(m.module);
  const [raw, setRaw] = useState(false);
  const teams = useMemo(() => (run ? Object.keys(run.dataset.teams) : []), [run]);
  const [team, setTeam] = useState<string>("");
  const t = team && teams.includes(team) ? team : teams[0];
  const previewTeams = useMemo(() => {
    if (!t) return [];
    if (m.view === "team") return [t];
    const others = teams.filter((x) => x !== t);
    const own = [t, ...others.slice(0, 2)];
    return m.wholeMatch ? [...own, "|", ...others.slice(2, 5)] : own;
  }, [t, teams, m.view, m.wholeMatch]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title={m.name || "(untitled)"}
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
            <Field label="Title">
              <Input value={m.name} onChange={(e) => setMod((x) => (x.name = e.target.value))} />
            </Field>
            <Field label="Module">
              <Select value={m.module} onChange={(e) => setMod((x) => (x.module = e.target.value))}>
                {MODULES.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Page">
              <Select value={m.view} onChange={(e) => setMod((x) => (x.view = e.target.value as ModuleConfig["view"]))}>
                <option value="team">Team page</option>
                <option value="match">Match simulation</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-5">
            {m.view === "team" && (
              <Field label="Column">
                <Select value={m.position ?? "main"} onChange={(e) => setMod((x) => (x.position = e.target.value as ModuleConfig["position"]))} className="w-32">
                  <option value="main">Main</option>
                  <option value="side">Side</option>
                </Select>
              </Field>
            )}
            {m.view === "match" && <Switch checked={!!m.wholeMatch} onChange={(v) => setMod((x) => (v ? (x.wholeMatch = true) : delete x.wholeMatch))} label="Whole match" help="Gets both alliances (needed for win chance)." />}
            <Switch checked={!!m.separate} onChange={(v) => setMod((x) => (v ? (x.separate = true) : delete x.separate))} label="Show even without scouting data" />
            <Switch checked={!m.disabled} onChange={(v) => setMod((x) => (v ? delete x.disabled : (x.disabled = true)))} label="Visible" />
          </div>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Options</h4>
            <Button size="sm" variant="ghost" onClick={() => setRaw(!raw)}>
              {raw ? "Form" : "Edit as JSON"}
            </Button>
          </div>
          {raw || !def ? (
            <JsonInput value={m.options} onChange={(v) => setMod((x) => (x.options = (v as Record<string, unknown>) ?? {}))} rows={12} />
          ) : def.fields.length === 0 ? (
            <p className="text-sm text-muted">No options.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {def.fields.map((f) => (
                <FieldEditor key={f.key} spec={f} value={m.options[f.key]} onChange={(v) => setMod((x) => (x.options = setOrDelete(x.options ?? {}, f.key, v)))} />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Preview"
        description={run ? undefined : "Load data (top right) to preview."}
        actions={
          teams.length > 0 && (
            <Select value={t} onChange={(e) => setTeam(e.target.value)} className="h-8 w-32">
              {teams.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          )
        }
      >
        <div className="p-4">{run && t && <ModuleRenderer config={m} teams={previewTeams} dataset={run.dataset} fieldImage={fieldImage} />}</div>
      </Card>
    </div>
  );
}
