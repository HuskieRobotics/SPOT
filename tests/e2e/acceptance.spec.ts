import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { devices } from "@playwright/test";
import jsQR from "jsqr";
import { MongoClient } from "mongodb";
import { PNG } from "pngjs";
import { JOIN_CODE_HEADER } from "../../src/auth/join-code";
import { loadMatchScouting } from "../../src/config/load";
import { NOT_FLAGGED, type TeamMatchPerformance } from "../../src/data/types";
import { COLLECTIONS, validateDocument } from "../../src/data/validate";
import { decodePerformance } from "../../src/qr/codec";
import { qrLayout } from "../../src/qr/layout";
import { REPLACEMENT_TWO_RECORDS } from "../../src/submissions/rules";
import { E2E_ADMIN_PASSWORD, E2E_JOIN_CODE, E2E_MONGO_URI } from "./fixtures";

// Phase 2's exit criterion (docs/spec/17 §3, gate W-1; #363): two scouters on phones and an admin
// at a laptop run matches from TBA's recorded schedule (T-9) against `next start` and the
// in-memory MongoDB, and the records are checked in MongoDB itself. Then the two paths where
// events go wrong (T-6a): a scouter who drops mid-match, and a robot released to a replacement
// while its scouter is away, whose late record arrives after the replacement's. The released
// scouter's QR code decodes to the very record MongoDB stores.
//
// Runs last, in its own project (playwright.config.ts), because it drives the registry every
// test shares.

test.describe.configure({ mode: "serial" });

const PHONE = devices["Pixel 7 landscape"];
const ALEX = { id: "700001", name: "Alex Rivera" };
const JORDAN = { id: "700002", name: "Jordan Lee" };

/** TBA's recorded 2026mnwi playoff match `n` (sf`n`m1), as the server reads it. */
function playoffTeams(n: number): string[] {
  const matches = JSON.parse(
    readFileSync("tools/oracle/fixtures/tba/2026mnwi/matches.json", "utf8"),
  ) as { key: string; alliances: Record<"red" | "blue", { team_keys: string[] }> }[];
  const m = matches.find((x) => x.key === `2026mnwi_sf${n}m1`)!;
  return [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys].map((k) => k.slice(3));
}

/**
 * The playoff match a test scouts: `base`, or a fresh one on a retry, because the registry keeps
 * each match's history (who was released from which robot) and MongoDB keeps its records.
 */
const playoff = (base: number) => base + 3 * test.info().retry;

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ ...devices["Desktop Chrome"] })).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "SPOT admin" })).toBeVisible();
  await page.request.post("/api/admin/registry", { data: { action: "set-match", match: null } });
  return page;
}

/** A phone held sideways, whose clock the test moves. */
async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  await page.clock.install();
  return { context, page };
}

/** Sign in from the roster the admin page's link opens (SEC-3b). */
async function signIn(page: Page, name: string) {
  await page.goto(`/?join=${E2E_JOIN_CODE}`);
  await page.getByRole("list", { name: "Roster" }).getByRole("button", { name }).click();
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
  await expect(page.getByTestId("connection")).toHaveText("Connected");
}

/** Accept the robot the registry assigned in `match`, and return its team. */
async function accept(page: Page, match: string): Promise<string> {
  const dialog = page.getByRole("alertdialog", { name: "Match information" });
  await expect(dialog).toContainText(`in ${match}.`);
  const team = /assigned team (\w+) in/.exec((await dialog.textContent())!)![1];
  await dialog.getByRole("button", { name: "OK" }).click();
  return team;
}

function screen(page: Page) {
  const region = page.getByRole("region", { name: "Scouting screen" });
  return {
    button: (id: string) => region.locator(`[data-button="${id}"]`),
    clock: region.locator('[data-button="startGame"]'),
    readout: page.getByTestId("last-actions"),
  };
}

/** Start the clock and record two presses of 2026's auto. */
async function scoutAuto(page: Page) {
  const s = screen(page);
  await s.button("preloadFuel").click();
  await s.clock.click();
  await s.button("AttemptL1").click();
  await s.button("StartShooting").click();
  await expect(s.readout).toHaveText("startGame ➔ AttemptL1 ➔ StartShooting");
}

