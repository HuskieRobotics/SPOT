/**
 * Built-in data transformers.
 *
 * Each transformer keeps the option names and semantics of legacy SPOT (documented in
 * claude/09-transformers-and-modules-catalog.md) so archived analysis-pipeline.json files run
 * unchanged. Every transformer also declares its options so the admin builder can render a
 * form for it — no JSON editing required.
 */
import type { Dataset, ScoringConfig, TeamMatchPerformance, TransformerType } from "../types";
import { getPath, setPath } from "./path";
import { pointsForAction } from "../scoring";

export interface PipelineContext {
  /** Every action id the project knows about, in a stable order (seeds countActions all:true). */
  actionIds: string[];
  totalTime: number;
  scoring: ScoringConfig;
}

export type OptionKind =
  | "boolean"
  | "number"
  | "string"
  | "path" // one dataset path
  | "paths" // list of dataset paths
  | "actionIds" // list of action ids
  | "actionId" // single action id or list
  | "weightedPaths" // { path: weight }
  | "keyValue" // { key: value } free map
  | "numberOrPaths" // (path | number)[]
  | "json"; // anything else

export interface OptionSpec {
  key: string;
  label: string;
  kind: OptionKind;
  help?: string;
  required?: boolean;
  default?: unknown;
  /** For "path" options: whether it reads from a tmp or a team object. */
  scope?: "tmp" | "team";
}

type Exec = (dataset: Dataset, outputPath: string, options: any, ctx: PipelineContext) => Dataset;

export interface TransformerDef {
  name: string;
  label: string;
  category: "Counting" | "Math" | "Averages" | "Time" | "Actions" | "Ratings" | "Data";
  description: string;
  /** True when the transformer does not write to outputPath. */
  noOutput?: boolean;
  types: Partial<Record<TransformerType, { options: OptionSpec[]; exec: Exec }>>;
}

// ---------------------------------------------------------------- helpers

const teamTmps = (dataset: Dataset, team: string) => dataset.tmps.filter((t) => String(t.robotNumber) === String(team));

const numericSum = (entity: unknown, paths: unknown[], fallback = 0) =>
  paths.reduce<number>((acc, p) => acc + (typeof p === "number" ? p : Number(getPath(entity, String(p), fallback))), 0);

function forTmps(dataset: Dataset, fn: (tmp: TeamMatchPerformance) => void) {
  for (const tmp of dataset.tmps) fn(tmp);
  return dataset;
}
function forTeams(dataset: Dataset, fn: (team: Record<string, unknown>, teamNumber: string) => void) {
  for (const [teamNumber, team] of Object.entries(dataset.teams)) fn(team, teamNumber);
  return dataset;
}

function seedCounts(ids: string[]) {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  return out;
}

// ---------------------------------------------------------------- implementations

const countActionsOptions: OptionSpec[] = [
  { key: "all", label: "Count every action", kind: "boolean", help: "Counts every id the project knows plus any id found in the data." },
  { key: "ids", label: "Only count these ids", kind: "actionIds", help: "Used when 'Count every action' is off." },
  { key: "actionArrayPath", label: "Action list path", kind: "path", default: "actionQueue", scope: "tmp" },
];

function countInto(out: Record<string, number>, actions: { id: string }[], countAll: boolean, ids: string[]) {
  for (const action of actions || []) {
    if (countAll) out[action.id] = (out[action.id] || 0) + 1;
    else if (ids.includes(action.id)) out[action.id]++;
  }
}

const countActions: TransformerDef = {
  name: "countActions",
  label: "Count actions",
  category: "Counting",
  description: "Counts how many times each action id appears. Output is an object {actionId: count}.",
  types: {
    tmp: {
      options: countActionsOptions,
      exec: (d, out, o = {}, ctx) => {
        const ids: string[] = o.all ? ctx.actionIds : o.ids || [];
        const arrayPath = o.actionArrayPath || "actionQueue";
        return forTmps(d, (tmp) => {
          const counts = seedCounts(ids);
          countInto(counts, getPath(tmp, arrayPath, []), !!o.all, ids);
          setPath(tmp, out, counts);
        });
      },
    },
    team: {
      options: countActionsOptions,
      exec: (d, out, o = {}, ctx) => {
        const ids: string[] = o.all ? ctx.actionIds : o.ids || [];
        const arrayPath = o.actionArrayPath || "actionQueue";
        return forTeams(d, (team, n) => {
          const counts = seedCounts(ids);
          for (const tmp of teamTmps(d, n)) countInto(counts, getPath(tmp, arrayPath, []), !!o.all, ids);
          setPath(team, out, counts);
        });
      },
    },
  },
};

