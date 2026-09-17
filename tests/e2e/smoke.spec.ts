import { expect, test } from "@playwright/test";

// T-7 seed: the app shell renders. Real journeys (scouting, admin, analysis, offline) are
// added per phase; see docs/spec/12 T-7 and docs/spec/18 OF-9.
test("home page renders the SPOT shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SPOT" })).toBeVisible();
  await expect(page.getByRole("img", { name: "SPOT logo" })).toBeVisible();
});
