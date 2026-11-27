import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ACTIVE_SEASON, findSeason, readSeason } from "../../src/config/load";
import { checkAnalysisFile } from "../../src/config/serve";

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
});

test("AN-3, #393: an address naming what isn't there opens an event's page", async ({ page }) => {
  const event = page.getByLabel("Event", { exact: true });
  // An event no one created: the active one, with no team.
  await page.goto("/analysis?event=2024nope_official&team=3061");
  await expect(page.getByRole("heading", { name: "2026mnwi_e2e" })).toBeVisible();
  await expect(event).toHaveValue("2026mnwi_e2e");
  // A team with no data at the event: the event's page.
  await page.goto("/analysis?event=2025ilch_official&team=9999");
  await expect(page.getByRole("heading", { name: "2025ilch_official" })).toBeVisible();
  await expect(page.getByTestId("event-summary")).toBeVisible();
  // Choosing another event from a team's view opens that event's page: the number names another
  // robot there.
  await page.goto("/analysis?event=2025ilch_official&team=3061");
  await expect(page.getByRole("heading", { name: "Team 3061 · Huskie Robotics" })).toBeVisible();
  await event.selectOption("2026mnwi_official");
  await expect(page.getByRole("heading", { name: "2026mnwi_official" })).toBeVisible();
  await expect(page).toHaveURL(/\/analysis\?event=2026mnwi_official$/);
});

