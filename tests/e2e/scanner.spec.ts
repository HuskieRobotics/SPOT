import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import QRCode from "qrcode";
import type { MatchScoutingConfig } from "../../src/config/types";
import { encodePerformance, type QrInput } from "../../src/qr/codec";
import { qrLayout } from "../../src/qr/layout";
import { E2E_ADMIN_PASSWORD } from "./fixtures";

// #411, T-7 (the scanner journey), AD-18 to AD-21, OF-4, AN-8, SEC-5: an admin scans the codes
// of matches phones scouted with no connection. Chromium's fake camera plays a video of a real
// code, so the camera itself is tested; more codes are scanned from photos. Each worker makes an
// event of its own, so no other test reads what this one stores.

interface Made {
  event: { _id: string; code: string };
  /** The code the camera shows: Qual 3, team 3061. */
  camera: string;
  video: string;
}

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;
const layout = qrLayout(config);

let n = 0;
/** A match's code, as a phone with no connection shows it (SC-41). */
function code(eventId: string, matchNumber: number, team: string): string {
  const record: QrInput = {
    eventId,
    level: "qual",
    matchNumber,
    team,
    clientVersion: "6.0.0",
    submittedAt: Date.now(),
    nonce: `sc${Date.now().toString(36).slice(-6)}${String(++n).padStart(4, "0")}`,
    coverage: "full",
    actions: [{ id: layout.buttons[0], ts: 100_000, ...layout.placements[1] }],
  };
  return encodePerformance(record, layout);
}

const segments = (text: string) => [{ data: text, mode: "alphanumeric" as const }];

