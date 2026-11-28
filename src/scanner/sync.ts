/**
 * Sending scanned records (#411; AD-20, AD-21, OF-4): every record the scanner holds goes to
 * `/api/admin/scanned`, oldest first, in batches. A record leaves the device once the server has
 * it, stored or already there; one the server refuses stays, with the reason, for an admin to read
 * or discard. With no connection nothing is lost: the page sends again when it returns.
 */
import { call, type Reply } from "@/scouter/api";
import { MAX_SUBMISSIONS, type SubmissionResult } from "@/submissions/submission";
import type { ScannerStore } from "./store";

export interface SendOutcome {
  /** What the server said about each record it was sent, by nonce. */
  results: Map<string, SubmissionResult>;
  /** Why sending stopped before the end: no connection, or the server refused the request. */
  stopped: Exclude<Reply<unknown>, { ok: true }> | null;
}

export async function sendScans(
  store: ScannerStore,
  fetchImpl: typeof fetch = fetch,
): Promise<SendOutcome> {
  const results = new Map<string, SubmissionResult>();
  const pending = await store.pending();
  for (let i = 0; i < pending.length; i += MAX_SUBMISSIONS) {
    const batch = pending.slice(i, i + MAX_SUBMISSIONS);
    const reply = await call<{ results: SubmissionResult[] }>(
      "/api/admin/scanned",
      {
        method: "POST",
        body: JSON.stringify({
          records: batch.map((r) => ({ eventId: r.eventId, ...r.record })),
        }),
      },
      fetchImpl,
    );
    if (!reply.ok) return { results, stopped: reply };
    const done: string[] = [];
    for (const [j, result] of reply.value.results.entries()) {
      const nonce = batch[j].record.nonce;
      results.set(nonce, result);
      if (result.status === "invalid") await store.setProblem(nonce, result.message ?? null);
      else done.push(nonce);
    }
    await store.remove(done);
  }
  return { results, stopped: null };
}
