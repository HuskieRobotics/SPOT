"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Badge, Button, Field, Input, Modal, Select, ThemeToggle, cx, useConfirm, useToast } from "@/components/ui";
import { ScoutGrid, useScoutingEngine } from "./ScoutGrid";
import { encodeTmp } from "@/lib/scouting/qr";
import { ScouterStatus, type Match, type ScoutingConfig, type TeamMatchPerformance } from "@/lib/types";

interface Bootstrap {
  project: { _id: string; name: string; revision: number; scouting: ScoutingConfig };
  settings: { activeEventId: string | null; swapZones: boolean; clientVersion: string; tbaEventKey: string };
  demo: boolean;
  schedule: Match[];
}

type Screen = "landing" | "signin" | "waiting" | "scouting";
interface Assignment {
  matchNumber: number;
  robotNumber: string;
}

const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

const TIPS = [
  "Misclicked? Press Undo — it reverses the last action exactly.",
  "Arrive a few minutes early so your match starts on time.",
  "Stay focused: the data you collect drives your team's strategy.",
  "Having trouble? Tell the scouting leads right away.",
  "Leaving? Let the scouting team know so they can replace you.",
  "No signal? Keep scouting — matches are saved on your phone and upload later.",
];

function useSessionId() {
  return useMemo(() => {
    if (typeof window === "undefined") return "";
    let id = LS.get<string>("spot.session", "");
    if (!id) {
      id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
      LS.set("spot.session", id);
    }
    return id;
  }, []);
}

