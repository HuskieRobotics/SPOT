"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Tabs, api, cx, useConfirm, useToast } from "@/components/ui";
import type { Project } from "@/lib/types";

interface Row {
  _id: string;
  name: string;
  season: string;
  description: string;
  revision: number;
  updatedAt: string;
}
interface Preset {
  id: string;
  name: string;
  season: string;
  description: string;
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const readFile = (f: File) => f.text().then((t) => JSON.parse(t));

/** A project = scouting layout + timing + points + pipeline + dashboard. One is active at a time. */
export function ProjectsPanel() {
  const [data, setData] = useState<{ projects: Row[]; presets: Preset[]; activeProjectId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const load = useCallback(() => api("/api/projects").then(setData), []);
  useEffect(() => {
    load();
  }, [load]);

  const activate = async (p: Row) => {
    if (!(await confirm(`Use "${p.name}" for scouting and analysis?`, { body: "Scouters get the new layout the next time their app loads. Analysis switches to this project's pipeline and dashboard." }))) return;
    await api("/api/admin/settings", { method: "PUT", json: { activeProjectId: p._id } });
    toast(`"${p.name}" is now active`, "success");
    load();
  };
  const duplicate = async (p: Row) => {
    const full = await api<Project>(`/api/projects/${p._id}`);
    await api("/api/projects", { method: "POST", json: { project: { ...full, name: `${full.name} (copy)` } } });
    toast("Project duplicated", "success");
    load();
  };
  const exportProject = async (p: Row) => {
    const { _id, createdAt, updatedAt, revision, ...rest } = await api<Project>(`/api/projects/${p._id}`);
    downloadJson(`${p.name.replace(/[^\w-]+/g, "_")}.spot.json`, { spotProject: 6, ...rest });
  };
  const remove = async (p: Row) => {
    if (!(await confirm(`Delete "${p.name}"?`, { danger: true, body: "Scouted match data is kept. The layout, points, pipeline and dashboard of this project are deleted.", confirmLabel: "Delete" }))) return;
    try {
      await api(`/api/projects/${p._id}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  return (
    <div className="flex flex-col gap-5">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          A project holds everything about a season: the scouting buttons and layers, the match timer, how many points each button is worth, the analysis
          pipeline and the dashboard. Switch the active project and both scouting and analysis follow it.
        </p>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + New project
        </Button>
      </div>
      {data.projects.length === 0 ? (
        <Card>
          <Empty title="No projects yet">Create one from a past season&apos;s template or start blank.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.projects.map((p) => {
            const active = p._id === data.activeProjectId;
            return (
              <Card key={p._id} className={cx(active && "ring-2 ring-accent")}>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{p.name}</h3>
                      <p className="text-xs text-muted">
                        {p.season && `${p.season} · `}revision {p.revision} · saved {new Date(p.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    {active && <Badge tone="accent">Active</Badge>}
                  </div>
                  {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    <a href={`/admin/projects/${p._id}`} className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-contrast hover:brightness-110">
                      Open builder
                    </a>
                    {!active && (
                      <Button size="sm" variant="subtle" onClick={() => activate(p)}>
                        Activate
                      </Button>
                    )}
                    <Button size="sm" onClick={() => duplicate(p)}>
                      Duplicate
                    </Button>
                    <Button size="sm" onClick={() => exportProject(p)}>
                      Export
                    </Button>
                    {!active && (
                      <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <CreateProject open={creating} presets={data.presets} onClose={() => setCreating(false)} onCreated={(id) => (location.href = `/admin/projects/${id}`)} />
    </div>
  );
}

function CreateProject({ open, presets, onClose, onCreated }: { open: boolean; presets: Preset[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [tab, setTab] = useState<"template" | "import">("template");
  const [preset, setPreset] = useState("blank");
  const [name, setName] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const create = async () => {
    setBusy(true);
    try {
      let body: Record<string, unknown>;
      if (tab === "template") body = { preset, ...(name ? { name } : {}) };
      else if (files.project) {
        const p = await readFile(files.project);
        body = { project: p, ...(name ? { name } : {}) };
      } else {
        if (!files.matchScouting) throw new Error("Choose a match-scouting.json file (or a SPOT project export).");
        body = {
          name: name || files.matchScouting.name.replace(/\.json$/, ""),
          legacy: {
            matchScouting: await readFile(files.matchScouting),
            pipeline: files.pipeline ? await readFile(files.pipeline) : [],
            modules: files.modules ? await readFile(files.modules) : [],
            scoring: files.scoring ? await readFile(files.scoring) : null,
          },
        };
      }
      const p = await api<Project>("/api/projects", { method: "POST", json: body });
      toast("Project created", "success");
      onCreated(p._id);
    } catch (e) {
      toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const fileInput = (key: string, label: string, help?: string) => (
    <Field label={label} help={help}>
      <input type="file" accept=".json,application/json" className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text" onChange={(e) => setFiles({ ...files, [key]: e.target.files?.[0] ?? null })} />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="New project"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            Create project
          </Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "template", label: "Start from a template" },
          { value: "import", label: "Import files" },
        ]}
      />
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Project name (optional)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2027 Kickoff draft" />
        </Field>
        {tab === "template" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cx("rounded-xl border p-3 text-left transition", preset === p.id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-1 text-xs text-muted">{p.description}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {fileInput("project", "SPOT v6 project export (.spot.json)", "Use this OR the legacy files below.")}
            <div className="rounded-xl border border-border p-3">
              <div className="mb-3 text-xs font-semibold text-muted">Legacy SPOT (2022–2026) config files</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fileInput("matchScouting", "match-scouting.json (required)")}
                {fileInput("pipeline", "analysis-pipeline.json")}
                {fileInput("modules", "analysis-modules.json")}
                {fileInput("scoring", "scouter-accuracy-*.json (points)")}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
