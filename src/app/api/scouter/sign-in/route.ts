/**
 * Sign in for assignment (RT-1, #354): `{ scouterId, deviceId, joinCode }` → the scouter's state.
 * 403 with a message if the join code is wrong (SEC-2); 409 if no event is active.
 */
import { deviceIdFrom, jsonBody, scouterIdFrom } from "@/sessions/input";
import { getRuntime, refusalResponse } from "@/sessions/runtime";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const joinCode = typeof body.joinCode === "string" ? body.joinCode : null;
    const runtime = await getRuntime();
    const view = await runtime.signIn(
      scouterIdFrom(body.scouterId),
      deviceIdFrom(body.deviceId),
      joinCode,
    );
    return Response.json({ view });
  } catch (error) {
    return refusalResponse(error);
  }
}