export function ScoutApp() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const sessionId = useSessionId();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState("");
  const [screen, setScreen] = useState<Screen>("landing");
  const [name, setName] = useState({ first: "", last: "" });
  const [offline, setOffline] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [assignedNotice, setAssignedNotice] = useState<Assignment | null>(null);
  const [pending, setPending] = useState<TeamMatchPerformance[]>([]);
  const [qr, setQr] = useState<{ url: string; tmp: TeamMatchPerformance } | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const statusRef = useRef<ScouterStatus>(ScouterStatus.NEW);
  const enterSeqRef = useRef<number | null>(null);
  const screenRef = useRef<Screen>("landing");
  screenRef.current = screen;

  // ------------------------------------------------------------ boot
  useEffect(() => {
    setName(LS.get("spot.name", { first: "", last: "" }));
    setPending(LS.get<TeamMatchPerformance[]>("spot.pending", []));
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Server error");
        LS.set("spot.bootstrap", data);
        setBoot(data);
      })
      .catch((e) => {
        const cached = LS.get<Bootstrap | null>("spot.bootstrap", null);
        if (cached) {
          setBoot(cached);
          setOffline(true);
          toast("No connection — using the saved scouting layout (offline mode).");
        } else setBootError(e.message || "Could not reach the SPOT server.");
      });
  }, [toast]);

  // Fetch the field map once online so the service worker has it for offline position taps.
  const mapSrc = boot?.project.scouting.field.image;
  useEffect(() => {
    if (mapSrc && !offline) fetch(mapSrc).catch(() => {});
  }, [mapSrc, offline]);

  const savePending = (list: TeamMatchPerformance[]) => {
    LS.set("spot.pending", list);
    setPending(list);
  };

  // ------------------------------------------------------------ sync
  const syncing = useRef(false);
  const sync = useCallback(async (): Promise<boolean> => {
    const list = LS.get<TeamMatchPerformance[]>("spot.pending", []);
    if (!list.length) return true;
    if (syncing.current) return false;
    syncing.current = true;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch("/api/tmps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmps: list }), signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      const { saved = [], duplicates = [] } = await res.json();
      const done = new Set([...saved, ...duplicates]);
      const remaining = LS.get<TeamMatchPerformance[]>("spot.pending", []).filter((x) => !done.has(x.matchId));
      savePending(remaining);
      return remaining.length === 0;
    } catch {
      return false;
    } finally {
      syncing.current = false;
    }
  }, []);

  // ------------------------------------------------------------ heartbeat (polling, ~2 s)
  const beat = useCallback(
    async (extra: Record<string, unknown> = {}) => {
      if (!sessionId) return;
      try {
        const res = await fetch("/api/scout/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, scouterId: `${name.first}${name.last}`, status: statusRef.current, ...extra }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConnected(true);
        if (data.kicked) {
          statusRef.current = ScouterStatus.NEW;
          setScreen("landing");
          setAssignment(null);
          toast("An admin signed you out of scouting.", "danger");
          return;
        }
        setMatch(data.match);
        const s = data.scouter;
        if (statusRef.current === ScouterStatus.WAITING) {
          const a = s.matchNumber != null && s.robotNumber ? { matchNumber: s.matchNumber, robotNumber: s.robotNumber } : null;
          setAssignment(a);
          if (enterSeqRef.current === null) enterSeqRef.current = s.enterSeq;
          if (s.enterSeq > (enterSeqRef.current ?? 0) && a && screenRef.current === "waiting") {
            enterSeqRef.current = s.enterSeq;
            setMatchKey((k) => k + 1);
            setScreen("scouting");
            setAssignedNotice(a);
          } else enterSeqRef.current = s.enterSeq;
        }
        if (LS.get<unknown[]>("spot.pending", []).length) sync();
      } catch {
        setConnected(false);
      }
    },
    [sessionId, name.first, name.last, sync, toast],
  );

  useEffect(() => {
    if (offline || screen === "landing" || screen === "signin") return;
    beat();
    const id = setInterval(() => beat(), 2000);
    return () => clearInterval(id);
  }, [offline, screen, beat]);

  // ------------------------------------------------------------ actions
  const signIn = (offlineAssignment?: Assignment) => {
    LS.set("spot.name", name);
    statusRef.current = ScouterStatus.WAITING;
    enterSeqRef.current = null;
    if (offlineAssignment) {
      setAssignment(offlineAssignment);
      setMatchKey((k) => k + 1);
      setScreen("scouting");
    } else {
      setAssignment(null);
      setScreen("waiting");
    }
  };

  const alliance = useMemo(() => {
    if (!assignment) return null;
    const m = (match?.number === assignment.matchNumber ? match : null) ?? boot?.schedule.find((x) => x.number === assignment.matchNumber);
    if (!m) return null;
    if (m.robots.red.map(String).includes(String(assignment.robotNumber))) return "red";
    if (m.robots.blue.map(String).includes(String(assignment.robotNumber))) return "blue";
    return null;
  }, [assignment, match, boot]);

  const submit = async (tmp: TeamMatchPerformance) => {
    savePending([...LS.get<TeamMatchPerformance[]>("spot.pending", []), tmp]);
    const ok = !offline && (await sync());
    if (ok) {
      statusRef.current = ScouterStatus.COMPLETE;
      await beat({ status: ScouterStatus.COMPLETE, matchNumber: tmp.matchNumber, robotNumber: String(tmp.robotNumber) });
      toast("Match uploaded. Thank you!", "success");
      statusRef.current = ScouterStatus.WAITING;
      setAssignment(null);
      setScreen("waiting");
    } else {
      setQr({ url: await QRCode.toDataURL(await encodeTmp(tmp), { errorCorrectionLevel: "M", margin: 2, width: 720 }), tmp });
    }
  };

  const showQr = async (tmp: TeamMatchPerformance) => setQr({ url: await QRCode.toDataURL(await encodeTmp(tmp), { errorCorrectionLevel: "M", margin: 2, width: 720 }), tmp });

  // ------------------------------------------------------------ render
  if (bootError)
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-sm px-6 text-center">
          <h1 className="text-lg font-semibold">SPOT can&apos;t start</h1>
          <p className="mt-2 text-sm text-muted">{bootError}</p>
          <Button className="mt-6" variant="primary" onClick={() => location.reload()}>
            Try again
          </Button>
        </div>
      </Shell>
    );
  if (!boot)
    return (
      <Shell>
        <div className="flex h-dvh items-center justify-center text-sm text-muted">Loading SPOT…</div>
      </Shell>
    );

  const statusChip =
    offline ? <Badge tone="warning">Offline mode</Badge> : connected === null ? <Badge>Connecting…</Badge> : connected ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Disconnected</Badge>;

  return (
    <Shell>
      {dialog}
      {screen === "landing" && (
        <Landing
          boot={boot}
          pending={pending}
          offline={offline}
          setOffline={setOffline}
          onStart={() => setScreen("signin")}
          onRetry={async () => toast((await sync()) ? "All matches uploaded." : "Still offline — try again later.", "info")}
          onShowQr={showQr}
          onDiscard={async (t) => {
            if (await confirm("Delete this unsynced match?", { danger: true, body: "Only do this after it has been scanned or uploaded another way.", confirmLabel: "Delete" }))
              savePending(pending.filter((p) => p.matchId !== t.matchId));
          }}
        />
      )}
      {screen === "signin" && (
        <SignIn
          name={name}
          setName={setName}
          offline={offline || connected === false}
          schedule={boot.schedule}
          onBack={() => setScreen("landing")}
          onDone={signIn}
        />
      )}
      {screen === "waiting" && (
        <Waiting
          name={`${name.first} ${name.last}`}
          assignment={assignment}
          statusChip={statusChip}
          onLeave={() => {
            statusRef.current = ScouterStatus.NEW;
            beat({ status: ScouterStatus.NEW });
            setScreen("landing");
          }}
        />
      )}
      {screen === "scouting" && assignment && (
        <MatchScreen
          key={matchKey}
          boot={boot}
          assignment={assignment}
          alliance={alliance}
          scouterId={`${name.first}${name.last}`}
          statusChip={statusChip}
          matchKey={(match?.number === assignment.matchNumber ? match : boot.schedule.find((m) => m.number === assignment.matchNumber))?.match_string ?? null}
          onStatus={(s) => {
            statusRef.current = s;
            beat({ status: s, matchNumber: assignment.matchNumber, robotNumber: assignment.robotNumber });
          }}
          onSubmit={submit}
          onExit={async () => {
            if (await confirm("Leave this match?", { danger: true, body: "Anything you recorded for this match will be lost.", confirmLabel: "Leave" })) {
              statusRef.current = offline ? ScouterStatus.NEW : ScouterStatus.WAITING;
              setScreen(offline ? "landing" : "waiting");
            }
          }}
        />
      )}

      <Modal
        open={!!assignedNotice}
        onClose={() => setAssignedNotice(null)}
        title="Match assignment"
        footer={
          <Button variant="primary" onClick={() => setAssignedNotice(null)}>
            OK
          </Button>
        }
      >
        <p className="text-sm">
          You are scouting{" "}
          <b className={alliance === "red" ? "text-red-alliance" : alliance === "blue" ? "text-blue-alliance" : ""}>team {assignedNotice?.robotNumber}</b> in match{" "}
          <b>{assignedNotice?.matchNumber}</b>.
        </p>
      </Modal>

      {qr && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4 text-black">
          <p className="text-center text-sm font-semibold">
            Couldn&apos;t upload. Have a scouting lead scan this code
            <br />
            (match {qr.tmp.matchNumber}, team {qr.tmp.robotNumber}).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.url} alt="Match data QR code" className="aspect-square w-full max-w-[min(90vw,70dvh)]" />
          <p className="max-w-sm text-center text-xs text-gray-600">It is also saved on this phone and will upload automatically when you are back online.</p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setQr(null);
              statusRef.current = offline ? ScouterStatus.NEW : ScouterStatus.WAITING;
              setAssignment(null);
              setScreen(offline ? "landing" : screen === "scouting" ? "waiting" : screen);
            }}
          >
            Done
          </Button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex h-dvh flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{children}</main>;
}

