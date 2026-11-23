"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select, Switch, api, useToast } from "@/components/ui";
import type { EventDoc, Match, Settings } from "@/lib/types";

interface Data {
  settings: Settings;
  events: EventDoc[];
  server: { demo: boolean; hasTbaKey: boolean; authRequired: boolean; configFile: string | null; envVars: string[] };
}

export function SettingsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [newCode, setNewCode] = useState("");
  const toast = useToast();
  const load = () => api<Data>("/api/admin/settings").then(setData);
  useEffect(() => {
    load();
  }, []);

  const save = async (patch: Partial<Settings>, msg = "Saved") => {
    try {
      const r = await api<{ settings: Settings }>("/api/admin/settings", { method: "PUT", json: patch });
      setData((d) => d && { ...d, settings: r.settings });
      toast(msg, "success");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };

  const createEvent = async () => {
    try {
      const r = await api<{ events: EventDoc[] }>("/api/admin/events", { method: "POST", json: { code: newCode.trim(), activate: true } });
      setNewCode("");
      toast("Event created and activated", "success");
      setData((d) => d && { ...d, events: r.events });
      load();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  const s = data.settings;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Event" description="Scouters always record into the active event. Analysis can browse any event.">
        <div className="grid gap-4 p-4">
          <Field label="Active event">
            <Select
              value={s.activeEventId ?? ""}
              onChange={(e) => {
                const ev = data.events.find((x) => x._id === e.target.value);
                save({ activeEventId: e.target.value, ...(ev ? { tbaEventKey: ev.code.split("_")[0] } : {}) }, "Active event changed");
              }}
            >
              {data.events.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.code}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Create a new event" help='Format: TBA event key + "_" + label, e.g. 2027ilch_official or 2027ilch_practice.' className="flex-1">
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="2027ilch_official" />
            </Field>
            <Button variant="primary" onClick={createEvent} disabled={!newCode.trim()} className="mb-5">
              Create
            </Button>
          </div>
          <Field label="TBA event key (schedule, team names, OPRs, official scores)">
            <Input defaultValue={s.tbaEventKey} key={s.tbaEventKey} onBlur={(e) => e.target.value !== s.tbaEventKey && save({ tbaEventKey: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title="Scouting">
        <div className="grid gap-5 p-4">
          <Switch
            checked={s.swapZones}
            onChange={(v) => save({ swapZones: v })}
            label="Flip field orientation"
            help="Turn on when your scouts sit on the other side of the field, so zone buttons and the field map match what they see."
          />
          <Field label="When do scouters enter a match?">
            <Select value={s.startRule} onChange={(e) => save({ startRule: e.target.value as Settings["startRule"] })}>
              <option value="auto">Automatically when every robot has a scouter (or anyone already started)</option>
              <option value="admin">Only when an admin presses Start</option>
            </Select>
          </Field>
          <Field label="Client version label (stored on each match)">
            <Input defaultValue={s.clientVersion} key={s.clientVersion} onBlur={(e) => e.target.value !== s.clientVersion && save({ clientVersion: e.target.value })} className="w-32" />
          </Field>
        </div>
      </Card>

      <ManualSchedule />

      <Card title="Server" description="Secrets (database URL, access code, TBA key) come from environment variables or config/config.json and are never shown here.">
        <ul className="grid gap-2 p-4 text-sm">
          <li className="flex justify-between">
            TBA API key <Badge tone={data.server.hasTbaKey ? "success" : "danger"}>{data.server.hasTbaKey ? "configured" : "missing"}</Badge>
          </li>
          <li className="flex justify-between">
            Admin access code <Badge tone={data.server.authRequired ? "success" : "warning"}>{data.server.authRequired ? "required" : "not set — admin is open"}</Badge>
          </li>
          <li className="flex justify-between">
            Demo mode <Badge tone={data.server.demo ? "warning" : "neutral"}>{data.server.demo ? "on" : "off"}</Badge>
          </li>
          <li className="flex justify-between">
            Config file <span className="text-muted">{data.server.configFile ?? "none"}</span>
          </li>
          <li className="flex justify-between gap-4">
            Environment variables used <span className="text-right text-muted">{data.server.envVars.join(", ") || "none"}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

function ManualSchedule() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [count, setCount] = useState("");
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  useEffect(() => {
    api<{ matches: Match[] }>("/api/admin/schedule").then((r) => setMatches(r.matches));
  }, []);
  if (!matches) return null;
  const resize = () => {
    const n = Math.max(0, Math.min(300, Number(count) || 0));
    setMatches(Array.from({ length: n }, (_, i) => matches[i] ?? { number: i + 1, match_string: `manual_qm${i + 1}`, robots: { red: ["", "", ""], blue: ["", "", ""] } }));
    setDirty(true);
  };
  const save = async (list: Match[]) => {
    await api("/api/admin/schedule", { method: "PUT", json: { matches: list } });
    setMatches(list);
    setDirty(false);
    toast(list.length ? "Manual schedule saved — it replaces TBA" : "Manual schedule cleared — using TBA", "success");
  };
  const set = (i: number, side: "red" | "blue", k: number, v: string) => {
    const next = structuredClone(matches);
    next[i].robots[side][k] = v.replace(/\D/g, "");
    setMatches(next);
    setDirty(true);
  };
  return (
    <Card
      title="Manual schedule"
      description="Only for events without TBA data. While it has matches, it replaces the TBA schedule."
      actions={
        <>
          {matches.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => save([])}>
              Clear
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!dirty} onClick={() => save(matches)}>
            Save
          </Button>
        </>
      }
      className="xl:col-span-2"
    >
      <div className="flex items-end gap-2 p-4 pb-2">
        <Field label="Number of matches">
          <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} className="w-28" placeholder={String(matches.length)} />
        </Field>
        <Button onClick={resize}>Set</Button>
      </div>
      {matches.length > 0 && (
        <div className="max-h-96 overflow-auto px-4 pb-4">
          <table className="text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-1 py-1 text-left font-medium">#</th>
                <th colSpan={3} className="px-1 text-left font-medium text-red-alliance">
                  Red
                </th>
                <th colSpan={3} className="px-1 text-left font-medium text-blue-alliance">
                  Blue
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => (
                <tr key={i}>
                  <td className="px-1 py-0.5 font-semibold">{m.number}</td>
                  {(["red", "blue"] as const).flatMap((side) =>
                    [0, 1, 2].map((k) => (
                      <td key={side + k} className="px-0.5 py-0.5">
                        <Input value={m.robots[side][k]} onChange={(e) => set(i, side, k, e.target.value)} className={`h-8 w-20 ${side === "red" ? "border-red-alliance/40" : "border-blue-alliance/40"}`} inputMode="numeric" />
                      </td>
                    )),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
