"use client";
import { useState } from "react";
import { Button, Card, Field, Switch, api, useToast } from "@/components/ui";
import type { FilterBand, Project } from "@/lib/types";
import { ListEditor, PathsInput, TagInput } from "./fields";

type Update = (fn: (p: Project) => void) => void;

export function AnalysisEditor({ project, update }: { project: Project; update: Update }) {
  const a = project.analysis;
  const toast = useToast();
  const [coprs, setCoprs] = useState<string[]>([]);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Dashboard features">
        <div className="flex flex-col gap-4 p-4">
          <Switch checked={a.features.compare} onChange={(v) => update((p) => (p.analysis.features.compare = v))} label="Compare teams" help="Scatter plot of every team on two chosen values." />
          <Switch checked={a.features.filter} onChange={(v) => update((p) => (p.analysis.features.filter = v))} label="Filter teams" help="Find teams by value and rating/OPR bands." />
          <Switch checked={a.features.simulateMatch} onChange={(v) => update((p) => (p.analysis.features.simulateMatch = v))} label="Match simulation" help="Pick six teams (or a scheduled match) and see the match-simulation modules per alliance." />
          <Switch checked={a.features.pickList} onChange={(v) => update((p) => (p.analysis.features.pickList = v))} label="Pick list" help="Ranks teams by average chance of beating every other team (needs averageScores.total and standardDeviation)." />
          <Field label="Values offered in Compare (empty = every averageScores and OPR value)">
            <PathsInput value={a.comparePaths} onChange={(v) => update((p) => (p.analysis.comparePaths = v))} scope="team" />
          </Field>
        </div>
      </Card>

      <Card title="The Blue Alliance data">
        <div className="flex flex-col gap-4 p-4">
          <Switch
            checked={a.tbaBreakdown.enabled}
            onChange={(v) => update((p) => (p.analysis.tbaBreakdown.enabled = v))}
            label="Add official score-breakdown values as actions"
            help='For each robot, TBA breakdown keys starting with a prefix and ending in its station number become actions, e.g. "endGameTowerRobot_Level2". Counts them like any button.'
          />
          {a.tbaBreakdown.enabled && (
            <Field label="Breakdown key prefixes">
              <TagInput value={a.tbaBreakdown.prefixes} onChange={(v) => update((p) => (p.analysis.tbaBreakdown.prefixes = v))} />
            </Field>
          )}
          <Field label="Component OPRs to attach (as opr.<name>)" help="Pick from what TBA offers for the event, or type names.">
            <TagInput value={a.oprKeys} onChange={(v) => update((p) => (p.analysis.oprKeys = v))} suggestions={coprs} mono={false} />
          </Field>
          <Button
            size="sm"
            className="self-start"
            onClick={async () => {
              try {
                const r = await api<{ keys: string[]; eventKey: string }>("/api/admin/coprs");
                setCoprs(r.keys);
                toast(r.keys.length ? `${r.keys.length} OPR names from ${r.eventKey} — start typing to pick` : `TBA has no OPRs for ${r.eventKey || "the event"} yet`);
              } catch (e) {
                toast((e as Error).message, "danger");
              }
            }}
          >
            Load OPR names from TBA
          </Button>
        </div>
      </Card>

      <Card title="Filter bands" description="Bands offered in Filter Teams. A team matches a band when one of its values falls inside it." className="xl:col-span-2">
        <div className="p-4">
          <ListEditor
            value={a.filterBands as unknown as Record<string, unknown>[]}
            onChange={(v) => update((p) => (p.analysis.filterBands = v as unknown as FilterBand[]))}
            newItem={() => ({ label: "New band", source: "average", min: 0, max: null })}
            itemTitle={(x) => String(x.label ?? "Band")}
            fields={[
              { key: "label", label: "Label", kind: "string" },
              {
                key: "source",
                label: "Checks",
                kind: "select",
                choices: [
                  { value: "average", label: "Average scores" },
                  { value: "opr", label: "OPRs" },
                  { value: "any", label: "Both" },
                ],
              },
              { key: "min", label: "Minimum (empty = none)", kind: "number" },
              { key: "max", label: "Maximum (empty = none)", kind: "number" },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
