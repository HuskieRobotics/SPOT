"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Field, Input, Modal, Select, Spinner, Tabs, Textarea, api, cx, useConfirm, useToast } from "@/components/ui";
import { AdminGate, AdminLayout, type AdminSection } from "@/components/admin/AdminShell";
import type { CodebaseMapFile, FieldMapDto, Project, TeamMatchPerformance } from "@/lib/types";
import { runPipeline, type TbaData } from "@/lib/analysis/pipeline";
import { listPaths } from "@/lib/analysis/path";
import { allActionIds } from "@/lib/scouting/ids";
import { synthesizeEvent } from "@/lib/scouting/synthetic";
import { validateProject, type Issue } from "@/lib/project/validate";
import { FieldMapsCtx, SuggestionsCtx, type Suggestions } from "./fields";
import { FieldMapEditor } from "./FieldMapEditor";
import { LayoutEditor } from "./LayoutEditor";
import { TimingEditor } from "./TimingEditor";
import { ScoringEditor } from "./ScoringEditor";
import { PipelineEditor } from "./PipelineEditor";
import { DashboardEditor } from "./DashboardEditor";
import { AnalysisEditor } from "./AnalysisEditor";
import { JsonTab } from "./JsonTab";
import { PreviewPanel } from "./PreviewPanel";

type Tab = "layout" | "timing" | "fieldmap" | "scoring" | "pipeline" | "dashboard" | "analysis" | "json";
const TAB_AREA: Partial<Record<Tab, Issue["area"]>> = { layout: "layout", timing: "timing", scoring: "scoring", pipeline: "pipeline", dashboard: "dashboard" };

export function ProjectBuilder({ id }: { id: string }) {
  return (
    <AdminGate>
      <Builder id={id} />
    </AdminGate>
  );
}

