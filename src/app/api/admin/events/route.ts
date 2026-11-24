/**
 * Events for admins (SEC-3, SEC-5), behind the admin session that `src/proxy.ts` checks.
 *
 * GET  → every event, with its join code
 * POST `{ tbaKey, label }` → 201 with the new event and its fresh join code; 400; 409 in use
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { adminEvents, createEvent, findEventByCode } from "@/db/events";

const TBA_KEY = /^\d{4}[a-z][a-z0-9]*$/;
const LABEL = /^[A-Za-z0-9_-]+$/;

export async function GET() {
  return NextResponse.json(await adminEvents(await getDb()));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    tbaKey?: unknown;
    label?: unknown;
  } | null;
  const tbaKey = typeof body?.tbaKey === "string" ? body.tbaKey.trim().toLowerCase() : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!TBA_KEY.test(tbaKey))
    return NextResponse.json(
      {
        error: "tba-key",
        message: "The TBA event key is the year and the event's short name, such as 2026mnwi.",
      },
      { status: 400 },
    );
  if (!LABEL.test(label))
    return NextResponse.json(
      {
        error: "label",
        message: "The label uses only letters, digits, _ and -, such as official or practice.",
      },
      { status: 400 },
    );
  const db = await getDb();
  if (await findEventByCode(db, `${tbaKey}_${label}`))
    return NextResponse.json(
      { error: "in-use", message: `There is already an event ${tbaKey}_${label}.` },
      { status: 409 },
    );
  return NextResponse.json(await createEvent(db, { tbaKey, label }), { status: 201 });
}
