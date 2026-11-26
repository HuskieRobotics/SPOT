"use client";

/**
 * The scouting client at `/` (docs/spec/05, #359): sign in, wait, get assigned, scout, submit.
 *
 * What the device knows lives in its store (`src/scouter/device.ts`), which survives a reload
 * and a restart (RT-26); this component reads it on every render and re-renders when it changes.
 * The registry's messages arrive on the connection (`src/scouter/connection.ts`); the rules for
 * opening, closing and keeping a match are in `src/scouter/match.ts`.
 *
 * Submitting keeps the match on the device, then sends it (#360, `src/scouter/sync.ts`): at once,
 * whenever the connection comes back, and every minute while any is left. A match not sent is
 * shown as a QR code (SC-41) and stays in the pending list (OF-2, BL-93) until the server has it.
 *
 * Offline (#361, docs/spec/18): the service worker keeps the app, so the page opens with no
 * connection, and with no connection the waiting page lets the scouter type the match and team
 * and scout it (OF-1, SC-10).
 */
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MatchScoutingConfig } from "@/config/types";
import { newNonce } from "@/data/nonce";
import { cn } from "@/lib/utils";
import { registerServiceWorker } from "@/offline/register";
import { call, httpApi } from "@/scouter/api";
import { Connection, type ConnectionStatus } from "@/scouter/connection";
import {
  browserStore,
  DeviceStore,
  joinCodeFromUrl,
  type CachedConfig,
  type SignedIn,
} from "@/scouter/device";
import {
  assignmentPrompt,
  beginManualMatch,
  beginMatch,
  closesUnstarted,
  finishMatch,
  keyOf,
  reconcile,
  registryHas,
  shouldEnter,
  started,
  viewMatch,
  type FinishedMatch,
  type MatchKey,
} from "@/scouter/match";
import { browserRecords, type PendingRecord, type RecordStore } from "@/scouter/records";
import { refreshSchedule, signOut as signOutOfRegistry } from "@/scouter/sign-in";
import { Syncer, type SyncOutcome } from "@/scouter/sync";
import { matchLabel } from "@/schedule/labels";
import type { SessionState } from "@/scouting/session";
import type { DeviceAction } from "@/sessions/runtime";
import type { Alliance, DeviceMessage, DeviceView } from "@/sessions/registry";
import { Dialog } from "./dialog";
import { InstallPrompt } from "./install-prompt";
import { ManualMatchForm } from "./manual-match-form";
import { MatchPage } from "./match-page";
import { PendingList } from "./pending-list";
import { QrSheet } from "./qr-sheet";
import { SettingsMenu } from "./settings-menu";
import { SignInScreen } from "./sign-in-screen";
import { ConnectionLabel, MatchLabel } from "./status-line";
import { WaitingPage } from "./waiting-page";

interface Notice {
  title: string;
  text: string;
}

type Confirm = "sign-out" | "reset" | null;

/** Send matches every minute while any are left, besides on connecting and on submitting. */
const RETRY_MS = 60_000;

const NOT_SENT_OFFLINE =
  "No connection. The match is kept on this device and sent when the connection returns. An admin can scan this code now.";

function withdrawnText(view: DeviceView | null, reason: "released" | "match-changed"): string {
  const m = viewMatch(view);
  const robot = m ? `team ${m.team} in ${matchLabel(m.level, m.number)}` : "your robot";
  return reason === "released"
    ? `An admin gave ${robot} to another scouter. Wait here for a new assignment.`
    : `The match changed before you started, so ${robot} is no longer yours. Wait here for a new assignment.`;
}

