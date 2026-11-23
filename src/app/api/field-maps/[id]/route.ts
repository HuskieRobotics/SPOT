import mongoose from "mongoose";
import { route, json, bad } from "@/lib/server/http";
import { connectDb, FieldMapModel, ProjectModel } from "@/lib/server/db";
import { toDto } from "@/lib/server/fieldMaps";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Refuses while any project still uses the map, so scouting never loses its image. */
export const DELETE = route<Ctx>(
  async (_req, { params }) => {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return bad("Bad id");
    await connectDb();
    const doc = await FieldMapModel.findById(id, { data: 0 }).lean();
    if (!doc) return bad("Map not found", 404);
    const src = toDto(doc).src;
    const users: string[] = [];
    for (const p of (await ProjectModel.find({}, { name: 1, scouting: 1, modules: 1 }).lean()) as any[]) {
      const hay = JSON.stringify({ f: p.scouting?.field, m: p.modules });
      if (p.scouting?.field?.mapId === id || hay.includes(JSON.stringify(src).slice(1, -1))) users.push(p.name);
    }
    if (users.length) return bad(`Still used by: ${users.join(", ")}. Pick a different map there first.`, 409);
    await FieldMapModel.deleteOne({ _id: id });
    return json({ ok: true });
  },
  { admin: true },
);
