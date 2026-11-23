"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Switch, api, cx, useConfirm, useToast } from "@/components/ui";
import { QrScanner } from "./QrScanner";
import { decodeTmp } from "@/lib/scouting/qr";
import type { EventDoc, Match, TeamMatchPerformance } from "@/lib/types";

type Tmp = TeamMatchPerformance & { _id: string };

/** Review scouted matches: flag suspect data for re-scouting, delete bad entries, find gaps. */
export function DataPanel() {
  const [data, setData] = useState<{ tmps: Tmp[]; schedule: Match[]; eventId: string; events: EventDoc[] } | null>(null);
  const [event, setEvent] = useState<string>("");
  const [f, setF] = useState({ scouter: "", match: "", robot: "", flagged: false, gaps: true });
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [flagging, setFlagging] = useState<Tmp | null>(null);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const load = useCallback(() => api(`/api/admin/tmps${event ? `?event=${event}` : ""}`).then((d) => setData(d)), [event]);
  useEffect(() => {
    load().catch((e) => toast(e.message, "danger"));
  }, [load, toast]);

  const allianceOf = useCallback(
    (t: { matchNumber: number; robotNumber: number }) => {
      const m = data?.schedule.find((x) => x.number === t.matchNumber);
      if (m?.robots.red.includes(String(t.robotNumber))) return "red";
      if (m?.robots.blue.includes(String(t.robotNumber))) return "blue";
      return null;
    },
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.tmps.filter(
      (t) =>
        (!f.scouter || t.scouterId.toLowerCase().includes(f.scouter.toLowerCase())) &&
        (!f.match || String(t.matchNumber) === f.match) &&
        (!f.robot || String(t.robotNumber) === f.robot) &&
        (!f.flagged || t.flagged),
    );
    const dupes = new Map<string, number>();
    for (const t of data.tmps) dupes.set(`${t.matchNumber}-${t.robotNumber}`, (dupes.get(`${t.matchNumber}-${t.robotNumber}`) ?? 0) + 1);
    type Row = { kind: "tmp"; t: Tmp; dupe: boolean } | { kind: "gap"; match: number; robot: string };
    const out: Row[] = list.map((t) => ({ kind: "tmp", t, dupe: (dupes.get(`${t.matchNumber}-${t.robotNumber}`) ?? 0) > 1 }));
    if (f.gaps && !f.scouter && !f.flagged) {
      const scoutedMatches = new Set(data.tmps.map((t) => t.matchNumber));
      for (const m of data.schedule) {
        if (!scoutedMatches.has(m.number) || (f.match && String(m.number) !== f.match)) continue;
        for (const r of [...m.robots.red, ...m.robots.blue]) {
          if (f.robot && r !== f.robot) continue;
          if (!data.tmps.some((t) => t.matchNumber === m.number && String(t.robotNumber) === r)) out.push({ kind: "gap", match: m.number, robot: r });
        }
      }
    }
    return out.sort((a, b) => {
      const am = a.kind === "tmp" ? a.t.matchNumber : a.match;
      const bm = b.kind === "tmp" ? b.t.matchNumber : b.match;
      const ar = a.kind === "tmp" ? a.t.robotNumber : Number(a.robot);
      const br = b.kind === "tmp" ? b.t.robotNumber : Number(b.robot);
      return bm - am || ar - br;
    });
  }, [data, f]);

  const setFlag = async (t: Tmp, flagged: boolean, flagReason = "") => {
    setData((d) => d && { ...d, tmps: d.tmps.map((x) => (x._id === t._id ? { ...x, flagged, flagReason } : x)) });
    try {
      await api(`/api/admin/tmps/${t._id}`, { method: "PATCH", json: { flagged, flagReason } });
    } catch (e) {
      toast((e as Error).message, "danger");
      load();
    }
  };

  const remove = async (t: Tmp) => {
    if (!(await confirm(`Delete match ${t.matchNumber} / team ${t.robotNumber}?`, { body: `Scouted by ${t.scouterId}. This cannot be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api(`/api/admin/tmps/${t._id}`, { method: "DELETE" });
      setData((d) => d && { ...d, tmps: d.tmps.filter((x) => x._id !== t._id) });
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  const flaggedCount = data.tmps.filter((t) => t.flagged).length;
  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Event" className="min-w-48">
            <Select value={event || data.eventId} onChange={(e) => setEvent(e.target.value)}>
              {data.events.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scouter">
            <Input value={f.scouter} onChange={(e) => setF({ ...f, scouter: e.target.value })} className="w-36" />
          </Field>
          <Field label="Match">
            <Input inputMode="numeric" value={f.match} onChange={(e) => setF({ ...f, match: e.target.value.replace(/\D/g, "") })} className="w-20" />
          </Field>
          <Field label="Team">
            <Input inputMode="numeric" value={f.robot} onChange={(e) => setF({ ...f, robot: e.target.value.replace(/\D/g, "") })} className="w-24" />
          </Field>
          <div className="flex flex-col gap-2 pb-1">
            <Switch checked={f.flagged} onChange={(v) => setF({ ...f, flagged: v })} label={`Flagged only (${flaggedCount})`} />
            <Switch checked={f.gaps} onChange={(v) => setF({ ...f, gaps: v })} label="Show robots not scouted" />
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => load()}>Refresh</Button>
            <Button variant="primary" onClick={() => setScan(true)}>
              Scan QR code
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`${data.tmps.length} scouted matches`} description="Newest match first. Re-scouting a robot later replaces the earlier entry in analysis.">
        {rows.length === 0 ? (
          <Empty title="Nothing here yet" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              if (row.kind === "gap")
                return (
                  <li key={`gap-${row.match}-${row.robot}`} className="flex items-center gap-3 bg-warning-soft/50 px-4 py-2 text-sm">
                    <span className="w-16 font-semibold">M{row.match}</span>
                    <span className="w-20">{row.robot}</span>
                    <Badge tone="warning">Not scouted</Badge>
                  </li>
                );
              const t = row.t;
              const al = allianceOf(t);
              const counts = t.actionQueue.reduce<Record<string, number>>((acc, a) => ((acc[a.id] = (acc[a.id] ?? 0) + 1), acc), {});
              return (
                <li key={t._id} className={cx("border-l-4", al === "red" ? "border-l-red-alliance" : al === "blue" ? "border-l-blue-alliance" : "border-l-transparent")}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                    <button type="button" className="w-5 text-muted" onClick={() => setOpen(open === t._id ? null : t._id)} aria-label="Show actions">
                      {open === t._id ? "▾" : "▸"}
                    </button>
                    <span className="w-16 font-semibold">M{t.matchNumber}</span>
                    <span className="w-20">{t.robotNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{t.scouterId}</span>
                    <span className="text-xs text-muted">{t.actionQueue.length} actions</span>
                    {row.dupe && <Badge tone="accent">Re-scouted</Badge>}
                    {t.flagged && (
                      <Badge tone="danger" className="max-w-56 truncate">
                        ⚑ {t.flagReason || "Flagged"}
                      </Badge>
                    )}
                    <Button size="sm" variant={t.flagged ? "subtle" : "ghost"} onClick={() => (t.flagged ? setFlag(t, false) : setFlagging(t))}>
                      {t.flagged ? "Unflag" : "Flag"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t)} aria-label="Delete">
                      Delete
                    </Button>
                  </div>
                  {open === t._id && (
                    <div className="grid gap-4 bg-surface-2/60 px-12 py-3 text-xs sm:grid-cols-2">
                      <ol className="max-h-64 list-decimal overflow-y-auto pl-5 font-mono">
                        {t.actionQueue.map((a, i) => (
                          <li key={i}>
                            {a.id} <span className="text-muted">@{(a.ts / 1000).toFixed(1)}s{a.other?.pos ? ` (${a.other.pos.x},${a.other.pos.y})` : ""}</span>
                          </li>
                        ))}
                      </ol>
                      <div>
                        <div className="mb-1 font-semibold">Counts</div>
                        <ul className="font-mono">
                          {Object.entries(counts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([id, n]) => (
                              <li key={id}>
                                {id}: {n}
                              </li>
                            ))}
                        </ul>
                        <div className="mt-2 text-muted">
                          Submitted {new Date(t.timestamp).toLocaleString()} · client {t.clientVersion}
                          {t.projectRevision ? ` · project rev ${t.projectRevision}` : ""}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <FlagDialog t={flagging} onClose={() => setFlagging(null)} onFlag={(reason) => flagging && setFlag(flagging, true, reason)} />
      <ScanDialog open={scan} onClose={() => setScan(false)} onUploaded={load} />
    </div>
  );
}

function FlagDialog({ t, onClose, onFlag }: { t: Tmp | null; onClose: () => void; onFlag: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [t]);
  return (
    <Modal
      open={!!t}
      onClose={onClose}
      title={`Flag match ${t?.matchNumber} / team ${t?.robotNumber}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              onFlag(reason);
              onClose();
            }}
          >
            Flag for re-scout
          </Button>
        </>
      }
    >
      <Field label="Reason (optional)" help="Flags tell scouting leads this data is suspect. Analysis shows a warning on flagged teams.">
        <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. scouter watched the wrong robot" />
      </Field>
    </Modal>
  );
}

