"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Field, Input, Modal, NumberInput, Select, Textarea, contrastText, cx } from "@/components/ui";
import { PALETTE, TYPE_DEFAULT_COLORS, newUid } from "@/lib/project/defaults";
import type { Executable, ExecutableType, GridArea, Project, ScoutButton } from "@/lib/types";
import { TagInput } from "./fields";

type Update = (fn: (p: Project) => void) => void;

const TYPE_INFO: Record<ScoutButton["type"], { label: string; help: string }> = {
  action: { label: "Action", help: "Records an action (with the clock time) every time it is pressed." },
  "match-control": { label: "Timer / Start / Submit", help: "Starts the match, shows the clock, then becomes Submit when time runs out." },
  undo: { label: "Undo", help: "Removes the last action and reverses everything it did." },
  none: { label: "Navigation only", help: "Runs its executables (e.g. go to a layer) without recording data. Shift buttons use this type." },
  label: { label: "Label", help: "Text only, not pressable." },
};

export const EXEC_INFO: Record<ExecutableType, { label: string; help: string }> = {
  layer: { label: "Go to layer", help: "Switch the screen to another layer. Undo comes back." },
  conditionalLayer: { label: "Go to layer (filtered by variables)", help: "Show only the buttons whose variable condition matches." },
  setVariable: { label: "Set variable", help: "Remember a value (e.g. which game piece is held) for filtered layers." },
  position: { label: "Ask for field position", help: "Show the field map so the scouter taps where the robot is." },
  constantPosition: { label: "Fixed field position", help: "Attach a fixed position without asking." },
  climbHighlight: { label: "Highlight (one at a time)", help: "Highlight this button and un-highlight every other button that also has this." },
  clearHighlight: { label: "Clear highlight", help: "Remove this button's highlight." },
  hide: { label: "Hide after press", help: "Hide this button after it is pressed (Undo shows it again)." },
  multiplier: { label: "Count multiple times", help: "Record this action N times per press." },
};

const DEFAULT_ARGS: Record<ExecutableType, (layer: number) => unknown[]> = {
  layer: (l) => [l, 0],
  conditionalLayer: (l) => [l, 0, [], {}],
  setVariable: () => ["variable", "value"],
  position: () => [],
  constantPosition: () => [{ x: 50, y: 50 }],
  climbHighlight: () => [],
  clearHighlight: () => [],
  hide: () => [],
  multiplier: () => [2],
};

interface Drag {
  kind: "create" | "move" | "resize";
  uid?: string;
  start: [number, number];
  cur: [number, number];
  orig?: GridArea;
}

