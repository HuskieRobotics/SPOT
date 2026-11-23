"use client";
import { useState } from "react";
import { Badge, Button, Card, Empty, Field, Input, Tabs, api, cx, useConfirm, useToast } from "@/components/ui";
import { MAX_MAP_BYTES } from "@/lib/fieldMaps";
import type { CodebaseMapFile, FieldMapDto, Project } from "@/lib/types";

type Update = (fn: (p: Project) => void) => void;
type Source = "file" | "url" | "upload";

const KIND_LABEL: Record<FieldMapDto["kind"], string> = { file: "Codebase file", url: "Web address", upload: "Uploaded" };

function Thumb({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cx("rounded-md bg-black object-contain", className)} />;
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });

/**
 * Field maps: a library shared by every project. Scouters tap the project's map to record robot
 * positions, and heatmaps in the dashboard draw on a saved map.
 * Saving to the library is immediate; choosing the project's scouting map needs the project Save.
 */
export function FieldMapEditor({ project, update, maps, files, reload }: { project: Project; update: Update; maps: FieldMapDto[]; files: CodebaseMapFile[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [source, setSource] = useState<Source>("file");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [upload, setUpload] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const field = project.scouting.field;
  const current = maps.find((m) => m._id === field.mapId) ?? maps.find((m) => m.src === field.image);
  const usedPaths = new Set(maps.filter((m) => m.kind === "file").map((m) => m.src));

  const reset = () => {
    setName("");
    setPicked(null);
    setUrl("");
    setUpload(null);
  };

  const canSave = !!name.trim() && !busy && ((source === "file" && picked) || (source === "url" && /^https?:\/\/\S+$/i.test(url.trim())) || (source === "upload" && upload));

  const save = async () => {
    setBusy(true);
    try {
      const body =
        source === "file" ? { name, kind: "file", ref: picked } : source === "url" ? { name, kind: "url", ref: url.trim() } : { name, kind: "upload", dataBase64: await toBase64(upload!.file) };
      await api<FieldMapDto>("/api/field-maps", { method: "POST", json: body });
      await reload();
      toast(`“${name.trim()}” saved to the library`, "success");
      reset();
    } catch (e) {
      toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: FieldMapDto) => {
    if (!(await confirm(`Delete “${m.name}”?`, { danger: true, confirmLabel: "Delete", body: m.kind === "upload" ? "The uploaded image is removed from the database." : "Only the library entry is removed; the file or web address itself is untouched." }))) return;
    try {
      await api(`/api/field-maps/${m._id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  };

  const pickUpload = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MAP_BYTES) return toast(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MAP_BYTES / 1024 / 1024} MB.`, "danger");
    if (upload) URL.revokeObjectURL(upload.preview);
    setUpload({ file, preview: URL.createObjectURL(file) });
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
  };

  const preview = source === "file" ? picked : source === "url" ? (/^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : null) : upload?.preview ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      {dialog}
      <div className="flex flex-col gap-5">
        <Card title="Map used for scouting" description="Scouters tap this map to record where the robot is, whenever a button has the “Ask for field position” behavior.">
          <div className="flex flex-wrap items-center gap-4 p-4">
            <Thumb src={field.image || "/img/field.svg"} className="h-28 w-48" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{current?.name ?? "Custom image"}</div>
              <div className="truncate font-mono text-xs text-muted">{field.image}</div>
              <p className="mt-2 text-xs text-muted">
                Turn on <b>Flipped field</b> in Admin → Event &amp; settings if your scouts sit on the other side; the map rotates and positions are flipped back so data stays consistent.
              </p>
            </div>
          </div>
        </Card>

        <Card title={`Saved maps (${maps.length})`} description="Shared by every project. Pick one for scouting here, or in a Field heatmap module on the Dashboard tab.">
          {maps.length === 0 ? (
            <Empty title="No saved maps yet">Add one with the form on the right.</Empty>
          ) : (
            <ul className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
              {maps.map((m) => {
                const active = current?._id === m._id;
                return (
                  <li key={m._id} className={cx("flex flex-col gap-2 rounded-xl border p-3", active ? "border-accent bg-accent-soft/40" : "border-border")}>
                    <Thumb src={m.src} className="h-32 w-full" />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{m.name}</div>
                        <div className="truncate font-mono text-[11px] text-muted">{m.kind === "upload" ? "stored in the database" : m.src}</div>
                      </div>
                      <Badge tone={m.kind === "upload" ? "success" : "neutral"}>{KIND_LABEL[m.kind]}</Badge>
                    </div>
                    <div className="flex gap-2">
                      {active ? (
                        <Badge tone="accent" className="px-2 py-1">
                          Used for scouting
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() =>
                            update((p) => {
                              p.scouting.field.image = m.src;
                              p.scouting.field.mapId = m._id;
                            })
                          }
                        >
                          Use for scouting
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove(m)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Add a map" description="New maps are saved to the library right away.">
        <div className="flex flex-col gap-4 p-4">
          <Tabs
            value={source}
            onChange={(s) => {
              setSource(s);
              setPicked(null);
            }}
            items={[
              { value: "file", label: "Codebase" },
              { value: "url", label: "Web address" },
              { value: "upload", label: "Upload" },
            ]}
          />

          {source === "file" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {files.map((f) => {
                  const saved = usedPaths.has(f.path);
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => {
                        setPicked(f.path);
                        if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
                      }}
                      className={cx("flex flex-col gap-1 rounded-lg border p-2 text-left transition", picked === f.path ? "border-accent bg-accent-soft/50" : "border-border hover:bg-surface-2")}
                    >
                      <Thumb src={f.path} className="h-20 w-full" />
                      <span className="truncate text-xs font-medium">{f.name}</span>
                      {saved && <Badge tone="success">Saved</Badge>}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
                <b className="text-text">Adding more files:</b>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>
                    Copy your image (SVG, PNG, JPG or WebP) into the <code className="rounded bg-surface px-1">public/field-maps/</code> folder of the SPOT code.
                  </li>
                  <li>
                    Running with <code className="rounded bg-surface px-1">npm run dev</code>: reload this page.
                  </li>
                  <li>
                    On a server: commit the file, then rebuild and restart (<code className="rounded bg-surface px-1">npm run build</code>, then restart). New files in <code className="rounded bg-surface px-1">public/</code> are not served until the next build.
                  </li>
                </ol>
                <p className="mt-2">No code access? Use the <b>Upload</b> tab instead. It needs no setup.</p>
              </div>
            </>
          )}

          {source === "url" && (
            <Field label="Image address" help="Must start with https:// and point straight at the image. Scouters need internet to load it, so for offline scouting prefer Upload or a codebase file.">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/field.png" />
            </Field>
          )}

          {source === "upload" && (
            <Field label="Image file" help={`SVG, PNG, JPG or WebP, up to ${MAX_MAP_BYTES / 1024 / 1024} MB. Stored in your MongoDB database, so there is nothing else to configure and it works offline once scouters have loaded it. SVGs with scripts are rejected.`}>
              <input type="file" accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp" onChange={(e) => pickUpload(e.target.files?.[0])} className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text" />
            </Field>
          )}

          {preview && <Thumb src={preview} className="h-40 w-full" />}
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2027 field" maxLength={60} />
          </Field>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            Save to library
          </Button>
        </div>
      </Card>
    </div>
  );
}
