"use client";

/**
 * Signing in on a scouting device (SEC-2, SEC-6, SEC-7, RT-26, #356): the join code once per
 * device, typed or from the admin page's QR code; then a name from the roster, searchable, or
 * "I'm not on the list". Works offline from the roster the device last read (OF-1). The
 * scouting client (#359) shows it on its landing page and takes over once someone signs in.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { httpApi } from "@/scouter/api";
import type { DeviceStore, SignedIn } from "@/scouter/device";
import { refreshRoster, refreshSchedule, sendPendingScouters, signIn } from "@/scouter/sign-in";

type Phase = "join" | "pick" | "add";

interface Message {
  text: string;
  error?: boolean;
}

const input = "bg-background w-full rounded-md border px-3 py-2";

export function SignInScreen({
  store,
  onSignedIn,
  askForJoinCode = false,
}: {
  store: DeviceStore;
  /** Signed in; `note` says when it was on this device only, with no connection. */
  onSignedIn(who: SignedIn, note?: string): void;
  /** Start at the join code even if the device has one (the menu's "Change join code"). */
  askForJoinCode?: boolean;
}) {
  const api = useMemo(() => httpApi(), []);
  const [phase, setPhase] = useState<Phase>(() =>
    store.joinCode() && !askForJoinCode ? "pick" : "join",
  );
  const [code, setCode] = useState(() => store.joinCode() ?? "");
  const [search, setSearch] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [, rerender] = useState(0);

  // Read the roster and send any scouters added offline; say so if the server cannot be reached.
  // The schedule comes too, for a match typed with no connection later (OF-1).
  async function loadRoster(): Promise<boolean> {
    const notices = await sendPendingScouters(store, api);
    const result = await refreshRoster(store, api);
    if (result.ok) await refreshSchedule(store, api);
    rerender((n) => n + 1);
    if (!result.ok && result.error === "join-code") {
      setMessage({ text: result.message ?? "Enter the join code.", error: true });
      setPhase("join");
      return false;
    }
    if (!result.ok && result.offline)
      setMessage({ text: "No connection: showing the roster this device last read." });
    else if (!result.ok) setMessage({ text: result.message ?? "", error: true });
    else if (notices.length > 0)
      setMessage({ text: notices.map((n) => n.message).join(" "), error: true });
    return true;
  }

  useEffect(() => {
    // In a callback, not the effect's body: it sets state when the server answers.
    if (phase === "pick") void Promise.resolve().then(loadRoster);
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    store.setJoinCode(code);
    setBusy(true);
    setMessage(null);
    if (await loadRoster()) setPhase("pick");
    setBusy(false);
  }

  async function choose(who: { id: string; name: string; added?: boolean }) {
    setBusy(true);
    setMessage(null);
    const outcome = await signIn(store, api, who);
    setBusy(false);
    if (outcome.status === "join-code") {
      setMessage({ text: outcome.message, error: true });
      setPhase("join");
    } else if (outcome.status === "refused") setMessage({ text: outcome.message, error: true });
    else
      onSignedIn(
        store.signedIn()!,
        outcome.status === "offline"
          ? "No connection: you are signed in on this device. You will be assigned a robot when the connection returns."
          : undefined,
      );
  }

  async function addSelf(event: React.FormEvent) {
    event.preventDefault();
    await choose({ id: newId.trim(), name: newName.trim(), added: true });
  }

  const status = message && (
    <p role="status" className={cn("text-sm", message.error && "text-destructive")}>
      {message.text}
    </p>
  );

  if (phase === "join")
    return (
      <form onSubmit={submitCode} className="flex w-full max-w-sm flex-col gap-3">
        <label htmlFor="join-code" className="font-medium">
          Join code
        </label>
        <p className="text-muted-foreground text-sm">
          The six letters and digits an admin shows at the event, or scan the admin page&apos;s QR
          code. You enter it once on this device.
        </p>
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          className={cn(input, "font-mono text-lg tracking-widest uppercase")}
        />
        <Button type="submit" disabled={busy || code.trim() === ""}>
          Continue
        </Button>
        {status}
      </form>
    );

  if (phase === "add")
    return (
      <form onSubmit={addSelf} className="flex w-full max-w-sm flex-col gap-3">
        <h2 className="text-xl font-semibold">Add yourself</h2>
        <label className="flex flex-col gap-1 text-sm">
          Student ID
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            inputMode="text"
            autoComplete="off"
            required
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="name"
            required
            className={input}
          />
        </label>
        <Button type="submit" disabled={busy || newId.trim() === "" || newName.trim().length < 2}>
          Sign in
        </Button>
        <Button type="button" variant="ghost" onClick={() => setPhase("pick")}>
          Back to the list
        </Button>
        {status}
      </form>
    );

  const list = store
    .pickList()
    .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="find-name" className="font-medium">
        Find your name
      </label>
      <input
        id="find-name"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
        className={input}
      />
      {status}
      <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto" aria-label="Roster">
        {list.map((s) => (
          <li key={s.id}>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={busy}
              onClick={() => choose(s)}
            >
              {s.name}
              {s.pending && (
                <span className="text-muted-foreground ml-2 text-xs">(added here)</span>
              )}
            </Button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-muted-foreground text-sm">No one on the roster matches.</li>
        )}
      </ul>
      <Button variant="ghost" onClick={() => setPhase("add")}>
        I&apos;m not on the list
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setMessage(null);
          setPhase("join");
        }}
      >
        Change the join code
      </Button>
    </div>
  );
}
