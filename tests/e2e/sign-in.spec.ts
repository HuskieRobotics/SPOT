import { expect, test } from "@playwright/test";
import { E2E_JOIN_CODE } from "./fixtures";

// #356: signing in on a scouting device (SEC-2, SEC-3b, SEC-6, SEC-7, RT-26, OF-1). Each test
// runs in its own browser context, so it starts as a device that has never been used. Other tests
// add scouters to the shared roster, so these look for the seeded names rather than count them.

test("SEC-3b, SEC-7, RT-26: the QR link fills in the join code; pick a name; a reload keeps it", async ({
  page,
}) => {
  await page.goto(`/?join=${E2E_JOIN_CODE.toLowerCase()}`);
  await expect(page).toHaveURL(/\/sign-in\?join=/);
  await expect(page.getByRole("heading", { name: "Sign in to scout" })).toBeVisible();
  const roster = page.getByRole("list", { name: "Roster" });
  await expect(roster.getByRole("button", { name: "Zoe Park" })).toBeVisible();

  await page.getByLabel("Find your name").fill("ri");
  await expect(roster.getByRole("button")).toHaveText(["Alex Rivera"]);
  await roster.getByRole("button", { name: "Alex Rivera" }).click();
  await expect(page.getByText("Signed in as Alex Rivera")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Signed in as Alex Rivera")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(roster.getByRole("button", { name: "Zoe Park" })).toBeVisible();
});

test("SEC-2: a typed join code works, and a wrong one is refused with a message", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const code = page.getByLabel("Join code");
  await code.fill("WRONG1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("status")).toContainText("join code is wrong");
  await code.fill(E2E_JOIN_CODE.toLowerCase());
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("list", { name: "Roster" }).getByRole("button", { name: "Zoe Park" }),
  ).toBeVisible();
});

test("OF-1, SEC-7: offline, a scouter adds themselves; the next connection adds them to the roster", async ({
  page,
  context,
}) => {
  test.skip(test.info().project.name !== "desktop-chromium", "adds to the shared roster");
  await page.goto(`/sign-in?join=${E2E_JOIN_CODE}`);
  await expect(
    page.getByRole("list", { name: "Roster" }).getByRole("button", { name: "Zoe Park" }),
  ).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: "I'm not on the list" }).click();
  await page.getByLabel("Student ID").fill("700099");
  await page.getByLabel("Full name").fill("Sam  Offline");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in as Sam Offline")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No connection");

  await context.setOffline(false);
  await page.getByRole("button", { name: "Sign out" }).click();
  const roster = page.getByRole("list", { name: "Roster" });
  await expect(roster.getByRole("button", { name: "Sam Offline", exact: true })).toBeVisible();
  await expect(roster.getByText("(added here)")).toHaveCount(0);
});
