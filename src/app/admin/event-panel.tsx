"use client";

/**
 * The event (DV-12a, DV-12b, SEC-3, SEC-3b): which event is active, chosen by its code; a new
 * one from a TBA key and a label; and its join code as text and as a QR code.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import type { SpotEvent } from "@/data/types";
import { panel, field } from "./styles";

interface Props {
  event: SpotEvent | null;
  events: SpotEvent[];
  /** Whether anyone is signed in to the active event, so a switch asks first. */
  signedIn: number;
  choose: (code: string | null) => Promise<boolean>;
  create: (tbaKey: string, label: string) => Promise<boolean>;
  rotate: (event: SpotEvent) => Promise<boolean>;
}

export function EventPanel({ event, events, signedIn, choose, create, rotate }: Props) {
  return (
    <section aria-labelledby="event-heading" className={panel}>
      <h2 id="event-heading" className="text-xl font-semibold">
        Event
      </h2>
      {event ? (
        <p className="text-2xl font-semibold" aria-label="Active event">
          {event.code}
        </p>
      ) : (
        <p className="text-muted-foreground">
          No event is active. Choose one or create one; scouters sign in to the active event.
        </p>
      )}
      {event && <JoinCode event={event} rotate={rotate} />}
      <ChooseEvent
        key={event?.code ?? ""}
        current={event?.code ?? ""}
        events={events}
        signedIn={signedIn}
        choose={choose}
      />
      <NewEvent create={create} />
    </section>
  );
}

function JoinCode({ event, rotate }: { event: SpotEvent; rotate: Props["rotate"] }) {
  const code = event.joinCode;
  // The link the QR code opens; `/?join=` fills in the code on the sign-in screen (SEC-3b).
  const url = code ? `${window.location.origin}/?join=${code}` : null;
  const [qr, setQr] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    void QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 }).then((svg) => {
      if (live) setQr({ url, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
    });
    return () => {
      live = false;
    };
  }, [url]);

  async function onRotate() {
    const ok = window.confirm(
      code
        ? "Make a new join code? Devices that entered this one must enter the new one, or scan the new QR code, before they can sign in or send records. Nothing on them is lost."
        : "Make a join code for this event?",
    );
    if (ok) await rotate(event);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Join code</h3>
      {code ? (
        <>
          <p className="text-muted-foreground text-sm">
            Scouters type it once per device, or scan the QR code.
          </p>
          <p aria-label="Join code" className="font-mono text-4xl font-semibold tracking-[0.3em]">
            {code}
          </p>
          {qr?.url === url && (
            // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
            <img
              src={qr.src}
              alt={`QR code that opens SPOT with join code ${code}`}
              className="size-48 rounded-md bg-white"
            />
          )}
          <p className="text-muted-foreground text-xs break-all">{url}</p>
        </>
      ) : (
        <p className="text-destructive text-sm">
          This event has no join code, so scouters cannot sign in or send records. Make one.
        </p>
      )}
      <div>
        <Button variant="outline" onClick={onRotate}>
          {code ? "Make a new join code" : "Make a join code"}
        </Button>
      </div>
    </div>
  );
}

function ChooseEvent({
  current,
  events,
  signedIn,
  choose,
}: {
  current: string;
  events: SpotEvent[];
  signedIn: number;
  choose: Props["choose"];
}) {
  const [choice, setChoice] = useState(current);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (choice === current) return;
    const ok =
      signedIn === 0 ||
      window.confirm(
        `${choice ? `Make ${choice} the active event?` : "Make no event active?"} The ${signedIn} scouters signed in are signed out, and sign in again to it.`,
      );
    if (ok) await choose(choice || null);
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Choose an event
        <select value={choice} onChange={(e) => setChoice(e.target.value)} className={field}>
          <option value="">None</option>
          {events.map((e) => (
            <option key={e._id} value={e.code}>
              {e.code}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={choice === current}>
        Make active
      </Button>
    </form>
  );
}

function NewEvent({ create }: { create: Props["create"] }) {
  const [tbaKey, setTbaKey] = useState("");
  const [label, setLabel] = useState("official");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await create(tbaKey.trim(), label.trim())) setTbaKey("");
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">New event</summary>
      <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
        <p className="text-muted-foreground">
          The event&apos;s code is its TBA key and a label, such as 2026mnwi_official. Use another
          label, such as practice, for a second event at the same competition.
        </p>
        <label className="flex flex-col gap-1">
          TBA event key
          <input
            value={tbaKey}
            onChange={(e) => setTbaKey(e.target.value)}
            placeholder="2026mnwi"
            autoComplete="off"
            spellCheck={false}
            required
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            className={field}
          />
        </label>
        <div>
          <Button type="submit" disabled={tbaKey.trim() === "" || label.trim() === ""}>
            Create and make active
          </Button>
        </div>
      </form>
    </details>
  );
}
