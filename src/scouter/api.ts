/**
 * The device's calls to the server for signing in (#356). Every call has a timeout and tells
 * "the server cannot be reached" apart from "the server said no" (OF-7), so the device can carry
 * on offline in the first case and show the server's message in the second.
 */
import { JOIN_CODE_HEADER } from "@/auth/join-code";
import type { DeviceView } from "@/sessions/registry";
import type { DeviceAction } from "@/sessions/runtime";
import type { RosterEntry } from "./device";

export const REQUEST_TIMEOUT_MS = 8_000;

export type Reply<T> =
  | { ok: true; value: T }
  | { ok: false; offline: true }
  | { ok: false; offline: false; status: number; error: string; message: string };

export async function call<T>(
  path: string,
  init: RequestInit & { joinCode?: string | null } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Reply<T>> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.joinCode) headers.set(JOIN_CODE_HEADER, init.joinCode);
  let response: Response;
  try {
    response = await fetchImpl(path, {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, offline: true };
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return { ok: true, value: body as T };
  return {
    ok: false,
    offline: false,
    status: response.status,
    error: typeof body.error === "string" ? body.error : "server",
    message:
      typeof body.message === "string" ? body.message : "The server refused that. Try again.",
  };
}

export interface ScouterApi {
  roster(joinCode: string): Promise<Reply<{ scouters: RosterEntry[] }>>;
  addScouters(
    joinCode: string,
    scouters: RosterEntry[],
  ): Promise<Reply<{ results: { id: string; status: string; name: string; message?: string }[] }>>;
  signIn(body: {
    scouterId: string;
    deviceId: string;
    joinCode: string;
    name?: string;
  }): Promise<Reply<{ view: DeviceView; name: string }>>;
  signOut(scouterId: string, deviceId: string): Promise<Reply<unknown>>;
  /** Tell the registry what the scouter did (RT-1): the reply is where they are now. */
  act(
    scouterId: string,
    deviceId: string,
    action: Exclude<DeviceAction, "sign-out">,
  ): Promise<Reply<{ view: DeviceView }>>;
}

export function httpApi(fetchImpl: typeof fetch = fetch): ScouterApi {
  return {
    roster: (joinCode) => call("/api/scouter/roster", { joinCode }, fetchImpl),
    addScouters: (joinCode, scouters) =>
      call(
        "/api/scouter/roster",
        { method: "POST", joinCode, body: JSON.stringify({ scouters }) },
        fetchImpl,
      ),
    signIn: (body) =>
      call("/api/scouter/sign-in", { method: "POST", body: JSON.stringify(body) }, fetchImpl),
    signOut: (scouterId, deviceId) =>
      call(
        "/api/scouter/action",
        { method: "POST", body: JSON.stringify({ scouterId, deviceId, action: "sign-out" }) },
        fetchImpl,
      ),
    act: (scouterId, deviceId, action) =>
      call(
        "/api/scouter/action",
        { method: "POST", body: JSON.stringify({ scouterId, deviceId, action }) },
        fetchImpl,
      ),
  };
}
