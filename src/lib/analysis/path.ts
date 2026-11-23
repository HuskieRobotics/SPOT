/* Dot-path helpers with the exact semantics of legacy SPOT util.js. */

const NO_DEFAULT = Symbol("no-default");

/**
 * Read a value at a dot path ("counts.autoScore").
 * - Missing (undefined) value: returns `ifnone`, or throws when no default is given.
 * - null is a real value and is returned as-is.
 */
export function getPath(obj: unknown, path: string, ifnone: unknown = NO_DEFAULT): any {
  let cur: any = obj;
  if (path !== "") {
    for (const key of path.split(".")) {
      if (cur === undefined || cur === null) {
        cur = undefined;
        break;
      }
      cur = cur[key];
    }
  }
  if (cur === undefined) {
    if (ifnone === NO_DEFAULT) throw new Error(`path ${path} not traversable!`);
    return ifnone;
  }
  return cur;
}

/** Write a value at a dot path, creating intermediate objects (falsy intermediates are replaced). */
export function setPath(obj: any, path: string, value: unknown): unknown {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return value;
}

/** List every leaf path of an object (used by the builder's path pickers). */
export function listPaths(obj: unknown, prefix = "", out: Map<string, unknown> = new Map(), depth = 0): Map<string, unknown> {
  if (depth > 6 || obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out.set(prefix, obj);
    return out;
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (prefix && entries.length === 0) out.set(prefix, obj);
  for (const [k, v] of entries) listPaths(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  return out;
}

/** "Teleop Transition" → "teleopTransition"; "Active Shift 1" → "activeShift1". */
export function camelCase(text: string): string {
  const words = String(text).split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}