/** Run the clock out and press Submit Match. */
async function finish(page: Page) {
  const s = screen(page);
  await page.clock.fastForward("03:00");
  await expect(s.clock).toHaveText("Submit Match");
  await s.clock.click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to scout" })).toBeVisible();
}

const card = (admin: Page, name: string) =>
  admin.getByRole("list", { name: "Signed-in scouters" }).getByRole("listitem", { name });

/** What MongoDB holds for a playoff match of the active event. */
async function stored(eventId: string, matchNumber: number): Promise<TeamMatchPerformance[]> {
  const client = await MongoClient.connect(E2E_MONGO_URI);
  try {
    return await client
      .db()
      .collection<TeamMatchPerformance>(COLLECTIONS["team-match-performance"])
      .find({ eventId, level: "playoff", matchNumber })
      .sort({ submittedAt: 1 })
      .toArray();
  } finally {
    await client.close();
  }
}

/** Every stored record is a valid document (DV-1), as the collection's own validator also says. */
function expectValid(records: TeamMatchPerformance[]) {
  for (const r of records) expect(validateDocument("team-match-performance", r).issues).toEqual([]);
}

let eventId = "";

test.beforeAll(async ({ request }) => {
  const schedule = await request.get("/api/scouter/schedule", {
    headers: { [JOIN_CODE_HEADER]: E2E_JOIN_CODE },
  });
  eventId = (await schedule.json()).eventId;
});

test("W-1, T-7, RT-9, RT-16: an admin chooses a match from TBA's schedule; two scouters get different robots, scout and submit, and MongoDB has both records", async ({
  browser,
}) => {
  const n = playoff(1);
  const match = `Playoff ${n}`;
  const admin = await adminPage(browser);
  const alex = await phone(browser);
  const jordan = await phone(browser);
  await signIn(alex.page, ALEX.name);
  await signIn(jordan.page, JORDAN.name);
  await expect(card(admin, ALEX.name)).toContainText("● Connected");
  await expect(card(admin, JORDAN.name)).toContainText("● Connected");

  // The playoffs come from TBA's schedule, the qualifications from the typed one (AD-8).
  await admin.getByRole("button", { name: `Choose ${match}`, exact: true }).click();
  await expect(admin.getByLabel("Current match")).toHaveText(match);
  const alexTeam = await accept(alex.page, match);
  const jordanTeam = await accept(jordan.page, match);
  expect(alexTeam).not.toBe(jordanTeam);
  expect(playoffTeams(n)).toEqual(expect.arrayContaining([alexTeam, jordanTeam]));
  await expect(card(admin, ALEX.name)).toContainText(`Team ${alexTeam} `);

  // RT-6: the admin sends both in; each scouts their own robot.
  await admin.getByRole("button", { name: "Start match" }).click();
  for (const [p, team] of [
    [alex.page, alexTeam],
    [jordan.page, jordanTeam],
  ] as const) {
    await expect(p.getByTestId("scouting-info")).toHaveText(`${match} | Team ${team}`);
    await scoutAuto(p);
  }
  for (const p of [alex.page, jordan.page]) {
    await finish(p);
    await expect(p.getByRole("status")).toHaveText("Match sent.");
  }

  // In MongoDB: one valid record each, with the right team, match, event and scouter.
  const records = await stored(eventId, n);
  expectValid(records);
  expect(
    records
      .map((r) => ({ team: r.team, scouterId: r.scouterId }))
      .sort((a, b) => a.team.localeCompare(b.team)),
  ).toEqual(
    [
      { team: alexTeam, scouterId: ALEX.id },
      { team: jordanTeam, scouterId: JORDAN.id },
    ].sort((a, b) => a.team.localeCompare(b.team)),
  );
  for (const r of records) {
    expect(r).toMatchObject({
      eventId,
      level: "playoff",
      matchNumber: n,
      source: "app",
      coverage: "full",
      superseded: false,
      flag: NOT_FLAGGED,
    });
    expect(r.actions.map((a) => a.id)).toEqual(["preloadFuel", "AttemptL1", "StartShooting"]);
  }
  await expect(card(admin, ALEX.name)).toContainText("Finished");

  await signOut(alex.page);
  await signOut(jordan.page);
  await alex.context.close();
  await jordan.context.close();
});

