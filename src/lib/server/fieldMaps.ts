import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { CodebaseMapFile, FieldMapDto } from "../types";
import { connectDb, FieldMapModel, SettingsModel } from "./db";
import { getSettings } from "./store";

const EXT = /\.(svg|png|jpe?g|webp)$/i;
/** Maps that ship with SPOT (used by the season templates). */
export const BUILTIN_MAPS = [
  { path: "/img/field.svg", name: "Full field (default)" },
  { path: "/img/half-field.svg", name: "Half field (2026 heatmap)" },
];

/** Images that exist in the codebase: public/field-maps/* plus the built-ins. */
export function listCodebaseFiles(): CodebaseMapFile[] {
  const out: CodebaseMapFile[] = BUILTIN_MAPS.map((b) => ({ path: b.path, name: b.name, builtin: true }));
  try {
    const dir = path.join(process.cwd(), "public", "field-maps");
    for (const f of fs.readdirSync(dir).sort()) if (EXT.test(f)) out.push({ path: `/field-maps/${f}`, name: f, builtin: false });
  } catch {
    /* folder missing: only built-ins */
  }
  return out;
}

export function toDto(doc: any): FieldMapDto {
  const id = String(doc._id);
  return {
    _id: id,
    name: doc.name,
    kind: doc.kind,
    src: doc.kind === "upload" ? `/api/field-maps/${id}/image` : doc.ref,
    builtin: BUILTIN_MAPS.some((b) => b.path === doc.ref),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
  };
}

/** First use: put the built-in maps in the library so templates' images are selectable. */
async function seed() {
  // Run the normal first-run setup (event, projects) before touching the settings document.
  await getSettings();
  const s: any = await SettingsModel.findById("global", { fieldMapsSeeded: 1 }).lean();
  if (s?.fieldMapsSeeded) return;
  for (const b of BUILTIN_MAPS) await FieldMapModel.updateOne({ kind: "file", ref: b.path }, { $setOnInsert: { name: b.name, kind: "file", ref: b.path } }, { upsert: true });
  await SettingsModel.updateOne({ _id: "global" }, { $set: { fieldMapsSeeded: true } });
}

export async function listFieldMaps(): Promise<FieldMapDto[]> {
  await connectDb();
  await seed();
  const docs = await FieldMapModel.find({}, { data: 0 }).sort({ createdAt: 1, _id: 1 }).lean();
  return docs.map(toDto);
}