const sumOpts: OptionSpec[] = [{ key: "addends", label: "Values to add", kind: "paths", required: true }];
const sum: TransformerDef = {
  name: "sum",
  label: "Sum",
  category: "Math",
  description: "Adds the values at several paths (missing values count as 0).",
  types: {
    tmp: { options: sumOpts.map((x) => ({ ...x, scope: "tmp" })), exec: (d, out, o) => forTmps(d, (t) => setPath(t, out, numericSum(t, o.addends || []))) },
    team: { options: sumOpts.map((x) => ({ ...x, scope: "team" })), exec: (d, out, o) => forTeams(d, (t) => setPath(t, out, numericSum(t, o.addends || []))) },
  },
};

const subOpts: OptionSpec[] = [
  { key: "minuend", label: "Start with", kind: "path", required: true },
  { key: "subtrahend", label: "Subtract", kind: "path", required: true },
];
const subtract: TransformerDef = {
  name: "subtract",
  label: "Subtract",
  category: "Math",
  description: "First value minus second value (missing values count as 0).",
  types: {
    tmp: { options: subOpts, exec: (d, out, o) => forTmps(d, (t) => setPath(t, out, getPath(t, o.minuend, 0) - getPath(t, o.subtrahend, 0))) },
    team: { options: subOpts, exec: (d, out, o) => forTeams(d, (t) => setPath(t, out, getPath(t, o.minuend, 0) - getPath(t, o.subtrahend, 0))) },
  },
};

const mulOpts: OptionSpec[] = [
  { key: "multiplicands", label: "Values to multiply", kind: "paths", required: true },
  { key: "weight", label: "Then multiply by", kind: "number", default: 1, required: true },
];
const product = (entity: unknown, o: any) => {
  let p = 1;
  for (const m of o.multiplicands || []) p *= getPath(entity, typeof m === "string" ? m : m.path, 1);
  return p * (o.weight ?? 1);
};
const multiply: TransformerDef = {
  name: "multiply",
  label: "Multiply",
  category: "Math",
  description: "Multiplies values together and by a constant (e.g. 0.001 to convert ms to seconds).",
  types: {
    tmp: { options: mulOpts, exec: (d, out, o) => forTmps(d, (t) => setPath(t, out, product(t, o))) },
    team: { options: mulOpts, exec: (d, out, o) => forTeams(d, (t) => setPath(t, out, product(t, o))) },
  },
};

const ratioOpts: OptionSpec[] = [
  { key: "numerator", label: "Numerator (paths or numbers, summed)", kind: "numberOrPaths", required: true },
  { key: "denominator", label: "Denominator (paths or numbers, summed)", kind: "numberOrPaths", required: true },
  { key: "divByZero", label: "Value when dividing by zero", kind: "json", help: 'For example 0, null, or "N/A".' },
];
const ratio: TransformerDef = {
  name: "ratio",
  label: "Ratio / percentage",
  category: "Math",
  description: "Sum of numerator values divided by sum of denominator values (e.g. accuracy).",
  types: {
    tmp: {
      options: ratioOpts,
      exec: (d, out, o) =>
        forTmps(d, (t) => {
          const den = numericSum(t, o.denominator || []);
          setPath(t, out, den === 0 ? o.divByZero : numericSum(t, o.numerator || []) / den);
        }),
    },
    team: {
      options: ratioOpts,
      exec: (d, out, o) =>
        forTeams(d, (t) => {
          const den = numericSum(t, o.denominator || []);
          setPath(t, out, den === 0 ? o.divByZero || "N/A" : numericSum(t, o.numerator || []) / den);
        }),
    },
  },
};

