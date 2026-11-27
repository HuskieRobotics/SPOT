import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { builtInModules } from "../../src/config/check/references";
import { validateConfig } from "../../src/config/validate";
import { EVERY_MODULE, WITH_DATA, withoutData } from "./every-module";

// #392 (docs/spec/17 §3, Phase 3's exit criterion): every built-in module, drawn on the oracle's
// real 2026 event, with data and without, and compared with a screenshot in light and dark mode on
// the phone and the desktop (the two projects this file runs in). Screenshots are compared on
// Linux only, where CI runs (playwright.config.ts).

const CHARTS = new Set(["Bar", "Pie", "PerformanceTimePlot", "RadarChart", "HeatmapScatterPlot"]);

/** The season's analysis-modules.json, served with every module in place of its own. */
async function serveEveryModule(page: Page) {
  await page.route(/\/api\/config\/analysis-modules\?/, async (route) => {
    const headers = { ...route.request().headers() };
    delete headers["if-none-match"];
    const served = await (await route.fetch({ headers })).json();
    await route.fulfill({
      json: { ...served, config: { ...served.config, modules: EVERY_MODULE }, findings: [] },
    });
  });
  await page.goto("/analysis?event=2026mnwi_official&team=3061");
  await expect(page.getByRole("heading", { name: /^Team 3061/ })).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** The card drawn, its chart too in `theme`, and the page's font loaded. */
async function drawn(page: Page, name: string, theme: "light" | "dark") {
  const region = card(page, name);
  await expect(region).toBeVisible();
  if (CHARTS.has(name)) await expect(region.locator(`[data-drawn="${theme}"]`)).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return region;
}

test("#392: the list of every module is a valid analysis-modules.json", () => {
  const season = JSON.parse(readFileSync("config/analysis-modules.json", "utf8"));
  expect(validateConfig("analysis-modules", { ...season, modules: EVERY_MODULE }).issues).toEqual(
    [],
  );
  // Every built-in module is in it (a unit test ties the schema's list to the dashboard's).
  expect(new Set(WITH_DATA)).toEqual(new Set(builtInModules()));
});

test("MO-1, F-27, #392: every module draws 3061's data, and says No Data where there is none", async ({
  page,
}) => {
  await serveEveryModule(page);
  for (const name of WITH_DATA) {
    const region = await drawn(page, name, "light");
    if (CHARTS.has(name)) {
      // A chart, with a table of what it shows for a screen reader (where a rating 3061 never
      // got says No Data).
      await expect(region.locator("svg.main-svg").first()).toBeVisible();
      await expect(region.getByRole("table")).toBeAttached();
      await expect(region.getByTestId("no-data")).toHaveCount(0);
    } else {
      await expect(region).not.toContainText("No Data");
    }
  }
  for (const name of WITH_DATA.filter((m) => m !== "Divider")) {
    const region = card(page, withoutData(name));
    await expect(region).toContainText("No Data");
    // No empty axes and no zeros standing in for values nobody has.
    await expect(region.locator("svg.main-svg")).toHaveCount(0);
    await expect(region).not.toContainText(/\b0(\.0+)?\b/);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`#392: every module looks as it did, in ${theme} mode`, async ({ page }) => {
    // Tall enough that no card is scrolled to: in phone emulation on Linux, a card scrolled into
    // view was captured about 22 px too high. The width, and so the layout, stays the phone's.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 6000 });
    await serveEveryModule(page);
    if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    for (const name of WITH_DATA) {
      const region = await drawn(page, name, theme);
      await expect(region).toHaveScreenshot(`${name}-${theme}.png`);
    }
  });
}
