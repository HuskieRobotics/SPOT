import { route, json, bad } from "@/lib/server/http";
import { connectDb, FieldMapModel } from "@/lib/server/db";
import { listCodebaseFiles, listFieldMaps, toDto } from "@/lib/server/fieldMaps";
import { inspectUpload, isValidMapUrl } from "@/lib/fieldMaps";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ maps: await listFieldMaps(), files: listCodebaseFiles() }), { admin: true });

/**
 * Save a field map to the library. Body: { name, kind: "file" | "url" | "upload", ref?, dataBase64? }
 *  - file:   ref must be one of the images found in the codebase (see GET .files)
 *  - url:    ref is an http(s) address
 *  - upload: dataBase64 is the SVG/PNG/JPG/WebP file (max 2 MB); stored in MongoDB
 */
export const POST = route(
  async (req) => {
    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? "").trim().slice(0, 60);
    if (!name) return bad("Give the map a name.");
    await connectDb();
    let doc: any;
    if (body.kind === "file") {
      const ref = String(body.ref ?? "");
      if (!listCodebaseFiles().some((f) => f.path === ref)) return bad("That file was not found in the codebase.");
      doc = { name, kind: "file", ref };
    } else if (body.kind === "url") {
      const ref = String(body.ref ?? "").trim();
      if (!isValidMapUrl(ref)) return bad("Enter a full web address starting with https://");
      doc = { name, kind: "url", ref };
    } else if (body.kind === "upload") {
      const data = Buffer.from(String(body.dataBase64 ?? ""), "base64");
      const check = inspectUpload(data);
      if (!check.ok) return bad(check.error);
      doc = { name, kind: "upload", contentType: check.contentType, data };
    } else return bad("Unknown map type.");
    return json(toDto((await FieldMapModel.create(doc)).toObject()), 201);
  },
  { admin: true },
);
