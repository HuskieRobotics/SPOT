/**
 * The roster for admins (SEC-6, SEC-6a, #357), behind the admin session that `src/proxy.ts`
 * checks.
 *
 * GET  → `{ scouters: [{ id, name }] }`, by name: the roster devices sign in from
 * POST `{ action: "rename", scouterId, name }` → `{ scouter: { id, name } }`: correct a name a
 *      student misspelled when adding themselves. Devices see it the next time they read the
 *      roster. 404 if there is no such scouter.
 */
import { getDb } from "@/db/client";
import { renameScouter, rosterFor } from "@/db/scouters";
import { Refusal, refusalResponse } from "@/lib/refusal";
import { jsonBody, nameFrom, scouterIdFrom } from "@/sessions/input";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ scouters: await rosterFor(await getDb()) });
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    if (body.action !== "rename") throw new Refusal(400, "action", "The action must be rename.");
    const id = scouterIdFrom(body.scouterId);
    const name = nameFrom(body.name);
    const scouter = await renameScouter(await getDb(), id, name);
    if (!scouter) throw new Refusal(404, "not-found", `There is no scouter with student ID ${id}.`);
    return Response.json({ scouter: { id: scouter._id, name: scouter.displayName } });
  } catch (error) {
    return refusalResponse(error);
  }
}
