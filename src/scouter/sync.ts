/**
 * Sending the device's finished matches to the server (#360; RT-21, RT-28, OF-2, SC-42).
 *
 * A sync sends every record the device still holds, grouped by the event it was scouted at, in
 * batches; the server stores each once by its nonce, so a record whose acknowledgement was lost
 * is simply sent again and answered as a duplicate. A record leaves the device only when the
 * server has it. One refused (a wrong join code, a record the server cannot store) stays, with
 * the server's message beside it in the pending list.
 *
 * The device asks nothing first, unlike v5's `syncData` exchange (RT-20): it holds only what the
 * server has not acknowledged, so asking would save nothing.
 *
 * Syncs run one at a time; asking while one runs queues one more, so a match submitted during a
 * sync is still sent.
 */
import { acknowledged, MAX_SUBMISSIONS } from "@/submissions/submission";
import type { ScouterApi } from "./api";
import { toSubmission } from "./match";
import type { PendingRecord, RecordStore } from "./records";

export interface SyncOutcome {
  /** Records the server now has. */
  sent: number;
  /** Records still on the device. */
  left: number;
  /** The server could not be reached. */
  offline: boolean;
  /** The server's reason for refusing, when it refused. */
  message: string | null;
}

export const NO_JOIN_CODE =
  "Enter the join code in the menu (Change join code) to send these matches. An admin can tell you what it is.";

export interface SyncerOptions {
  records: RecordStore;
  api: Pick<ScouterApi, "submit">;
  joinCode(): string | null;
  /** The records changed: some were sent, or a refusal was noted. */
  onChange?(): void;
  /** A sync started or ended, for a "Sending…" label. */
  onBusy?(busy: boolean): void;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class Syncer {
  private running: Promise<SyncOutcome> | null = null;
  private next: Promise<SyncOutcome> | null = null;

  constructor(private readonly options: SyncerOptions) {}

  /** Send what the device holds. Resolves when this request's records have been tried. */
  sync(): Promise<SyncOutcome> {
    if (this.next) return this.next;
    if (this.running) {
      this.next = this.running.then(() => {
        this.next = null;
        return this.start();
      });
      return this.next;
    }
    return this.start();
  }

  private start(): Promise<SyncOutcome> {
    this.options.onBusy?.(true);
    const run = this.once().finally(() => {
      if (this.running === run) this.running = null;
      if (!this.running) this.options.onBusy?.(false);
    });
    this.running = run;
    return run;
  }

  private async once(): Promise<SyncOutcome> {
    const { records, api, joinCode, onChange } = this.options;
    const pending = await records.all();
    const outcome: SyncOutcome = { sent: 0, left: pending.length, offline: false, message: null };
    if (pending.length === 0) return outcome;
    const code = joinCode();
    if (!code) {
      await this.note(pending, NO_JOIN_CODE);
      return { ...outcome, message: NO_JOIN_CODE };
    }

    const byEvent = new Map<string | null, PendingRecord[]>();
    for (const r of pending) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
    send: for (const [eventId, group] of byEvent) {
      for (const batch of chunks(group, MAX_SUBMISSIONS)) {
        const reply = await api.submit(code, eventId, batch.map(toSubmission));
        if (!reply.ok && reply.offline) {
          outcome.offline = true;
          break send;
        }
        if (!reply.ok) {
          // The whole batch was refused: the join code, or the event is unknown here.
          outcome.message = reply.message;
          await this.note(batch, reply.message);
          continue;
        }
        const results = reply.value.results;
        const gone = batch.filter((r, i) => results[i] && acknowledged(results[i]));
        await records.remove(gone.map((r) => r.nonce));
        outcome.sent += gone.length;
        for (const [i, r] of batch.entries()) {
          const result = results[i];
          if (result && !acknowledged(result)) {
            outcome.message = result.message ?? "The server could not store this match.";
            await records.setProblem(r.nonce, outcome.message);
          }
        }
        if (gone.length > 0) onChange?.();
      }
    }
    outcome.left = (await records.all()).length;
    return outcome;
  }

  private async note(records: readonly PendingRecord[], problem: string) {
    for (const r of records)
      if (r.problem !== problem) await this.options.records.setProblem(r.nonce, problem);
    this.options.onChange?.();
  }
}
