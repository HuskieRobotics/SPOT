import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_JOIN_CODE } from "./fixtures";

// #357: the admin page. Two admins (BL-33, RT-14b) watch two simulated scouters; one admin
// chooses a match, releases a robot (RT-31), flips the field (A-19) and corrects a name (SEC-6a),
// and the other admin and the devices see each change. Runs in its own project, after the other
// tests, because it drives the registry they share (playwright.config.ts).

async function signedInAdmin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "SPOT admin" })).toBeVisible();
  return page;
}

/** A device that signs in and opens its stream, as the scouting client will (#359). */
async function scouter(browser: Browser, scouterId: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  const status = await page.evaluate(
    async (body) =>
      (
        await fetch("/api/scouter/sign-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    { scouterId, deviceId: `e2e-device-${scouterId}`, joinCode: E2E_JOIN_CODE, name },
  );
  expect(status).toBe(200);
  await page.evaluate(
    ({ scouterId, deviceId }) => {
      const w = window as unknown as { log: string[] };
      w.log = [];
      const es = new EventSource(`/api/scouter/stream?scouter=${scouterId}&device=${deviceId}`);
      for (const kind of ["state", "assigned", "unassigned", "settings", "signed-out"])
        es.addEventListener(kind, (e) => {
          const data = JSON.parse((e as MessageEvent).data);
          w.log.push(`${kind}:${data.view?.team ?? data.fieldFlipped ?? ""}`);
          if (kind === "signed-out") es.close();
        });
    },
    { scouterId, deviceId: `e2e-device-${scouterId}` },
  );
  await expect.poll(() => log(page)).toContain("settings:false");
  return page;
}

const log = (page: Page) => page.evaluate(() => (window as unknown as { log: string[] }).log ?? []);

test("two admins run a match: choose it, see scouters assigned, release a robot, flip the field, correct a name", async ({
  browser,
}) => {
  const first = await signedInAdmin(browser);
  const second = await signedInAdmin(browser);
  await first.request.post("/api/admin/registry", { data: { action: "set-match", match: null } });
  await first.request.post("/api/admin/settings", { data: { fieldFlipped: false } });

  // SEC-3b: the join code as text and as a QR code.
  await expect(first.getByLabel("Active event")).toHaveText("2026mnwi_e2e");
  await expect(first.getByLabel("Join code", { exact: true })).toHaveText(E2E_JOIN_CODE);
  await expect(
    first.getByRole("img", { name: `QR code that opens SPOT with join code ${E2E_JOIN_CODE}` }),
  ).toBeVisible();

  const casey = await scouter(browser, "e2e-admin-1", "Casey Morgan");
  const drew = await scouter(browser, "e2e-admin-2", "Drew Patel");

  // RT-16, AD-4: one admin chooses the match; both see the two scouters assigned.
  await first.getByRole("button", { name: "Choose Qual 2" }).click();
  await expect(first.getByRole("status")).toHaveText("Qual 2 is the current match.");
  await expect(second.getByLabel("Current match")).toHaveText("Qual 2");
  const caseyCard = (page: Page) => page.getByRole("listitem", { name: "Casey Morgan" });
  for (const page of [first, second]) {
    await expect(caseyCard(page)).toContainText(/Team 2\d\d \(\w+\) · Qual 2/);
    await expect(page.getByRole("listitem", { name: "Drew Patel" })).toContainText("Qual 2");
  }
  const team = /^Team (\w+)/.exec(
    (await caseyCard(first)
      .getByText(/^Team /)
      .textContent())!,
  )![1];
  await expect.poll(() => log(casey)).toContain(`assigned:${team}`);

  // RT-31, AD-4b: release Casey's robot; Casey gets another, and the second admin sees it.
  await first.getByRole("button", { name: "Release Casey Morgan's robot" }).click();
  await first.getByRole("button", { name: "Release", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText(`Released Team ${team} from Casey Morgan.`);
  await expect(caseyCard(second)).not.toContainText(`Team ${team} `);
  await expect(caseyCard(second)).toContainText(/Team 2\d\d/);
  await expect.poll(() => log(casey)).toContain(`unassigned:`);

  // A-19, SC-28: the field orientation reaches every device.
  await first.getByRole("radio", { name: "Flipped" }).click();
  await expect(first.getByRole("radio", { name: "Flipped" })).toBeChecked();
  await expect.poll(() => log(drew)).toContain("settings:true");
  await expect(second.getByRole("radio", { name: "Flipped" })).toBeChecked();
  await first.getByRole("radio", { name: "Normal" }).click();
  await expect(first.getByRole("radio", { name: "Normal" })).toBeChecked();
  await expect.poll(() => log(drew)).toContain("settings:false");

  // SEC-6a: correct a misspelled name; the roster devices read and the other admin show it.
  await first.getByText(/^Roster \(/).click();
  await first.getByRole("button", { name: "Correct the name of Casey Morgan" }).click();
  await first.getByLabel("New name for e2e-admin-1").fill("Casey Morgan-Reyes");
  await first.getByRole("button", { name: "Save" }).click();
  await expect(first.getByRole("status")).toHaveText(
    "Student ID e2e-admin-1 is now Casey Morgan-Reyes.",
  );
  const roster = await casey.evaluate(
    async (code) =>
      (await (await fetch("/api/scouter/roster", { headers: { "x-spot-join-code": code } })).json())
        .scouters as { id: string; name: string }[],
    E2E_JOIN_CODE,
  );
  expect(roster).toContainEqual({ id: "e2e-admin-1", name: "Casey Morgan-Reyes" });
  await expect(second.getByRole("listitem", { name: "Casey Morgan-Reyes" })).toBeVisible();

  // RT-29: sign both out from the cards, which signs their devices out.
  await first.getByRole("button", { name: "Sign out Casey Morgan-Reyes" }).click();
  await first.getByRole("button", { name: "Sign out Drew Patel" }).click();
  await expect.poll(() => log(casey)).toContain("signed-out:");
  await expect(second.getByRole("listitem", { name: "Drew Patel" })).toHaveCount(0);

  // Leave the shared state as the other tests expect it, for a reused local server.
  await first.request.post("/api/admin/scouters", {
    data: { action: "rename", scouterId: "e2e-admin-1", name: "Casey Morgan" },
  });
  await first.request.post("/api/admin/registry", { data: { action: "set-match", match: null } });
});