const weightedSum: TransformerDef = {
  name: "weightedSum",
  label: "Weighted sum (points)",
  category: "Math",
  description: "Σ value × weight. Typically counts × point values to compute a score.",
  types: {
    tmp: {
      options: [{ key: "weightedPaths", label: "Path → weight", kind: "weightedPaths", required: true, scope: "tmp" }],
      exec: (d, out, o) =>
        forTmps(d, (t) => {
          let s = 0;
          for (const [p, w] of Object.entries(o.weightedPaths || {})) s += getPath(t, p, 0) * (w as number);
          setPath(t, out, s);
        }),
    },
  },
};

const points: TransformerDef = {
  name: "points",
  label: "Points from scoring map",
  category: "Math",
  description:
    "Adds up the points of every action using the project's Scoring map (the same map used for scouter accuracy). Optionally restrict to ids with a prefix such as 'auto'.",
  types: {
    tmp: {
      options: [
        { key: "prefix", label: "Only actions starting with", kind: "string", help: "Leave empty for all actions." },
        { key: "ids", label: "Only these action ids", kind: "actionIds" },
      ],
      exec: (d, out, o = {}, ctx) =>
        forTmps(d, (t) => {
          let s = 0;
          for (const a of t.actionQueue || []) {
            if (o.prefix && !a.id.startsWith(o.prefix)) continue;
            if (o.ids?.length && !o.ids.includes(a.id)) continue;
            s += pointsForAction(a.id, ctx.scoring);
          }
          setPath(t, out, s);
        }),
    },
  },
};

const weightedSumAverage: TransformerDef = {
  name: "weightedSumAverage",
  label: "Weighted average (ratings)",
  category: "Ratings",
  description:
    "Match: Σ(count × weight) / Σcount, e.g. average rating from rating-button counts (null if none). Team: merges nested count objects across matches and averages any keys ending in a number, using that number as the weight.",
  types: {
    tmp: {
      options: [{ key: "weightedPaths", label: "Count path → rating value", kind: "weightedPaths", required: true, scope: "tmp" }],
      exec: (d, out, o) =>
        forTmps(d, (t) => {
          let ws = 0;
          let tc = 0;
          for (const [p, w] of Object.entries(o.weightedPaths || {})) {
            const c = getPath(t, p, 0);
            ws += c * (w as number);
            tc += c;
          }
          setPath(t, out, tc === 0 ? null : ws / tc);
        }),
    },
    team: {
      options: [{ key: "path", label: "Nested count object on each match", kind: "path", required: true, scope: "tmp" }],
      exec: (d, out, o) => {
        const merge = (target: any, source: any): any => {
          if (typeof source === "number") return (typeof target === "number" ? target : 0) + source;
          if (typeof source !== "object" || source === null) return target;
          const m = typeof target === "object" && target !== null ? target : {};
          for (const [k, v] of Object.entries(source)) m[k] = merge(m[k], v);
          return m;
        };
        const avg = (obj: any): any => {
          if (typeof obj === "number") return obj;
          if (typeof obj !== "object" || obj === null) return null;
          const entries = Object.entries(obj);
          if (entries.length > 0 && entries.every(([, v]) => typeof v === "number")) {
            let ws = 0;
            let tc = 0;
            let used = false;
            for (const [k, c] of entries as [string, number][]) {
              const m = String(k).match(/(\d+)(?!.*\d)/);
              if (!m) continue;
              ws += c * Number(m[1]);
              tc += c;
              used = true;
            }
            if (used) return tc === 0 ? null : ws / tc;
          }
          const res: any = {};
          for (const [k, v] of entries) res[k] = avg(v);
          return res;
        };
        return forTeams(d, (team, n) => {
          let merged: any = null;
          for (const t of teamTmps(d, n)) {
            const v = getPath(t, o.path || "", undefined);
            if (v === undefined || v === null) continue;
            merged = merge(merged, v);
          }
          setPath(team, out, merged === null ? null : avg(merged));
        });
      },
    },
  },
};