test("T-6a, RT-24 to RT-29: a scouter who drops mid-match keeps one card and the same robot, and the record arrives once", async ({
  browser,
}) => {
  const n = playoff(2);
  const match = `Playoff ${n}`;
  const admin = await adminPage(browser);
  const alex = await phone(browser);
  await signIn(alex.page, ALEX.name);
  await admin.getByRole("button", { name: `Choose ${match}`, exact: true }).click();
  const team = await accept(alex.page, match);
  await admin.getByRole("button", { name: "Start match" }).click();
  await scoutAuto(alex.page);
  await expect(card(admin, ALEX.name)).toContainText("Scouting");

  // The phone loses its connection mid-match. A connection that goes quiet stays open, so after
  // 45 s with no heartbeat the device gives up on it (OF-7), and the admin sees the drop, the
  // robot still held (RT-25, RT-29).
  await alex.context.setOffline(true);
  await alex.page.clock.fastForward("00:50");
  await expect(alex.page.getByTestId("connection")).toHaveText("Disconnected");
  await expect(card(admin, ALEX.name)).toContainText("○ Disconnected");
  await expect(card(admin, ALEX.name)).toContainText(
    `Disconnected while holding Team ${team}. Release the robot if they are not coming back.`,
  );

  // Scouting goes on with no connection (OF-1).
  const s = screen(alex.page);
  await s.button("Broken").click();
  await expect(s.readout).toContainText("Broken");

  // Back: one card, connected, with the same robot (RT-24, RT-25), and still scouting.
  await alex.context.setOffline(false);
  await expect(alex.page.getByTestId("connection")).toHaveText("Connected");
  await expect(card(admin, ALEX.name)).toHaveCount(1);
  await expect(card(admin, ALEX.name)).toContainText("● Connected");
  await expect(card(admin, ALEX.name)).toContainText(`Team ${team} (`);
  await expect(card(admin, ALEX.name)).toContainText("Scouting");

  // The record arrives once, with the press made while disconnected (DV-18, T-6a).
  await finish(alex.page);
  await expect(alex.page.getByRole("status")).toHaveText("Match sent.");
  const records = await stored(eventId, n);
  expectValid(records);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    team,
    scouterId: ALEX.id,
    coverage: "full",
    superseded: false,
  });
  expect(records[0].actions.map((a) => a.id)).toEqual([
    "preloadFuel",
    "AttemptL1",
    "StartShooting",
    "Broken",
  ]);

  await signOut(alex.page);
  await alex.context.close();
});

