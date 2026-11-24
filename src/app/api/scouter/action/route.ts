/**
 * What a device does (RT-1, #354): `{ scouterId, deviceId, action }`, where `action` is
 * `accept` (saw the assignment), `start` (pressed Start Match), `finish` (submitted), `ready`
 * (back on the waiting page) or `sign-out`. Returns the scouter's state, or 401 if this device
 * does not hold the session, so it signs in again.
 */
import { deviceIdFrom, jsonBody, scouterIdFrom } from "@/sessions/input";
import { getRuntime, Refusal, refusalResponse, type DeviceAction } from "@/sessions/runtime";

const ACTIONS: readonly DeviceAction[] = ["accept", "start", "finish", "ready", "sign-out"];

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const action = body.action as DeviceAction;
    if (!ACTIONS.includes(action))
      throw new Refusal(400, "action", `The action must be one of: ${ACTIONS.join(", ")}.`);
    const runtime = await getRuntime();
    const view = await runtime.act(
      scouterIdFrom(body.scouterId),
      deviceIdFrom(body.deviceId),
      action,
    );
    return Response.json({ view });
  } catch (error) {
    return refusalResponse(error);
  }
}
