import mongoose from "mongoose";
import { connectDb, FieldMapModel } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded map. Public on purpose: scouting phones load it, and the service worker
 * caches it for offline use. Maps never change once saved, so it is cached as immutable.
 * The CSP makes a directly-opened SVG inert even if a script slipped past upload checks.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return new Response("Not found", { status: 404 });
  await connectDb();
  const doc = await FieldMapModel.findById(id);
  if (!doc || doc.kind !== "upload" || !doc.data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
