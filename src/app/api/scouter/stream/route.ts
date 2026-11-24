/**
 * A device's server-sent event stream (RT-5 to RT-8, ADR 0001, #354):
 * `GET /api/scouter/stream?scouter=<student id>&device=<device id>`.
 *
 * Events: `state` first, then `assigned`, `enter-match`, `unassigned` and `signed-out`, each
 * with the message as JSON data; a heartbeat comment every 20 s. A session this device does not
 * hold is refused with 401 JSON, which stops the browser's automatic reconnects.
 */
import { deviceIdFrom, scouterIdFrom } from "@/sessions/input";
import { getRuntime, refusalResponse } from "@/sessions/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scouterId = scouterIdFrom(url.searchParams.get("scouter"));
    const deviceId = deviceIdFrom(url.searchParams.get("device"));
    const runtime = await getRuntime();
    return await runtime.openStream(scouterId, deviceId, request.signal);
  } catch (error) {
    return refusalResponse(error);
  }
}
