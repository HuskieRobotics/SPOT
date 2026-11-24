/**
 * Where a finding is, in words a student recognizes (#317): a pipeline entry by its number, type,
 * name and output, a button by its layer and id, a phase by its id. Plain keys are joined with
 * dots, and an item of a list without names is "item N", counting from 1.
 *
 *   entry 6 (tmp actionTime → actionTimes.attemptClimb) › options.actionId
 *   layer "layer-3" › button "Climb" › executable 1 (layer) › to
 *   module 4 (team Stats "Auto") › options.list › item 3 › path
 */
import type { ConfigKind } from "../validate";
import type { Key } from "./json";

type Doc = Record<string, unknown>;

const field = (v: unknown, k: string): string => {
  const x = v !== null && typeof v === "object" ? (v as Doc)[k] : undefined;
  return typeof x === "string" || typeof x === "number" ? String(x) : "?";
};

/** How to name an item of a list, given the keys that lead to the list. */
type Namer = (item: unknown, index: number) => string;

function namerFor(kind: ConfigKind, parents: readonly Key[]): Namer | null {
  const at = parents.filter((k) => typeof k === "string").join(".");
  if (kind === "analysis-pipeline" && at === "pipeline") {
    return (e, i) =>
      `entry ${i + 1} (${field(e, "type")} ${field(e, "name")} → ${field(e, "outputPath")})`;
  }
  if (kind === "analysis-modules" && at === "modules") {
    return (m, i) =>
      `module ${i + 1} (${field(m, "view")} ${field(m, "module")} "${field(m, "name")}")`;
  }
  if (kind === "analysis-modules" && at === "filterTeams.ratingBands") {
    return (b) => `rating band "${field(b, "id")}"`;
  }
  if (kind === "match-scouting") {
    if (at === "timing.phases") return (p) => `phase "${field(p, "id")}"`;
    if (at.endsWith(".segments")) return (s) => `segment "${field(s, "id")}"`;
    if (at.endsWith(".kinds")) return (k) => `kind "${field(k, "id")}"`;
    if (at === "layout.layers") return (l) => `layer "${field(l, "id")}"`;
    if (at.endsWith(".buttons")) return (b) => `button "${field(b, "id")}"`;
    if (at.endsWith(".executables")) return (x, i) => `executable ${i + 1} (${field(x, "type")})`;
    if (at === "rules.locks") return (l) => `lock "${field(l, "id")}"`;
  }
  return null;
}

export function describeLocation(kind: ConfigKind, doc: unknown, keys: readonly Key[]): string {
  const parts: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) parts.push(run.join("."));
    run = [];
  };
  let current: unknown = doc;
  // Keys since the last named item: a named item's own list name is not repeated.
  let sinceNamed: Key[] = [];
  const all: Key[] = [];
  for (const key of keys) {
    all.push(key);
    const next =
      current !== null && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined;
    if (typeof key === "number") {
      const namer = namerFor(kind, all.slice(0, -1));
      if (namer) {
        // Drop the list's own name from the run ("timing.phases" is implied by "phase").
        run = run.slice(0, Math.max(0, run.length - sinceNamed.length));
        flush();
        parts.push(namer(next, key));
        sinceNamed = [];
      } else {
        flush();
        parts.push(`item ${key + 1}`);
        sinceNamed = [];
      }
    } else {
      run.push(key);
      sinceNamed.push(key);
    }
    current = next;
  }
  flush();
  return parts.length > 0 ? parts.join(" › ") : "(whole file)";
}
