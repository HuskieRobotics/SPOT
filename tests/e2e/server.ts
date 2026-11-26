/**
 * The server the browser tests run against (`playwright.config.ts`): a throwaway in-memory
 * MongoDB, seeded with one active event and a two-match typed schedule, then `next start` on it.
 * Plain Node, no Docker (CLAUDE.md). Expects `npm run build` to have run.
 *
 * TBA is answered from the recorded events in tools/oracle/fixtures/tba (T-9): matches, COPRs and
 * teams. The playoffs come from TBA's 2026mnwi schedule and the qualifications from the typed one
 * (AD-8). Nothing reaches thebluealliance.com.
 *
 * The seed is test data, not a secret: tests/e2e names the same join code and TBA key.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ensureCollections } from "../../src/db/collections";
import { createEvent } from "../../src/db/events";
import { updateSchedule } from "../../src/db/schedules";
import { addScouter } from "../../src/db/scouters";
import { updateSettings } from "../../src/db/settings";
import { E2E_JOIN_CODE, E2E_MONGO_PORT, E2E_MONGO_URI, E2E_ROSTER, E2E_TBA_KEY } from "./fixtures";

/** TBA's read API for the recorded events in `tools/oracle/fixtures/tba/` (T-9). */
async function recordedTba(): Promise<string> {
  const recorded = join(process.cwd(), "tools", "oracle", "fixtures", "tba");
  // `/event/<key>/matches`, `/coprs` and `/teams/simple` (whose recording is the full team list).
  const files: Record<string, string> = {
    matches: "matches",
    coprs: "coprs",
    "teams/simple": "teams",
  };
  const server = createServer((request, response) => {
    const answer = (status: number, body: string | Buffer = "{}") =>
      response.writeHead(status, { "content-type": "application/json" }).end(body);
    if (request.headers["x-tba-auth-key"] !== E2E_TBA_KEY) return answer(401);
    const m = /^\/api\/v3\/event\/(\w+)\/(matches|coprs|teams\/simple)$/.exec(request.url ?? "");
    const file = m && join(recorded, m[1], `${files[m[2]]}.json`);
    if (!file || !existsSync(file)) return answer(404);
    answer(200, readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v3`;
}

async function main() {
  const mongo = await MongoMemoryServer.create({ instance: { port: E2E_MONGO_PORT } });
  const uri = E2E_MONGO_URI;
  const tba = await recordedTba();
  const client = await MongoClient.connect(uri);
  const db = client.db();
  await ensureCollections(db);
  const event = await createEvent(db, {
    tbaKey: "2026mnwi",
    label: "e2e",
    joinCode: E2E_JOIN_CODE,
  });
  await updateSchedule(db, event._id, {
    manual: [1, 2].map((n) => ({
      level: "qual" as const,
      number: n,
      key: `2026mnwi_qm${n}`,
      red: [`${n}01`, `${n}02`, `${n}03`],
      blue: [`${n}04`, `${n}05`, `${n}06`],
    })),
  });
  await updateSettings(db, { activeEventId: event._id });
  for (const [id, name] of E2E_ROSTER) await addScouter(db, { id, name });
  await client.close();

  // E2E_NEXT=dev runs the same tests against `next dev` (ADR 0001's time-box asked for both).
  const next = spawn("npx", ["next", process.env.E2E_NEXT === "dev" ? "dev" : "start"], {
    stdio: "inherit",
    env: { ...process.env, MONGODB_URI: uri, TBA_API_KEY: E2E_TBA_KEY, TBA_API_URL: tba },
  });
  const stop = async () => {
    next.kill("SIGTERM");
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", async (code) => {
    await mongo.stop();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