test("AN-4: a loading message shows while an event's data arrives", async ({ page }) => {
  // Hold the dataset back a moment, so the message can be seen before the event.
  await page.route(/\/api\/analysis\/dataset\?/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto("/analysis?event=2025ilch_official");
  await expect(
    page.getByRole("status").filter({ hasText: "Loading 2025ilch_official…" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "2025ilch_official" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Loading" })).toHaveCount(0);
});

test("TR-10: a mistake in the season's files is shown to an admin, and the page still works", async ({
  page,
}) => {
  // The active 2026 files have no errors since #392. Put v5's misspelled button id back (F-29),
  // and serve the file with what config:check finds in it, as the server would.
  await page.route(/\/api\/config\/analysis-pipeline\?/, async (route) => {
    const sources = readSeason(findSeason(ACTIVE_SEASON)!);
    const misspelled = sources["analysis-pipeline"]!.replace(
      '"actionId": ["AttemptClimb"]',
      '"actionId": ["attemptClimb"]',
    );
    expect(misspelled).not.toBe(sources["analysis-pipeline"]);
    const file = checkAnalysisFile("analysis-pipeline", {
      ...sources,
      "analysis-pipeline": misspelled,
    })!;
    await route.fulfill({
      json: { version: file.version, config: file.config, findings: file.findings },
    });
  });
  // The event's page lists the problems.
  await page.goto("/analysis?event=2026mnwi_official");
  const problems = page.getByTestId("problems");
  await expect(problems.locator("summary")).toHaveText("The analysis configuration has 1 error");
  await problems.locator("summary").click();
  await expect(problems).toContainText('"attemptClimb" is not a button id');
  // The rest of the dashboard draws.
  await page.goto("/analysis?event=2026mnwi_official&team=3061");
  await expect(page.getByRole("heading", { name: "Team 3061 · Huskie Robotics" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Robot Action Counts Each Match" }).locator("[data-drawn]"),
  ).toBeVisible();
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

test("#408 AN-21a: an event's bands are its season's, 2025's in points", async ({ page }) => {
  await page.goto("/analysis?event=2025ilch_official&view=filter");
  const count = page.getByTestId("filter-count");
  await expect(count).toHaveText(/^All \d+ teams\.$/);
  const all = Number(/(\d+)/.exec((await count.textContent()) ?? "")?.[1]);
  await page.getByRole("button", { name: "Band" }).click();
  await expect(page.getByRole("group", { name: "Band" }).locator("label")).toHaveText([
    "60+ points",
    "40+ points",
    "20+ points",
  ]);
  await page.getByRole("checkbox", { name: "40+ points" }).check();
  await page.keyboard.press("Escape");
  await expect(count).toHaveText(new RegExp(`^\\d+ of ${all} teams match\\.$`));
  const matching = Number(/^(\d+) of/.exec((await count.textContent()) ?? "")?.[1]);
  expect(matching).toBeGreaterThan(0);
  expect(matching).toBeLessThan(all);
});

/** The rows of a CSV file, each a list of fields (RFC 4180: quoted fields, doubled quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[++i];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  return rows;
}

test("#388 AN-26, AN-26b, F-27, SEC-8: the event's teams download as a CSV file", async ({
  page,
}) => {
  const narrow = test.info().project.name === "mobile-chromium";
  const download = async (event: string) => {
    await page.goto(`/analysis?event=${event}`);
    const teams = Number(
      /(\d+) teams?\./.exec((await page.getByTestId("event-summary").textContent()) ?? "")?.[1],
    );
    if (narrow) await page.getByRole("button", { name: "Teams" }).click();
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(file.suggestedFilename()).toBe(`${event}.csv`);
    const text = readFileSync(await file.path(), "utf8");
    return { text, rows: parseCsv(text), teams };
  };

  // 2025ilch: a row per team with data, each as wide as the header, and no scouter anywhere.
  const ilch = await download("2025ilch_official");
  const [header, ...rows] = ilch.rows;
  expect(header[0]).toBe("Team #");
  expect(header.some((h) => h.endsWith(" Score Average"))).toBe(true);
  expect(header.some((h) => h.endsWith(" Cycle Average Time Complete"))).toBe(true);
  expect(rows).toHaveLength(ilch.teams);
  expect(rows.map((r) => r[0])).toContain("3061");
  for (const row of rows) expect(row).toHaveLength(header.length);
  expect(ilch.text).not.toContain("CharlotteCao");

  // 2026mnwi: a value the pipeline could not compute is an empty cell, not 0.
  const mnwi = await download("2026mnwi_official");
  expect(mnwi.rows.slice(1)).toHaveLength(mnwi.teams);
  expect(mnwi.rows.slice(1).some((r) => r.slice(1).includes(""))).toBe(true);
  // AN-26: v6 counts each action per period, a column per value: 3061's are numbers.
  const [mnwiHeader] = mnwi.rows;
  const own = mnwi.rows.find((r) => r[0] === "3061")!;
  const counted = mnwiHeader
    .map((h, i) => [h, own[i]])
    .filter(([h, v]) => /^\w+\.\w+ Average$/.test(h) && v !== "" && Number.isFinite(Number(v)));
  expect(counted.length).toBeGreaterThan(10);
});

test("#389 AN-23, AN-24: Simulate Match and the Auto Pick List, turned on for 2025", async ({
  page,
}) => {
  const narrow = test.info().project.name === "mobile-chromium";
  const views = page.getByRole("navigation", { name: "Views" });
  const openTeams = async () => {
    if (narrow) await page.getByRole("button", { name: "Teams" }).click();
  };

  // 2026 leaves both off: no button, and an address naming one opens the event.
  await page.goto("/analysis?event=2026mnwi_official&view=simulate");
  await expect(page.getByRole("heading", { name: "2026mnwi_official" })).toBeVisible();
  await openTeams();
  await expect(views.getByRole("button", { name: "Compare Team Scores" })).toBeVisible();
  await expect(views.getByRole("button", { name: "Simulate Match" })).toHaveCount(0);
  await expect(views.getByRole("button", { name: "Auto Pick List" })).toHaveCount(0);

  // AN-23: a match from the schedule fills both alliances; each shows the match-view modules,
  // and the chance of winning compares the two, so the chances add to 100 %.
  const matchModules = (
    read("config/seasons/2025/analysis-modules.json") as { modules: { view: string }[] }
  ).modules.filter((m) => m.view === "match").length;
  await page.goto("/analysis?event=2025ilch_official");
  await openTeams();
  await views.getByRole("button", { name: "Simulate Match" }).click();
  await expect(page).toHaveURL(/view=simulate$/);
  const match = page.getByLabel("Match", { exact: true });
  await match.selectOption({ label: "Qual 1" });
  for (const slot of ["Red 1", "Blue 1"])
    await expect(page.getByLabel(slot, { exact: true })).not.toHaveValue("");
  const red = page.getByRole("region", { name: "Red alliance" });
  const blue = page.getByRole("region", { name: "Blue alliance" });
  await expect(red.locator("section[data-module]")).toHaveCount(matchModules);
  await expect(blue.locator("section[data-module]")).toHaveCount(matchModules);
  const chance = async (side: typeof red) => {
    await expect(side.getByTestId("chance")).toHaveText(/^\d+(\.\d)?%$/);
    return Number((await side.getByTestId("chance").textContent())!.replace("%", ""));
  };
  expect((await chance(red)) + (await chance(blue))).toBeCloseTo(100, 0);

  // Choosing a team clears the match; an alliance with no team shows no modules.
  await page.getByLabel("Red 1", { exact: true }).selectOption("3061");
  await expect(match).toHaveValue("");
  for (const slot of ["Blue 1", "Blue 2", "Blue 3"])
    await page.getByLabel(slot, { exact: true }).selectOption("");
  await expect(blue.locator("section[data-module]")).toHaveCount(0);
  await expect(blue).toContainText("Choose a team for this alliance.");

  // AN-24: every team with a total, highest chance first; a team opens its view.
  await openTeams();
  await views.getByRole("button", { name: "Auto Pick List" }).click();
  await expect(page).toHaveURL(/view=pick$/);
  const picks = page.getByRole("list", { name: "Ranked teams" }).getByRole("button");
  await expect(picks.first()).toBeVisible();
  expect(await picks.count()).toBeGreaterThan(10);
  const chances = (
    await page
      .getByRole("list", { name: "Ranked teams" })
      .getByTestId("pick-chance")
      .allTextContents()
  ).map((t) => Number(t.trim().replace("%", "")));
  expect(chances.every((c) => c >= 0 && c <= 100)).toBe(true);
  expect(chances).toEqual([...chances].sort((a, b) => b - a));
  await picks.first().click();
  await expect(page.getByRole("heading", { name: /^Team \d+/ })).toBeVisible();
});
