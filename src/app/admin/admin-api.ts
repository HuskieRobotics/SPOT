/**
 * The admin page's calls to the admin routes (#357). A refusal comes back with the server's
 * message, so the page can show it; an expired admin session says to sign in again.
 */
import type { SpotEvent, Settings } from "@/data/types";

export type AdminReply<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

/** What `/api/admin/settings` answers. */
export interface SettingsView {
  settings: Settings;
  event: SpotEvent | null;
}

export interface RosterEntry {
  id: string;
  name: string;
}

export async function adminFetch<T>(
  path: string,
  body?: object,
  method: "GET" | "POST" | "DELETE" = body ? "POST" : "GET",
): Promise<AdminReply<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, message: "The server cannot be reached. Retrying…" };
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return { ok: true, value: json as T };
  if (response.status === 401)
    return {
      ok: false,
      status: 401,
      message: "Your admin session has ended. Reload the page and sign in again.",
    };
  return {
    ok: false,
    status: response.status,
    message:
      typeof json.message === "string" ? json.message : "The server refused that. Try again.",
  };
}
