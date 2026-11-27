"use client";

/**
 * An event's records (#410; AD-10 to AD-15): filters, and each record with its flag, its actions,
 * and the admin's edits. Every edit is confirmed by the server and then the list is read again,
 * because deleting or promoting one record changes which of its robot's others counts.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Action, SpotEvent } from "@/data/types";
import {
  actionCounts,
  filterRows,
  NO_FILTERS,
  SOURCE_LABELS,
  type EditFilters,
  type EditRow,
} from "@/edit/records";
import { cn } from "@/lib/utils";
import { adminFetch } from "../admin-api";
import { field, panel } from "../styles";

interface Listing {
  event: { _id: string; code: string };
  rows: EditRow[];
}

type Message = { text: string; error: boolean } | null;

const MAX_REASON = 300;

const FILTERS: { key: keyof EditFilters; label: string; placeholder: string; numeric?: true }[] = [
  { key: "scouter", label: "Scouter", placeholder: "Name or student ID" },
  { key: "match", label: "Match", placeholder: "12", numeric: true },
  { key: "team", label: "Team", placeholder: "3061" },
];

/** "Qual 12, team 3061", as a row is named in messages and confirmations. */
const named = (r: EditRow) => `${r.match}, team ${r.team}`;
const scouterOf = (r: EditRow) => r.scouterName ?? r.scouterId ?? "no scouter";
const when = (ms: number) =>
  new Date(ms).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function EditRecords() {
  const [events, setEvents] = useState<SpotEvent[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [filters, setFilters] = useState<EditFilters>(NO_FILTERS);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const load = useCallback(
    (eventId?: string) =>
      adminFetch<Listing>(
        `/api/admin/performances${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`,
      ).then((reply) => {
        if (reply.ok) setListing(reply.value);
        else setMessage({ text: reply.message, error: true });
        return reply.ok;
      }),
    [],
  );

  useEffect(() => {
    void adminFetch<SpotEvent[]>("/api/admin/events").then((reply) => {
      if (reply.ok) setEvents(reply.value);
    });
    void load();
  }, [load]);

  /** Run an edit, say what happened, and read the list again. */
  const edit = async (
    row: EditRow,
    request: () => ReturnType<typeof adminFetch>,
    done: string,
  ): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    const reply = await request();
    if (reply.ok) setMessage({ text: `${done} ${named(row)}.`, error: false });
    else setMessage({ text: reply.message, error: true });
    if (listing) await load(listing.event._id);
    setBusy(false);
    return reply.ok;
  };

  const path = (row: EditRow) => `/api/admin/performances/${row.id}`;
  const actions = {
    flag: (row: EditRow, reason: string) =>
      edit(row, () => adminFetch(path(row), { action: "flag", reason }), "Flagged"),
    unflag: (row: EditRow) =>
      edit(row, () => adminFetch(path(row), { action: "unflag" }), "Cleared the flag on"),
    promote: (row: EditRow) =>
      edit(row, () => adminFetch(path(row), { action: "promote" }), "Analysis now uses"),
    remove: (row: EditRow) => {
      const ok = window.confirm(
        `Delete ${named(row)}, scouted by ${scouterOf(row)}? Analysis stops using it at once.`,
      );
      if (!ok) return Promise.resolve(false);
      return edit(row, () => adminFetch(path(row), undefined, "DELETE"), "Deleted");
    },
  };

  const rows = listing ? filterRows(listing.rows, filters) : [];

  return (
    <>
      <section aria-label="Choose records" className={panel}>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-event`} className="font-medium">
            Event
          </label>
          <select
            id={`${id}-event`}
            className={field}
            value={listing?.event._id ?? ""}
            onChange={(e) => {
              setMessage(null);
              void load(e.target.value);
            }}
          >
            {!listing && <option value="">Loading…</option>}
            {events.map((e) => (
              <option key={e._id} value={e._id}>
                {e.code}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {FILTERS.map(({ key, label, placeholder, numeric }) => (
            <div key={key} className="flex flex-col gap-1 text-sm">
              <label htmlFor={`${id}-${key}`}>{label}</label>
              <input
                id={`${id}-${key}`}
                className={field}
                value={filters[key]}
                onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                inputMode={numeric ? "numeric" : undefined}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </section>

      <p role="status" className={cn("min-h-6", message?.error && "text-destructive")}>
        {message?.text}
      </p>

      {listing && (
        <p data-testid="record-count" className="text-muted-foreground text-sm">
          {rows.length === listing.rows.length
            ? `${rows.length} records at ${listing.event.code}, newest first.`
            : `${rows.length} of ${listing.rows.length} records at ${listing.event.code}.`}
        </p>
      )}

      <ul aria-label="Records" className="flex flex-col gap-3">
        {rows.map((row) => (
          <RecordItem key={row.id} row={row} busy={busy} actions={actions} />
        ))}
      </ul>
    </>
  );
}

interface RecordActions {
  flag: (row: EditRow, reason: string) => Promise<boolean>;
  unflag: (row: EditRow) => Promise<boolean>;
  promote: (row: EditRow) => Promise<boolean>;
  remove: (row: EditRow) => Promise<boolean>;
}

function RecordItem({
  row,
  busy,
  actions,
}: {
  row: EditRow;
  busy: boolean;
  actions: RecordActions;
}) {
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const id = useId();
  const notes = [
    row.source !== "app" && SOURCE_LABELS[row.source],
    row.coverage === "partial" && "Covers part of the match",
    row.superseded && "Replaced by another record for this robot: analysis does not use it",
  ].filter(Boolean);

  return (
    <li
      aria-label={named(row)}
      className={cn(
        "bg-card flex flex-col gap-2 rounded-lg border border-l-4 p-3",
        row.alliance === "red" && "border-l-alliance-red",
        row.alliance === "blue" && "border-l-alliance-blue",
        row.superseded && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-semibold">
          {row.match} · {row.team}
        </span>
        {row.alliance && (
          <span className="text-muted-foreground text-sm">
            {row.alliance === "red" ? "Red" : "Blue"}
          </span>
        )}
        <span>{scouterOf(row)}</span>
        <span className="text-muted-foreground text-sm">{when(row.submittedAt)}</span>
      </div>
      {notes.length > 0 && <p className="text-muted-foreground text-sm">{notes.join(" · ")}</p>}
      {row.flag.flagged && (
        <p className="rounded-md border-l-4 border-l-amber-500 bg-amber-500/10 px-2 py-1 text-sm">
          <span className="font-medium">
            {row.flag.source === "machine" ? "Flagged automatically" : "Flagged by an admin"}
          </span>
          {row.flag.reason ? `: ${row.flag.reason}` : "."}
        </p>
      )}

      {flagging ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void actions.flag(row, reason).then((ok) => ok && setFlagging(false));
          }}
        >
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={`${id}-reason`}>
              Why it needs review (optional). Anyone can read this, so don’t name a scouter.
            </label>
            <input
              id={`${id}-reason`}
              className={field}
              value={reason}
              maxLength={MAX_REASON}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Flag for review
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setFlagging(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {row.flag.flagged ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => actions.unflag(row)}>
              Clear flag
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setFlagging(true)}>
              Flag
            </Button>
          )}
          {row.superseded && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => actions.promote(row)}
            >
              Use this record
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => actions.remove(row)}
          >
            Delete
          </Button>
        </div>
      )}

      <Actions row={row} />
    </li>
  );
}

/** AD-13: the record's actions in order, then a count of each; read when first opened. */
function Actions({ row }: { row: EditRow }) {
  const [actions, setActions] = useState<Action[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details
      onToggle={(e) => {
        if (!e.currentTarget.open || actions) return;
        void adminFetch<{ actions: Action[] }>(`/api/admin/performances/${row.id}`).then((reply) =>
          reply.ok ? setActions(reply.value.actions) : setError(reply.message),
        );
      }}
    >
      <summary className="cursor-pointer text-sm">
        {row.actionCount === 1 ? "1 action" : `${row.actionCount} actions`}
      </summary>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {actions && actions.length === 0 && (
        <p className="text-muted-foreground text-sm">No actions recorded.</p>
      )}
      {actions && actions.length > 0 && (
        <div className="grid gap-3 pt-2 text-sm sm:grid-cols-2">
          <ol aria-label="Actions in order" className="list-decimal pl-6">
            {actions.map((a, i) => (
              <li key={i}>{a.id}</li>
            ))}
          </ol>
          <ul aria-label="Count of each action">
            {actionCounts(actions).map(([id, count]) => (
              <li key={id}>
                {id}: {count}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
