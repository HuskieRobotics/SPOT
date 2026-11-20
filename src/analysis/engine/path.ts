/**
 * Dot-separated paths into the analysis dataset (docs/spec/09 TR-3).
 *
 * Configuration names everything by path ("counts.l4", "cycles.coral.averageTime"), so these two
 * functions are the whole contract between a pipeline entry and the data it reads and writes.
 *
 * Kept from v5:
 * - `getPath` without a default throws when the path is missing; with a default it returns the
 *   default when the value is `undefined`. A `null` leaf is returned as `null`: it is a value
 *   ("no data", DM-1b), and each transformer decides what no data means for it.
 * - An empty path is the object itself. Numeric segments index arrays ("list.0.id").
 * - `setPath` creates missing intermediate objects.
 *
 * Changed from v5, both cases where v5 failed in a confusing way:
 * - A `null` part-way along the path counts as missing. v5 threw even when a default was given.
 * - `setPath` refuses to write through an existing value that is not an object. v5 silently
 *   replaced a falsy one (0, "", false) with `{}` and silently ignored a truthy one, which broke
 *   the rule that a pipeline entry never changes a path another entry wrote.
 */

export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathError";
  }
}

function split(path: string): string[] {
  return path === "" ? [] : path.split(".");
}

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getPath(obj: unknown, path: string): unknown;
export function getPath<D>(obj: unknown, path: string, ifMissing: D): unknown;
// Rest parameters rather than a default value: a default parameter would also apply when a caller
// passes `undefined` on purpose, and `undefined` is a legitimate default.
export function getPath(obj: unknown, path: string, ...ifMissing: [] | [unknown]): unknown {
  let current: unknown = obj;
  for (const key of split(path)) {
    if (!isContainer(current)) {
      current = undefined;
      break;
    }
    current = current[key];
  }
  if (current !== undefined) return current;
  if (ifMissing.length === 0) throw new PathError(`path "${path}" does not exist`);
  return ifMissing[0];
}

/** True when `getPath` would find a value (including `null`) at the path. */
export function hasPath(obj: unknown, path: string): boolean {
  return getPath(obj, path, undefined) !== undefined;
}

export function setPath<T>(obj: Record<string, unknown>, path: string, value: T): T {
  const keys = split(path);
  if (keys.length === 0) throw new PathError("cannot write to an empty path");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const next = current[key];
    if (next === undefined || next === null) {
      const created: Record<string, unknown> = {};
      current[key] = created;
      current = created;
    } else if (isContainer(next)) {
      current = next;
    } else {
      const at = keys.slice(0, i + 1).join(".");
      throw new PathError(
        `cannot write "${path}": "${at}" already holds ${JSON.stringify(next)}, not an object`,
      );
    }
  }
  current[keys[keys.length - 1]] = value;
  return value;
}