function ScanDialog({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const [tmp, setTmp] = useState<TeamMatchPerformance | null>(null);
  const [err, setErr] = useState("");
  const [key, setKey] = useState(0);
  const toast = useToast();
  const onResult = useCallback(async (text: string) => {
    try {
      setErr("");
      setTmp(await decodeTmp(text));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  const reset = () => {
    setTmp(null);
    setErr("");
    setKey((k) => k + 1);
  };
  const upload = async () => {
    try {
      const r = await api("/api/tmps", { method: "POST", json: { tmps: [tmp] } });
      toast(r.saved.length ? "Uploaded" : "Already uploaded earlier", "success");
      onUploaded();
      reset();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Scan a match QR code"
      footer={
        tmp && (
          <>
            <Button onClick={reset}>Scan another</Button>
            <Button variant="primary" onClick={upload}>
              Upload
            </Button>
          </>
        )
      }
    >
      {!tmp ? (
        <>
          {open && <QrScanner key={key} onResult={onResult} />}
          {err && (
            <p className="mt-2 text-sm text-danger">
              {err}{" "}
              <button className="underline" onClick={reset}>
                Try again
              </button>
            </p>
          )}
        </>
      ) : (
        <div className="text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted">Match</dt>
            <dd>{tmp.matchNumber}</dd>
            <dt className="text-muted">Team</dt>
            <dd>{tmp.robotNumber}</dd>
            <dt className="text-muted">Scouter</dt>
            <dd>{tmp.scouterId}</dd>
            <dt className="text-muted">Actions</dt>
            <dd>{tmp.actionQueue.length}</dd>
          </dl>
          <ol className="mt-3 max-h-48 list-decimal overflow-y-auto pl-5 font-mono text-xs">
            {tmp.actionQueue.map((a, i) => (
              <li key={i}>
                {a.id} @{(a.ts / 1000).toFixed(1)}s
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
