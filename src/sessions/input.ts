/**
 * Reading what a device sends (#354). Student IDs and device IDs are short text; anything else
 * is refused with a message rather than reaching the registry.
 */
import { Refusal } from "./runtime";

const SCOUTER = /^[A-Za-z0-9._-]{1,64}$/;
const DEVICE = /^[A-Za-z0-9_-]{8,128}$/;

export function scouterIdFrom(value: unknown): string {
  if (typeof value === "string" && SCOUTER.test(value)) return value;
  throw new Refusal(400, "scouter-id", "A student ID is letters and digits, at most 64.");
}

export function deviceIdFrom(value: unknown): string {
  if (typeof value === "string" && DEVICE.test(value)) return value;
  throw new Refusal(400, "device-id", "This device has no valid id. Reset the app's data.");
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  if (body && typeof body === "object" && !Array.isArray(body))
    return body as Record<string, unknown>;
  throw new Refusal(400, "body", "The request must be a JSON object.");
}
