"use client";

/**
 * What the dashboard says about its own data (#383): TBA's status (AN-7, AN-9, NF-6), and the
 * problems config:check finds in the season's analysis files and the pipeline meets as it runs
 * (TR-10), for an admin to fix. A problem never hides the dashboard: a bad entry is skipped.
 */
import type { Kept, LoadedEvent } from "./data";

/**
 * OF-3, OF-7 (#390): the event shown is a copy kept on this device, from when, and why the
 * server's answer is not shown.
 */
export function KeptNotice({ kept }: { kept: Kept | null }) {
  if (!kept) return null;
  const when = new Date(kept.savedAt).toLocaleString();
  return (
    <p
      role="status"
      data-testid="kept-notice"
      className="bg-muted rounded-md border-l-4 border-l-amber-500 px-3 py-2 text-sm font-medium"
    >
      {kept.reason === null
        ? `Offline, showing data from ${when}.`
        : `${kept.reason} Showing data from ${when}.`}
    </p>
  );
}

export function TbaNotice({ tba }: { tba: LoadedEvent["tba"] }) {
  if (!tba.error) return null;
  const when = tba.fetchedAt
    ? ` Showing TBA's data from ${new Date(tba.fetchedAt).toLocaleString()}.`
    : " TBA's results and OPRs are left out.";
  return (
    <p role="status" data-testid="tba-notice" className="bg-muted rounded-md px-3 py-2 text-sm">
      {tba.error}
      {when}
    </p>
  );
}

export function Problems({ loaded }: { loaded: LoadedEvent }) {
  const { findings } = loaded;
  const { problems } = loaded.analysis;
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  if (findings.length === 0 && problems.length === 0) return null;
  const counts = [
    errors > 0 && `${errors} ${errors === 1 ? "error" : "errors"}`,
    warnings > 0 && `${warnings} ${warnings === 1 ? "warning" : "warnings"}`,
    problems.length > 0 &&
      `${problems.length} pipeline ${problems.length === 1 ? "entry" : "entries"} with a problem`,
  ].filter(Boolean);
  return (
    <details className="rounded-md border px-3 py-2 text-sm" data-testid="problems">
      <summary className="cursor-pointer font-medium">
        The analysis configuration has {counts.join(", ")}
      </summary>
      <p className="text-muted-foreground mt-2">
        The dashboard skips what it can&apos;t use. An admin can fix these in the season&apos;s
        files; <code>npm run config:check</code> lists them with their lines.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {problems.map((p) => (
          <li key={`p${p.index}`}>
            <span className="font-medium">
              analysis-pipeline.json, entry {p.index + 1} ({p.type} {p.name} → {p.outputPath}):
            </span>{" "}
            {p.message}
            {p.failed && ` (${p.failed.count} of ${p.failed.of}, first ${p.failed.first})`}
          </li>
        ))}
        {findings.map((f, i) => (
          <li key={`f${i}`}>
            <span className="font-medium">
              {f.file}.json{f.line ? `, line ${f.line}` : ""}, {f.where}:
            </span>{" "}
            {f.severity === "warning" ? "(warning) " : ""}
            {f.message}
            {f.hint && <span className="text-muted-foreground"> {f.hint}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