function deriveCountPaths(entity: unknown, averagePath: string) {
  const prefix = "scores.";
  if (!averagePath || !averagePath.startsWith(prefix) || !averagePath.endsWith("Rating"))
    throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
  const base = averagePath.slice(prefix.length);
  const counts = getPath(entity, "counts", {});
  const found: { n: number; path: string }[] = [];
  for (const key of Object.keys(counts)) {
    const m = key.match(/^(.*)Rating(.+?)(\d+)$/);
    if (!m || `${m[1]}${m[2]}Rating` !== base) continue;
    found.push({ n: Number(m[3]), path: `counts.${key}` });
  }
  if (!found.length) throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
  return found.sort((a, b) => a.n - b.n).map((x) => x.path);
}
const sumAverageExec = (entity: any, out: string, o: any) => {
  if (!o || !Array.isArray(o.groups)) throw new Error("sumAverage requires options.groups");
  let ws = 0;
  let tc = 0;
  for (const g of o.groups) {
    const countPaths: string[] = g.countPaths || deriveCountPaths(entity, g.averagePath);
    const gc = countPaths.reduce((acc, p) => acc + getPath(entity, p, 0), 0);
    if (gc === 0) continue;
    const a = getPath(entity, g.averagePath, null);
    if (a === null || a === undefined) continue;
    ws += a * gc;
    tc += gc;
  }
  setPath(entity, out, tc === 0 ? null : ws / tc);
};
const sumAverageOpts: OptionSpec[] = [
  {
    key: "groups",
    label: "Groups [{ averagePath, countPaths? }]",
    kind: "json",
    required: true,
    help: "Each group's average is weighted by its total count. countPaths is inferred from counts.<phase>Rating<Metric><N> when omitted.",
  },
];
const sumAverage: TransformerDef = {
  name: "sumAverage",
  label: "Combine rating averages",
  category: "Ratings",
  description: "Count-weighted average of several averages (e.g. overall shooting rating across phases).",
  types: {
    tmp: { options: sumAverageOpts, exec: (d, out, o) => forTmps(d, (t) => sumAverageExec(t, out, o)) },
    team: { options: sumAverageOpts, exec: (d, out, o) => forTeams(d, (t) => sumAverageExec(t, out, o)) },
  },
};

const average: TransformerDef = {
  name: "average",
  label: "Average across matches",
  category: "Averages",
  description: "Averages a match value (or every key of a match object) across the team's matches. NaN when no matches.",
  types: {
    team: {
      options: [{ key: "path", label: "Match value or object", kind: "path", required: true, scope: "tmp" }],
      exec: (d, out, o) =>
        forTeams(d, (team, n) => {
          const tmps = teamTmps(d, n);
          const first = tmps.length ? getPath(tmps[0], o.path, undefined) : undefined;
          if (typeof first === "object" && first !== null) {
            const res: Record<string, number> = {};
            for (const sub of Object.keys(first)) {
              const valid = tmps.filter((t) => getPath(t, `${o.path}.${sub}`, null) !== null);
              res[sub] = valid.reduce((acc, t) => acc + getPath(t, `${o.path}.${sub}`), 0) / valid.length;
            }
            setPath(team, out, res);
          } else {
            const valid = tmps.filter((t) => {
              const v = getPath(t, o.path, null);
              return v !== null;
            });
            setPath(team, out, valid.reduce((acc, t) => acc + getPath(t, o.path), 0) / valid.length);
          }
        }),
    },
  },
};

const averageTime: TransformerDef = {
  name: "averageTime",
  label: "Average (null when empty)",
  category: "Averages",
  description: "Like Average, but gives null instead of NaN when there are no values (good for times).",
  types: {
    team: {
      options: [{ key: "path", label: "Match value or object", kind: "path", required: true, scope: "tmp" }],
      exec: (d, out, o) =>
        forTeams(d, (team, n) => {
          const tmps = teamTmps(d, n);
          const first = tmps.length ? getPath(tmps[0], o.path, null) : null;
          const avgOf = (p: string) => {
            const valid = tmps.filter((t) => getPath(t, p, null) !== null);
            return valid.length === 0 ? null : valid.reduce((acc, t) => acc + getPath(t, p), 0) / valid.length;
          };
          if (typeof first === "object" && first !== null) {
            const res: Record<string, number | null> = {};
            for (const sub of Object.keys(first)) res[sub] = avgOf(`${o.path}.${sub}`);
            setPath(team, out, res);
          } else setPath(team, out, avgOf(o.path));
        }),
    },
  },
};

