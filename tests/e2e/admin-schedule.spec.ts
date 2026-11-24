import { expect, test } from "@playwright/test";
import { E2E_ADMIN_PASSWORD } from "./fixtures";

// #355, D-4, AD-22 to AD-25a: an admin types a schedule. The e2e server seeds a two-match typed
// schedule (tests/e2e/server.ts); this test adds a third and removes it again, so the matches
// other tests use are untouched. One project only: it changes shared server state.
test("an admin types a match, is told what is wrong, saves it, and locks it", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-chromium", "changes shared server state");
  await page.goto("/admin/schedule");
  await page.getByLabel("Admin password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Match schedule" })).toBeVisible();
  await expect(
    page.getByText("Scouters are assigned from the schedule typed below."),
  ).toBeVisible();
  await expect(page.getByLabel("Match 1 Red 1")).toHaveValue("101");

  await page.getByLabel("Number of matches").fill("3");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  const slots = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"];
  const typed = ["3061", "2338b", "frc254", "1", "abc", ""];
  for (const [i, slot] of slots.entries()) await page.getByLabel(`Match 3 ${slot}`).fill(typed[i]);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText(
    'Match 3, Blue 2: "abc" is not a team number',
  );

  await page.getByLabel("Match 3 Blue 2").fill("2");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Saved. Scouters are assigned from this schedule.",
  );
  await page.reload();
  await expect(page.getByLabel("Match 3 Red 2")).toHaveValue("2338B");
  await expect(page.getByLabel("Match 3 Red 3")).toHaveValue("254");

  // AD-25a: a locked row cannot be edited by mistake, and stays locked after saving.
  await page.getByRole("button", { name: "Lock" }).nth(2).click();
  await expect(page.getByLabel("Match 3 Red 1")).toBeDisabled();
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await expect(page.getByLabel("Match 3 Red 1")).toBeDisabled();

  await page.getByLabel("Number of matches").fill("2");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Match 3 Red 1")).toHaveCount(0);
});
