import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// #383 (T-7): the analysis dashboard on the oracle's real events, which the e2e server migrates
// from their v5 exports (tests/e2e/server.ts). It only reads, so it runs in every project.

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** Teams with data at 2025ilch, from the v5 export the server migrated. */
const ilchTeams = new Set(
  (
    read("tools/oracle/fixtures/db/2025Reefscape.teamMatchPerformances.json") as {
      eventNumber: { $oid: string };
      robotNumber: number;
    }[]
  )
    .filter((p) => p.eventNumber.$oid === "68bf4411906f900a12f7c6cd")
    .map((p) => String(p.robotNumber)),
);
const ilchModules = (
  read("config/seasons/2025/analysis-modules.json") as {
    modules: { view: string; position?: string }[];
  }
).modules.filter((m) => m.view === "team");

test("AN-1 to AN-4, AN-11a to AN-15, SEC-8: choose an event, find a team, open it, and reload", async ({
  page,
}) => {
  const narrow = test.info().project.name === "mobile-chromium";
  await page.goto("/analysis");

  // AN-11a: the event scouters are writing to opens first.
  const event = page.getByLabel("Event", { exact: true });
  await expect(event).toHaveValue("2026mnwi_e2e");
  await expect(page.getByRole("heading", { name: "2026mnwi_e2e" })).toBeVisible();

  // AN-3, DV-12b, #209: any event, by its code; its season's configuration reads it (2025).
  await event.selectOption("2025ilch_official");
  await expect(page.getByRole("heading", { name: "2025ilch_official" })).toBeVisible();
  await expect(page).toHaveURL(/\/analysis\?event=2025ilch_official$/);
  await expect(page.getByTestId("event-summary")).toContainText(`${ilchTeams.size} teams`);

  // AN-1, AN-12: every team with data, by number and TBA's nickname; on a phone, behind Teams.
  if (narrow) await page.getByRole("button", { name: "Teams" }).click();
  const list = page.getByRole("list", { name: "Teams" });
  await expect(list.getByRole("button")).toHaveCount(ilchTeams.size);
  await expect(list.getByRole("button", { name: "3061 Huskie Robotics" })).toBeVisible();

  // AN-13: by number or name, forgiving a typo.
  const find = page.getByLabel("Find a team");
  await find.fill("huskei");
  await expect(list.getByRole("button")).toHaveText([/^3061\s*Huskie Robotics$/]);
  await find.fill("zzzz");
  await expect(page.getByText("No team matches “zzzz”.")).toBeVisible();
  await find.fill("3061");
  await list.getByRole("button", { name: "3061 Huskie Robotics" }).click();

  // AN-14, AN-15: the team's view, its team modules in the main and side columns.
  await expect(page.getByRole("heading", { name: "Team 3061 · Huskie Robotics" })).toBeVisible();
  await expect(page.getByTestId("team-notes")).toContainText("scouted");
  const main = ilchModules.filter((m) => m.position !== "side").length;
  await expect(page.getByTestId("main-column").locator("section")).toHaveCount(main);
  await expect(page.getByTestId("side-column").locator("section")).toHaveCount(
    ilchModules.length - main,
  );
  await expect(page).toHaveURL(/\?event=2025ilch_official&team=3061$/);

  // A reload opens the same event and team.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Team 3061 · Huskie Robotics" })).toBeVisible();
  await expect(event).toHaveValue("2025ilch_official");

  // SEC-8: no scouter appears anywhere on a public page (one of 2025ilch's scouters in v5).
  await expect(page.locator("body")).not.toContainText("CharlotteCao");

  // TR-10: the active season's analysis files have problems an admin can see, and the page works.
  await event.selectOption("2026mnwi_official");
  await expect(page.getByTestId("problems")).toContainText("The analysis configuration has");
  await page.getByTestId("problems").locator("summary").click();
  await expect(page.getByTestId("problems")).toContainText('"attemptClimb" is not a button id');
});