const deepAverage: TransformerDef = {
  name: "deepAverage",
  label: "Deep average (nested objects)",
  category: "Averages",
  description: "Averages every numeric leaf of a nested object across matches (arrays of numbers are summed first).",
  types: {
    team: {
      options: [{ key: "path", label: "Nested object on each match", kind: "path", required: true, scope: "tmp" }],
      exec: (d, out, o) => {
        const addNested = (a: any, b: any): any => {
          if (b === undefined) return a;
          if (a === undefined) return b;
          if (typeof a === "number" && typeof b === "number") return a + b;
          if (typeof a === "object" && typeof b === "object" && a && b) {
            const r: any = {};
            for (const k in a) r[k] = addNested(a[k], b[k]);
            for (const k in b) if (!(k in a)) r[k] = b[k];
            return r;
          }
          return a;
        };
        const sumNested = (obj: any): any => {
          if (typeof obj === "number") return obj;
          if (Array.isArray(obj)) return obj.every((v) => typeof v === "number") ? obj.reduce((a, v) => a + v, 0) : undefined;
          if (typeof obj === "object" && obj !== null) {
            const r: any = {};
            for (const k in obj) {
              const s = sumNested(obj[k]);
              if (s !== undefined) r[k] = s;
            }
            return Object.keys(r).length ? r : undefined;
          }
          return undefined;
        };
        const divideNested = (obj: any, c: number): any => {
          if (typeof obj === "number") return obj / c;
          if (obj === undefined) return undefined;
          if (typeof obj === "object" && obj !== null) {
            const r: any = {};
            for (const k in obj) {
              const v = divideNested(obj[k], c);
              if (v !== undefined) r[k] = v;
            }
            return Object.keys(r).length ? r : undefined;
          }
          return obj;
        };
        return forTeams(d, (team, n) => {
          let total: any = null;
          let count = 0;
          for (const t of teamTmps(d, n)) {
            const v = getPath(t, o.path || "", undefined);
            if (v === undefined) continue;
            const s = sumNested(v);
            if (s === undefined) continue;
            total = total === null ? s : addNested(total, s);
            count++;
          }
          setPath(team, out, count > 0 ? divideNested(total, count) : null);
        });
      },
    },
  },
};

const aggregateArray: TransformerDef = {
  name: "aggregateArray",
  label: "Combine lists across matches",
  category: "Data",
  description: "Concatenates a list from every match into one team list (e.g. all actions, all cycles).",
  types: {
    team: {
      options: [{ key: "path", label: "List on each match", kind: "path", required: true, scope: "tmp" }],
      exec: (d, out, o) =>
        forTeams(d, (team, n) => {
          let arr: unknown[] = [];
          for (const t of teamTmps(d, n)) arr = arr.concat(getPath(t, o.path));
          setPath(team, out, arr);
        }),
    },
  },
};

const averageArrayExec = (entity: any, out: string, o: any) => {
  const arr = getPath(entity, o.arrayPath);
  if (!Array.isArray(arr)) throw new Error(`no array found at ${o.arrayPath}!`);
  setPath(entity, out, arr.reduce((acc: number, x: unknown) => acc + getPath(x, o.valuePath), 0) / arr.length);
};
const averageArrayOpts: OptionSpec[] = [
  { key: "arrayPath", label: "List path", kind: "path", required: true },
  { key: "valuePath", label: "Value inside each item", kind: "string", required: true, help: "e.g. timeDifferential" },
];
const averageArray: TransformerDef = {
  name: "averageArray",
  label: "Average of a list",
  category: "Averages",
  description: "Average of one field across the items of a list (e.g. average cycle time).",
  types: {
    tmp: { options: averageArrayOpts, exec: (d, out, o) => forTmps(d, (t) => averageArrayExec(t, out, o)) },
    team: { options: averageArrayOpts, exec: (d, out, o) => forTeams(d, (t) => averageArrayExec(t, out, o)) },
  },
};

const countMatches: TransformerDef = {
  name: "countMatches",
  label: "Count matches",
  category: "Counting",
  description: "Number of distinct matches scouted for the team (× weight).",
  types: {
    team: {
      options: [{ key: "weight", label: "Multiply by", kind: "number", default: 1 }],
      exec: (d, out, o = {}) =>
        forTeams(d, (team, n) => setPath(team, out, new Set(teamTmps(d, n).map((t) => t.matchNumber)).size * (o.weight || 1))),
    },
  },
};

