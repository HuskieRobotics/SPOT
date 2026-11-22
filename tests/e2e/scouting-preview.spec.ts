import { expect, test, type Page } from "@playwright/test";

/**
 * K-5 (#322): the scouting-screen preview draws a season's match-scouting.json and plays a match
 * on it. Runs on the phone viewport first (playwright.config.ts). Requirement ids are from
 * docs/spec/05.
 */

function preview(page: Page) {
  const screen = page.getByRole("region", { name: "Scouting screen" });
  const control = page.getByRole("button", { name: "Skip to next period" });
  return {
    screen,
    button: (id: string) => screen.locator(`[data-button="${id}"]`),
    clock: screen.locator('[data-button="startGame"]'),
    skip: () => control.click(),
    readout: page.getByTestId("last-actions"),
    actions: page.getByRole("table", { name: "Recorded actions" }),
    /** The recorded action ids, oldest first. */
    ids: async () =>
      (
        await page
          .locator('table[aria-label="Recorded actions"] td[data-field="id"]')
          .allTextContents()
      ).reverse(),
  };
}

test("K-5, SC-19 to SC-24: 2025 plays through a match", async ({ page }) => {
  await page.goto("/scouting-preview?season=2025");
  const p = preview(page);
  await expect(p.clock).toHaveText("Start");

  await p.button("preloadCoral").click();
  await p.clock.click();
  await expect(p.clock).toContainText("| Auto");

  // A none button opens the coral levels without recording; a level records and returns.
  await p.button("autoScoreCoral").click();
  await p.button("autol4").click();
  await p.button("leave").click();
  await expect(p.readout).toHaveText("autoScoreCoral ➔ autol4 ➔ leave");

  await p.skip();
  await expect(p.clock).toContainText("| Teleop");
  await p.button("teleopScoreCoral").click();
  await p.button("teleopl2").click();
  await p.button("barge").click();
  await p.button("undo").click(); // takes back the barge, and the screen it opened
  await expect(p.button("teleopScoreCoral")).toBeVisible();
  expect(await p.ids()).toEqual([
    "preloadCoral",
    "autol4",
    "leave",
    "teleopScoreCoral",
    "teleopl2",
  ]);
  const leave = p.actions.locator("tr", {
    has: page.locator('td[data-field="id"]', { hasText: /^leave$/ }),
  });
  await expect(leave.locator('td[data-field="phase"]')).toHaveText("auto");

  await p.skip(); // to the end
  await expect(p.clock).toHaveText("Match Complete");
  await expect(p.clock).toHaveText("Submit Match", { timeout: 5000 });
  await p.clock.click();
  await expect(p.clock).toHaveText("Submitted");
  await expect(page.getByText("A real match would send these 5 actions.")).toBeVisible();
});

test("K-5, SC-22, SC-27, SC-28, SC-32: 2026's shifts, A-Stop, zones and field map", async ({
  page,
}) => {
  await page.goto("/scouting-preview");
  const p = preview(page);
  // Undo keeps the first two presses (rules.undo.minQueueLength), the preload and the start.
  await p.button("preloadFuel").click();
  await p.clock.click();
  await expect(p.clock).toContainText("| Auto");

  // The A-Stop lock disables the screen until teleop; undo releases it.
  await p.button("aStop").click();
  await expect(page.getByRole("status").filter({ hasText: "A-Stop" })).toBeVisible();
  await expect(p.button("Passing")).toBeDisabled();
  await p.button("undo").click();
  await expect(p.button("Passing")).toBeEnabled();

  // Teleop: a position button shows the map, and the tap is stored on the action.
  await p.skip();
  await expect(p.clock).toContainText("| Teleop Transition");
  await p.button("StartShooting").click();
  const map = page.getByRole("img", { name: /Field map/ });
  await map.click({ position: { x: 10, y: 10 } });
  await expect(map).toBeHidden();
  await expect(p.actions.locator('td[data-field="other"]').first()).toContainText('"pos"');

  // On blue, the Alliance Zone button records the opposing zone, relative to the robot.
  await page.getByRole("button", { name: "Blue", exact: true }).click();
  await p.button("AZone").click();
  expect((await p.ids()).at(-1)).toBe("OAZone");

  // The shift: choosing Active labels the clock with the kind and the slot.
  await p.skip();
  await p.button("teleopActive").click();
  await expect(p.clock).toContainText("| Active Shift 1");
  await p.button("Defense").click();
  const defense = p.actions.locator("tr").nth(1);
  await expect(defense.locator('td[data-field="segment"]')).toHaveText("shift");
  await expect(defense.locator('td[data-field="segmentKind"]')).toHaveText("active");
  await expect(defense.locator('td[data-field="segmentIndex"]')).toHaveText("1");
});

test("K-5: an unknown season says so", async ({ page }) => {
  await page.goto("/scouting-preview?season=..%2Fconfig");
  await expect(page.getByText("There is no season called “../config”.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Scouting screen" })).toHaveCount(0);
});