function Builder({ id }: { id: string }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<Project | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [activeId, setActiveId] = useState("");
  const [tab, setTab] = useState<Tab>("layout");
  const [layer, setLayer] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const lastPush = useRef(0);

  // Saved field maps (shared library).
  const [fieldMaps, setFieldMaps] = useState<FieldMapDto[]>([]);
  const [mapFiles, setMapFiles] = useState<CodebaseMapFile[]>([]);
  const reloadMaps = useCallback(async () => {
    const r = await api<{ maps: FieldMapDto[]; files: CodebaseMapFile[] }>("/api/field-maps");
    setFieldMaps(r.maps);
    setMapFiles(r.files);
  }, []);
  useEffect(() => {
    reloadMaps().catch(() => {});
  }, [reloadMaps]);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    Promise.all([api<Project>(`/api/projects/${id}`), api<{ activeProjectId: string }>("/api/projects")])
      .then(([p, list]) => {
        setDraft(p);
        setSavedJson(JSON.stringify(p));
        setActiveId(list.activeProjectId);
      })
      .catch((e) => toast(e.message, "danger"));
  }, [id, toast]);

  const update = useCallback((fn: (p: Project) => void) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const now = Date.now();
      // Typing coalesces into one undo step.
      if (now - lastPush.current > 700) {
        past.current.push(JSON.stringify(cur));
        if (past.current.length > 100) past.current.shift();
      }
      lastPush.current = now;
      future.current = [];
      const next = structuredClone(cur);
      fn(next);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setDraft((cur) => {
      if (cur) future.current.push(JSON.stringify(cur));
      return JSON.parse(prev);
    });
    lastPush.current = 0;
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setDraft((cur) => {
      if (cur) past.current.push(JSON.stringify(cur));
      return JSON.parse(next);
    });
    lastPush.current = 0;
  }, []);

  const dirty = !!draft && JSON.stringify(draft) !== savedJson;

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const p = await api<Project>(`/api/projects/${id}`, { method: "PUT", json: draft });
      setDraft(p);
      setSavedJson(JSON.stringify(p));
      toast(id === activeId ? "Saved — scouters get it next time their app loads" : "Saved", "success");
    } catch (e) {
      const err = e as Error & { status?: number };
      toast(err.message, "danger");
    } finally {
      setSaving(false);
    }
  }, [draft, id, activeId, toast]);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (mod && e.key.toLowerCase() === "z" && !(e.target as HTMLElement)?.closest("input,textarea")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", keys);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("beforeunload", leave);
    };
  }, [save, undo, redo, dirty]);

  // ---------------------------------------------------------------- test data + pipeline run
  const [source, setSource] = useState<"sample" | "real">("sample");
  const [real, setReal] = useState<{ tmps: TeamMatchPerformance[]; tba: TbaData; event: string } | null>(null);
  const [loadingReal, setLoadingReal] = useState(false);
  useEffect(() => {
    if (source !== "real" || real) return;
    setLoadingReal(true);
    api(`/api/analysis/data?project=${id}`)
      .then((d) => setReal({ tmps: d.tmps, tba: d.tba, event: d.events.find((e: { _id: string }) => e._id === d.eventId)?.code ?? "" }))
      .catch((e) => toast(e.message, "danger"))
      .finally(() => setLoadingReal(false));
  }, [source, real, id, toast]);

  const deferred = useDeferredValue(draft);
  const scoutingJson = deferred ? JSON.stringify(deferred.scouting) : "";
  const sample = useMemo(() => {
    if (!deferred) return null;
    try {
      return synthesizeEvent(deferred.scouting, 12, 12);
    } catch {
      return null;
    }
  }, [scoutingJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useMemo(() => {
    if (!deferred) return null;
    const tmps = source === "real" ? real?.tmps : sample?.tmps;
    if (!tmps) return null;
    try {
      return runPipeline(deferred, tmps, { tba: source === "real" ? real?.tba : null });
    } catch {
      return null;
    }
  }, [deferred, source, real, sample]);

  const suggestions: Suggestions = useMemo(() => {
    if (!deferred) return { actionIds: [], tmpPaths: [], teamPaths: [] };
    const ids = new Set(allActionIds(deferred.scouting));
    for (const t of (source === "real" ? real?.tmps : sample?.tmps) ?? []) for (const a of t.actionQueue) ids.add(a.id);
    const tmpPaths = new Set<string>();
    const teamPaths = new Set<string>();
    if (run) {
      for (const t of run.dataset.tmps.slice(0, 20)) {
        const { actionQueue, _id, ...rest } = t as TeamMatchPerformance & { _id?: string };
        for (const p of listPaths(rest).keys()) tmpPaths.add(p);
        tmpPaths.add("actionQueue");
      }
      for (const t of Object.values(run.dataset.teams).slice(0, 10)) for (const p of listPaths(t).keys()) teamPaths.add(p);
      // Also offer object paths (e.g. "counts", "scores") for steps that take a whole object.
      for (const p of [...tmpPaths]) p.split(".").forEach((_, i, a) => i > 0 && tmpPaths.add(a.slice(0, i).join(".")));
      for (const p of [...teamPaths]) p.split(".").forEach((_, i, a) => i > 0 && teamPaths.add(a.slice(0, i).join(".")));
    }
    return { actionIds: [...ids], tmpPaths: [...tmpPaths].sort(), teamPaths: [...teamPaths].sort() };
  }, [deferred, run, source, real, sample]);

  const issues = useMemo(() => (deferred ? validateProject(deferred) : []), [deferred]);

  if (!draft)
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="text-muted" />
      </div>
    );

  const count = (area?: Issue["area"]) => issues.filter((i) => i.area === area).length;
  const errs = issues.filter((i) => i.level === "error").length;
  const tabs: { value: Tab; label: string }[] = [
    { value: "layout", label: "Layout" },
    { value: "timing", label: "Timing" },
    { value: "fieldmap", label: "Field map" },
    { value: "scoring", label: "Scoring" },
    { value: "pipeline", label: "Pipeline" },
    { value: "dashboard", label: "Dashboard" },
    { value: "analysis", label: "Analysis settings" },
    { value: "json", label: "JSON" },
  ];

  const goSection = async (s: AdminSection) => {
    if (dirty && !(await confirm("Leave without saving?", { danger: true, confirmLabel: "Leave", body: "Your unsaved changes will be lost." }))) return;
    location.href = `/admin#${s}`;
  };

  return (
    <SuggestionsCtx.Provider value={suggestions}>
      <FieldMapsCtx.Provider value={fieldMaps}>
      {dialog}
      <AdminLayout
        section={null}
        onSection={goSection}
        title={
          <span className="flex items-center gap-2">
            <button type="button" className="truncate hover:underline" onClick={() => setInfoOpen(true)} title="Edit name and description">
              {draft.name}
            </button>
            {id === activeId ? <Badge tone="accent">Active</Badge> : null}
            {dirty && <Badge tone="warning">Unsaved</Badge>}
          </span>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)">
              ↶
            </Button>
            <Button size="sm" variant="ghost" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)">
              ↷
            </Button>
            <Button size="sm" variant={issues.length ? (errs ? "danger" : "subtle") : "ghost"} onClick={() => setIssuesOpen(true)}>
              {issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""}` : "No issues"}
            </Button>
            <Button size="sm" onClick={() => setPreview(true)}>
              ▶ Preview
            </Button>
            {id !== activeId && (
              <Button
                size="sm"
                onClick={async () => {
                  if (dirty) await save();
                  await api("/api/admin/settings", { method: "PUT", json: { activeProjectId: id } });
                  setActiveId(id);
                  toast("Project activated", "success");
                }}
              >
                Activate
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={save} disabled={saving || !dirty}>
              {saving ? <Spinner /> : "Save"}
            </Button>
          </div>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={tabs.map((t) => ({ ...t, badge: count(TAB_AREA[t.value]) ? <Badge tone={issues.some((i) => i.area === TAB_AREA[t.value] && i.level === "error") ? "danger" : "warning"}>{count(TAB_AREA[t.value])}</Badge> : undefined }))}
          />
          {(tab === "pipeline" || tab === "dashboard" || tab === "scoring") && (
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-muted">Test data:</span>
              <Select value={source} onChange={(e) => setSource(e.target.value as "sample" | "real")} className="h-8 w-auto">
                <option value="sample">Sample matches (generated from your layout)</option>
                <option value="real">Real matches{real ? ` · ${real.event} (${real.tmps.length})` : ""}</option>
              </Select>
              {loadingReal && <Spinner />}
              {source === "real" && real && real.tmps.length === 0 && <Badge tone="warning">No real matches yet</Badge>}
            </div>
          )}
        </div>

        <div className={cx(tab !== "layout" && "hidden")}>
          <LayoutEditor project={draft} update={update} layer={layer} setLayer={setLayer} selected={selected} setSelected={setSelected} />
        </div>
        {tab === "timing" && <TimingEditor project={draft} update={update} />}
        {tab === "fieldmap" && <FieldMapEditor project={draft} update={update} maps={fieldMaps} files={mapFiles} reload={reloadMaps} />}
        {tab === "scoring" && <ScoringEditor project={draft} update={update} />}
        {tab === "pipeline" && <PipelineEditor project={draft} update={update} run={run} />}
        {tab === "dashboard" && <DashboardEditor project={draft} update={update} run={run} />}
        {tab === "analysis" && <AnalysisEditor project={draft} update={update} />}
        {tab === "json" && <JsonTab key={draft.revision} project={draft} update={update} />}
      </AdminLayout>

      {preview && <PreviewPanel cfg={draft.scouting} onClose={() => setPreview(false)} />}

      <Modal open={issuesOpen} onClose={() => setIssuesOpen(false)} title="Checks" wide>
        {issues.length === 0 ? (
          <p className="text-sm text-muted">Everything looks good.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {issues.map((i, k) => (
              <li key={k}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    setTab(i.area as Tab);
                    if (i.ref?.layer !== undefined) setLayer(i.ref.layer);
                    if (i.ref?.uid) setSelected(i.ref.uid);
                    setIssuesOpen(false);
                  }}
                >
                  <Badge tone={i.level === "error" ? "danger" : "warning"}>{i.level}</Badge>
                  <span className="text-xs uppercase text-muted">{i.area}</span>
                  <span className="flex-1">{i.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Project details">
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => update((p) => (p.name = e.target.value))} />
          </Field>
          <Field label="Season">
            <Input value={draft.season} onChange={(e) => update((p) => (p.season = e.target.value))} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={draft.description} onChange={(e) => update((p) => (p.description = e.target.value))} className="font-sans text-sm" />
          </Field>
        </div>
      </Modal>
      </FieldMapsCtx.Provider>
    </SuggestionsCtx.Provider>
  );
}