const standardDeviation: TransformerDef = {
  name: "standardDeviation",
  label: "Standard deviation",
  category: "Averages",
  description: "Population standard deviation of a match value across the team's matches (used by match prediction).",
  types: {
    team: {
      options: [{ key: "path", label: "Match value", kind: "path", required: true, scope: "tmp" }],
      exec: (d, out, o) =>
        forTeams(d, (team, n) => {
          const xs = teamTmps(d, n)
            .map((t) => getPath(t, o.path, undefined))
            .filter((x) => typeof x === "number") as number[];
          if (!xs.length) return void setPath(team, out, NaN);
          const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
          setPath(team, out, Math.sqrt(xs.map((x) => (x - mean) ** 2).reduce((a, b) => a + b, 0) / xs.length));
        }),
    },
  },
};

const actionTime: TransformerDef = {
  name: "actionTime",
  label: "Time of first action",
  category: "Time",
  description: "Clock time (ms remaining) of the first matching action, or a default.",
  types: {
    tmp: {
      options: [
        { key: "actionId", label: "Action id(s)", kind: "actionId", required: true },
        { key: "default", label: "Default when not found", kind: "json", default: null },
      ],
      exec: (d, out, o) => {
        const ids: string[] = Array.isArray(o.actionId) ? o.actionId : [o.actionId];
        return forTmps(d, (t) => {
          const a = t.actionQueue.find((x) => ids.includes(x.id));
          setPath(t, out, a ? a.ts : o.default ?? null);
        });
      },
    },
  },
};

const actionTimeFilter: TransformerDef = {
  name: "actionTimeFilter",
  label: "Actions in a time window",
  category: "Time",
  description: "List of actions whose clock time is between min and max (ms remaining), e.g. auto-only actions.",
  types: {
    tmp: {
      options: [
        { key: "timeMin", label: "Min ms remaining", kind: "number", default: 0 },
        { key: "timeMax", label: "Max ms remaining", kind: "number", help: "Defaults to the full match time." },
      ],
      exec: (d, out, o = {}, ctx) => {
        const min = o.timeMin || 0;
        const max = o.timeMax || ctx.totalTime;
        return forTmps(d, (t) => setPath(t, out, t.actionQueue.filter((a) => a.ts >= min && a.ts <= max)));
      },
    },
  },
};

const finalActionOccurrence: TransformerDef = {
  name: "finalActionOccurrence",
  label: "Last matching action",
  category: "Actions",
  description: "The last action whose id is in the list (e.g. final climb state), or a default object.",
  types: {
    tmp: {
      options: [
        { key: "ids", label: "Action ids", kind: "actionIds", required: true },
        { key: "default", label: "Default", kind: "json", help: 'e.g. {"id": "noClimb"}' },
        { key: "actionArrayPath", label: "Action list path", kind: "path", default: "actionQueue", scope: "tmp" },
      ],
      exec: (d, out, o) =>
        forTmps(d, (t) => {
          const arr: any[] = getPath(t, o.actionArrayPath || "actionQueue", []);
          // Legacy reversed the queue in place (corrupting later steps); this reads without mutating.
          for (let i = arr.length - 1; i >= 0; i--) {
            if ((o.ids || []).includes(arr[i].id)) return void setPath(t, out, arr[i]);
          }
          if (o.default) setPath(t, out, o.default);
        }),
    },
  },
};

const mapT: TransformerDef = {
  name: "map",
  label: "Map value",
  category: "Data",
  description: "Looks up the value at a path in a table, e.g. final climb id → points.",
  types: {
    tmp: {
      options: [
        { key: "path", label: "Value to look up", kind: "path", required: true, scope: "tmp" },
        { key: "map", label: "Lookup table", kind: "keyValue", required: true },
      ],
      exec: (d, out, o) => forTmps(d, (t) => setPath(t, out, (o.map || {})[getPath(t, o.path, "")])),
    },
  },
};

