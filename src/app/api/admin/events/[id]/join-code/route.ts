/**
 * Rotate an event's code (SEC-3), behind the admin session that `src/proxy.ts` checks.
 *
 * POST → `{ joinCode, joinCodeRotatedAt }`; 404 if there is no such event
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { rotateJoinCode } from "@/db/events";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = /^[0-9a-f]{24}$/.test(id) ? await rotateJoinCode(await getDb(), id) : null;
  if (!event)
    return NextResponse.json(
      { error: "not-found", message: "There is no such event." },
      { status: 404 },
    );
  return NextResponse.json({
    joinCode: event.joinCode,
    joinCodeRotatedAt: event.joinCodeRotatedAt,
  });
}
