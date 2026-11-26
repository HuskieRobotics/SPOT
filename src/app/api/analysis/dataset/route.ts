/**
 * An event's scouting data, for the analysis dashboard (#382; AN-6, SEC-1, SEC-8). Anyone may
 * read it. The browser runs TBA enrichment and the pipeline on it (TR-9).
 *
 * GET `?event=<code>` (the active event when absent) → `{ event, performances }`: the current
 * records, without scouter ids. 404 with a message for an unknown code, or when none is named
 * and none is active.
 */
import { getDb } from "@/db/client";
import { refusalResponse } from "@/lib/refusal";
import { currentPerformances, requestedEvent } from "@/public-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { event, summary } = await requestedEvent(db, request);
    return Response.json(
      { event: summary, performances: await currentPerformances(db, event) },
      { headers: { "cache-control": "no-cache" } },
    );
  } catch (error) {
    return refusalResponse(error);
  }
}
