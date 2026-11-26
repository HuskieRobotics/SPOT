/**
 * Every event, for the analysis dashboard's event choice (#382; AN-3, AN-11a, DV-12b): anyone may
 * read it (SEC-1), and no join code is in it (SEC-3).
 *
 * GET → `{ events: [{ code, tbaKey, label, active }] }`, newest code first.
 */
import { getDb } from "@/db/client";
import { refusalResponse } from "@/lib/refusal";
import { eventList } from "@/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ events: await eventList(await getDb()) });
  } catch (error) {
    return refusalResponse(error);
  }
}
