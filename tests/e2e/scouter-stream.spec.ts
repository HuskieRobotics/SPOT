import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_JOIN_CODE } from "./fixtures";

// #354, ADR 0001: server-sent events reach a real browser through `next start` as they happen,
// not buffered until the response ends, and the browser's reconnects behave as docs/spec/15
// requires. One project only: the test changes the server's current match.

const scouterId = "e2e-stream-1";
const deviceId = "e2e-device-0001";

async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { log: string[] }).log);
}

async function open(page: Page) {
  await page.evaluate(
    ({ scouterId, deviceId }) => {
      const w = window as unknown as { log: string[]; es?: EventSource };
      w.log ??= [];
      w.es?.close();
      const es = new EventSource(`/api/scouter/stream?scouter=${scouterId}&device=${deviceId}`);
      for (const kind of ["state", "assigned", "enter-match", "unassigned", "signed-out"])
        es.addEventListener(kind, (e) => {
          const data = JSON.parse((e as MessageEvent).data);
          w.log.push(`${kind}:${data.view?.team ?? ""}`);
          if (kind === "signed-out") es.close(); // docs/spec/15, condition 3
        });
      es.onerror = () => w.log.push(`error:${es.readyState}`);
      w.es = es;
    },
    { scouterId, deviceId },
  );
}

test("a device's stream delivers assignments as they happen, and a removal stops it", async ({
  page,
  request,
}) => {
  test.skip(test.info().project.name !== "desktop-chromium", "changes shared server state");
  await page.goto("/");
  const signIn = await page.evaluate(
    async (body) =>
      (
        await fetch("/api/scouter/sign-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    { scouterId, deviceId, joinCode: E2E_JOIN_CODE.toLowerCase() },
  );
  expect(signIn).toBe(200);
  await open(page);
  await expect.poll(() => events(page)).toContain("state:");

  expect(
    (await request.post("/api/admin/session", { data: { password: E2E_ADMIN_PASSWORD } })).status(),
  ).toBe(204);
  await request.post("/api/admin/registry", { data: { action: "set-match", matchNumber: null } });
  const chosen = await request.post("/api/admin/registry", {
    data: { action: "set-match", matchNumber: 1 },
  });
  expect(chosen.status()).toBe(200);
  // Within the 2 to 3 s the spec allows (RT-14c), so nothing between server and browser buffers.
  await expect.poll(() => events(page), { timeout: 3_000 }).toContain("assigned:101");

  // A reconnect resumes the same robot (RT-27).
  await open(page);
  await expect.poll(() => events(page)).toContain("state:101");

  // Removed by an admin: signed out, and the next attempt is refused for good.
  await request.post("/api/admin/registry", { data: { action: "remove", scouterId } });
  await expect.poll(() => events(page)).toContain("signed-out:");
  await open(page);
  await expect.poll(() => events(page)).toContain("error:2"); // EventSource.CLOSED: no retries
});
