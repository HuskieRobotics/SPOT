"use client";
import { useState } from "react";
import { Button, Card, Select, Textarea, useToast } from "@/components/ui";
import type { Project } from "@/lib/types";
import { convertLegacyScouting, upgradeStep } from "@/lib/project/legacy";
import { normalizeScouting } from "@/lib/project/normalize";
import { downloadJson } from "@/components/admin/ProjectsPanel";

type Update = (fn: (p: Project) => void) => void;
type Part = "scouting" | "scoring" | "pipeline" | "modules" | "analysis";

/** Everything the builder edits is plain JSON; view, copy, paste or import any part here. */
export function JsonTab({ project, update }: { project: Project; update: Update }) {
  const [part, setPart] = useState<Part>("scouting");
  const [text, setText] = useState(() => JSON.stringify(project[part], null, 2));
  const [err, setErr] = useState("");
  const toast = useToast();

  const load = (p: Part) => {
    setPart(p);
    setText(JSON.stringify(project[p], null, 2));
    setErr("");
  };
  const apply = () => {
    try {
      let v = JSON.parse(text);
      if (part === "scouting") v = v.layout?.layers ? convertLegacyScouting(v) : normalizeScouting(v);
      if (part === "pipeline") {
        if (!Array.isArray(v)) throw new Error("The pipeline must be a list ([...]).");
        v = v.map(upgradeStep);
      }
      if (part === "modules" && !Array.isArray(v)) throw new Error("Modules must be a list ([...]).");
      if (part === "scoring" && v.actions && !v.points) v = { version: v.version ?? 1, points: v.actions, suffixMatch: true };
      update((p) => ((p as any)[part] = v));
      setText(JSON.stringify(v, null, 2));
      setErr("");
      toast("Applied — remember to Save", "success");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Card
      title="JSON"
      description="Paste a part from another project, or a legacy match-scouting.json / analysis-pipeline.json / analysis-modules.json / scouter-accuracy.json — it is converted automatically."
      actions={
        <>
          <Select value={part} onChange={(e) => load(e.target.value as Part)} className="h-8 w-48">
            <option value="scouting">Scouting layout & timing</option>
            <option value="scoring">Scoring (points)</option>
            <option value="pipeline">Analysis pipeline</option>
            <option value="modules">Dashboard modules</option>
            <option value="analysis">Analysis settings</option>
          </Select>
          <Button size="sm" onClick={() => load(part)}>
            Reload
          </Button>
          <Button size="sm" onClick={() => downloadJson(`${project.name}-${part}.json`, project[part])}>
            Download
          </Button>
          <Button size="sm" variant="primary" onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      {err && <div className="border-b border-border bg-danger-soft px-4 py-2 text-xs text-danger">{err}</div>}
      <Textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="h-[65dvh] rounded-none border-0" />
    </Card>
  );
}
