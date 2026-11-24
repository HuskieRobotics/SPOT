/**
 * The roster a device signs in from (SEC-6, SEC-7, #356). Both need the active event's join
 * code in `X-SPOT-Join-Code`: names are not a public read (SEC-8).
 *
 * GET  → `{ scouters: [{ id, name }] }`, by name
 * POST `{ scouters: [{ id, name }] }` → `{ results: [{ id, status, name, message? }] }`: adds
 *      scouters a device added while offline (SEC-7). `status` is `created`, `exists`, or
 *      `conflict` when the student ID is on the roster under another name, which is kept.
 */
import { activeEventFor } from "@/auth/active-event";
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import { getDb } from "@/db/client";
import { addScouter, rosterFor } from "@/db/scouters";
import { Refusal, refusalResponse } from "@/lib/refusal";
import { jsonBody, nameFrom, scouterIdFrom } from "@/sessions/input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    await activeEventFor(db, request.headers.get(JOIN_CODE_HEADER));
    return Response.json({ scouters: await rosterFor(db) });
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    await activeEventFor(db, request.headers.get(JOIN_CODE_HEADER));
    const body = await jsonBody(request);
    if (!Array.isArray(body.scouters) || body.scouters.length > 200)
      throw new Refusal(400, "scouters", "Send a list of at most 200 scouters.");
    const results = [];
    for (const s of body.scouters as { id?: unknown; name?: unknown }[]) {
      const id = scouterIdFrom(s?.id);
      const added = await addScouter(db, { id, name: nameFrom(s?.name) });
      results.push({
        id,
        status: added.status,
        name: added.scouter.displayName,
        ...(added.status === "conflict"
          ? {
              message: `Student ID ${id} is already on the roster as ${added.scouter.displayName}. Check the ID, or ask an admin to correct the name.`,
            }
          : {}),
      });
    }
    return Response.json({ results });
  } catch (error) {
    return refusalResponse(error);
  }
}
