/**
 * Reading The Blue Alliance's API (v3) on the server: the schedule (#355, RT-22) and the analysis
 * dashboard's results, COPRs and team names (#382, AN-6, AN-9). Node's `fetch`, with the key from
 * `TBA_API_KEY` (ADR 0003) and a timeout, so no request hangs (OF-7).
 */

/** Why a read failed, for the caller to say in its own words. */
export type TbaFailure = "no-key" | "unreachable" | "refused" | "not-found" | "status" | "shape";

export class TbaError extends Error {
  constructor(
    message: string,
    readonly reason: TbaFailure = "status",
  ) {
    super(message);
  }
}

/** TBA's read API (v3). */
export const TBA_API_URL = "https://www.thebluealliance.com/api/v3";

/**
 * Where to read TBA: `TBA_API_URL` when it is set, which only the browser tests do, to answer
 * from recorded responses (T-9). Leave it unset everywhere else.
 */
export function tbaApiUrl(): string {
  return (process.env.TBA_API_URL || TBA_API_URL).replace(/\/+$/, "");
}

/** How long to wait for TBA before giving up (OF-7: no request may hang). */
export const TBA_TIMEOUT_MS = 10_000;

/**
 * GET one path of TBA's API (`/event/2026mnwi/coprs`) and return its JSON. Throws `TbaError`,
 * whose `reason` says what went wrong: no key, no connection, a refused key, an unknown event,
 * another status, or an answer that is not JSON.
 */
export async function tbaGet(
  path: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (!apiKey) throw new TbaError("This server has no TBA_API_KEY.", "no-key");
  let response: Response;
  try {
    response = await fetchImpl(`${tbaApiUrl()}${path}`, {
      headers: { "X-TBA-Auth-Key": apiKey },
      signal: AbortSignal.timeout(TBA_TIMEOUT_MS),
    });
  } catch {
    throw new TbaError("The Blue Alliance could not be reached.", "unreachable");
  }
  if (response.status === 401) throw new TbaError("TBA refused the TBA_API_KEY.", "refused");
  if (response.status === 404) throw new TbaError(`TBA has no ${path}.`, "not-found");
  if (!response.ok) throw new TbaError(`TBA answered ${response.status}.`, "status");
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new TbaError("TBA's answer was not JSON.", "shape");
  }
}
