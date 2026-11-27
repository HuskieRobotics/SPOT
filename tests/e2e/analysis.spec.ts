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

const ilchStats = (
  read("config/seasons/2025/analysis-modules.json") as {
    modules: { module: string; name: string; options: { list: unknown[] } }[];
  }
).modules.find((m) => m.module === "Stats")!;

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

  // #384, MO-3, MO-4: the Stats module, a line per stat, ranked among the event's teams.
  const stats = page.getByRole("region", { name: ilchStats.name });
  await expect(stats.getByRole("listitem")).toHaveCount(ilchStats.options.list.length);
  await expect(
    stats
      .getByRole("listitem")
      .filter({ hasText: /^#\d+ / })
      .first(),
  ).toBeVisible();

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

// #385, MO-5: the chart modules, drawn by Plotly, in the theme's colours.
type Entry = { view: string; module: string; name: string };
const charts = (dir: string) =>
  (read(`${dir}/analysis-modules.json`) as { modules: Entry[] }).modules.filter(
    (m) =>
      m.view === "team" && ["Bar", "Pie", "PerformanceTimePlot", "RadarChart"].includes(m.module),
  );

test("#385 MO-5, F-27: the chart modules draw an event's data in light and dark mode", async ({
  page,
}) => {
  const paper = (region: ReturnType<typeof page.getByRole>) =>
    region
      .locator("svg.main-svg")
      .first()
      .evaluate((svg) => getComputedStyle(svg).backgroundColor);

  // 2026mnwi has one of each, the radar too.
  await page.goto("/analysis?event=2026mnwi_official&team=3061");
  const mnwi = charts("config");
  expect(new Set(mnwi.map((m) => m.module)).size).toBe(4);
  for (const m of mnwi) {
    const region = page.getByRole("region", { name: m.name, exact: true });
    await expect(region.locator('[data-drawn="light"]')).toBeVisible();
    // The card's colour (#fefefe), not Plotly's white.
    expect(await paper(region)).toBe("rgb(254, 254, 254)");
    // What the chart shows, in a table a screen reader reads.
    await expect(region.getByRole("table", { name: m.name, exact: true })).toBeAttached();
  }
  // TR-6, DV-17: a row per match, in match order.
  const matches = page
    .getByRole("table", { name: mnwi.find((m) => m.module === "PerformanceTimePlot")!.name })
    .locator("tbody th");
  const labels = await matches.allTextContents();
  expect(labels.length).toBeGreaterThan(1);
  const numbers = labels.map((l) => Number(/^Qual (\d+)$/.exec(l)?.[1]));
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

  // The theme changes: each chart is drawn again, in the dark card's colour (#232323).
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  for (const m of mnwi) {
    const region = page.getByRole("region", { name: m.name, exact: true });
    await expect(region.locator('[data-drawn="dark"]')).toBeVisible();
    expect(await paper(region)).toBe("rgb(35, 35, 35)");
  }

  // 2025ilch: every chart of 3061's is drawn but one with nothing in it, which says No Data.
  await page.goto("/analysis?event=2025ilch_official&team=3061");
  const empty = "Auto Algae Scored Distribution";
  for (const m of charts("config/seasons/2025")) {
    const region = page.getByRole("region", { name: m.name, exact: true });
    if (m.name === empty) {
      await expect(region.getByTestId("no-data")).toHaveText("No Data");
      await expect(region.locator("svg.main-svg")).toHaveCount(0);
    } else {
      await expect(region.locator("[data-drawn]")).toBeVisible();
    }
  }
});

test("#386, A-20, SC-28: the heatmap draws a team's shooting positions on the field", async ({
  page,
}) => {
  // From the v5 export: 3061's teleop and endgame Start Shooting taps at 2026mnwi that the
  // half-field fold keeps (the middle third is left out). v5 named the period in the id.
  const event = (
    read("tools/oracle/fixtures/db/2026Rebuilt.events.json") as {
      code: string;
      _id: { $oid: string };
    }[]
  ).find((e) => e.code === "2026mnwi_official")!._id.$oid;
  const kept = (
    read("tools/oracle/fixtures/db/2026Rebuilt.teamMatchPerformances.json") as {
      eventNumber: { $oid: string };
      robotNumber: number;
      actionQueue: { id: string; other?: { pos?: { x: number } } }[];
    }[]
  )
    .filter((p) => p.eventNumber.$oid === event && p.robotNumber === 3061)
    .flatMap((p) => p.actionQueue)
    .filter((a) => a.id.endsWith("StartShooting") && !a.id.startsWith("auto"))
    .filter((a) => a.other?.pos && (a.other.pos.x < 30.5 || a.other.pos.x > 69.5)).length;
  expect(kept).toBeGreaterThan(10);

  await page.goto("/analysis?event=2026mnwi_official&team=3061");
  const heatmap = page.getByRole("region", { name: "Teleop Shooting Heatmap", exact: true });
  await expect(heatmap.locator('[data-drawn="light"]')).toBeVisible();
  // The configuration's field picture, behind a marker per position.
  const pictures = await heatmap
    .locator("image")
    .evaluateAll((images) =>
      images.map((i) => i.getAttribute("xlink:href") ?? i.getAttribute("href")),
    );
  expect(pictures).toEqual(["/img/half-field.svg"]);
  await expect(heatmap.locator("g.trace.scatter path.point")).toHaveCount(kept);
  await expect(heatmap.getByRole("table")).toContainText(String(kept));
  await expect(
    heatmap.getByRole("img", { name: "Teleop Shooting Heatmap: Teleop Start Shooting" }),
  ).toBeVisible();
});

test("#387 AN-16 to AN-22, T-7: compare an event's teams, and filter them", async ({ page }) => {
  const narrow = test.info().project.name === "mobile-chromium";
  const views = page.getByRole("navigation", { name: "Views" });
  const openView = async (name: string) => {
    if (narrow) await page.getByRole("button", { name: "Teams" }).click();
    await views.getByRole("button", { name }).click();
  };
  await page.goto("/analysis?event=2026mnwi_official");

  // AN-16 to AN-18: a bubble per team with the values chosen, drawn again on a change.
  await openView("Compare Team Scores");
  await expect(page).toHaveURL(/\?event=2026mnwi_official&view=compare$/);
  const chart = page.getByRole("img", { name: "Compare Team Scores" });
  await expect(chart).toHaveAttribute("data-drawn", "light");
  const table = page.getByRole("table", { name: "Compare Team Scores" });
  const bubbles = await table.locator("tbody tr").count();
  expect(bubbles).toBeGreaterThan(10);
  await expect(chart.locator("g.trace.scatter path.point")).toHaveCount(bubbles);
  await expect(table.locator("thead th")).toHaveCount(4);
  await page.getByLabel("Bubble size").selectOption("constant");
  await expect(table.locator("thead th")).toHaveCount(3);
  await expect(chart).toHaveAttribute("data-drawn", "light");

  // A reload opens the same view.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Compare Team Scores" })).toBeVisible();

  // AN-19 to AN-22: a band narrows the teams; its chip removes it; a card opens the team.
  await openView("Filter Teams");
  await expect(page).toHaveURL(/view=filter$/);
  const count = page.getByTestId("filter-count");
  const all = Number(/^All (\d+) teams\.$/.exec((await count.textContent()) ?? "")?.[1]);
  expect(all).toBeGreaterThan(10);
  const cards = page.getByRole("list", { name: "Matching teams" }).getByRole("button");
  await expect(cards).toHaveCount(all);
  await page.getByRole("button", { name: "Band" }).click();
  await page.getByRole("checkbox", { name: "Rating3" }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("checkbox", { name: "Rating3" })).toBeHidden();
  await expect(count).toHaveText(new RegExp(`^\\d+ of ${all} teams match\\.$`));
  const matching = Number(/^(\d+) of/.exec((await count.textContent()) ?? "")?.[1]);
  expect(matching).toBeGreaterThan(0);
  expect(matching).toBeLessThan(all);
  await expect(cards).toHaveCount(matching);

  await page.getByRole("button", { name: "Remove Rating3" }).click();
  await expect(count).toHaveText(`All ${all} teams.`);
  await cards.first().click();
  await expect(page.getByRole("heading", { name: /^Team \d+/ })).toBeVisible();
  await expect(page).toHaveURL(/&team=\d+$/);
});