// ---------------------------------------------------------------- screens

function Landing({
  boot,
  pending,
  offline,
  setOffline,
  onStart,
  onRetry,
  onShowQr,
  onDiscard,
}: {
  boot: Bootstrap;
  pending: TeamMatchPerformance[];
  offline: boolean;
  setOffline: (v: boolean) => void;
  onStart: () => void;
  onRetry: () => void;
  onShowQr: (t: TeamMatchPerformance) => void;
  onDiscard: (t: TeamMatchPerformance) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-3">
        <nav className="flex gap-1 text-sm">
          <a className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text" href="/analysis">
            Analysis
          </a>
          <a className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text" href="/admin">
            Admin
          </a>
        </nav>
        <ThemeToggle />
      </header>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 pb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/logo.svg" alt="" className="h-28 w-28 dark:invert" />
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">SPOT</h1>
          <p className="mt-1 text-sm text-muted">{boot.project.name}</p>
          {boot.demo && (
            <Badge tone="warning" className="mt-2">
              DEMO
            </Badge>
          )}
        </div>
        <Button variant="primary" size="lg" className="w-full justify-center" onClick={onStart}>
          Start scouting
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Scout offline (pick your own match and robot)
        </label>

        {pending.length > 0 && (
          <div className="w-full rounded-xl border border-warning/40 bg-warning-soft p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-warning">
                {pending.length} match{pending.length > 1 ? "es" : ""} not uploaded
              </span>
              <Button size="sm" onClick={onRetry}>
                Retry
              </Button>
            </div>
            <ul className="mt-2 space-y-1">
              {pending.map((t) => (
                <li key={t.matchId} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    Match {t.matchNumber} · Team {t.robotNumber}
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onShowQr(t)}>
                      QR
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDiscard(t)} aria-label="Delete">
                      ✕
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <footer className="pb-4 text-center text-[11px] text-muted">SPOT v6 · Team 3061 Huskie Robotics</footer>
    </div>
  );
}

function SignIn({
  name,
  setName,
  offline,
  schedule,
  onBack,
  onDone,
}: {
  name: { first: string; last: string };
  setName: (n: { first: string; last: string }) => void;
  offline: boolean;
  schedule: Match[];
  onBack: () => void;
  onDone: (a?: Assignment) => void;
}) {
  const [matchNumber, setMatchNumber] = useState("");
  const [robot, setRobot] = useState("");
  const sched = schedule.find((m) => String(m.number) === matchNumber);
  const valid = name.first.trim() && name.last.trim() && (!offline || (Number(matchNumber) > 0 && robot.trim()));
  return (
    <form
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onDone(offline ? { matchNumber: Number(matchNumber), robotNumber: robot.trim() } : undefined);
      }}
    >
      <h1 className="text-2xl font-bold">Sign in</h1>
      <Field label="First name">
        <Input autoFocus value={name.first} onChange={(e) => setName({ ...name, first: e.target.value.replace(/\s/g, "") })} autoComplete="given-name" />
      </Field>
      <Field label="Last name">
        <Input value={name.last} onChange={(e) => setName({ ...name, last: e.target.value.replace(/\s/g, "") })} autoComplete="family-name" />
      </Field>
      {offline && (
        <>
          <Field label="Match number">
            <Input inputMode="numeric" value={matchNumber} onChange={(e) => setMatchNumber(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Robot (team number)">
            {sched ? (
              <Select value={robot} onChange={(e) => setRobot(e.target.value)}>
                <option value="">Choose…</option>
                {sched.robots.red.map((r) => (
                  <option key={`r${r}`} value={r}>
                    {r} (red)
                  </option>
                ))}
                {sched.robots.blue.map((r) => (
                  <option key={`b${r}`} value={r}>
                    {r} (blue)
                  </option>
                ))}
              </Select>
            ) : (
              <Input inputMode="numeric" value={robot} onChange={(e) => setRobot(e.target.value.replace(/\D/g, ""))} />
            )}
          </Field>
        </>
      )}
      <div className="mt-2 flex gap-2">
        <Button onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" className="flex-1 justify-center" disabled={!valid}>
          {offline ? "Start match" : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function Waiting({ name, assignment, statusChip, onLeave }: { name: string; assignment: Assignment | null; statusChip: React.ReactNode; onLeave: () => void }) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    setTip(Math.floor(Math.random() * TIPS.length));
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 7000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        {statusChip}
        <Button size="sm" variant="ghost" onClick={onLeave}>
          Sign out
        </Button>
      </header>
      <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/gear.svg" alt="" className="spin-slow h-20 w-20 opacity-70 dark:invert" />
        <div>
          <h1 className="text-xl font-semibold">Waiting for a match…</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {name}</p>
        </div>
        {assignment && (
          <div className="rounded-xl bg-accent-soft px-4 py-2 text-sm text-accent">
            Next up: team <b>{assignment.robotNumber}</b> in match <b>{assignment.matchNumber}</b>
          </div>
        )}
        <p key={tip} className="fade-in min-h-12 text-sm text-muted">
          {TIPS[tip]}
        </p>
      </div>
    </div>
  );
}

function MatchScreen({
  boot,
  assignment,
  alliance,
  scouterId,
  statusChip,
  matchKey,
  onStatus,
  onSubmit,
  onExit,
}: {
  boot: Bootstrap;
  assignment: Assignment;
  alliance: "red" | "blue" | null;
  scouterId: string;
  statusChip: React.ReactNode;
  matchKey: string | null;
  onStatus: (s: ScouterStatus) => void;
  onSubmit: (t: TeamMatchPerformance) => Promise<void>;
  onExit: () => void;
}) {
  const cfg = boot.project.scouting;
  const ctx = useMemo(() => ({ swapZones: boot.settings.swapZones, alliance }), [boot.settings.swapZones, alliance]);
  const { engine, rerender } = useScoutingEngine(cfg, ctx);
  const [submitting, setSubmitting] = useState(false);
  const [menu, setMenu] = useState(false);
  const { confirm, dialog } = useConfirm();

  const buildTmp = (): TeamMatchPerformance => {
    const rand = Math.floor(Math.random() * 2 ** 32).toString(32);
    return {
      matchId: `${assignment.matchNumber}-${assignment.robotNumber}-${scouterId}-${rand}`,
      matchId_rand: rand,
      timestamp: Date.now(),
      clientVersion: boot.settings.clientVersion,
      scouterId,
      robotNumber: Number(assignment.robotNumber),
      matchNumber: Number(assignment.matchNumber),
      matchKey,
      eventNumber: boot.settings.activeEventId ?? "",
      projectId: boot.project._id,
      projectRevision: boot.project.revision,
      flagged: false,
      actionQueue: engine.submittedActions(),
    };
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {dialog}
      <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-1.5 text-xs">
        <span
          className={cx(
            "rounded-md px-2 py-0.5 font-semibold text-white",
            alliance === "red" ? "bg-red-alliance" : alliance === "blue" ? "bg-blue-alliance" : "bg-muted",
          )}
        >
          M{assignment.matchNumber} · {assignment.robotNumber}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted" title="Last actions">
          {engine.lastActions() || "—"}
        </span>
        {engine.speed > 1 && <Badge tone="warning">2× clock</Badge>}
        {statusChip}
        <Button size="icon" variant="ghost" onClick={() => setMenu(true)} aria-label="Match menu">
          ⋯
        </Button>
      </header>
      <ScoutGrid
        engine={engine}
        rerender={rerender}
        swapZones={boot.settings.swapZones}
        onEffect={async (e) => {
          if (e.type === "started") onStatus(ScouterStatus.SCOUTING);
          if (e.type === "submit" && !submitting) {
            setSubmitting(true);
            await onSubmit(buildTmp());
            setSubmitting(false);
          }
        }}
      />
      {submitting && <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 text-sm font-semibold text-white">{cfg.messages.submitting}</div>}
      <Modal open={menu} onClose={() => setMenu(false)} title="Match options">
        <div className="flex flex-col gap-2">
          {cfg.allowFastClock && engine.status === "running" && (
            <Button
              onClick={async () => {
                setMenu(false);
                if (engine.speed > 1) engine.speed = 1;
                else if (await confirm("Use 2× clock?", { body: "Only for re-scouting from a video played at 2× speed. The match clock will run twice as fast." })) engine.speed = 2;
                rerender();
              }}
            >
              {engine.speed > 1 ? "Back to normal clock" : "2× clock (video re-scout)"}
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => {
              setMenu(false);
              onExit();
            }}
          >
            Leave match without submitting
          </Button>
        </div>
      </Modal>
    </div>
  );
}
