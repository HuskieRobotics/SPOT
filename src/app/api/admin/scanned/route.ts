/**
 * Records scanned from QR codes (#411; AD-20, AD-21, OF-4, SEC-5), behind the admin session that
 * `src/proxy.ts` checks, so no join code is needed: the admin who scans is trusted.
 *
 * POST `{ records: [{ eventId, ...record }] }`, at most 50, each as a scouting device would send
 * it with the event its code names → `{ results }`, one per record in order, as the submission
 * route answers (#360): `stored` with the record's `id`, `duplicate`, or `invalid` with a message.
 * They are stored with source `qr` (DV-5) and settled by the same rules (RT-14a, RT-35).
 */
import { getDb } from "@/db/client";
import { getEvent } from "@/db/events";
import { Refusal, refusalResponse } from "@/lib/refusal";
import { jsonBody } from "@/sessions/input";
import { getRuntime } from "@/sessions/runtime";
import { submitPerformances } from "@/submissions/service";
import { MAX_SUBMISSIONS, type SubmissionResult } from "@/submissions/submission";

export const dynamic = "force-dynamic";

const OBJECT_ID = /^[0-9a-f]{24}$/;

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const records = body.records;
    if (!Array.isArray(records))
      throw new Refusal(400, "body", "The request must carry a list of records.");
    if (records.length > MAX_SUBMISSIONS)
      throw new Refusal(413, "too-many", `Send at most ${MAX_SUBMISSIONS} records at a time.`);
    const db = await getDb();
    const runtime = await getRuntime();
    const results: SubmissionResult[] = [];
    // One at a time, in order: two scans of one robot settle as they arrived.
    for (const sent of records as Record<string, unknown>[]) {
      const nonce = typeof sent?.nonce === "string" ? sent.nonce : null;
      const eventId = sent?.eventId;
      const event =
        typeof eventId === "string" && OBJECT_ID.test(eventId) ? await getEvent(db, eventId) : null;
      if (!event) {
        results.push({
          nonce,
          status: "invalid",
          message:
            "This code is from an event this server does not have. Was it scouted with another server?",
        });
        continue;
      }
      results.push(
        ...(await submitPerformances(db, event, [sent], {
          source: "qr",
          assignmentOf: (level, matchNumber, team) =>
            runtime.assignmentOf(event._id, level, matchNumber, team),
        })),
      );
    }
    return Response.json({ results });
  } catch (error) {
    return refusalResponse(error);
  }
}
