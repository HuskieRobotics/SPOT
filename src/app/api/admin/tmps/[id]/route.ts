import mongoose from "mongoose";
import { route, json, bad } from "@/lib/server/http";
import { connectDb, plain, TmpModel } from "@/lib/server/db";
import { getServerConfig } from "@/lib/server/env";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Flag / unflag (with a reason) or annotate a scouted match. */
export const PATCH = route<Ctx>(
  async (req, { params }) => {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return bad("Bad id");
    const body = await req.json().catch(() => ({}));
    const $set: Record<string, unknown> = {};
    if (typeof body.flagged === "boolean") $set.flagged = body.flagged;
    if (typeof body.flagReason === "string") $set.flagReason = body.flagReason.slice(0, 500);
    if (typeof body.notes === "string") $set.notes = body.notes.slice(0, 2000);
    await connectDb();
    const doc = await TmpModel.findByIdAndUpdate(id, { $set }, { new: true }).lean();
    return doc ? json(plain(doc)) : bad("Not found", 404);
  },
  { admin: true },
);

export const DELETE = route<Ctx>(
  async (_req, { params }) => {
    if (getServerConfig().demo) return bad("Deleting is disabled in demo mode.", 403);
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return bad("Bad id");
    await connectDb();
    await TmpModel.deleteOne({ _id: id });
    return json({ ok: true });
  },
  { admin: true },
);
