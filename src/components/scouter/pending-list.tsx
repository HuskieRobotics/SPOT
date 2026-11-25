"use client";

/**
 * The matches on this device the server does not have yet (OF-2, BL-93): each with when it was
 * submitted, why it was refused if it was, and its QR code; and a button to send them now.
 */
import { Button } from "@/components/ui/button";
import { matchText } from "@/scouter/match";
import type { PendingRecord } from "@/scouter/records";

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function PendingList({
  records,
  sending,
  durable,
  onSend,
  onShowQr,
}: {
  records: readonly PendingRecord[];
  sending: boolean;
  /** False when the browser refused IndexedDB, and a reload would lose them. */
  durable: boolean;
  onSend(): void;
  onShowQr(record: PendingRecord): void;
}) {
  if (records.length === 0) return null;
  const count = `${records.length} ${records.length === 1 ? "match" : "matches"}`;
  return (
    <section
      aria-labelledby="pending-title"
      className="flex w-full max-w-md flex-col gap-2 rounded-lg border p-3 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="pending-title" className="text-sm font-semibold" data-testid="unsent">
          Not sent yet: {count}
        </h2>
        <Button size="sm" variant="outline" disabled={sending} onClick={onSend}>
          {sending ? "Sending…" : "Send now"}
        </Button>
      </div>
      {!durable && (
        <p role="alert" className="text-destructive text-xs">
          This browser will not keep them if the page reloads. Send them, or show their QR codes to
          an admin, before reloading.
        </p>
      )}
      <ul aria-label="Matches not sent" className="flex flex-col divide-y">
        {records.map((r) => (
          <li key={r.nonce} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 text-sm">
              <span className="font-medium">{matchText(r)}</span>
              <span className="text-muted-foreground"> · {time(r.submittedAt)}</span>
              {r.problem && <span className="text-destructive block text-xs">{r.problem}</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onShowQr(r)}>
              QR code
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
