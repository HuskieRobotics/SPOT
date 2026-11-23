"use client";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { normalizeImageSrc } from "@/lib/fieldMaps";
import type { FieldMapDto } from "@/lib/types";
import { Button, Input, NumberInput, Select, Switch, Textarea, cx } from "@/components/ui";
import type { FieldSpec } from "@/lib/analysis/moduleDefs";
import type { OptionSpec } from "@/lib/analysis/transformers";

/** Suggestions for pickers, computed by running the pipeline on real or sample data. */
export interface Suggestions {
  actionIds: string[];
  tmpPaths: string[];
  teamPaths: string[];
}
/** Saved field maps (library), for map pickers. */
export const FieldMapsCtx = createContext<FieldMapDto[]>([]);
export const SuggestionsCtx = createContext<Suggestions>({ actionIds: [], tmpPaths: [], teamPaths: [] });

function Datalist({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.slice(0, 600).map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

export function PathInput({ value, onChange, scope = "team", placeholder }: { value: string; onChange: (v: string) => void; scope?: "team" | "tmp"; placeholder?: string }) {
  const s = useContext(SuggestionsCtx);
  const id = useId();
  const list = scope === "tmp" ? s.tmpPaths : s.teamPaths;
  const unknown = value && list.length > 0 && !list.some((p) => p === value || p.startsWith(value + "."));
  return (
    <div>
      <Input list={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? (scope === "tmp" ? "e.g. counts.autoScore" : "e.g. averages.autoScore")} className={cx("font-mono text-xs", unknown && "border-warning")} />
      <Datalist id={id} values={list} />
      {unknown && <div className="mt-0.5 text-[11px] text-warning">Not produced by the pipeline on the current data.</div>}
    </div>
  );
}

/** Chip input for a list of strings with suggestions. */
export function TagInput({ value, onChange, suggestions = [], placeholder, mono = true }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; mono?: boolean }) {
  const [text, setText] = useState("");
  const id = useId();
  const list = Array.isArray(value) ? value : [];
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length) onChange([...list, ...parts.filter((p) => !list.includes(p))]);
    setText("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
      {list.map((v, i) => (
        <span key={v + i} className={cx("inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs", mono && "font-mono")}>
          {v}
          <button type="button" className="text-muted hover:text-danger" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${v}`}>
            ×
          </button>
        </span>
      ))}
      <input
        list={id}
        value={text}
        placeholder={list.length ? "" : placeholder ?? "Type and press Enter"}
        onChange={(e) => {
          // Picking from the datalist fires a change with the full value.
          if (suggestions.includes(e.target.value)) add(e.target.value);
          else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && list.length) onChange(list.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        className="h-7 min-w-28 flex-1 bg-transparent px-1 text-xs outline-none"
      />
      <Datalist id={id} values={suggestions.filter((s) => !list.includes(s))} />
    </div>
  );
}

export function ActionIdsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const s = useContext(SuggestionsCtx);
  return <TagInput value={value} onChange={onChange} suggestions={s.actionIds} placeholder="Add action ids…" />;
}

/** { key: value } editor. `numeric` for weights/points. */
export function KeyValueEditor({
  value,
  onChange,
  keyLabel = "Key",
  valueLabel = "Value",
  numeric,
  keySuggestions,
  keyScope,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  keyLabel?: string;
  valueLabel?: string;
  numeric?: boolean;
  keySuggestions?: string[];
  keyScope?: "team" | "tmp";
}) {
  const entries = Object.entries(value ?? {});
  const id = useId();
  const s = useContext(SuggestionsCtx);
  const sugg = keySuggestions ?? (keyScope === "tmp" ? s.tmpPaths : keyScope === "team" ? s.teamPaths : []);
  const set = (i: number, k: string, v: unknown) => {
    const next = entries.map(([ek, ev], j) => (j === i ? [k, v] : [ek, ev]));
    onChange(Object.fromEntries(next));
  };
  return (
    <div className="flex flex-col gap-1.5">
      {entries.length > 0 && (
        <div className="grid grid-cols-[1fr_7rem_2rem] gap-1.5 text-[11px] text-muted">
          <span>{keyLabel}</span>
          <span>{valueLabel}</span>
        </div>
      )}
      {entries.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem_2rem] gap-1.5">
          <Input list={id} value={k} onChange={(e) => set(i, e.target.value, v)} className="h-8 font-mono text-xs" />
          {numeric ? (
            <NumberInput value={v as number} onChange={(n) => set(i, k, n ?? 0)} className="h-8 text-xs" />
          ) : (
            <Input value={typeof v === "string" ? v : JSON.stringify(v)} onChange={(e) => set(i, k, parseLoose(e.target.value))} className="h-8 font-mono text-xs" />
          )}
          <Button size="icon" variant="ghost" onClick={() => onChange(Object.fromEntries(entries.filter((_, j) => j !== i)))} aria-label="Remove row">
            ×
          </Button>
        </div>
      ))}
      <Datalist id={id} values={sugg} />
      <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({ ...Object.fromEntries(entries), [uniqueKey(value)]: numeric ? 1 : "" })}>
        + Add row
      </Button>
    </div>
  );
}

const uniqueKey = (obj: Record<string, unknown>) => {
  let i = 1;
  while (`new${i}` in (obj ?? {})) i++;
  return `new${i}`;
};

/** Numbers stay numbers, true/false/null become literals, everything else is text. */
export function parseLoose(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === "true" || t === "false" || t === "null") return JSON.parse(t);
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return JSON.parse(t);
    } catch {}
  }
  return text;
}

export function JsonInput({ value, onChange, rows = 4 }: { value: unknown; onChange: (v: unknown) => void; rows?: number }) {
  const [text, setText] = useState(() => (value === undefined ? "" : JSON.stringify(value, null, 1)));
  const [err, setErr] = useState(false);
  return (
    <div>
      <Textarea
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === "") {
            setErr(false);
            return onChange(undefined);
          }
          try {
            onChange(JSON.parse(e.target.value));
            setErr(false);
          } catch {
            setErr(true);
          }
        }}
        className={cx(err && "border-danger")}
      />
      {err && <div className="text-[11px] text-danger">Not valid JSON yet</div>}
    </div>
  );
}

/** List of objects, each edited with the given fields. */
export function ListEditor({ value, onChange, fields, newItem, itemTitle }: { value: Record<string, unknown>[]; onChange: (v: Record<string, unknown>[]) => void; fields: FieldSpec[]; newItem?: () => Record<string, unknown>; itemTitle?: (item: Record<string, unknown>, i: number) => ReactNode }) {
  const list = Array.isArray(value) ? value : [];
  const move = (i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {list.map((item, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface-2/50 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold">{itemTitle?.(item, i) ?? (String(item.name ?? "") || `Item ${i + 1}`)}</span>
            <span className="flex gap-0.5">
              <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </Button>
              <Button size="icon" variant="ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove">
                ×
              </Button>
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <FieldEditor key={f.key} spec={f} value={item[f.key]} onChange={(v) => onChange(list.map((x, j) => (j === i ? setOrDelete(x, f.key, v) : x)))} />
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange([...list, newItem ? newItem() : {}])}>
        + Add
      </Button>
    </div>
  );
}

export const setOrDelete = (obj: Record<string, unknown>, key: string, v: unknown) => {
  const next = { ...obj };
  if (v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) delete next[key];
  else next[key] = v;
  return next;
};

/** Renders one module option from its FieldSpec. */
export function FieldEditor({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const wide = ["list", "json", "keyValue", "paths", "actionIds"].includes(spec.kind);
  let control: ReactNode;
  switch (spec.kind) {
    case "string":
      control = <Input value={(value as string) ?? ""} placeholder={spec.default !== undefined ? String(spec.default) : ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      control = <NumberInput value={value as number} placeholder={spec.default !== undefined ? String(spec.default) : ""} onChange={(n) => onChange(n ?? undefined)} />;
      break;
    case "boolean":
      control = <Switch checked={!!value} onChange={onChange} />;
      break;
    case "color":
      control = (
        <div className="flex gap-2">
          <input type="color" value={(value as string) || "#30a2ff"} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded border border-border bg-surface" />
          <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
        </div>
      );
      break;
    case "path":
      control = <PathInput value={(value as string) ?? ""} onChange={onChange} scope={spec.scope} />;
      break;
    case "paths":
      control = <PathsInput value={(value as string[]) ?? []} onChange={onChange} scope={spec.scope} />;
      break;
    case "actionIds":
      control = <ActionIdsInput value={(value as string[]) ?? []} onChange={onChange} />;
      break;
    case "select":
      control = (
        <Select value={value === undefined || value === null ? "" : String(value)} onChange={(e) => {
          const c = spec.choices!.find((x) => String(x.value) === e.target.value);
          onChange(c?.value === "" ? undefined : c?.value);
        }}>
          {spec.choices!.map((c) => (
            <option key={String(c.value)} value={String(c.value)}>
              {c.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "fieldMap":
      control = <FieldMapSelect value={(value as string) ?? ""} onChange={(v) => onChange(v || undefined)} />;
      break;
    case "keyValue":
      control = <KeyValueEditor value={(value as Record<string, unknown>) ?? {}} onChange={onChange} />;
      break;
    case "list":
      control = <ListEditor value={(value as Record<string, unknown>[]) ?? []} onChange={onChange} fields={spec.itemFields ?? []} />;
      break;
    default:
      control = <JsonInput value={value} onChange={onChange} />;
  }
  return (
    <div className={cx("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <span className="text-xs font-medium text-muted">{spec.label}</span>
      {control}
      {spec.help && <span className="text-[11px] text-muted">{spec.help}</span>}
    </div>
  );
}

/** Select a saved map; empty = follow the project's scouting map. */
export function FieldMapSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const maps = useContext(FieldMapsCtx);
  const cur = value ? normalizeImageSrc(value) : "";
  const known = !cur || maps.some((m) => m.src === cur);
  return (
    <Select value={cur} onChange={(e) => onChange(e.target.value)}>
      <option value="">Same as the scouting map</option>
      {maps.map((m) => (
        <option key={m._id} value={m.src}>
          {m.name}
        </option>
      ))}
      {!known && <option value={cur}>Custom: {cur}</option>}
    </Select>
  );
}

export function PathsInput({ value, onChange, scope }: { value: string[]; onChange: (v: string[]) => void; scope?: "team" | "tmp" }) {
  const s = useContext(SuggestionsCtx);
  return <TagInput value={value} onChange={onChange} suggestions={scope === "tmp" ? s.tmpPaths : s.teamPaths} placeholder="Add paths…" />;
}

/** Renders one transformer option from its OptionSpec. */
export function OptionEditor({ spec, value, onChange, defaultScope }: { spec: OptionSpec; value: unknown; onChange: (v: unknown) => void; defaultScope: "tmp" | "team" }) {
  const scope = spec.scope ?? defaultScope;
  const s = useContext(SuggestionsCtx);
  const asField = (kind: FieldSpec["kind"]): FieldSpec => ({ key: spec.key, label: spec.label, kind, help: spec.help, scope, default: spec.default });
  switch (spec.kind) {
    case "weightedPaths":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted">{spec.label}</span>
          <KeyValueEditor value={(value as Record<string, unknown>) ?? {}} onChange={onChange} numeric keyLabel="Path" valueLabel="Weight" keyScope={scope} />
          {spec.help && <span className="text-[11px] text-muted">{spec.help}</span>}
        </div>
      );
    case "actionId":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted">{spec.label}</span>
          <TagInput value={Array.isArray(value) ? value : value ? [String(value)] : []} onChange={(v) => onChange(v.length === 1 ? v[0] : v)} suggestions={s.actionIds} />
        </div>
      );
    case "numberOrPaths":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted">{spec.label}</span>
          <TagInput
            value={(Array.isArray(value) ? value : []).map(String)}
            onChange={(v) => onChange(v.map((x) => (/^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)))}
            suggestions={scope === "tmp" ? s.tmpPaths : s.teamPaths}
            placeholder="Paths or numbers"
          />
        </div>
      );
    case "keyValue":
      return <FieldEditor spec={asField("keyValue")} value={value} onChange={onChange} />;
    default:
      return <FieldEditor spec={asField(spec.kind as FieldSpec["kind"])} value={value} onChange={onChange} />;
  }
}