const cycle: TransformerDef = {
  name: "cycle",
  label: "Cycles",
  category: "Time",
  description:
    "Pairs each start action with the first later end/miss action. Output: { all, allComplete, averageTime, averageTimeComplete, cycleCount, cycleCountComplete } (times in ms).",
  types: {
    tmp: {
      options: [
        { key: "startAction", label: "Start action ids", kind: "actionIds", required: true },
        { key: "endAction", label: "End (success) action ids", kind: "actionIds", required: true },
        { key: "misses", label: "Miss action ids", kind: "actionIds" },
      ],
      exec: (d, out, opts) => {
        const o = { startAction: [], endAction: [], misses: [], ...opts } as { startAction: string[]; endAction: string[]; misses: string[] };
        return forTmps(d, (t) => {
          const res: any = { all: [], allComplete: null, averageTime: null, averageTimeComplete: null, cycleCount: null, cycleCountComplete: null };
          const starts = t.actionQueue.filter((x) => o.startAction.includes(x.id));
          let endings = t.actionQueue.filter((x) => o.endAction.includes(x.id) || o.misses.includes(x.id));
          while (starts.length > 0) {
            const s = starts.shift()!;
            endings = endings.filter((x) => x.ts < s.ts);
            if (endings.length === 0) break;
            const e = endings.shift()!;
            res.all.push({ starts: s, ending: e, timeDifferential: s.ts - e.ts });
          }
          res.averageTime = res.all.reduce((acc: number, x: any) => acc + x.timeDifferential, 0) / res.all.length;
          res.allComplete = res.all.filter((x: any) => !o.misses.includes(x.ending.id));
          res.averageTimeComplete = res.allComplete.reduce((acc: number, x: any) => acc + x.timeDifferential, 0) / res.allComplete.length;
          res.cycleCount = res.all.length;
          res.cycleCountComplete = res.allComplete.length;
          setPath(t, out, res);
        });
      },
    },
  },
};

const countHybrid: TransformerDef = {
  name: "countHybrid",
  label: "Count placements by held piece",
  category: "Counting",
  description: "Counts 'hybrid' placements attributed to the most recent pickup id.",
  types: {
    tmp: {
      options: [
        { key: "pickup", label: "Pickup ids", kind: "actionIds", required: true },
        { key: "hybrid", label: "Placement ids", kind: "actionIds", required: true },
        { key: "actionArrayPath", label: "Action list path", kind: "path", default: "actionQueue", scope: "tmp" },
      ],
      exec: (d, out, o) =>
        forTmps(d, (t) => {
          let held = "";
          const placements: Record<string, number> = {};
          for (const id of o.pickup || []) placements[id] = 0;
          for (const a of getPath(t, o.actionArrayPath || "actionQueue", [])) {
            if ((o.pickup || []).includes(a.id)) held = a.id;
            if ((o.hybrid || []).includes(a.id)) placements[held] = placements[held] + 1;
          }
          setPath(t, out, placements);
        }),
    },
    team: { options: [], exec: (d) => d },
  },
};

const threshold: TransformerDef = {
  name: "threshold",
  label: "Names above threshold",
  category: "Data",
  description: "Lists the names of paths whose value is above a threshold, e.g. which climb levels a team has done.",
  types: {
    team: {
      options: [
        { key: "paths", label: "Path → name", kind: "keyValue", required: true },
        { key: "threshold", label: "Threshold", kind: "number" },
        { key: "separator", label: "Join with", kind: "string", help: "Leave empty to output a list." },
        { key: "none", label: "Text when none pass", kind: "string" },
      ],
      exec: (d, out, o) =>
        forTeams(d, (team) => {
          const names: string[] = [];
          for (const [p, name] of Object.entries(o.paths || {})) {
            if (o.threshold === undefined || o.threshold === null || getPath(team, p, 0) > o.threshold) names.push(String(name));
          }
          let r: unknown;
          if (o.separator === undefined) r = names;
          else r = names.length === 0 && o.none !== "" ? o.none : names.join(o.separator);
          setPath(team, out, r);
        }),
    },
  },
};

const removeDuplicates: TransformerDef = {
  name: "removeDuplicates",
  label: "Keep latest re-scout",
  category: "Data",
  description: "When a robot/match was scouted more than once, keep only the most recent submission.",
  noOutput: true,
  types: {
    tmp: {
      options: [],
      exec: (d) => {
        const latest: Record<string, TeamMatchPerformance> = {};
        for (const t of d.tmps) {
          const k = `${t.robotNumber}-${t.matchNumber}`;
          if (!latest[k] || t.timestamp > latest[k].timestamp) latest[k] = t;
        }
        d.tmps = Object.values(latest);
        return d;
      },
    },
  },
};

