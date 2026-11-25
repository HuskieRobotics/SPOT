"use client";

/**
 * A match's QR code, full screen (SC-41, OF-2, #358): shown when a match could not be sent, and
 * from the pending list. An admin scans it on the QR scanner page (Phase 4); the record stays on
 * the device either way, and the server keeps one copy whichever arrives first (DV-18).
 *
 * The code is black on white in either theme, so a scanner reads it in a dark stand.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { encodePerformance, QrError } from "@/qr/codec";
import { qrLayout } from "@/qr/layout";
import { qrSvg } from "@/qr/render";
import type { CachedConfig } from "@/scouter/device";
import { matchText, toSubmission } from "@/scouter/match";
import type { PendingRecord } from "@/scouter/records";

type Drawn = { svg: string } | { error: string };

async function draw(record: PendingRecord, config: CachedConfig | null): Promise<Drawn> {
  if (record.eventId === null)
    return {
      error:
        "This match was scouted before the device knew its event, so it has no QR code. It is sent when the device connects.",
    };
  if (!config || config.version !== record.configVersion)
    return {
      error:
        "The scouting configuration this match used is no longer on this device, so it has no QR code. It is sent when the device connects.",
    };
  try {
    const text = encodePerformance(
      { ...toSubmission(record), eventId: record.eventId },
      qrLayout(config.config),
    );
    return { svg: await qrSvg(text) };
  } catch (error) {
    return {
      error: error instanceof QrError ? error.message : "This match cannot be drawn as a QR code.",
    };
  }
}

export function QrSheet({
  record,
  config,
  message,
  onDismiss,
}: {
  record: PendingRecord;
  config: CachedConfig | null;
  /** Why the code is shown, such as "No connection". */
  message?: string | null;
  onDismiss(): void;
}) {
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  useEffect(() => {
    let cancelled = false;
    void draw(record, config).then((d) => !cancelled && setDrawn(d));
    return () => {
      cancelled = true;
    };
  }, [record, config]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Match QR code"
      className="bg-background fixed inset-0 z-50 flex flex-col items-center gap-2 overflow-y-auto p-3 landscape:flex-row landscape:justify-center landscape:gap-6"
      onClick={onDismiss}
    >
      {drawn && "svg" in drawn && (
        <div
          data-testid="match-qr"
          className="aspect-square h-auto w-full max-w-[min(100%,calc(100dvh-1.5rem))] shrink-0 rounded bg-white p-1 landscape:h-[calc(100dvh-1.5rem)] landscape:w-auto [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: drawn.svg }}
        />
      )}
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <p className="text-lg font-semibold">{matchText(record)}</p>
        {message && <p className="text-sm">{message}</p>}
        {drawn && "error" in drawn && (
          <p role="alert" className="text-destructive text-sm">
            {drawn.error}
          </p>
        )}
        <Button size="lg" onClick={onDismiss}>
          Tap to dismiss
        </Button>
      </div>
    </div>
  );
}
