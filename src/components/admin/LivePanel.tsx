"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Input, api, cx, useConfirm, useToast } from "@/components/ui";
import { StatusPill } from "./AdminShell";
import type { Match, ScouterState } from "@/lib/types";

interface Live {
  scouters: ScouterState[];
  match: Match | null;
  schedule: Match[];
  startRule: "auto" | "admin";
}

/** Run the event: pick the match, watch scouters get assigned, start or remove scouters. */
export function LivePanel() {
  const [live, setLive] = useState<Live | null>(null);
  const [filter, setFilter] = useState("");
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const load = useCallback(() => api<Live>("/api/admin/live").then(setLive).catch(() => {}), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  const selectMatch = async (m: Match) => {
    try {
      await api("/api/admin/match", { method: "POST", json: { number: m.number } });
      toast(`Match ${m.number} selected`, "success");
      load();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };

  const start = async () => {
    const r = await api<{ entered: number }>("/api/admin/start", { method: "POST" });
    toast(r.entered ? `${r.entered} scouter${r.entered > 1 ? "s" : ""} sent into the match` : "No assigned scouters are waiting", r.entered ? "success" : "info");
    load();
  };

  const kick = async (s: ScouterState) => {
    if (!(await confirm(`Remove ${s.scouterId || "this scouter"}?`, { body: "Their phone returns to the start screen. Any match in progress on it is not submitted.", danger: true, confirmLabel: "Remove" }))) return;
    await api("/api/admin/kick", { method: "POST", json: { sessionId: s.sessionId } });
    toast(`${s.scouterId} removed`, "success");
    load();
  };

  const scouters = useMemo(() => (live?.scouters ?? []).filter((s) => s.status !== 0).sort((a, b) => a.scouterId.localeCompare(b.scouterId)), [live]);
  const matches = useMemo(() => (live?.schedule ?? []).filter((m) => !filter || String(m.number).includes(filter) || [...m.robots.red, ...m.robots.blue].some((r) => r.includes(filter))), [live, filter]);
  const robotsInMatch = live?.match ? [...live.match.robots.red, ...live.match.robots.blue] : [];
  const coverage = robotsInMatch.map((r) => ({ robot: r, red: live!.match!.robots.red.includes(r), s: scouters.find((s) => s.robotNumber === r && s.matchNumber === live!.match!.number && s.status !== 4) }));

  if (!live) return <div className="text-sm text-muted">Loading…</div>;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
      {dialog}
      <div className="flex flex-col gap-5">
        <Card
          title={live.match ? `Current match: ${live.match.number}` : "No match selected"}
          description={live.startRule === "auto" ? "Scouters enter automatically once every robot has a scouter." : "Scouters enter only when you press Start."}
          actions={
            <Button variant="primary" onClick={start} disabled={!live.match}>
              Start match now
            </Button>
          }
        >
          {live.match ? (
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
              {coverage.map((c) => (
                <div key={c.robot} className={cx("rounded-lg border p-3", c.red ? "border-red-alliance/40 bg-red-alliance/5" : "border-blue-alliance/40 bg-blue-alliance/5")}>
                  <div className={cx("text-lg font-bold", c.red ? "text-red-alliance" : "text-blue-alliance")}>{c.robot}</div>
                  <div className="mt-1 truncate text-xs text-muted">{c.s ? c.s.scouterId : "Unassigned"}</div>
                  {c.s && (
                    <div className="mt-1">
                      <StatusPill status={c.s.status} connected={c.s.connected} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Pick a match from the schedule">Scouters who are waiting get a robot as soon as you select a match.</Empty>
          )}
        </Card>

        <Card title={`Scouters (${scouters.length})`} description="Phones poll every 2 seconds. Disconnected scouters drop off after a minute.">
          {scouters.length === 0 ? (
            <Empty title="No scouters signed in yet">Ask scouters to open this site on their phones and tap Start scouting.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {scouters.map((s) => (
                <li key={s.sessionId} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.scouterId || "(no name)"}</div>
                    <div className="text-xs text-muted">{s.robotNumber ? `Match ${s.matchNumber} · Team ${s.robotNumber}` : "No robot assigned"}</div>
                  </div>
                  <StatusPill status={s.status} connected={s.connected} />
                  <Button size="sm" variant="ghost" onClick={() => kick(s)} aria-label={`Remove ${s.scouterId}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Schedule" description={`${live.schedule.length} matches`} actions={<Input placeholder="Find match or team…" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-44" />}>
        {live.schedule.length === 0 ? (
          <Empty title="No schedule yet">Set the TBA event key under Event & settings, or enter a manual schedule there.</Empty>
        ) : (
          <ul className="max-h-[70dvh] divide-y divide-border overflow-y-auto">
            {matches.map((m) => {
              const active = live.match?.number === m.number;
              return (
                <li key={m.number}>
                  <button type="button" onClick={() => !active && selectMatch(m)} className={cx("flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-surface-2", active && "bg-accent-soft")}>
                    <span className="w-12 shrink-0 text-sm font-semibold">{m.number}</span>
                    <span className="flex flex-1 flex-wrap gap-1 text-xs">
                      {m.robots.red.map((r) => (
                        <span key={`r${r}`} className="rounded bg-red-alliance/15 px-1.5 py-0.5 font-medium text-red-alliance">
                          {r}
                        </span>
                      ))}
                      {m.robots.blue.map((r) => (
                        <span key={`b${r}`} className="rounded bg-blue-alliance/15 px-1.5 py-0.5 font-medium text-blue-alliance">
                          {r}
                        </span>
                      ))}
                    </span>
                    <span className="hidden text-[11px] uppercase text-muted sm:block">{m.match_string.split("_").pop()}</span>
                    {active && <Badge tone="accent">Current</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
