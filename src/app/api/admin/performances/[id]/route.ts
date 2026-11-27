/**
 * One record on the edit page (#410; document 07 AD-13 to AD-15, RT-35, SEC-5), behind the admin
 * session that `src/proxy.ts` checks. Every answer is 404 for a record this server does not have.
 *
 * GET    → `{ actions }`: the record's actions in order (AD-13)
 * POST   `{ action: "flag", reason }` → flag it for review, with a reason anyone may read
 *        (AD-13a, AD-14, SEC-8); an empty reason is none. 400 for a reason over 300 characters.
 *        `{ action: "unflag" }` → clear the flag, so no rule flags it again
 *        `{ action: "promote" }` → make it the record analysis uses for its robot and match (RT-35)
 * DELETE → delete it (AD-15). It is kept apart, so a copy sent again is not stored (DV-20); if it
 *        was the record analysis used, the rules pick one of the robot's others.
 * POST and DELETE answer `{ ok: true }`.
 */
import { getDb } from "@/db/client";
import { getPerformance } from "@/db/performances";
import { Refusal, refusalResponse } from "@/lib/refusal";
import { jsonBody } from "@/sessions/input";
import { getRuntime } from "@/sessions/runtime";
import {
  deleteRecord,
  MAX_FLAG_REASON,
  promoteRecord,
  setFlag,
  type EditOptions,
} from "@/submissions/edits";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = new Refusal(
  404,
  "not-found",
  "There is no such record. Someone may have deleted it; reload the page.",
);

async function recordId({ params }: Context): Promise<string> {
  const { id } = await params;
  if (!/^[0-9a-f]{24}$/.test(id)) throw NOT_FOUND;
  return id;
}

async function editOptions(): Promise<EditOptions> {
  const runtime = await getRuntime();
  return { assignmentOf: (...match) => runtime.assignmentOf(...match) };
}

function reasonFrom(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Refusal(400, "reason", "The reason must be text.");
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length > MAX_FLAG_REASON)
    throw new Refusal(
      400,
      "reason",
      `Keep the reason to ${MAX_FLAG_REASON} characters; it has ${reason.length}.`,
    );
  return reason === "" ? null : reason;
}

export async function GET(_request: Request, context: Context) {
  try {
    const record = await getPerformance(await getDb(), await recordId(context));
    if (!record) throw NOT_FOUND;
    return Response.json({ actions: record.actions });
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const id = await recordId(context);
    const body = await jsonBody(request);
    const db = await getDb();
    const options = await editOptions();
    let done;
    if (body.action === "flag")
      done = await setFlag(db, id, true, reasonFrom(body.reason), options);
    else if (body.action === "unflag") done = await setFlag(db, id, false, null, options);
    else if (body.action === "promote") done = await promoteRecord(db, id, options);
    else throw new Refusal(400, "action", "The action must be flag, unflag or promote.");
    if (!done) throw NOT_FOUND;
    return Response.json({ ok: true });
  } catch (error) {
    return refusalResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const done = await deleteRecord(await getDb(), await recordId(context), await editOptions());
    if (!done) throw NOT_FOUND;
    return Response.json({ ok: true });
  } catch (error) {
    return refusalResponse(error);
  }
}