const LEGACY_ZONES = ["AZone", "NeutralZone", "OAZone"];
const LEGACY_ACTIONS = ["Defense", "Passing", "StopShooting", "Storing"];
const zoneActionRatingGroupings: TransformerDef = {
  name: "zoneActionRatingGroupings",
  label: "Zone → action → rating triplets",
  category: "Ratings",
  description:
    "Walks the action list pairing each zone press with the next action and the next rating. Output: { list, counts[zone][action][rating], [zone][action]: average rating }.",
  types: {
    tmp: {
      options: [
        { key: "zones", label: "Zone action ids", kind: "actionIds", required: true },
        { key: "actions", label: "Action ids", kind: "actionIds", required: true },
        { key: "ratings", label: "Rating ids (ending in a number)", kind: "actionIds", required: true },
        { key: "zoneNames", label: "Zone names (suffixes)", kind: "actionIds", help: "Ids are grouped by these suffixes. Default AZone, NeutralZone, OAZone." },
        { key: "actionNames", label: "Action names (suffixes)", kind: "actionIds", help: "Default Defense, Passing, StopShooting, Storing." },
      ],
      exec: (d, out, opts) => {
        const o = { zones: [], actions: [], ratings: [], ...opts } as any;
        const zoneNames: string[] = o.zoneNames?.length ? o.zoneNames : LEGACY_ZONES;
        const actionNames: string[] = o.actionNames?.length ? o.actionNames : LEGACY_ACTIONS;
        // Longest suffix wins so "OAZone" is not mistaken for "AZone".
        const norm = (id: string, names: string[]) =>
          names.filter((n) => id.endsWith(n)).sort((a, b) => b.length - a.length)[0] ?? id;
        return forTmps(d, (t) => {
          const res: any = { list: [], counts: {} };
          let ratings = t.actionQueue.filter((x) => o.ratings.includes(x.id));
          let actions = t.actionQueue.filter((x) => o.actions.includes(x.id));
          const zones = t.actionQueue.filter((x) => o.zones.includes(x.id));
          while (zones.length > 0) {
            const zone = zones.shift()!;
            actions = actions.filter((x) => x.ts < zone.ts);
            if (!actions.length) break;
            const action = actions.shift()!;
            ratings = ratings.filter((x) => x.ts < action.ts);
            if (!ratings.length) break;
            const rating = ratings.shift()!;
            const m = String(rating.id).match(/(\d+)$/);
            const rv = m ? Number(m[1]) : null;
            const z = norm(zone.id, zoneNames);
            const a = norm(action.id, actionNames);
            res.list.push({ zone: z, action: a, rating: rv });
            if (rv != null) {
              res.counts[z] ??= {};
              res.counts[z][a] ??= {};
              res.counts[z][a][rv] = (res.counts[z][a][rv] ?? 0) + 1;
              res[z] ??= {};
              res[z][a] ??= { sum: 0, count: 0 };
              res[z][a].sum += rv;
              res[z][a].count += 1;
            }
          }
          for (const z in res) {
            if (z === "list" || z === "counts") continue;
            for (const a in res[z]) res[z][a] = res[z][a].count > 0 ? res[z][a].sum / res[z][a].count : 0;
          }
          setPath(t, out, res);
        });
      },
    },
  },
};

export const TRANSFORMERS: TransformerDef[] = [
  countActions,
  countMatches,
  countHybrid,
  sum,
  subtract,
  multiply,
  ratio,
  weightedSum,
  points,
  average,
  averageTime,
  averageArray,
  deepAverage,
  standardDeviation,
  weightedSumAverage,
  sumAverage,
  zoneActionRatingGroupings,
  cycle,
  actionTime,
  actionTimeFilter,
  finalActionOccurrence,
  aggregateArray,
  mapT,
  threshold,
  removeDuplicates,
];

const ALIASES: Record<string, string> = { finalActionOccurence: "finalActionOccurrence" };

export function getTransformer(name: string): TransformerDef | undefined {
  const n = ALIASES[name] ?? name;
  return TRANSFORMERS.find((t) => t.name === n);
}
