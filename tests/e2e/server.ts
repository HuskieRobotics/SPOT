/**
 * The server the browser tests run against (`playwright.config.ts`): a throwaway in-memory
 * MongoDB, seeded with one active event and a two-match schedule, then `next start` on it. Plain
 * Node, no Docker (CLAUDE.md). Expects `npm run build` to have run.
 *
 * The seed is test data, not a secret: tests/e2e names the same event code.
 */
import { spawn } from "node:child_process";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ensureCollections } from "../../src/db/collections";
import { createEvent } from "../../src/db/events";
import { updateSchedule } from "../../src/db/schedules";
import { updateSettings } from "../../src/db/settings";
import { E2E_EVENT_CODE } from "./fixtures";

async function main() {
  const mongo = await MongoMemoryServer.create();
  const uri = `${mongo.getUri().replace(/\/$/, "")}/spot-e2e`;
  const client = await MongoClient.connect(uri);
  const db = client.db();
  await ensureCollections(db);
  const event = await createEvent(db, {
    tbaKey: "2026mnwi",
    label: "e2e",
    eventCode: E2E_EVENT_CODE,
  });
  await updateSchedule(db, event._id, {
    manual: [1, 2].map((n) => ({
      number: n,
      key: `2026mnwi_qm${n}`,
      red: [`${n}01`, `${n}02`, `${n}03`],
      blue: [`${n}04`, `${n}05`, `${n}06`],
    })),
  });
  await updateSettings(db, { activeEventId: event._id });
  await client.close();

  // E2E_NEXT=dev runs the same tests against `next dev` (ADR 0001's time-box asked for both).
  const next = spawn("npx", ["next", process.env.E2E_NEXT === "dev" ? "dev" : "start"], {
    stdio: "inherit",
    env: { ...process.env, MONGODB_URI: uri },
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
