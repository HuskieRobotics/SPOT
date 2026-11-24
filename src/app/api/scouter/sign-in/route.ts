/**
 * Sign in for assignment (RT-1, #354, #356): `{ scouterId, deviceId, joinCode, name? }` →
 * `{ view, name }`, the scouter's state and name on the roster. `name` adds a scouter who is not
 * on the roster yet (SEC-7). 403 if the join code is wrong (SEC-2); 404 if the student ID is not
 * on the roster and no name was sent; 409 if no event is active.
 */
import { deviceIdFrom, jsonBody, nameFrom, scouterIdFrom } from "@/sessions/input";
import { getRuntime, refusalResponse } from "@/sessions/runtime";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const joinCode = typeof body.joinCode === "string" ? body.joinCode : null;
    const runtime = await getRuntime();
    const name = body.name === undefined ? undefined : nameFrom(body.name);
    const result = await runtime.signIn(
      scouterIdFrom(body.scouterId),
      deviceIdFrom(body.deviceId),
      joinCode,
      name,
    );
    return Response.json(result);
  } catch (error) {
    return refusalResponse(error);
  }
}
