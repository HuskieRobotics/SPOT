/**
 * Sign in for assignment (RT-1, #354): `{ scouterId, deviceId, eventCode }` → the scouter's state.
 * 403 with a message if the event code is wrong (SEC-2); 409 if no event is active.
 */
import { deviceIdFrom, jsonBody, scouterIdFrom } from "@/sessions/input";
import { getRuntime, refusalResponse } from "@/sessions/runtime";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const eventCode = typeof body.eventCode === "string" ? body.eventCode : null;
    const runtime = await getRuntime();
    const view = await runtime.signIn(
      scouterIdFrom(body.scouterId),
      deviceIdFrom(body.deviceId),
      eventCode,
    );
    return Response.json({ view });
  } catch (error) {
    return refusalResponse(error);
  }
}
