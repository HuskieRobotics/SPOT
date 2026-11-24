import { expect, test } from "@playwright/test";
import { E2E_ADMIN_PASSWORD } from "./fixtures";

// #355, D-4, AD-22 to AD-25a, DV-17: an admin types a schedule. The e2e server seeds two typed
// qualification matches (tests/e2e/server.ts); this test adds a third and a final, then removes
// them, so the matches other tests use are untouched. One project only: it changes shared
// server state.
test("an admin types matches, is told what is wrong, saves them, and locks one", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop-chromium", "changes shared server state");
  await page.goto("/admin/schedule");
  await page.getByLabel("Admin password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Match schedule" })).toBeVisible();
  await expect(page.getByText("Qualifications: the 2 typed below.")).toBeVisible();
  await expect(page.getByLabel("Qual 1 Red 1")).toHaveValue("101");

  const setCount = async (level: "qualification" | "playoff", n: number) => {
    await page.getByLabel(`Number of ${level} matches`, { exact: true }).fill(String(n));
    await page.getByRole("button", { name: `Set the number of ${level} matches` }).click();
  };
  const slots = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"];
  const type = async (match: string, teams: string[]) => {
    for (const [i, slot] of slots.entries())
      await page.getByLabel(`${match} ${slot}`).fill(teams[i]);
  };

  await setCount("qualification", 3);
  await type("Qual 3", ["3061", "2338b", "frc254", "1", "abc", ""]);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText(
    'Qual 3, Blue 2: "abc" is not a team number',
  );

  await page.getByLabel("Qual 3 Blue 2").fill("2");
  await setCount("playoff", 14);
  await type("Final 1", ["11", "12", "13", "14", "15", "16"]);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByLabel("Qual 3 Red 2")).toHaveValue("2338B");
  await expect(page.getByLabel("Qual 3 Red 3")).toHaveValue("254");
  await expect(page.getByLabel("Final 1 Red 1")).toHaveValue("11");
  await expect(page.getByText("Playoffs: the 14 typed below.")).toBeVisible();

  // AD-25a: a locked row cannot be edited by mistake, and stays locked after saving.
  await page.getByRole("button", { name: "Lock Qual 3" }).click();
  await expect(page.getByLabel("Qual 3 Red 1")).toBeDisabled();
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await expect(page.getByLabel("Qual 3 Red 1")).toBeDisabled();

  await setCount("qualification", 2);
  await setCount("playoff", 0);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByLabel("Qual 3 Red 1")).toHaveCount(0);
  await expect(page.getByText("Playoffs: none yet.")).toBeVisible();
});
