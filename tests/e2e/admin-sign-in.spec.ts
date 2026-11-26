import { expect, test } from "@playwright/test";
import { E2E_ADMIN_PASSWORD } from "./fixtures";

// SEC-4, SEC-5 (#352): the proxy guards admin pages in the running app, not only in unit tests.
// Uses the password playwright.config.ts gives the server; a server reused locally needs it too.
const password = process.env.SPOT_ADMIN_PASSWORD ?? E2E_ADMIN_PASSWORD;

test("an admin page needs the admin password, and sign-out ends the session", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in\?next=%2Fadmin$/);

  await page.getByLabel("Admin password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That is not the admin password.")).toBeVisible();

  await page.getByLabel("Admin password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Event" })).toBeVisible();

  const cookie = (await page.context().cookies()).find((c) => c.name === "spot-admin");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");

  // Exact: a scouter signed in by a test running alongside has a card with "Sign out <name>".
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in/);
});

test("an admin route answers 401 without a session", async ({ request }) => {
  const response = await request.get("/api/admin/events");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: "admin-sign-in" });
});
