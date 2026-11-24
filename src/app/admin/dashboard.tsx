"use client";

/**
 * The admin page's body (#357). It polls the settings and the registry every 2.5 s (AD-4, NF-5,
 * RT-14c), so what one admin changes shows in every admin's view within seconds (BL-33, RT-14b).
 * The schedule, the event list and the roster change rarely and are read every 30 s and after
 * each change made here.
 */
import { useCallback, useEffect, useState } from "react";
import type { MatchRef, SpotEvent } from "@/data/types";
import { cn } from "@/lib/utils";
import type { ScheduleView } from "@/schedule/service";
import type { AdminEntry, AdminSnapshot } from "@/sessions/runtime";
import { adminFetch, type RosterEntry, type SettingsView } from "./admin-api";
import { EventPanel } from "./event-panel";
import { MatchPanel } from "./match-panel";
import { RosterPanel } from "./roster-panel";
import { ScouterPanel } from "./scouter-panel";

export const POLL_MS = 2_500;
export const SLOW_POLL_MS = 30_000;

interface Notice {
  text: string;
  error?: boolean;
}

export function AdminDashboard() {
  const [overview, setOverview] = useState<SettingsView | null>(null);
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [events, setEvents] = useState<SpotEvent[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const [s, r] = await Promise.all([
      adminFetch<SettingsView>("/api/admin/settings"),
      adminFetch<{ snapshot: AdminSnapshot | null }>("/api/admin/registry"),
    ]);
    if (s.ok) setOverview(s.value);
    if (r.ok) setSnapshot(r.value.snapshot);
    const failed = !s.ok ? s : !r.ok ? r : null;
    setTrouble(failed ? failed.message : null);
  }, []);

  const loadRoster = useCallback(async () => {
    const r = await adminFetch<{ scouters: RosterEntry[] }>("/api/admin/scouters");
    if (r.ok) setRoster(r.value.scouters);
  }, []);

  const loadSlow = useCallback(async () => {
    const [e, s] = await Promise.all([
      adminFetch<SpotEvent[]>("/api/admin/events"),
      adminFetch<{ schedule: ScheduleView }>("/api/admin/schedule"),
      loadRoster(),
    ]);
    if (e.ok) setEvents(e.value);
    if (s.ok) {
      setSchedule(s.value.schedule);
      setScheduleError(null);
    } else {
      setSchedule(null);
      // 409: no event is active, which the event panel already says.
      setScheduleError(s.status === 409 ? null : s.message);
    }
  }, [loadRoster]);

  useEffect(() => {
    // In callbacks, not the effect's body: they set state when the server answers.
    void Promise.resolve().then(poll);
    const fast = setInterval(poll, POLL_MS);
    const slow = setInterval(loadSlow, SLOW_POLL_MS);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [poll, loadSlow]);

  // A new active event, chosen here or by another admin, has its own schedule.
  const activeEventId = overview?.settings.activeEventId;
  useEffect(() => {
    void Promise.resolve().then(loadSlow);
  }, [activeEventId, loadSlow]);

  // Someone who added themselves at sign-in (SEC-7) belongs on the roster at once.
  const rosterLacksSomeone =
    snapshot?.entries.some((e) => !roster.some((s) => s.id === e.scouterId)) ?? false;
  useEffect(() => {
    if (rosterLacksSomeone) void Promise.resolve().then(loadRoster);
  }, [rosterLacksSomeone, loadRoster]);

  /** Make a change; show its result or the server's message. */
  async function act<T extends object>(
    path: string,
    body: object,
    success?: string,
  ): Promise<boolean> {
    const r = await adminFetch<T>(path, body);
    if (!r.ok) {
      setNotice({ text: r.message, error: true });
      return false;
    }
    const value = r.value as Partial<SettingsView> & { snapshot?: AdminSnapshot | null };
    if ("snapshot" in value) setSnapshot(value.snapshot ?? null);
    if (value.settings) setOverview(value as SettingsView);
    setNotice(success ? { text: success } : null);
    return true;
  }

  const registry = (body: object, success?: string) => act("/api/admin/registry", body, success);
  const settings = (body: object, success?: string) => act("/api/admin/settings", body, success);

  if (!overview) return trouble ? <p className="text-destructive">{trouble}</p> : <p>Loading…</p>;
  const event = overview.event;

  return (
    <div className="flex flex-col gap-4">
      {trouble && <p className="text-destructive text-sm font-medium">{trouble}</p>}
      <p
        role="status"
        className={cn("min-h-5 text-sm", notice?.error && "text-destructive font-medium")}
      >
        {notice?.text}
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <EventPanel
          event={event}
          events={events}
          signedIn={snapshot?.entries.length ?? 0}
          choose={(code) =>
            settings(
              { activeEvent: code },
              code ? `${code} is the active event.` : "No event is active.",
            )
          }
          create={async (tbaKey, label) => {
            const r = await adminFetch<SpotEvent>("/api/admin/events", { tbaKey, label });
            if (!r.ok) {
              setNotice({ text: r.message, error: true });
              return false;
            }
            const made = await settings(
              { activeEvent: r.value.code },
              `Created ${r.value.code}; it is the active event.`,
            );
            await loadSlow();
            return made;
          }}
          rotate={async (e) => {
            const r = await adminFetch(`/api/admin/events/${e._id}/join-code`, {});
            if (!r.ok) {
              setNotice({ text: r.message, error: true });
              return false;
            }
            setNotice({ text: "A new join code is ready. Show it to scouters." });
            await poll();
            return true;
          }}
        />
        {event && (
          <MatchPanel
            snapshot={snapshot}
            schedule={schedule}
            scheduleError={scheduleError}
            settings={overview.settings}
            setMatch={(match: MatchRef | null, label: string) =>
              registry(
                { action: "set-match", match },
                match ? `${label} is the current match.` : "No match is chosen.",
              )
            }
            start={() =>
              registry({ action: "start" }, "Sent in the scouters waiting on the match.")
            }
            setSettings={(change) => settings(change, "Saved.")}
          />
        )}
      </div>
      {event && (
        <ScouterPanel
          snapshot={snapshot}
          release={(e: AdminEntry, to: AdminEntry | null) =>
            registry(
              { action: "release", scouterId: e.scouterId, ...(to ? { to: to.scouterId } : {}) },
              `Released Team ${e.team} from ${e.name}${to ? ` to ${to.name}` : ""}.`,
            )
          }
          remove={(e: AdminEntry) =>
            registry(
              { action: "remove", scouterId: e.scouterId },
              `${e.connected ? "Signed out" : "Removed"} ${e.name}.`,
            )
          }
        />
      )}
      <RosterPanel
        roster={roster}
        onOpen={loadRoster}
        rename={async (s, name) => {
          const ok = await act(
            "/api/admin/scouters",
            { action: "rename", scouterId: s.id, name },
            `Student ID ${s.id} is now ${name.trim().replace(/\s+/g, " ")}.`,
          );
          if (ok) await Promise.all([loadRoster(), poll()]);
          return ok;
        }}
      />
    </div>
  );
}
