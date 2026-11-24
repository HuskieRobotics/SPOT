/**
 * The scouter registry for admins (RT-15 to RT-18, #354), behind the admin session that
 * `src/proxy.ts` checks. Admin views poll GET every 2 to 3 s (NF-5, RT-14c).
 *
 * GET  → `{ snapshot }`: the event, current match, start rules and every entry; null if no
 *        event is active
 * POST `{ action: "set-match", matchNumber }` (a number, or null for none) — RT-16
 *      `{ action: "start" }` — admin start (RT-12a)
 *      `{ action: "release", scouterId, to? }` — RT-31, RT-32
 *      `{ action: "remove", scouterId }` — RT-29; signs the device out
 */
import { jsonBody, scouterIdFrom } from "@/sessions/input";
import { getRuntime, Refusal, refusalResponse } from "@/sessions/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = await getRuntime();
    return Response.json({ snapshot: await runtime.snapshot() });
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const runtime = await getRuntime();
    switch (body.action) {
      case "set-match": {
        const m = body.match as { level?: unknown; number?: unknown } | null | undefined;
        if (m === null) await runtime.setMatch(null);
        else if (
          m &&
          (m.level === "qual" || m.level === "playoff") &&
          typeof m.number === "number" &&
          Number.isInteger(m.number) &&
          m.number >= 1
        )
          await runtime.setMatch({ level: m.level, number: m.number });
        else
          throw new Refusal(
            400,
            "match",
            "The match is { level: qual or playoff, number: a whole number from 1 }, or null.",
          );
        break;
      }
      case "start":
        await runtime.adminStart();
        break;
      case "release":
        await runtime.release(
          scouterIdFrom(body.scouterId),
          body.to === undefined || body.to === null ? undefined : scouterIdFrom(body.to),
        );
        break;
      case "remove":
        await runtime.remove(scouterIdFrom(body.scouterId));
        break;
      default:
        throw new Refusal(400, "action", "The action must be set-match, start, release or remove.");
    }
    return Response.json({ snapshot: await runtime.snapshot() });
  } catch (error) {
    return refusalResponse(error);
  }
}
