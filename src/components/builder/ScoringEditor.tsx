"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, NumberInput, Switch, Textarea, useToast } from "@/components/ui";
import type { Project } from "@/lib/types";
import { allActionIds, recordedButtonIds } from "@/lib/scouting/ids";
import { resolvePointsKey } from "@/lib/scoring";

type Update = (fn: (p: Project) => void) => void;

export function ScoringEditor({ project, update }: { project: Project; update: Update }) {
  const sc = project.scoring;
  const s = project.scouting;
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState("");
  const [custom, setCustom] = useState("");

  const base = useMemo(() => recordedButtonIds(s), [s]);
  const every = useMemo(() => allActionIds(s), [s]);
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of s.layers) for (const b of l.buttons) if (!m.has(b.id)) m.set(b.id, b.label.split("\n")[0]);
    return m;
  }, [s]);

  const rows = useMemo(() => {
    const list = [...new Set([...base, ...Object.keys(sc.points), ...(showAll ? every : s.knownActionIds)])];
    return list.filter((id) => !filter || id.toLowerCase().includes(filter.toLowerCase()) || labelOf.get(id)?.toLowerCase().includes(filter.toLowerCase()));
  }, [base, every, sc.points, showAll, filter, s.knownActionIds, labelOf]);

  const setPts = (id: string, n: number | null) =>
    update((p) => {
      if (n === null) delete p.scoring.points[id];
      else p.scoring.points[id] = n;
    });

  const addPipelineSteps = () => {
    update((p) => {
      const has = (name: string, out: string) => p.pipeline.some((x) => x.name === name && x.outputPath === out);
      const firstTeam = p.pipeline.findIndex((x) => x.type === "team");
      const at = firstTeam < 0 ? p.pipeline.length : firstTeam;
      if (!has("points", "scores.total")) p.pipeline.splice(at, 0, { type: "tmp", name: "points", outputPath: "scores.total", options: {}, comment: "Points from the scoring map" });
      if (!p.pipeline.some((x) => x.type === "team" && x.outputPath === "averageScores")) p.pipeline.push({ type: "team", name: "average", outputPath: "averageScores", options: { path: "scores" } });
      if (!has("standardDeviation", "standardDeviation")) p.pipeline.push({ type: "team", name: "standardDeviation", outputPath: "standardDeviation", options: { path: "scores.total" } });
    });
    toast("Added scores.total, averageScores and standardDeviation to the pipeline", "success");
  };

  const total = Object.values(sc.points).filter((v) => v !== 0).length;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card
        title="Points per action"
        description="How many official points each button is worth. Used to estimate alliance scores for scouter accuracy, and by the 'Points from scoring map' pipeline step."
        actions={<Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-40" />}
      >
        <div className="max-h-[65dvh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Action id</th>
                <th className="px-4 py-2 font-medium">Button</th>
                <th className="w-32 px-4 py-2 font-medium">Points</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((id) => {
                const own = sc.points[id];
                const via = own === undefined ? resolvePointsKey(id, sc.points, sc.suffixMatch) : null;
                return (
                  <tr key={id}>
                    <td className="px-4 py-1.5 font-mono text-xs">{id}</td>
                    <td className="px-4 py-1.5 text-xs text-muted">{labelOf.get(id) ?? (s.knownActionIds.includes(id) ? "known id" : base.includes(id) ? "" : "derived")}</td>
                    <td className="px-4 py-1">
                      <NumberInput value={own ?? null} onChange={(n) => setPts(id, n)} placeholder={via ? String(sc.points[via]) : "0"} className="h-8" />
                    </td>
                    <td className="px-4 py-1.5 text-[11px] text-muted">{via && <span>= {sc.points[via]} via “{via}”</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border p-3">
          <Switch checked={showAll} onChange={setShowAll} label="Show per-phase ids" help="Set different points for the same button in different phases (e.g. autoScore vs teleopScore)." />
          <div className="ml-auto flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value.trim())} placeholder="Other id (e.g. TBA)" className="h-8 w-48 font-mono text-xs" />
            <Button
              size="sm"
              disabled={!custom}
              onClick={() => {
                setPts(custom, 0);
                setCustom("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <Card title="Matching">
          <div className="flex flex-col gap-4 p-4">
            <Switch
              checked={sc.suffixMatch}
              onChange={(v) => update((p) => (p.scoring.suffixMatch = v))}
              label="Match by ending"
              help='"Score" also counts "autoScore" and "activeShift2Score". An exact id always wins, then the longest matching ending.'
            />
            <Field label="Scoring version" help="Each match saves the points used, so changing points later doesn't silently change old accuracy numbers. Bump the version when you change values mid-event.">
              <div className="flex gap-2">
                <NumberInput value={sc.version} onChange={(n) => n && update((p) => (p.scoring.version = n))} className="w-24" />
                <Button onClick={() => update((p) => (p.scoring.version += 1))}>Bump</Button>
              </div>
            </Field>
            <Field label="Notes">
              <Textarea rows={3} value={sc.notes ?? ""} onChange={(e) => update((p) => (p.scoring.notes = e.target.value))} className="font-sans text-sm" />
            </Field>
          </div>
        </Card>
        <Card title="Use points in analysis">
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p className="text-muted">
              Adds <code className="rounded bg-surface-2 px-1 text-xs">scores.total</code> (points per match), team averages and standard deviation — what match
              simulation and the pick list need.
            </p>
            <Button variant="subtle" onClick={addPipelineSteps}>
              Add point steps to pipeline
            </Button>
            <div className="text-xs text-muted">
              <Badge tone={total ? "success" : "warning"}>{total}</Badge> actions currently worth points.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