export function ScoutingApp() {
  // Browser only (see `ScoutingClient`): everything starts from the device's storage.
  const [store] = useState(() => {
    const s = new DeviceStore(browserStore());
    const fromLink = joinCodeFromUrl(window.location.search);
    if (fromLink) {
      s.setJoinCode(fromLink);
      // The code is kept; the link need not stay in the address bar or the history.
      history.replaceState(null, "", window.location.pathname);
    }
    return s;
  });
  const api = useMemo(() => httpApi(), []);
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  // `tried`: the connection has reported once, so "not connected" is known rather than assumed.
  const [connection, setConnection] = useState<{
    status: ConnectionStatus;
    detail?: string;
    tried?: boolean;
  }>({ status: "not-connected" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);
  const [askForJoinCode, setAskForJoinCode] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  // Matches not yet on the server (OF-2), and the QR code on show (SC-41).
  const [records, setRecords] = useState<RecordStore | null>(null);
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [qr, setQr] = useState<{
    record: PendingRecord;
    config: CachedConfig | null;
    message: string | null;
  } | null>(null);
  const opened = useRef<Promise<RecordStore> | null>(null);
  const openRecords = useCallback(() => (opened.current ??= browserRecords()), []);

  // The app itself is kept for opening with no connection (OF-1, OF-5).
  useEffect(registerServiceWorker, []);

  const signedIn = store.signedIn();
  const view = store.view();
  const settings = store.settings();
  const active = store.match();

  // ------------------------------------------------------------ keeping and sending matches
  const syncer = useMemo(
    () =>
      records &&
      new Syncer({
        records,
        api,
        joinCode: () => store.joinCode(),
        onChange: () => void records.all().then(setPending),
        onBusy: setSending,
      }),
    [records, api, store],
  );

  /**
   * Move finished matches from the device store to IndexedDB, including any a reload left, and
   * show what is waiting.
   */
  const keepFinished = useCallback(async () => {
    const r = await openRecords();
    for (const { record, config } of store.finishing()) {
      await r.put(record, config);
      store.removeFinishing(record.nonce);
    }
    return r;
  }, [store, openRecords]);

  /** Send what is waiting; the syncer's `onChange` updates the list. */
  const send = useCallback(
    async (): Promise<SyncOutcome | null> => (syncer ? syncer.sync() : null),
    [syncer],
  );

  useEffect(() => {
    void keepFinished().then(async (r) => {
      setRecords(r);
      setPending(await r.all());
    });
  }, [keepFinished]);

  // Send on start, when the browser comes online, and every minute while any are left (RT-21).
  useEffect(() => {
    if (!syncer) return;
    const go = () => void syncer.sync();
    const first = setTimeout(go, 0);
    window.addEventListener("online", go);
    const timer = setInterval(go, RETRY_MS);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", go);
      clearInterval(timer);
    };
  }, [syncer]);

  /** End a match and keep its record: off the screen and safe at once, then sent (SC-39). */
  const finish = useCallback(
    (record: FinishedMatch, config: CachedConfig) => {
      store.addFinishing(record, config);
      store.addDone(keyOf(record));
      store.clearMatch();
      void keepFinished()
        .then((r) => r.all())
        .then(setPending);
    },
    [store, keepFinished],
  );

  // ------------------------------------------------------------ talking to the registry
  const act = useCallback(
    async (action: Exclude<DeviceAction, "sign-out">) => {
      const who = store.signedIn();
      if (!who) return;
      const reply = await api.act(who.scouterId, store.deviceId(), action);
      if (reply.ok) {
        store.setView(reply.value.view);
        refresh();
      }
      // Not sent: `reconcile` sends it again when the registry next says where the scouter is.
    },
    [api, store, refresh],
  );

  /** Keep a match that was started; close one that was not (BL-54, RT-28). */
  const leaveMatch = useCallback(
    (cutShort: NonNullable<FinishedMatch["cutShort"]>) => {
      const current = store.match();
      if (!current) return false;
      const kept = started(current.match);
      if (kept) finish(finishMatch(current.match, Date.now(), cutShort), current.config);
      else store.clearMatch();
      return kept;
    },
    [store, finish],
  );

  /** After the registry says where the scouter is: open the match screen, and catch it up. */
  const followView = useCallback(async () => {
    const view = store.view();
    const current = store.match();
    const config = store.config();
    // A robot not yet started that the registry no longer gives this scouter closes.
    if (current && !started(current.match) && closesUnstarted(view, current.match))
      store.clearMatch();
    if (config && view && shouldEnter(view, store.match()?.match ?? null, store.done())) {
      const who = store.signedIn()!;
      store.setMatch(
        beginMatch(view, {
          scouterId: who.scouterId,
          eventId: store.settings().eventId,
          config: config.config,
          configVersion: config.version,
          nonce: newNonce(),
          now: Date.now(),
        }),
        config,
      );
    }
    refresh();
    for (const action of reconcile(
      view,
      store.match()?.match ?? null,
      store.done(),
      store.accepted(),
    ))
      await act(action as Exclude<DeviceAction, "sign-out">);
  }, [store, act, refresh]);

  // ------------------------------------------------------------ the configuration (CS-17)
  useEffect(() => {
    let cancelled = false;
    void call<{ version: string; config: MatchScoutingConfig }>("/api/config/match-scouting").then(
      (reply) => {
        if (cancelled) return;
        if (reply.ok) {
          store.setConfig(reply.value);
          setConfigError(null);
          // An assignment that arrived first can open its match now.
          if (store.signedIn()) void followView();
          else refresh();
        } else if (!reply.offline) setConfigError(reply.message);
        else if (!store.config())
          setConfigError("The scouting configuration has not loaded. Connect once to load it.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, refresh, followView]);

  const onMessage = useCallback(
    (message: DeviceMessage) => {
      if (message.kind === "signed-out") return; // the connection signs the device out
      if (message.kind === "settings") {
        store.setSettings({ fieldFlipped: message.fieldFlipped, eventId: message.eventId });
        refresh();
        return;
      }
      const before = store.view();
      store.setView(message.view);
      if (message.kind === "unassigned") {
        const current = store.match();
        const was = viewMatch(before);
        // A match typed offline is the registry's only if it gave the scouter that robot.
        const ours =
          current &&
          (current.match.manual
            ? registryHas(before, current.match)
            : !was || keyOf(was) === keyOf(current.match));
        if (ours && started(current.match)) {
          if (message.reason === "released") {
            leaveMatch("released");
            setNotice({
              title: "Released",
              text: `${withdrawnText(before, "released")} What you recorded is saved on this device.`,
            });
          }
          // A started match the registry thought was waiting (its start was lost): keep scouting.
        } else {
          if (ours) store.clearMatch();
          setNotice({
            title: "Assignment withdrawn",
            text: withdrawnText(before, message.reason),
          });
        }
      }
      void followView();
    },
    [store, refresh, followView, leaveMatch],
  );

  const signOutHere = useCallback(
    (reason: string | null) => {
      const kept = leaveMatch("signed-out");
      store.signOut();
      setSignedOutReason(
        reason && kept ? `${reason} What you recorded is saved on this device.` : reason,
      );
      setInfo(null);
      refresh();
    },
    [store, leaveMatch, refresh],
  );

  const scouterId = signedIn?.scouterId ?? null;
  useEffect(() => {
    if (!scouterId) return;
    const c = new Connection({
      store,
      api,
      handlers: {
        status: (status, detail) => setConnection({ status, detail, tried: true }),
        message: onMessage,
        // Ignored after signing out here: the registry's own sign-out message follows it.
        signedOut: (reason) => {
          if (store.signedIn()) signOutHere(reason);
        },
      },
    });
    void c.run();
    const online = () => c.wake();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      c.stop();
      setConnection({ status: "not-connected" });
    };
  }, [scouterId, store, api, onMessage, signOutHere]);

  // A connection that opens is the server back: send what waited (RT-21, RT-28), and read the
  // schedule for the next time it drops (OF-1).
  const connected = connection.status === "connected";
  useEffect(() => {
    if (connected) void syncer?.sync();
  }, [connected, syncer]);
  useEffect(() => {
    if (connected) void refreshSchedule(store, api);
  }, [connected, store, api]);

  // ------------------------------------------------------------ the scouter's own actions
  const onMatchChange = useCallback(
    (state: SessionState) => {
      const current = store.match();
      if (!current) return;
      const before = current.match.state.status;
      const match = { ...current.match, state };
      // The registry hears only of the robot it gave: a match typed offline may be another.
      const tell = !match.manual || registryHas(store.view(), match);
      if (state.status === "submitted") {
        const record = finishMatch(match, Date.now());
        finish(record, current.config);
        setInfo("Sending…");
        refresh();
        if (tell) void act("finish").then(() => act("ready"));
        // SC-40, SC-41: sent, or shown as a QR code and kept for the next try.
        void (async () => {
          await keepFinished();
          const outcome = await send();
          const left = (await openRecords().then((r) => r.all())).find(
            (r) => r.nonce === record.nonce,
          );
          if (!left) {
            setInfo("Match sent.");
            return;
          }
          setInfo(null);
          setQr({
            record: left,
            config: current.config,
            message: outcome?.offline || !outcome ? NOT_SENT_OFFLINE : outcome.message,
          });
        })();
        return;
      }
      store.setMatch(match);
      if (tell && before === "pre-match" && state.status === "running") void act("start");
    },
    [store, act, refresh, finish, keepFinished, send, openRecords],
  );

  const showQr = async (record: PendingRecord) => {
    const r = await openRecords();
    const config = store.config();
    setQr({
      record,
      config:
        (await r.config(record.configVersion)) ??
        (config?.version === record.configVersion ? config : null),
      message: record.problem,
    });
  };

  const sendNow = async () => {
    const outcome = await send();
    if (!outcome) return;
    if (outcome.offline) setInfo("No connection. The matches are kept on this device.");
    else if (outcome.message) setInfo(outcome.message);
    else if (outcome.sent > 0)
      setInfo(`${outcome.sent} ${outcome.sent === 1 ? "match" : "matches"} sent.`);
  };

  /** Scout a match the scouter typed, with no connection (OF-1, SC-10). */
  const scoutManually = (key: MatchKey, alliance: Alliance) => {
    const config = store.config();
    const who = store.signedIn();
    if (!config || !who) return;
    store.setMatch(
      beginManualMatch(key, alliance, {
        scouterId: who.scouterId,
        eventId: store.settings().eventId,
        config: config.config,
        configVersion: config.version,
        nonce: newNonce(),
        now: Date.now(),
      }),
      config,
    );
    setInfo(null);
    refresh();
  };

  const accept = () => {
    const m = viewMatch(store.view());
    if (m) store.setAccepted(keyOf(m));
    refresh();
    void act("accept");
  };

  async function signOut() {
    setConfirm(null);
    leaveMatch("signed-out");
    await signOutOfRegistry(store, api);
    setSignedOutReason(null);
    setInfo(null);
    refresh();
  }

  function changeJoinCode() {
    if (store.signedIn()) void signOut();
    setAskForJoinCode(true);
    refresh();
  }

  async function reset() {
    store.reset();
    await (await openRecords()).clear();
    try {
      for (const key of await caches.keys()) await caches.delete(key);
      for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? [])
        await r.unregister();
    } catch {
      // No caches or service worker to clear (#361 adds them).
    }
    location.replace("/");
  }

  const unsent = pending.length + (active && started(active.match) ? 1 : 0);
  const pendingList = (
    <PendingList
      records={pending}
      sending={sending}
      durable={records?.durable ?? true}
      onSend={() => void sendNow()}
      onShowQr={(r) => void showQr(r)}
    />
  );
  const menu = (speed?: { value: number; set(speed: number): void }) => (
    <SettingsMenu
      signedIn={signedIn !== null}
      onSignOut={() => (active && started(active.match) ? setConfirm("sign-out") : void signOut())}
      onChangeJoinCode={changeJoinCode}
      onReset={() => setConfirm("reset")}
      onLeaveMatch={
        active?.match.manual && !started(active.match)
          ? () => {
              store.clearMatch();
              refresh();
            }
          : undefined
      }
      speed={speed}
    />
  );
  // A scouter who finished a match still holds its robot until the match changes (RT-35), but
  // waits for the next assignment, even before the registry has heard of the finish.
  const viewed = viewMatch(view);
  const waitingFor =
    view?.status === "complete" || (viewed && store.done().includes(keyOf(viewed))) ? null : viewed;
  const assignedMatch = active?.match ?? waitingFor;
  const alliance = active?.match.alliance ?? view?.alliance ?? null;
  const statusParts = (speed?: { value: number; set(speed: number): void }) => (
    <span className="flex min-w-0 items-center gap-2">
      {menu(speed)}
      <ConnectionLabel status={connection.status} detail={connection.detail} />
      {assignedMatch && <MatchLabel match={assignedMatch} alliance={alliance} />}
      {pending.length > 0 && (
        <span className="text-destructive shrink-0 font-medium" data-testid="not-sent">
          {pending.length} not sent
        </span>
      )}
      {speed && speed.value !== 1 && (
        <span className="bg-destructive shrink-0 rounded px-1.5 font-bold text-white">
          {speed.value}×
        </span>
      )}
    </span>
  );

  // ------------------------------------------------------------ pages
  let page: React.ReactNode;
  if (!signedIn) {
    page = (
      <main className="flex min-h-dvh flex-col items-center gap-5 p-4 pt-10">
        <div className="fixed top-2 left-2">{menu()}</div>
        <Image
          src="/img/logo.svg"
          alt="SPOT logo"
          width={96}
          height={96}
          priority
          className="dark:invert"
        />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-4xl font-bold tracking-tight">SPOT</h1>
          <p className="text-muted-foreground text-sm">v{process.env.SPOT_VERSION}</p>
        </div>
        <h2 className="text-xl font-semibold">Sign in to scout</h2>
        {signedOutReason && (
          <p role="alert" className="text-destructive max-w-sm text-center text-sm">
            {signedOutReason}
          </p>
        )}
        {pendingList}
        <SignInScreen
          key={askForJoinCode ? "join" : "pick"}
          store={store}
          askForJoinCode={askForJoinCode}
          onSignedIn={(_who: SignedIn, note?: string) => {
            setSignedOutReason(null);
            setAskForJoinCode(false);
            setInfo(note ?? null);
            refresh();
          }}
        />
        <nav className="text-muted-foreground mt-auto flex gap-4 pt-6 text-sm">
          <a href="https://github.com/HuskieRobotics/SPOT/issues" target="_blank" rel="noopener">
            Give feedback
          </a>
          <Link href="/scouting-preview">Scouting-screen preview</Link>
        </nav>
      </main>
    );
  } else if (active) {
    page = (
      <MatchPage
        key={active.match.nonce}
        match={active.match}
        config={active.config.config}
        fieldFlipped={settings.fieldFlipped}
        onChange={onMatchChange}
        status={(speed) => statusParts(speed)}
      />
    );
  } else {
    // SC-10: with no connection, the scouter can type a match; known once the connection tried.
    const typing =
      connection.tried === true && connection.status !== "connected" && store.config() !== null;
    page = (
      <WaitingPage
        compact={typing}
        statusLine={
          <header className="flex h-10 items-center border-b px-2 text-sm">{statusParts()}</header>
        }
        name={signedIn.name}
        assigned={waitingFor}
      >
        {info && (
          <p role="status" className="text-sm">
            {info}
          </p>
        )}
        {configError && (
          <p role="alert" className="text-destructive max-w-md text-sm">
            {configError}
          </p>
        )}
        {typing && (
          <ManualMatchForm
            key={waitingFor ? keyOf(waitingFor) : "none"}
            assigned={waitingFor}
            assignedAlliance={waitingFor ? (view?.alliance ?? null) : null}
            schedule={store.schedule()?.matches ?? []}
            eventKnown={settings.eventId !== null}
            onScout={scoutManually}
          />
        )}
        {pendingList}
      </WaitingPage>
    );
  }

  const prompt = signedIn ? assignmentPrompt(view, store.accepted()) : null;
  return (
    <>
      {page}
      <InstallPrompt store={store} show={!active && !qr} />
      {prompt && !notice && (
        <Dialog title="Match information" actions={<Button onClick={accept}>OK</Button>}>
          {prompt}
        </Dialog>
      )}
      {notice && (
        <Dialog title={notice.title} actions={<Button onClick={() => setNotice(null)}>OK</Button>}>
          {notice.text}
        </Dialog>
      )}
      {qr && (
        <QrSheet
          record={qr.record}
          config={qr.config}
          message={qr.message}
          onDismiss={() => setQr(null)}
        />
      )}
      {confirm === "sign-out" && (
        <Dialog
          title="Sign out during a match?"
          actions={
            <>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Keep scouting
              </Button>
              <Button onClick={() => void signOut()}>Sign out</Button>
            </>
          }
        >
          You are scouting {active ? `team ${active.match.team}` : "a match"}. What you recorded is
          saved on this device, but the match ends here.
        </Dialog>
      )}
      {confirm === "reset" && (
        <Dialog
          title="Reset app data?"
          actions={
            <>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void reset()}>
                Reset
              </Button>
            </>
          }
        >
          <p>
            This removes everything SPOT keeps on this device: who is signed in, the join code, the
            roster and the scouting configuration.
          </p>
          {unsent > 0 && (
            <p className={cn("mt-2 font-semibold", "text-destructive")}>
              {unsent} {unsent === 1 ? "match" : "matches"} scouted here and not yet sent will be
              lost.
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
