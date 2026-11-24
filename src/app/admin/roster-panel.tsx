"use client";

/**
 * The roster (SEC-6, SEC-6a): everyone devices sign in from, searchable, with a way to correct a
 * name a student misspelled when adding themselves. Only the roster changes; scouting records
 * hold the student ID, so none is rewritten.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RosterEntry } from "./admin-api";
import { field, panel } from "./styles";

interface Props {
  roster: RosterEntry[];
  rename: (entry: RosterEntry, name: string) => Promise<boolean>;
  /** Read the roster again when the panel opens. */
  onOpen: () => void;
}

export function RosterPanel({ roster, rename, onOpen }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const q = search.trim().toLowerCase();
  const shown = roster.filter(
    (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
  );

  return (
    <section aria-labelledby="roster-heading" className={panel}>
      <details onToggle={(e) => e.currentTarget.open && onOpen()}>
        <summary className="cursor-pointer">
          <h2 id="roster-heading" className="inline text-xl font-semibold">
            Roster ({roster.length})
          </h2>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Scouters add themselves when they first sign in. Correct a misspelled name here; every
            device shows it the next time it reads the roster.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Find a scouter
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              className={field}
            />
          </label>
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto" aria-label="Roster">
            {shown.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-1">
                {editing === s.id ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await rename(s, name)) setEditing(null);
                    }}
                  >
                    <label className="flex flex-col gap-1 text-sm">
                      {`New name for ${s.id}`}
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="off"
                        required
                        className={field}
                      />
                    </label>
                    <Button type="submit" size="sm" disabled={name.trim().length < 2}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-xs">ID {s.id}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Correct the name of ${s.name}`}
                      onClick={() => {
                        setName(s.name);
                        setEditing(s.id);
                      }}
                    >
                      Correct name
                    </Button>
                  </>
                )}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="text-muted-foreground text-sm">
                {roster.length === 0 ? "No one has signed in yet." : "No one matches."}
              </li>
            )}
          </ul>
        </div>
      </details>
    </section>
  );
}
