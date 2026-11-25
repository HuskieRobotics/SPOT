import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { JOIN_CODE_HEADER } from "../../src/auth/join-code";
import { loadMatchScouting } from "../../src/config/load";
import { decodePerformance } from "../../src/qr/codec";
import { qrLayout } from "../../src/qr/layout";
import { E2E_ADMIN_PASSWORD, E2E_JOIN_CODE } from "./fixtures";

// T-8, OF-9 (#361): offline is tested, not assumed. The app is loaded online once; then, with no
// server at all, it opens, signs a scouter in, scouts a typed match and shows a QR code that a
// decoder reads back from a screenshot. Back online, the match is sent and stored once.
//
// The service worker runs from a production build only (`npm run build`), and only in this
// project (playwright.config.ts). It runs after the scouting client's tests because the scouter
// signs in to the registry once the connection returns.

test.describe.configure({ mode: "serial" });

const ID = "700003";
const NAME = "Zoe Park";

test.skip(process.env.E2E_NEXT === "dev", "The service worker is in production builds only.");

async function admin(request: APIRequestContext) {
  expect(
    (await request.post("/api/admin/session", { data: { password: E2E_ADMIN_PASSWORD } })).status(),
  ).toBe(204);
  return (data: Record<string, unknown>) => request.post("/api/admin/registry", { data });
}

function screen(page: Page) {
  const region = page.getByRole("region", { name: "Scouting screen" });
  return {
    button: (id: string) => region.locator(`[data-button="${id}"]`),
    clock: region.locator('[data-button="startGame"]'),
  };
}

/** The app has a service worker in charge of the page, its shell kept. */
async function kept(page: Page) {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
}

test("T-8, OF-1, OF-6, SC-10, SC-41: loaded online once, SPOT opens, signs in, scouts and makes a scannable QR code with no server", async ({
  page,
  context,
  request,
}) => {
  await page.clock.install();
  const registry = await admin(request);
  await registry({ action: "set-match", match: null });
  const { eventId } = await (
    await request.get("/api/scouter/schedule", { headers: { [JOIN_CODE_HEADER]: E2E_JOIN_CODE } })
  ).json();

  // OF-6: the page loads nothing from another site, so no CDN can stop it working.
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const elsewhere: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin) elsewhere.push(r.url());
  });

  // One online load, from the admin page's link: the join code, the roster and the schedule.
  await page.goto(`/?join=${E2E_JOIN_CODE}`);
  await expect(page.getByRole("list", { name: "Roster" })).toContainText(NAME);
  await kept(page);
  expect(elsewhere).toEqual([]);

  // No server at all: the page comes from the service worker's cache. A file it never kept
  // cannot be fetched, by the page or by the worker.
  await context.setOffline(true);
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  expect(
    await page.evaluate(() =>
      fetch("/_next/static/never-built.js").then(
        (r) => r.status,
        () => "no connection",
      ),
    ),
  ).toBe("no connection");
  await expect(page.getByRole("heading", { name: "SPOT", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "No connection: showing the roster this device last read.",
  );

  // OF-1: signs in from the roster the device last read.
  await page.getByRole("button", { name: NAME }).click();
  await expect(page.getByRole("heading", { name: "Waiting to be assigned…" })).toBeVisible();
  await expect(page.getByTestId("connection")).toHaveText("Not connected");

  // SC-10: types the match and team. The schedule kept on the device gives the alliance; a team
  // it does not have (a B team) is chosen by its bumpers.
  const form = page.getByRole("form", { name: "Scout without an assignment" });
  await form.getByLabel("Match number").fill("1");
  await form.getByLabel("Team").fill("105");
  await expect(form.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true");
  await form.getByLabel("Team").fill("3061b");
  await expect(form.getByTestId("not-in-schedule")).toContainText("Team 3061B is not in Qual 1");
  await form.getByRole("button", { name: "Scout this match" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose the robot's alliance.");
  await form.getByRole("button", { name: "Red" }).click();
  await form.getByRole("button", { name: "Scout this match" }).click();

  // The full configured grid, as for an assigned match (2026's).
  const s = screen(page);
  await expect(page.getByTestId("scouting-info")).toHaveText("Qual 1 | Team 3061B");
  await s.button("preloadFuel").click();
  await s.clock.click();
  await s.button("AttemptL1").click();
  await s.button("StartShooting").click();
  await page.clock.fastForward("03:00");
  await expect(s.clock).toHaveText("Submit Match");
  await s.clock.click();

  // SC-41: the QR code, read back from a screenshot by a decoder, as a phone camera would.
  const sheet = page.getByRole("dialog", { name: "Match QR code" });
  const code = sheet.getByTestId("match-qr");
  await expect(code.locator("svg")).toBeVisible();
  await expect(sheet).toContainText("No connection");
  const png = PNG.sync.read(await code.screenshot());
  const scanned = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(scanned, "a decoder reads the code").not.toBeNull();
  const config = loadMatchScouting(readFileSync("config/match-scouting.json", "utf8")).config!;
  const record = decodePerformance(scanned!.data, qrLayout(config));
  expect(record).toMatchObject({
    eventId,
    level: "qual",
    matchNumber: 1,
    team: "3061B",
    coverage: "full",
  });
  expect(record.actions.map((a) => a.id)).toEqual(["preloadFuel", "AttemptL1", "StartShooting"]);
  await sheet.getByRole("button", { name: "Tap to dismiss" }).click();
  await expect(page.getByTestId("not-sent")).toHaveText("1 not sent");

  // OF-2: back online, the match is sent without being asked, and the server has it once.
  await context.setOffline(false);
  await expect(page.getByTestId("connection")).toHaveText("Connected");
  await expect(page.getByTestId("not-sent")).toHaveCount(0);
  const again = await request.post("/api/scouter/performances", {
    headers: { [JOIN_CODE_HEADER]: E2E_JOIN_CODE },
    data: {
      eventId,
      records: [
        {
          level: record.level,
          matchNumber: record.matchNumber,
          team: record.team,
          scouterId: ID,
          nonce: record.nonce,
          submittedAt: record.submittedAt,
          clientVersion: record.clientVersion,
          coverage: record.coverage,
          actions: record.actions,
        },
      ],
    },
  });
  expect((await again.json()).results).toEqual([{ nonce: record.nonce, status: "duplicate" }]);

  // OF-8: a device holding an older configuration gets the server's on its next online load.
  const served = (await (await request.get("/api/config/match-scouting")).json()).version;
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("spot.config")!);
    localStorage.setItem("spot.config", JSON.stringify({ ...c, version: "older0000000" }));
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("spot.config")!).version))
    .toBe(served);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to scout" })).toBeVisible();
});

test("SC-5: SPOT is installable, and offers to install once per device", async ({
  page,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "SPOT", start_url: "/", display: "standalone" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);

  // Headless Chromium never offers to install, so the page is handed the browser's offer.
  const offer = () =>
    page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, { prompt: async () => undefined });
      window.dispatchEvent(event);
    });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to scout" })).toBeVisible();
  await offer();
  const dialog = page.getByRole("alertdialog", { name: "Install SPOT?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to scout" })).toBeVisible();
  await offer();
  await expect(dialog).toHaveCount(0);
});
