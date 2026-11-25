import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_JOIN_CODE } from "./fixtures";

// T-7 (#359, #360): the scouting client on a phone held in landscape. A scouter signs in, waits,
// is assigned a robot and sent into the match, scouts, reloads mid-match and finds the same
// presses and clock, and submits; without a connection, the match waits on the device as a QR
// code and is sent when the connection returns. Runs in its own project, after the tests that share the registry
// (playwright.config.ts), because it chooses the current match.

test.describe.configure({ mode: "serial" });

const ID = "e2e-client-1";
const NAME = "Taylor Quinn";

async function admin(request: APIRequestContext) {
  expect(
    (await request.post("/api/admin/session", { data: { password: E2E_ADMIN_PASSWORD } })).status(),
  ).toBe(204);
  return (data: Record<string, unknown>) => request.post("/api/admin/registry", { data });
}

function screen(page: Page) {
  const region = page.getByRole("region", { name: "Scouting screen" });
  return {
    region,
    button: (id: string) => region.locator(`[data-button="${id}"]`),
    clock: region.locator('[data-button="startGame"]'),
    readout: page.getByTestId("last-actions"),
  };
}

test("T-7, SC-12, SC-13, RT-6, RT-26: sign in, wait, get assigned, scout, reload mid-match, submit", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const registry = await admin(request);
  await registry({ action: "set-match", match: null });

  // Sign in from the admin page's link (SEC-3b), as a scouter new to the roster (SEC-7).
  await page.goto(`/?join=${E2E_JOIN_CODE}`);
  await expect(page.getByRole("heading", { name: "SPOT", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I'm not on the list" }).click();
  await page.getByLabel("Student ID").fill(ID);
  await page.getByLabel("Full name").fill(NAME);
  await page.getByRole("button", { name: "Sign in" }).click();

  // SC-12, OF-7: the waiting page, connected.
  await expect(page.getByRole("heading", { name: "Waiting to be assigned…" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${NAME}`)).toBeVisible();
  await expect(page.getByTestId("connection")).toHaveText("Connected");
  await expect(page.getByTestId("hint")).not.toBeEmpty();

  // SC-13: assigned a robot; OK accepts it, and a reload does not ask again (RT-27).
  await registry({ action: "set-match", match: { level: "qual", number: 2 } });
  const dialog = page.getByRole("alertdialog", { name: "Match information" });
  await expect(dialog).toContainText(/You have been assigned team 20\d in Qual 2\./);
  const team = /team (20\d)/.exec((await dialog.textContent())!)![1];
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("heading", { name: `Qual 2 | Team ${team}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Qual 2 | Team ${team}` })).toBeVisible();
  await expect(page.getByTestId("connection")).toHaveText("Connected");
  await expect(dialog).toHaveCount(0);

  // RT-6: an admin starts the match; the scouting screen opens in the alliance's color (SC-1).
  await registry({ action: "start" });
  const s = screen(page);
  await expect(s.clock).toBeVisible();
  await expect(page.getByTestId("scouting-info")).toHaveText(`Qual 2 | Team ${team}`);
  await s.button("preloadFuel").click();
  await s.clock.click();
  await expect(s.clock).toContainText("| Auto");
  await s.button("AttemptL1").click();
  await s.button("StartShooting").click();
  await expect(s.readout).toHaveText("startGame ➔ AttemptL1 ➔ StartShooting");
  const before = parseFloat((await s.clock.textContent())!);

  // RT-26: a reload mid-match resumes the same presses, highlight and clock.
  await page.clock.runFor(3_000);
  await page.reload();
  await expect(s.readout).toHaveText("startGame ➔ AttemptL1 ➔ StartShooting");
  await expect(s.button("StartShooting")).toHaveAttribute("aria-pressed", "true");
  await expect(s.clock).toContainText("| Auto");
  const after = parseFloat((await s.clock.textContent())!);
  expect(before - after).toBeGreaterThanOrEqual(3);
  expect(before - after).toBeLessThan(8);

  // BL-230: the 2× clock is behind the menu and a confirmation.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "2× speed, for a video…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Play at 2×" }).click();
  await expect(s.region.getByText("2×", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Back to normal speed" }).click();
  await expect(s.region.getByText("2×", { exact: true })).toHaveCount(0);

  // To the end of the match, and submit.
  await page.clock.fastForward("03:00");
  await expect(s.clock).toHaveText("Submit Match");
  await s.clock.click();
  await expect(page.getByRole("heading", { name: "Waiting to be assigned…" })).toBeVisible();
  // SC-40, SC-42: sent at once, so nothing waits on the device.
  await expect(page.getByRole("status")).toHaveText("Match sent.");
  await expect(page.getByTestId("unsent")).toHaveCount(0);

  // The registry heard the start and the finish.
  const snapshot = await (await request.get("/api/admin/registry")).json();
  const entry = snapshot.snapshot.entries.find((e: { scouterId: string }) => e.scouterId === ID);
  expect(entry).toMatchObject({ status: "complete", team, connected: true });

  // SC-3: signing out from the menu returns to the landing page.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to scout" })).toBeVisible();
  await registry({ action: "set-match", match: null });
});

test("BL-54: a change of match before the scouter starts reaches them", async ({
  page,
  request,
}) => {
  const registry = await admin(request);
  await registry({ action: "set-match", match: null });
  await page.goto(`/?join=${E2E_JOIN_CODE}`);
  await page.getByRole("button", { name: "I'm not on the list" }).click();
  await page.getByLabel("Student ID").fill("e2e-client-2");
  await page.getByLabel("Full name").fill("Morgan Ellis");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("connection")).toHaveText("Connected");

  await registry({ action: "set-match", match: { level: "qual", number: 1 } });
  await page
    .getByRole("alertdialog", { name: "Match information" })
    .getByRole("button", { name: "OK" })
    .click();
  await registry({ action: "start" });
  await expect(screen(page).clock).toBeVisible();

  // The admin moves on before the scouter presses Start Match: the screen closes, and they are told.
  await registry({ action: "set-match", match: { level: "qual", number: 2 } });
  const notice = page.getByRole("alertdialog", { name: "Assignment withdrawn" });
  await expect(notice).toContainText("The match changed before you started");
  await notice.getByRole("button", { name: "OK" }).click();
  // The new match's robot follows at once.
  await expect(page.getByRole("alertdialog", { name: "Match information" })).toContainText(
    "in Qual 2.",
  );
  await expect(screen(page).region).toHaveCount(0);

  await page.getByRole("alertdialog").getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await registry({ action: "set-match", match: null });
});

test("SC-41, OF-2, RT-28: a match submitted with no connection shows its QR code, waits, and is sent on reconnecting", async ({
  page,
  context,
  request,
}) => {
  await page.clock.install();
  const registry = await admin(request);
  await registry({ action: "set-match", match: null });
  await page.goto(`/?join=${E2E_JOIN_CODE}`);
  await page.getByRole("button", { name: "I'm not on the list" }).click();
  await page.getByLabel("Student ID").fill("e2e-client-3");
  await page.getByLabel("Full name").fill("Riley Chen");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("connection")).toHaveText("Connected");

  await registry({ action: "set-match", match: { level: "qual", number: 1 } });
  const dialog = page.getByRole("alertdialog", { name: "Match information" });
  await expect(dialog).toContainText(/You have been assigned team 10\d in Qual 1\./);
  const team = /team (10\d)/.exec((await dialog.textContent())!)![1];
  await dialog.getByRole("button", { name: "OK" }).click();
  await registry({ action: "start" });
  const s = screen(page);
  await s.clock.click();
  await s.button("AttemptL1").click();
  await page.clock.fastForward("03:00");
  await expect(s.clock).toHaveText("Submit Match");

  // SC-41: no connection, so the QR code fills the screen, and the match stays on the device.
  await context.setOffline(true);
  await s.clock.click();
  const sheet = page.getByRole("dialog", { name: "Match QR code" });
  await expect(sheet.getByTestId("match-qr").locator("svg")).toBeVisible();
  await expect(sheet).toContainText(`Qual 1 | Team ${team}`);
  await expect(sheet).toContainText("No connection");
  await sheet.getByRole("button", { name: "Tap to dismiss" }).click();
  await expect(sheet).toHaveCount(0);

  // OF-2, BL-93: the pending list, with each match's QR code.
  await expect(page.getByTestId("unsent")).toHaveText("Not sent yet: 1 match");
  // The status line says so on every page, and the finished match is no longer awaited.
  await expect(page.getByTestId("not-sent")).toHaveText("1 not sent");
  await expect(page.getByRole("heading", { name: "Waiting to be assigned…" })).toBeVisible();
  const list = page.getByRole("list", { name: "Matches not sent" });
  await expect(list).toContainText(`Qual 1 | Team ${team}`);
  await list.getByRole("button", { name: "QR code" }).click();
  await expect(sheet.getByTestId("match-qr").locator("svg")).toBeVisible();
  await sheet.getByRole("button", { name: "Tap to dismiss" }).click();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "No connection. The matches are kept on this device.",
  );

  // RT-28: the connection returns, and the match is sent without being asked.
  await context.setOffline(false);
  await expect(page.getByTestId("connection")).toHaveText("Connected");
  await expect(page.getByTestId("unsent")).toHaveCount(0);
  await expect(page.getByTestId("not-sent")).toHaveCount(0);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await registry({ action: "set-match", match: null });
});
