#!/usr/bin/env tsx
/**
 * Check a deployed SPOT server through its proxy (#412):
 *
 *   npm run deploy:check -- https://spot.example.org
 *
 * Takes about a minute and a half: the stream check lasts 70 s. To check the admin cookie too,
 * set SPOT_ADMIN_PASSWORD in the environment first (never on the command line, where the shell
 * would keep it). Exits 1 if any check fails.
 */
import { checkServer } from "../src/deploy/check";

const address = process.argv[2];
if (!address || !/^https?:\/\//.test(address)) {
  console.error("usage: npm run deploy:check -- https://<the server's address>");
  process.exit(2);
}

async function main() {
  console.log(`Checking ${address} (about 90 s)…`);
  const results = await checkServer(address, { password: process.env.SPOT_ADMIN_PASSWORD });
  for (const r of results)
    console.log(`${r.ok === null ? "-" : r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`);
  const failed = results.filter((r) => r.ok === false).length;
  console.log(
    failed === 0 ? "All checks passed." : `${failed} check${failed === 1 ? "" : "s"} failed.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
