import { expect, test, type Page } from "@playwright/test";
import { JOIN_CODE_HEADER } from "../../src/auth/join-code";
import { E2E_ADMIN_PASSWORD, E2E_ROSTER } from "./fixtures";

// #410, T-7 (the edit journey), AD-10 to AD-15, AN-18a, RT-35: an admin finds a record, flags it
// and sees the flag in analysis, makes an older record the one that counts, and deletes one. The
// test makes an event of its own, so no other test reads what it changes.

const [ALEX_ID, ALEX] = E2E_ROSTER[0];

interface Made {
  _id: string;
  code: string;
  joinCode: string;
}

let nonces = 0;
const record = (team: string, submittedAt: number, actions: string[]) => ({
  level: "qual",
  matchNumber: 1,
  team,
  scouterId: ALEX_ID,
  nonce: `ed${Date.now().toString(36).slice(-6)}${String(++nonces).padStart(4, "0")}`,
  submittedAt,
  clientVersion: "6.0.0",
  coverage: "full",
  actions: actions.map((id, i) => ({
    id,
    ts: 150_000 - i * 1_000,
    phase: "auto",
    segment: null,
    segmentKind: null,
    segmentIndex: null,
  })),
});

async function send(page: Page, event: Made, records: ReturnType<typeof record>[]) {
  const response = await page.request.post("/api/scouter/performances", {
    headers: { [JOIN_CODE_HEADER]: event.joinCode },
    data: { eventId: event._id, records },
  });
  expect(response.status()).toBe(200);
}

test("#410 T-7, AD-10 to AD-15, RT-35: an admin flags, promotes and deletes records", async ({
  page,
}) => {
  await page.goto("/admin/edit");
  await page.getByLabel("Admin password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Edit data" })).toBeVisible();

  // An event of this test's own, with a robot scouted twice (a re-scout) and one other robot.
  const label = `edit${test.info().project.name.replace(/\W/g, "")}${Date.now().toString(36)}`;
  const created = await page.request.post("/api/admin/events", {
    data: { tbaKey: "2026mnwi", label },
  });
  expect(created.status()).toBe(201);
  const event = (await created.json()) as Made;
  await send(page, event, [
    record("3061", 1_000, ["startGame", "score", "score"]),
    record("3061", 2_000, ["startGame", "score"]),
    record("254", 1_500, ["startGame"]),
  ]);

  // AD-10, AD-11: choose the event; the records come newest first, and filter by team.
  await page.reload(); // the page lists the events it found when it opened
  await page.getByLabel("Event", { exact: true }).selectOption(event.code);
  const count = page.getByTestId("record-count");
  await expect(count).toHaveText(`3 records at ${event.code}, newest first.`);
  await page.getByLabel("Team", { exact: true }).fill("frc3061");
  await expect(count).toHaveText(`2 of 3 records at ${event.code}.`);
  const rows = page.getByRole("list", { name: "Records" }).getByRole("listitem", {
    name: "Qual 1, team 3061",
  });
  await expect(rows).toHaveCount(2);
  const [rescout, first] = [rows.nth(0), rows.nth(1)];
  await expect(rescout).toContainText(ALEX);
  await expect(first).toContainText("Replaced by another record");

  // AD-13: a record's actions, in order and counted.
  await first.getByText("3 actions").click();
  await expect(first.getByRole("list", { name: "Count of each action" })).toContainText("score: 2");

  // AD-13a, AD-14, AN-18a: flag the record that counts; the team's page says so.
  await rescout.getByRole("button", { name: "Flag", exact: true }).click();
  await rescout.getByLabel(/Why it needs review/).fill("Two robots look swapped");
  await rescout.getByRole("button", { name: "Flag for review" }).click();
  const status = page.getByRole("status");
  await expect(status).toHaveText("Flagged Qual 1, team 3061.");
  await expect(rescout).toContainText("Flagged by an admin: Two robots look swapped");

  const analysis = await page.context().newPage();
  await analysis.goto(`/analysis?event=${event.code}&team=3061`);
  await expect(analysis.getByText(/1 flagged for review/)).toBeVisible();

  // RT-35: make the first record the one analysis uses; the re-scout is replaced.
  await first.getByRole("button", { name: "Use this record" }).click();
  await expect(status).toHaveText("Analysis now uses Qual 1, team 3061.");
  await expect(rows.nth(0)).toContainText("Replaced by another record");
  await expect(rows.nth(1)).not.toContainText("Replaced by another record");
  await analysis.reload();
  await expect(analysis.getByRole("heading", { name: /^Team 3061/ })).toBeVisible();
  await expect(analysis.getByText(/flagged for review/)).toHaveCount(0);

  // AD-15: delete the record analysis uses, after confirming; the re-scout counts again.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain(`Qual 1, team 3061, scouted by ${ALEX}`);
    void dialog.accept();
  });
  await rows.nth(1).getByRole("button", { name: "Delete" }).click();
  await expect(status).toHaveText("Deleted Qual 1, team 3061.");
  await expect(count).toHaveText(`1 of 2 records at ${event.code}.`);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).not.toContainText("Replaced by another record");
  await analysis.reload();
  await expect(analysis.getByText(/1 flagged for review/)).toBeVisible();

  // Clearing the flag.
  await rows.nth(0).getByRole("button", { name: "Clear flag" }).click();
  await expect(status).toHaveText("Cleared the flag on Qual 1, team 3061.");
  await expect(rows.nth(0)).not.toContainText("Flagged");
  await analysis.close();
});
