"use client";

/**
 * The QR scanner (#411; document 07 AD-18 to AD-21, OF-4, AN-8, SEC-5): read a phone's code, check
 * what it holds, send it, and undo the last scan. Everything scanned is kept on this device until
 * the server has it, so scanning goes on with no connection; the page sends what it holds when the
 * connection returns, and on its own every little while.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { keepPage, registerServiceWorker } from "@/offline/register";
import { describe, readCode, type ScannedRecord, type ScannerInputs } from "@/scanner/scan";
import { browserScannerStore, type ScannerStore } from "@/scanner/store";
import { sendScans } from "@/scanner/sync";
import { call } from "@/scouter/api";
import type { SubmissionResult } from "@/submissions/submission";
import { cn } from "@/lib/utils";
import { adminFetch } from "../admin-api";
import { panel } from "../styles";
import { Camera } from "./camera";

/** How often records kept on the device are sent again. */
const RETRY_MS = 15_000;

type Message = { text: string; error: boolean } | null;

/** The last record scanned and sent, for Undo: still here, stored (with its id), or already there. */
type Last =
  | { label: string; nonce: string; state: "kept" }
  | { label: string; nonce: string; state: "stored"; id: string }
  | { label: string; nonce: string; state: "duplicate" };

const when = (ms: number) => new Date(ms).toLocaleString();
/** The clock counts down (DM-3): an action's time as the match clock showed it. */
const clock = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1_000) % 60).padStart(2, "0")}`;

export function Scanner() {
  const [store, setStore] = useState<ScannerStore | null>(null);
  const [inputs, setInputs] = useState<ScannerInputs | null>(null);
  const [inputsNote, setInputsNote] = useState<string | null>(null);
  const [read, setRead] = useState<
    { ok: true; scanned: ScannedRecord } | { ok: false; message: string } | null
  >(null);
  const [pending, setPending] = useState<ScannedRecord[]>([]);
  const [last, setLast] = useState<Last | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const lastText = useRef<string | null>(null);
  const sending = useRef(false);

  const refresh = useCallback(async (s: ScannerStore) => setPending(await s.pending()), []);

  /** Send what this device holds; say what happened to `just`, the record just sent, if any. */
  const sync = useCallback(
    async (s: ScannerStore, just: Last | null = null) => {
      if (sending.current) return;
      sending.current = true;
      const before = (await s.pending()).length;
      const { results, stopped } = await sendScans(s);
      sending.current = false;
      await refresh(s);
      if (just) {
        const result: SubmissionResult | undefined = results.get(just.nonce);
        if (result?.status === "stored" && result.id) {
          setLast({ label: just.label, nonce: just.nonce, state: "stored", id: result.id });
          setMessage({ text: `Sent ${just.label}.`, error: false });
        } else if (result?.status === "duplicate") {
          setLast({ label: just.label, nonce: just.nonce, state: "duplicate" });
          setMessage({
            text: `${just.label} was not stored again: the server already had it, or an admin deleted it.`,
            error: false,
          });
        } else if (result?.status === "invalid") {
          setMessage({ text: `The server refused ${just.label}: ${result.message}`, error: true });
        } else if (stopped?.offline) {
          setMessage({
            text: `No connection: ${just.label} is kept on this device and is sent when the connection returns.`,
            error: false,
          });
        } else if (stopped) {
          setMessage({
            text:
              stopped.status === 401
                ? "Your admin session has ended. Sign in again; the records stay on this device."
                : `${just.label} is kept on this device. ${stopped.message}`,
            error: true,
          });
        }
      } else if (before > 0 && results.size > 0) {
        const sent = [...results.values()].filter((r) => r.status !== "invalid").length;
        if (sent > 0)
          setMessage({
            text:
              sent === 1
                ? "Sent 1 record kept on this device."
                : `Sent ${sent} records kept on this device.`,
            error: false,
          });
      }
    },
    [refresh],
  );

  useEffect(() => {
    registerServiceWorker();
    keepPage();
    let live = true;
    void browserScannerStore().then(async (s) => {
      if (!live) return;
      setStore(s);
      await refresh(s);
      const reply = await call<Omit<ScannerInputs, "savedAt">>("/api/admin/scanner");
      if (reply.ok) {
        const fresh = { ...reply.value, savedAt: Date.now() };
        await s.putInputs(fresh).catch(() => undefined);
        setInputs(fresh);
      } else {
        const kept = await s.inputs().catch(() => null);
        setInputs(kept);
        setInputsNote(
          kept
            ? `${reply.offline ? "No connection" : reply.message}: reading codes with the events and configuration kept from ${when(kept.savedAt)}.`
            : `${reply.offline ? "No connection" : reply.message}. Open this page once online, so it can read codes.`,
        );
      }
      await sync(s);
    });
    return () => {
      live = false;
    };
  }, [refresh, sync]);

  // OF-4: send again when the connection returns, and every little while.
  useEffect(() => {
    if (!store) return;
    const again = () => void sync(store);
    window.addEventListener("online", again);
    const timer = setInterval(again, RETRY_MS);
    return () => {
      window.removeEventListener("online", again);
      clearInterval(timer);
    };
  }, [store, sync]);

  const onCode = useCallback(
    (text: string, from: "camera" | "photo") => {
      if (!inputs) return;
      // The camera sees the same code many times a second: read it once. A photo is deliberate.
      if (from === "camera" && text === lastText.current) return;
      lastText.current = text;
      setMessage(null);
      setRead(readCode(text, inputs, Date.now()));
    },
    [inputs],
  );

  const send = async () => {
    if (!store || !read?.ok) return;
    const { scanned } = read;
    const just: Last = {
      label: describe(scanned.record),
      nonce: scanned.record.nonce,
      state: "kept",
    };
    await store.put(scanned);
    setRead(null);
    setLast(just);
    await refresh(store);
    await sync(store, just);
  };

  const undo = async () => {
    if (!store || !last) return;
    if (last.state === "kept") {
      await store.remove([last.nonce]);
      await refresh(store);
      setMessage({ text: `Undone: ${last.label} will not be sent.`, error: false });
    } else if (last.state === "duplicate") {
      setMessage({
        text: `Nothing to undo: this scan of ${last.label} stored nothing.`,
        error: false,
      });
    } else {
      if (!window.confirm(`Delete ${last.label} from the server? Analysis stops using it at once.`))
        return;
      const reply = await adminFetch(`/api/admin/performances/${last.id}`, undefined, "DELETE");
      if (!reply.ok) {
        setMessage({
          text:
            reply.status === 0
              ? `No connection: ${last.label} can be deleted once the connection returns.`
              : reply.message,
          error: true,
        });
        return;
      }
      setMessage({ text: `Undone: deleted ${last.label} from the server.`, error: false });
    }
    setLast(null);
    lastText.current = null; // the same code may be scanned again
  };

  const discard = async (r: ScannedRecord) => {
    if (!store) return;
    if (!window.confirm(`Discard ${describe(r.record)}? It is not on the server, so it is lost.`))
      return;
    await store.remove([r.record.nonce]);
    await refresh(store);
    if (last?.nonce === r.record.nonce) setLast(null);
  };

  return (
    <>
      {inputsNote && (
        <p
          role="status"
          className="bg-muted rounded-md border-l-4 border-l-amber-500 px-3 py-2 text-sm"
        >
          {inputsNote}
        </p>
      )}
      {store && !store.durable && (
        <p className="text-destructive text-sm">
          This browser won’t keep records on the device, so a reload loses any not sent. Use a
          normal (not private) window.
        </p>
      )}

      <section aria-labelledby="scan-heading" className={panel}>
        <h2 id="scan-heading" className="text-xl font-semibold">
          Scan
        </h2>
        <Camera onCode={onCode} />
      </section>

      <p role="status" className={cn("min-h-6", message?.error && "text-destructive")}>
        {message?.text}
      </p>

      {read && !read.ok && (
        <p role="alert" className="text-destructive">
          {read.message}
        </p>
      )}
      {read?.ok && (
        <ScannedView scanned={read.scanned} onSend={send} onDiscard={() => setRead(null)} />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!last} onClick={() => void undo()}>
          {last ? `Undo last scan (${last.label})` : "Undo last scan"}
        </Button>
      </div>

      <section aria-labelledby="pending-heading" className={panel}>
        <h2 id="pending-heading" className="text-xl font-semibold">
          Not sent
        </h2>
        <p data-testid="pending-count">
          {pending.length === 0
            ? "Every record scanned here is on the server."
            : pending.length === 1
              ? "1 record not sent."
              : `${pending.length} records not sent.`}
        </p>
        {pending.length > 0 && (
          <>
            <ul aria-label="Records not sent" className="flex flex-col gap-2">
              {pending.map((r) => (
                <li key={r.record.nonce} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{describe(r.record)}</span>
                  <span className="text-muted-foreground text-sm">{r.eventCode}</span>
                  {r.problem && <span className="text-destructive text-sm">{r.problem}</span>}
                  <Button size="sm" variant="outline" onClick={() => void discard(r)}>
                    Discard
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button variant="outline" onClick={() => store && void sync(store)}>
                Send now
              </Button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

/** AD-19: what a code holds, to check before sending. A scanned record names no scouter (DV-5). */
function ScannedView({
  scanned,
  onSend,
  onDiscard,
}: {
  scanned: ScannedRecord;
  onSend: () => Promise<void>;
  onDiscard: () => void;
}) {
  const r = scanned.record;
  return (
    <section aria-label="Scanned record" className={panel}>
      <p className="text-2xl font-semibold">{describe(r)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Event</dt>
        <dd>{scanned.eventCode}</dd>
        <dt className="text-muted-foreground">Submitted</dt>
        <dd>{when(r.submittedAt)}</dd>
        <dt className="text-muted-foreground">Covers</dt>
        <dd>{r.coverage === "partial" ? "Part of the match" : "The whole match"}</dd>
        <dt className="text-muted-foreground">Version</dt>
        <dd>{r.clientVersion}</dd>
      </dl>
      <details>
        <summary className="cursor-pointer text-sm">
          {r.actions.length === 1 ? "1 action" : `${r.actions.length} actions`}
        </summary>
        <ol aria-label="Actions" className="list-decimal pt-2 pl-6 text-sm">
          {r.actions.map((a, i) => (
            <li key={i}>
              {a.id} <span className="text-muted-foreground">{clock(a.ts)}</span>
            </li>
          ))}
        </ol>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void onSend()}>Send</Button>
        <Button variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}
