/**
 * Is SPOT up (#412)? For the deploy recipes, which wait for it after starting a new build, and for
 * anyone checking a server. Public, as it says nothing private.
 *
 * GET → 200 `{ status: "ok", database: "ok", build }`, or 503 `{ status: "unavailable",
 * database, message }` when the database does not answer within 3 s or `MONGODB_URI` is not set.
 * `build` is the running build's id (`.next/BUILD_ID`), so a recipe can tell the new build from
 * the old; null under `next dev`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

const DATABASE_TIMEOUT_MS = 3_000;

function buildId(): string | null {
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
}

const noStore = { "cache-control": "no-store" };

export async function GET() {
  const build = process.env.NODE_ENV === "production" ? buildId() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error(`The database did not answer within ${DATABASE_TIMEOUT_MS / 1000} s.`)),
        DATABASE_TIMEOUT_MS,
      );
    });
    await Promise.race([getDb().then((db) => db.command({ ping: 1 })), late]);
    return Response.json({ status: "ok", database: "ok", build }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        status: "unavailable",
        database: /MONGODB_URI/.test(message) ? "not set" : "unreachable",
        build,
        message,
      },
      { status: 503, headers: noStore },
    );
  } finally {
    clearTimeout(timer);
  }
}
