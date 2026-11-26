/**
 * An event's TBA data, for the analysis dashboard (#382; AN-6, AN-9, AN-12, NF-6): matches with
 * score breakdowns, component OPRs, and the event's teams. Anyone may read it (SEC-1).
 *
 * GET `?event=<code>` (the active event when absent) → `{ event, tba, error }`: `tba` is
 * `{ matches, coprs, teams, fetchedAt }`, the copy kept for the event, read from TBA again when
 * more than five minutes old; null when TBA was never read for it. `error` says why TBA could
 * not be read just now, or is null. 404 as for the dataset.
 */
import { getDb } from "@/db/client";
import { refusalResponse } from "@/lib/refusal";
import { requestedEvent } from "@/public-data";
import { tbaDataFor } from "@/public-data/tba";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { event, summary } = await requestedEvent(db, request);
    const { data, error } = await tbaDataFor(db, event);
    return Response.json(
      { event: summary, tba: data, error },
      { headers: { "cache-control": "no-cache" } },
    );
  } catch (error) {
    return refusalResponse(error);
  }
}