/** A few frames of the code, black on white, as YUV4MPEG2 for Chromium's fake camera. */
function video(text: string): Buffer {
  const qr = QRCode.create(segments(text), { errorCorrectionLevel: "M" });
  const [width, height] = [640, 480];
  const size = qr.modules.size;
  const scale = Math.floor((height - 40) / (size + 8));
  const left = Math.floor((width - size * scale) / 2);
  const top = Math.floor((height - size * scale) / 2);
  const luma = Buffer.alloc(width * height, 235);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (qr.modules.get(r, c))
        for (let y = 0; y < scale; y++)
          luma.fill(
            16,
            (top + r * scale + y) * width + left + c * scale,
            (top + r * scale + y) * width + left + (c + 1) * scale,
          );
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma]);
  return Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`),
    frame,
    frame,
    frame,
  ]);
}

const test = base.extend<object, { made: Made }>({
  made: [
    async ({}, use, workerInfo) => {
      const url = (path: string) => new URL(path, workerInfo.project.use.baseURL).href;
      const session = await fetch(url("/api/admin/session"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: E2E_ADMIN_PASSWORD }),
      });
      const cookie = session.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const label = `scan${workerInfo.project.name.replace(/\W/g, "")}${Date.now().toString(36)}`;
      const created = await fetch(url("/api/admin/events"), {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ tbaKey: "2026mnwi", label }),
      });
      const event = (await created.json()) as Made["event"];
      const camera = code(event._id, 3, "3061");
      const dir = workerInfo.project.outputDir;
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `scanner-camera-${workerInfo.workerIndex}.y4m`);
      writeFileSync(file, video(camera));
      await use({ event, camera, video: file });
    },
    { scope: "worker" },
  ],
  launchOptions: [
    async ({ launchOptions, made }, use) =>
      use({
        ...launchOptions,
        args: [
          ...(launchOptions.args ?? []),
          "--use-fake-device-for-media-stream",
          "--use-fake-ui-for-media-stream",
          `--use-file-for-fake-video-capture=${made.video}`,
        ],
      }),
    { scope: "worker" },
  ],
});

test.use({ permissions: ["camera"] });

async function photo(page: Page, text: string) {
  const png = await QRCode.toBuffer(segments(text), { errorCorrectionLevel: "M", scale: 6 });
  await page.getByLabel("Scan a photo").setInputFiles({
    name: "code.png",
    mimeType: "image/png",
    buffer: png,
  });
}

test("#411 T-7, AD-19 to AD-21, OF-4, AN-8, SEC-5: an admin scans codes, online and not", async ({
  page,
  made,
}) => {
  const { event } = made;
  await page.goto("/admin/scanner");
  await page.getByLabel("Admin password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "QR scanner" })).toBeVisible();
  const message = page.getByRole("status").last();
  const pending = page.getByTestId("pending-count");
  await expect(pending).toHaveText("Every record scanned here is on the server.");

  // AD-19: the camera reads the code; the page shows what it holds before anything is sent.
  await page.getByRole("button", { name: "Start camera" }).click();
  const scanned = page.getByRole("region", { name: "Scanned record" });
  await expect(scanned).toContainText("Qual 3, team 3061");
  await expect(scanned).toContainText(event.code);
  await page.getByRole("button", { name: "Stop camera" }).click();

  // AD-20: sent and stored; the team's page has it.
  await scanned.getByRole("button", { name: "Send" }).click();
  await expect(message).toHaveText("Sent Qual 3, team 3061.");
  await expect(pending).toHaveText("Every record scanned here is on the server.");
  const analysis = await page.context().newPage();
  await analysis.goto(`/analysis?event=${event.code}&team=3061`);
  await expect(analysis.getByRole("heading", { name: /^Team 3061/ })).toBeVisible();

  // SEC-5: undo deletes what the scan stored, after asking.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Undo last scan (Qual 3, team 3061)" }).click();
  await expect(message).toHaveText("Undone: deleted Qual 3, team 3061 from the server.");
  await analysis.reload();
  await expect(analysis.getByRole("heading", { name: event.code })).toBeVisible();
  await expect(analysis.getByRole("heading", { name: /^Team 3061/ })).toHaveCount(0);

  // OF-4, AN-8: the server can't be reached. The scan is kept, and this device's analysis shows it.
  await page.route("**/api/admin/scanned", (route) => route.abort("internetdisconnected"));
  await photo(page, code(event._id, 4, "254"));
  await expect(scanned).toContainText("Qual 4, team 254");
  await scanned.getByRole("button", { name: "Send" }).click();
  await expect(message).toHaveText(
    "No connection: Qual 4, team 254 is kept on this device and is sent when the connection returns.",
  );
  await expect(pending).toHaveText("1 record not sent.");
  await analysis.goto(`/analysis?event=${event.code}&team=254`);
  await expect(analysis.getByRole("heading", { name: /^Team 254/ })).toBeVisible();
  await expect(analysis.getByTestId("unsent-notice")).toContainText(
    "Includes 1 match this device scanned from a QR code",
  );

  // Back: Send now sends it, and analysis reads it from the server.
  await page.unroute("**/api/admin/scanned");
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(message).toHaveText("Sent 1 record kept on this device.");
  await expect(pending).toHaveText("Every record scanned here is on the server.");
  await analysis.reload();
  await expect(analysis.getByRole("heading", { name: /^Team 254/ })).toBeVisible();
  await expect(analysis.getByTestId("unsent-notice")).toHaveCount(0);

  // OF-4: with no connection at all, the scan is kept and sent when the connection returns.
  await page.context().setOffline(true);
  const third = code(event._id, 5, "1678");
  await photo(page, third);
  await scanned.getByRole("button", { name: "Send" }).click();
  await expect(pending).toHaveText("1 record not sent.");
  await page.context().setOffline(false);
  await expect(pending).toHaveText("Every record scanned here is on the server.");

  // AD-21: a code already on the server is not stored again, and undo leaves the record there.
  await photo(page, third);
  await scanned.getByRole("button", { name: "Send" }).click();
  await expect(message).toHaveText(
    "Qual 5, team 1678 was not stored again: the server already had it, or an admin deleted it.",
  );
  await page.getByRole("button", { name: "Undo last scan (Qual 5, team 1678)" }).click();
  await expect(message).toHaveText(
    "Nothing to undo: this scan of Qual 5, team 1678 stored nothing.",
  );
  // DV-20: the code of the record undone above stays deleted.
  await photo(page, made.camera);
  await scanned.getByRole("button", { name: "Send" }).click();
  await expect(message).toContainText("Qual 3, team 3061 was not stored again");

  // A code from an event this server lacks is refused with a reason.
  await photo(page, code("f".repeat(24), 6, "118"));
  await expect(
    page.getByRole("alert").filter({ hasText: "event this server does not have" }),
  ).toBeVisible();
  await analysis.close();
});