export function LayoutEditor({ project, update, layer, setLayer, selected, setSelected }: { project: Project; update: Update; layer: number; setLayer: (n: number) => void; selected: string | null; setSelected: (uid: string | null) => void }) {
  const s = project.scouting;
  const L = s.layers[layer] ?? s.layers[0];
  const sel = L?.buttons.find((b) => b.uid === selected) ?? null;
  const canvas = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [landscape, setLandscape] = useState(true);
  const [copyOpen, setCopyOpen] = useState(false);

  const cellAt = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    const col = Math.min(s.grid.columns, Math.max(1, Math.floor(((e.clientX - r.left) / r.width) * s.grid.columns) + 1));
    const row = Math.min(s.grid.rows, Math.max(1, Math.floor(((e.clientY - r.top) / r.height) * s.grid.rows) + 1));
    return [row, col];
  };

  const preview = useMemo((): { uid?: string; area: GridArea } | null => {
    if (!drag) return null;
    const [r0, c0] = drag.start;
    const [r1, c1] = drag.cur;
    if (drag.kind === "create") return { area: [Math.min(r0, r1), Math.min(c0, c1), Math.max(r0, r1) + 1, Math.max(c0, c1) + 1] };
    const o = drag.orig!;
    if (drag.kind === "move") {
      const h = o[2] - o[0];
      const w = o[3] - o[1];
      const r = Math.min(Math.max(1, o[0] + r1 - r0), s.grid.rows - h + 1);
      const c = Math.min(Math.max(1, o[1] + c1 - c0), s.grid.columns - w + 1);
      return { uid: drag.uid, area: [r, c, r + h, c + w] };
    }
    return { uid: drag.uid, area: [o[0], o[1], Math.max(o[0] + 1, r1 + 1), Math.max(o[1] + 1, c1 + 1)] };
  }, [drag, s.grid]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => d && { ...d, cur: cellAt(e) });
    const up = () => {
      setDrag(null);
      if (!preview) return;
      if (drag.kind === "create") {
        const uid = newUid();
        update((p) => {
          const lay = p.scouting.layers[layer];
          let n = 1;
          while (lay.buttons.some((b) => b.id === `action${n}`)) n++;
          lay.buttons.push({ uid, id: `action${n}`, label: `Action ${n}`, type: "action", area: preview.area, color: PALETTE[(n - 1) % 20].color, executables: [] });
        });
        setSelected(uid);
      } else {
        update((p) => {
          const b = p.scouting.layers[layer].buttons.find((x) => x.uid === preview.uid);
          if (b) b.area = preview.area;
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }); // re-bind each render so `preview` is current

  // Keyboard: Delete removes, arrows nudge.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!sel || (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        update((p) => {
          p.scouting.layers[layer].buttons = p.scouting.layers[layer].buttons.filter((b) => b.uid !== sel.uid);
        });
        setSelected(null);
      }
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (d) {
        e.preventDefault();
        update((p) => {
          const b = p.scouting.layers[layer].buttons.find((x) => x.uid === sel.uid)!;
          const [r1, c1, r2, c2] = b.area;
          if (r1 + d[0] < 1 || c1 + d[1] < 1 || r2 + d[0] > p.scouting.grid.rows + 1 || c2 + d[1] > p.scouting.grid.columns + 1) return;
          b.area = [r1 + d[0], c1 + d[1], r2 + d[0], c2 + d[1]];
        });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sel, layer, update, setSelected]);

  const setBtn = (fn: (b: ScoutButton) => void) =>
    update((p) => {
      const b = p.scouting.layers[layer].buttons.find((x) => x.uid === selected);
      if (b) fn(b);
    });

  const reachedFrom = (li: number) => {
    const out: string[] = [];
    s.phases.forEach((ph) => ph.layer === li && out.push(`⏱ ${ph.label}`));
    s.layers.forEach((l, i) =>
      l.buttons.forEach((b) => b.executables.some((e) => (e.type === "layer" || e.type === "conditionalLayer") && Number(e.args[1]) === li) && i !== li && out.push(`${b.label.split("\n")[0]}`)),
    );
    return [...new Set(out)];
  };

  const layerOps = {
    add: () => {
      update((p) => p.scouting.layers.push({ name: `Layer ${p.scouting.layers.length}`, buttons: [] }));
      setLayer(s.layers.length);
    },
    duplicate: () => {
      update((p) => p.scouting.layers.splice(layer + 1, 0, { name: `${L.name} copy`, buttons: L.buttons.map((b) => ({ ...structuredClone(b), uid: newUid() })) }));
      setLayer(layer + 1);
    },
    remove: () => {
      if (layer === 0 || s.layers.length <= 1) return;
      update((p) => {
        p.scouting.layers.splice(layer, 1);
        // Re-point layer references after the removed index.
        const fix = (n: number) => (n === layer ? 0 : n > layer ? n - 1 : n);
        p.scouting.phases.forEach((ph) => (ph.layer = ph.layer >= 0 ? fix(ph.layer) : ph.layer));
        p.scouting.layers.forEach((l) => l.buttons.forEach((b) => b.executables.forEach((e) => (e.type === "layer" || e.type === "conditionalLayer") && (e.args[1] = fix(Number(e.args[1]))))));
      });
      setLayer(Math.max(0, layer - 1));
    },
  };

  const quickAdd = (type: "match-control" | "undo") => {
    const free = findFree(L.buttons, s.grid.rows, s.grid.columns, type === "match-control" ? 3 : 2);
    const uid = newUid();
    update((p) =>
      p.scouting.layers[layer].buttons.push({
        uid,
        id: type === "undo" ? "undo" : "startGame",
        label: type === "undo" ? "Undo" : "Start Match",
        type,
        area: free,
        color: TYPE_DEFAULT_COLORS[type],
        executables: [],
      }),
    );
    setSelected(uid);
  };

  const shown = (b: ScoutButton) => (preview?.uid === b.uid ? preview.area : b.area);
  const dupIds = new Set(L.buttons.filter((b, i) => b.type !== "label" && L.buttons.findIndex((x) => x.id === b.id) !== i).map((b) => b.id));

  return (
    <div className="grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
      {/* Layers */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Layers</h3>
          <Button size="sm" variant="ghost" onClick={layerOps.add}>
            + Add
          </Button>
        </div>
        <ol className="flex flex-col gap-1">
          {s.layers.map((l, i) => {
            const from = reachedFrom(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setLayer(i);
                    setSelected(null);
                  }}
                  className={cx("w-full rounded-lg border px-2.5 py-2 text-left transition", i === layer ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="w-5 text-xs text-muted">{i}</span>
                    <span className="truncate">{l.name}</span>
                    <span className="ml-auto text-[11px] text-muted">{l.buttons.length}</span>
                  </div>
                  {i > 0 && (
                    <div className={cx("mt-0.5 truncate pl-7 text-[11px]", from.length ? "text-muted" : "text-warning")}>{from.length ? `from ${from.slice(0, 3).join(", ")}${from.length > 3 ? "…" : ""}` : "not reachable"}</div>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Canvas */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Layer name" className="min-w-40 flex-1">
            <Input value={L.name} onChange={(e) => update((p) => (p.scouting.layers[layer].name = e.target.value))} />
          </Field>
          <Field label="Rows">
            <NumberInput value={s.grid.rows} onChange={(n) => n && n > 0 && n <= 20 && update((p) => (p.scouting.grid.rows = n))} className="w-16" />
          </Field>
          <Field label="Columns">
            <NumberInput value={s.grid.columns} onChange={(n) => n && n > 0 && n <= 24 && update((p) => (p.scouting.grid.columns = n))} className="w-16" />
          </Field>
          <Button onClick={() => setLandscape(!landscape)} title="Preview aspect ratio">
            {landscape ? "Landscape" : "Portrait"}
          </Button>
          <Button onClick={layerOps.duplicate}>Duplicate layer</Button>
          {layer > 0 && (
            <Button variant="ghost" onClick={layerOps.remove}>
              Delete layer
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span>Drag across empty cells to add a button · drag to move · corner handle to resize · arrow keys nudge · Delete removes.</span>
          <span className="ml-auto flex gap-1.5">
            <Button size="sm" onClick={() => quickAdd("match-control")}>
              + Timer button
            </Button>
            <Button size="sm" onClick={() => quickAdd("undo")}>
              + Undo
            </Button>
          </span>
        </div>
        <div className="mx-auto w-full" style={{ maxWidth: landscape ? "100%" : "26rem" }}>
          <div
            ref={canvas}
            className="relative grid select-none gap-1 rounded-xl border border-border bg-surface-2 p-1"
            style={{
              aspectRatio: landscape ? "19.5 / 9" : "9 / 17",
              gridTemplateRows: `repeat(${s.grid.rows}, minmax(0, 1fr))`,
              gridTemplateColumns: `repeat(${s.grid.columns}, minmax(0, 1fr))`,
              touchAction: "none",
            }}
          >
            {Array.from({ length: s.grid.rows * s.grid.columns }, (_, i) => {
              const r = Math.floor(i / s.grid.columns) + 1;
              const c = (i % s.grid.columns) + 1;
              return (
                <div
                  key={`c${i}`}
                  className="rounded-md border border-dashed border-border/80 hover:bg-accent-soft"
                  style={{ gridArea: `${r} / ${c} / ${r + 1} / ${c + 1}` }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setSelected(null);
                    setDrag({ kind: "create", start: [r, c], cur: [r, c] });
                  }}
                />
              );
            })}
            {L.buttons.map((b) => {
              const [r1, c1, r2, c2] = shown(b);
              const isSel = b.uid === selected;
              const bg = b.color === "transparent" ? "var(--surface)" : b.color;
              return (
                <div
                  key={b.uid}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelected(b.uid);
                    setDrag({ kind: "move", uid: b.uid, start: cellAt(e), cur: cellAt(e), orig: b.area });
                  }}
                  className={cx(
                    "relative flex min-h-0 min-w-0 cursor-grab flex-col items-center justify-center overflow-hidden rounded-md px-0.5 text-center text-[clamp(8px,1.1vw,13px)] font-semibold leading-tight shadow-sm",
                    isSel && "z-10 ring-2 ring-accent ring-offset-2 ring-offset-surface-2",
                    dupIds.has(b.id) && "outline outline-2 outline-warning",
                  )}
                  style={{ gridArea: `${r1} / ${c1} / ${r2} / ${c2}`, background: bg, color: b.textColor || contrastText(b.color) }}
                >
                  <span className="pointer-events-none whitespace-pre-line">{b.type === "match-control" ? s.messages.start : b.label}</span>
                  <span className="pointer-events-none mt-0.5 font-mono text-[0.7em] font-normal opacity-70">
                    {b.type === "action" ? b.id : TYPE_INFO[b.type].label}
                    {b.executables.length > 0 && ` · ${b.executables.length}⚡`}
                  </span>
                  {isSel && (
                    <span
                      className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-se-resize rounded-tl bg-accent"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDrag({ kind: "resize", uid: b.uid, start: cellAt(e), cur: cellAt(e), orig: b.area });
                      }}
                    />
                  )}
                </div>
              );
            })}
            {drag?.kind === "create" && preview && (
              <div className="pointer-events-none rounded-md border-2 border-accent bg-accent/25" style={{ gridArea: preview.area.join(" / ") }} />
            )}
          </div>
        </div>
      </div>

      {/* Inspector */}
      <div className="flex flex-col gap-3">
        {!sel ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            Select a button to edit it, or drag across empty cells to add one.
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs">
              <li>Put a Timer button and an Undo button on every layer scouters use during the match.</li>
              <li>Buttons with the same id on different layers record the same action.</li>
              <li>Use “Go to layer” to make menus (e.g. press Shoot → pick a rating → back).</li>
            </ul>
          </div>
        ) : (
          <ButtonInspector
            key={sel.uid}
            b={sel}
            project={project}
            layer={layer}
            setBtn={setBtn}
            update={update}
            duplicateId={dupIds.has(sel.id)}
            onDelete={() => {
              update((p) => {
                p.scouting.layers[layer].buttons = p.scouting.layers[layer].buttons.filter((b) => b.uid !== sel.uid);
              });
              setSelected(null);
            }}
            onDuplicate={() => {
              const uid = newUid();
              update((p) => p.scouting.layers[layer].buttons.push({ ...structuredClone(sel), uid, area: findFree(L.buttons, s.grid.rows, s.grid.columns, sel.area[3] - sel.area[1]) }));
              setSelected(uid);
            }}
            onCopyToLayers={() => setCopyOpen(true)}
          />
        )}
      </div>
      {sel && <CopyToLayers open={copyOpen} onClose={() => setCopyOpen(false)} project={project} from={layer} button={sel} update={update} />}
    </div>
  );
}

function findFree(buttons: ScoutButton[], rows: number, cols: number, width: number): GridArea {
  const used = new Set<string>();
  for (const b of buttons) for (let r = b.area[0]; r < b.area[2]; r++) for (let c = b.area[1]; c < b.area[3]; c++) used.add(`${r},${c}`);
  for (let r = rows; r >= 1; r--)
    for (let c = 1; c + width - 1 <= cols; c++) {
      let ok = true;
      for (let k = 0; k < width; k++) if (used.has(`${r},${c + k}`)) ok = false;
      if (ok) return [r, c, r + 1, c + width];
    }
  return [1, 1, 2, 1 + width];
}

function ButtonInspector({
  b,
  project,
  layer,
  setBtn,
  update,
  duplicateId,
  onDelete,
  onDuplicate,
  onCopyToLayers,
}: {
  b: ScoutButton;
  project: Project;
  layer: number;
  setBtn: (fn: (b: ScoutButton) => void) => void;
  update: Update;
  duplicateId: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopyToLayers: () => void;
}) {
  const s = project.scouting;
  const pts = project.scoring.points[b.id];
  const usedElsewhere = s.layers.filter((l, i) => i !== layer && l.buttons.some((x) => x.id === b.id)).length;
  const [r1, c1, r2, c2] = b.area;
  const setArea = (a: GridArea) => setBtn((x) => (x.area = a));
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Button</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onCopyToLayers}>
            Copy to…
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <Field label="Type" help={TYPE_INFO[b.type].help}>
        <Select value={b.type} onChange={(e) => setBtn((x) => (x.type = e.target.value as ScoutButton["type"]))}>
          {Object.entries(TYPE_INFO).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Action id"
        help={
          duplicateId ? (
            <span className="text-warning">Another button on this layer has the same id.</span>
          ) : usedElsewhere ? (
            `Also used on ${usedElsewhere} other layer${usedElsewhere > 1 ? "s" : ""} — those record the same action.`
          ) : s.prefixActionIds && b.type === "action" ? (
            "Recorded with the phase in front, e.g. auto" + b.id
          ) : (
            "The name recorded in the data. Letters and numbers, no spaces."
          )
        }
      >
        <Input value={b.id} onChange={(e) => setBtn((x) => (x.id = e.target.value.replace(/\s+/g, "")))} className="font-mono text-xs" />
      </Field>
      <Field label="Label" help="Use a new line for a second line of text.">
        <Textarea rows={2} value={b.label} onChange={(e) => setBtn((x) => (x.label = e.target.value))} className="font-sans text-sm" />
      </Field>
      <Field label="Small hint (optional)">
        <Input value={b.hint ?? ""} onChange={(e) => setBtn((x) => (e.target.value ? (x.hint = e.target.value) : delete x.hint))} />
      </Field>
      <div>
        <div className="mb-1 text-xs font-medium text-muted">Color</div>
        <div className="flex flex-wrap gap-1">
          {PALETTE.map((p) => (
            <button
              key={p.color}
              type="button"
              title={p.name}
              onClick={() => setBtn((x) => (x.color = p.color))}
              className={cx("h-6 w-6 rounded-md border border-black/10", b.color === p.color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
              style={{ background: p.color }}
            />
          ))}
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-md border border-border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" title="Custom color">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#888888"} onChange={(e) => setBtn((x) => (x.color = e.target.value))} className="absolute inset-0 opacity-0" />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Row">
          <NumberInput value={r1} onChange={(n) => n && setArea([n, c1, n + (r2 - r1), c2])} />
        </Field>
        <Field label="Col">
          <NumberInput value={c1} onChange={(n) => n && setArea([r1, n, r2, n + (c2 - c1)])} />
        </Field>
        <Field label="Height">
          <NumberInput value={r2 - r1} onChange={(n) => n && n > 0 && setArea([r1, c1, r1 + n, c2])} />
        </Field>
        <Field label="Width">
          <NumberInput value={c2 - c1} onChange={(n) => n && n > 0 && setArea([r1, c1, r2, c1 + n])} />
        </Field>
      </div>
      {b.type === "action" && (
        <Field label="Points (scoring map)" help="Used for scouter accuracy and the 'Points from scoring map' pipeline step. Leave empty for 0.">
          <NumberInput
            value={pts ?? null}
            onChange={(n) =>
              update((p) => {
                if (n === null) delete p.scoring.points[b.id];
                else p.scoring.points[b.id] = n;
              })
            }
            placeholder="0"
          />
        </Field>
      )}
      <ExecutablesEditor b={b} project={project} layer={layer} setBtn={setBtn} />
    </div>
  );
}

function ExecutablesEditor({ b, project, layer, setBtn }: { b: ScoutButton; project: Project; layer: number; setBtn: (fn: (b: ScoutButton) => void) => void }) {
  const layers = project.scouting.layers;
  const setArgs = (i: number, args: unknown[]) => setBtn((x) => (x.executables[i] = { ...x.executables[i], args }));
  const layerSelect = (value: unknown, onChange: (n: number) => void) => (
    <Select value={String(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))}>
      {layers.map((l, i) => (
        <option key={i} value={i}>
          {i} · {l.name}
        </option>
      ))}
    </Select>
  );
  const allIds = [...new Set(layers.flatMap((l) => l.buttons.map((x) => x.id)))];
  const vars = Object.keys(project.scouting.variables);

  const body = (e: Executable, i: number) => {
    const a = e.args;
    switch (e.type) {
      case "layer":
        return layerSelect(a[1], (n) => setArgs(i, [layer, n]));
      case "conditionalLayer": {
        const cond = (a[3] as Record<string, Record<string, string[]>>) ?? {};
        const rows = Object.entries(cond).flatMap(([v, m]) => Object.entries(m).map(([val, ids]) => ({ v, val, ids })));
        const save = (rs: typeof rows) => {
          const out: Record<string, Record<string, string[]>> = {};
          for (const r of rs) ((out[r.v] ??= {})[r.val] = r.ids);
          setArgs(i, [layer, a[1], a[2] ?? [], out]);
        };
        return (
          <div className="flex flex-col gap-2">
            {layerSelect(a[1], (n) => setArgs(i, [layer, n, a[2] ?? [], cond]))}
            <span className="text-[11px] text-muted">Always show</span>
            <TagInput value={(a[2] as string[]) ?? []} onChange={(v) => setArgs(i, [layer, a[1], v, cond])} suggestions={allIds} />
            <span className="text-[11px] text-muted">Show buttons when variable = value</span>
            {rows.map((r, k) => (
              <div key={k} className="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1.5">
                <Input list="spot-vars" value={r.v} placeholder="variable" onChange={(ev) => save(rows.map((x, j) => (j === k ? { ...x, v: ev.target.value } : x)))} className="h-7 text-xs" />
                <Input value={r.val} placeholder="value" onChange={(ev) => save(rows.map((x, j) => (j === k ? { ...x, val: ev.target.value } : x)))} className="h-7 text-xs" />
                <div className="col-span-2">
                  <TagInput value={r.ids} onChange={(ids) => save(rows.map((x, j) => (j === k ? { ...x, ids } : x)))} suggestions={allIds} />
                </div>
                <Button size="sm" variant="ghost" className="col-span-2" onClick={() => save(rows.filter((_, j) => j !== k))}>
                  Remove condition
                </Button>
              </div>
            ))}
            <datalist id="spot-vars">
              {vars.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <Button size="sm" variant="ghost" onClick={() => save([...rows, { v: vars[0] ?? "variable", val: "value" + rows.length, ids: [] }])}>
              + Condition
            </Button>
          </div>
        );
      }
      case "setVariable":
        return (
          <div className="grid grid-cols-2 gap-1">
            <Input list="spot-vars2" value={String(a[0] ?? "")} placeholder="variable" onChange={(ev) => setArgs(i, [ev.target.value, a[1]])} className="h-8 text-xs" />
            <Input value={String(a[1] ?? "")} placeholder="value" onChange={(ev) => setArgs(i, [a[0], ev.target.value])} className="h-8 text-xs" />
            <datalist id="spot-vars2">
              {vars.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
        );
      case "constantPosition": {
        const p = (a[0] as { x: number; y: number }) ?? { x: 50, y: 50 };
        return (
          <div className="grid grid-cols-2 gap-1">
            <NumberInput value={p.x} onChange={(n) => setArgs(i, [{ ...p, x: n ?? 0 }])} placeholder="x %" className="h-8 text-xs" />
            <NumberInput value={p.y} onChange={(n) => setArgs(i, [{ ...p, y: n ?? 0 }])} placeholder="y %" className="h-8 text-xs" />
          </div>
        );
      }
      case "multiplier":
        return <NumberInput value={Number(a[0] ?? 2)} onChange={(n) => setArgs(i, [Math.max(1, n ?? 1)])} className="h-8 w-24 text-xs" />;
      case "position":
        return <span className="text-[11px] text-muted">Position lock re-uses a tap for {project.scouting.positionLockMs} ms (Timing tab).</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">When pressed (executables, in order)</span>
      </div>
      {b.executables.map((e, i) => (
        <div key={i} className="rounded-lg border border-border p-2">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="text-xs font-semibold">{EXEC_INFO[e.type]?.label ?? e.type}</span>
            <span className="flex">
              <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => setBtn((x) => x.executables.splice(i - 1, 0, ...x.executables.splice(i, 1)))} aria-label="Move up">
                ↑
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setBtn((x) => x.executables.splice(i, 1))} aria-label="Remove">
                ×
              </Button>
            </span>
          </div>
          {body(e, i)}
          <p className="mt-1 text-[11px] text-muted">{EXEC_INFO[e.type]?.help}</p>
        </div>
      ))}
      <Select
        value=""
        onChange={(e) => {
          const t = e.target.value as ExecutableType;
          if (t) setBtn((x) => x.executables.push({ type: t, args: DEFAULT_ARGS[t](layer) }));
        }}
      >
        <option value="">+ Add behavior…</option>
        {Object.entries(EXEC_INFO).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function CopyToLayers({ open, onClose, project, from, button, update }: { open: boolean; onClose: () => void; project: Project; from: number; button: ScoutButton; update: Update }) {
  const [targets, setTargets] = useState<number[]>([]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Copy "${button.label.split("\n")[0]}" to layers`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!targets.length}
            onClick={() => {
              update((p) =>
                targets.forEach((t) => {
                  const l = p.scouting.layers[t];
                  l.buttons = l.buttons.filter((x) => !(x.id === button.id && x.type === button.type));
                  l.buttons.push({ ...structuredClone(button), uid: newUid() });
                }),
              );
              setTargets([]);
              onClose();
            }}
          >
            Copy to {targets.length} layer{targets.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">Same position and behavior. A button with the same id and type already on a target layer is replaced.</p>
      <div className="mb-2 flex gap-2">
        <Button size="sm" onClick={() => setTargets(project.scouting.layers.map((_, i) => i).filter((i) => i !== from && i !== 0))}>
          All match layers
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTargets([])}>
          None
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {project.scouting.layers.map((l, i) =>
          i === from ? null : (
            <li key={i}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={targets.includes(i)} onChange={(e) => setTargets(e.target.checked ? [...targets, i] : targets.filter((x) => x !== i))} className="h-4 w-4 accent-[var(--accent)]" />
                {i} · {l.name}
                {l.buttons.some((x) => x.id === button.id) && <Badge>has one</Badge>}
              </label>
            </li>
          ),
        )}
      </ul>
    </Modal>
  );
}