test("T-6a, RT-31 to RT-36, OF-1: a robot released while its scouter is away goes to a replacement; the original returns to waiting, and their late record, the one their QR code holds, does not replace the replacement's", async ({
  browser,
}) => {
  const n = playoff(3);
  const match = `Playoff ${n}`;
  const admin = await adminPage(browser);
  const alex = await phone(browser);
  await signIn(alex.page, ALEX.name);
  await admin.getByRole("button", { name: `Choose ${match}`, exact: true }).click();
  const team = await accept(alex.page, match);
  // The first robot in alliance order, so whoever is assigned next in this match gets it.
  expect(team).toBe(playoffTeams(n)[0]);
  await admin.getByRole("button", { name: "Start match" }).click();
  await expect(screen(alex.page).clock).toBeVisible();

  // Alex's phone loses its connection before the match starts, and scouts it anyway: the registry
  // never hears the start.
  await alex.context.setOffline(true);
  await alex.page.clock.fastForward("00:50");
  await expect(card(admin, ALEX.name)).toContainText(
    `Disconnected while holding Team ${team}. Release the robot if they are not coming back.`,
  );
  await scoutAuto(alex.page);
  await finish(alex.page);

  // SC-41: the QR code, read by a decoder as a phone camera would.
  const sheet = alex.page.getByRole("dialog", { name: "Match QR code" });
  const code = sheet.getByTestId("match-qr");
  await expect(code.locator("svg")).toBeVisible();
  const png = PNG.sync.read(await code.screenshot());
  const scanned = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(scanned, "a decoder reads the code").not.toBeNull();
  const config = loadMatchScouting(readFileSync("config/match-scouting.json", "utf8")).config!;
  const fromQr = decodePerformance(scanned!.data, qrLayout(config));
  expect(fromQr).toMatchObject({ eventId, level: "playoff", matchNumber: n, team });
  await sheet.getByRole("button", { name: "Tap to dismiss" }).click();
  await expect(alex.page.getByTestId("not-sent")).toHaveText("1 not sent");

  // RT-31, RT-32: the admin releases the robot of a scouter who is not coming back.
  await admin.getByRole("button", { name: `Release ${ALEX.name}'s robot` }).click();
  await admin.getByRole("button", { name: "Release", exact: true }).click();
  await expect(admin.getByRole("status")).toHaveText(`Released Team ${team} from ${ALEX.name}.`);
  await expect(card(admin, ALEX.name)).toContainText("No robot");

  // Jordan arrives and is given the robot, before anyone has started the match.
  const jordan = await phone(browser);
  await signIn(jordan.page, JORDAN.name);
  expect(await accept(jordan.page, match)).toBe(team);
  await admin.getByRole("button", { name: "Start match" }).click();
  await scoutAuto(jordan.page);
  await finish(jordan.page);
  await expect(jordan.page.getByRole("status")).toHaveText("Match sent.");
  // A clean substitution, before the start: a full record, not flagged (RT-36).
  const [replacement] = await stored(eventId, n);
  expect(replacement).toMatchObject({
    team,
    scouterId: JORDAN.id,
    coverage: "full",
    superseded: false,
    flag: NOT_FLAGGED,
  });

  // RT-33: Alex comes back to waiting, not to the robot, and is assigned like anyone else.
  await alex.context.setOffline(false);
  await expect(alex.page.getByTestId("connection")).toHaveText("Connected");
  expect(await accept(alex.page, match)).not.toBe(team);
  await expect(alex.page.getByText("Waiting for the match to start…")).toBeVisible();
  await expect(card(admin, ALEX.name)).toHaveCount(1);

  // RT-35, RT-36: Alex's late record is kept but superseded, and the replacement's is flagged for
  // review. The stored record is the one the QR code holds (OF-2: sent without being asked).
  await expect(alex.page.getByTestId("not-sent")).toHaveCount(0);
  const records = await stored(eventId, n);
  expectValid(records);
  expect(records).toHaveLength(2);
  const late = records.find((r) => r.scouterId === ALEX.id)!;
  const kept = records.find((r) => r.scouterId === JORDAN.id)!;
  expect(kept).toMatchObject({
    team,
    superseded: false,
    flag: { flagged: true, source: "machine", reason: REPLACEMENT_TWO_RECORDS },
  });
  expect(late).toMatchObject({ team, superseded: true, source: "app" });
  for (const field of [
    "eventId",
    "level",
    "matchNumber",
    "team",
    "nonce",
    "submittedAt",
    "coverage",
    "actions",
  ] as const)
    expect(late[field], field).toEqual(fromQr[field]);
  // The code carries the version as major.minor.patch, and no student ID: a scanned copy has none
  // (DM-16).
  expect(late.clientVersion).toMatch(new RegExp(`^${fromQr.clientVersion.replace(/\./g, "\\.")}`));
  expect(fromQr.scouterId).toBeNull();
  expect(late.scouterId).toBe(ALEX.id);

  await signOut(alex.page);
  await signOut(jordan.page);
  await alex.context.close();
  await jordan.context.close();
  await admin.request.post("/api/admin/registry", { data: { action: "set-match", match: null } });
});
