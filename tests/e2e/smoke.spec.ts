import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FEEDBACK = "https://github.com/HuskieRobotics/SPOT/issues";

// T-7 seed: the app shell renders. Real journeys (scouting, admin, analysis, offline) are
// added per phase; see docs/spec/12 T-7 and docs/spec/18 OF-9.
test("home page renders the SPOT shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SPOT" })).toBeVisible();
  await expect(page.getByRole("img", { name: "SPOT logo" })).toBeVisible();
});

test("SC-7, SC-4: the landing page shows the version, and links to feedback and the preview", async ({
  page,
}) => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await page.goto("/");
  await expect(page.getByText(`v${version}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Give feedback" })).toHaveAttribute("href", FEEDBACK);
  await expect(page.getByRole("link", { name: "Scouting-screen preview" })).toHaveAttribute(
    "href",
    "/scouting-preview",
  );
});
