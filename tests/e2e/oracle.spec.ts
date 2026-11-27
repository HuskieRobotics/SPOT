import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { getPath, type Dataset } from "../../src/analysis/engine";
import { displayValue, type DisplayOptions } from "../../src/analysis/modules/display";
import type { AnalysisModulesConfig } from "../../src/config/types";
import { goldenTeamValues, runGoldenSet } from "../../tools/oracle/compare";
import { goldenSets } from "../../tools/oracle/sets";

// #392, T-4 (docs/spec/17 §3, Phase 3's exit criterion): for a few teams at the oracle's two real
// events, every value the team view's Stats show is the golden output's, or a reviewed divergence
// (tools/oracle/divergences.json) accepts the difference. The e2e server holds both events,
// migrated from the same v5 exports the golden output was made from (tests/e2e/server.ts).

type Stat = DisplayOptions & { name: string; path: string };

for (const name of ["2025ilch_official-v4.2.0", "2026mnwi_official-v5"]) {
  test(`T-4, #392: the Stats on the team view are the oracle's (${name})`, async ({ page }) => {
    // The numbers do not depend on the screen; the engine runs here too, so once is enough.
    test.skip(test.info().project.name !== "desktop-chromium", "checked on the desktop only");
    test.setTimeout(120_000);
    const set = goldenSets.find((s) => s.name === name)!;
    const golden = goldenTeamValues(set);
    // The engine on the golden set's own input. v4.2.0 counted re-scouted matches twice, so the
    // 2025 set includes superseded records, which v6 never analyzes (RT-14a): only teams with none
    // show the same on the page.
    const input = runGoldenSet(set).dataset;
    const shown: Dataset = set.includeSuperseded
      ? runGoldenSet({ ...set, includeSuperseded: false }).dataset
      : input;
    const count = (d: Dataset, team: string) => d.tmps.filter((t) => t.team === team).length;
    const teams = ["3061", ...Object.keys(shown.teams).sort((a, b) => Number(a) - Number(b))]
      .filter((t, i, all) => all.indexOf(t) === i && count(input, t) === count(shown, t))
      .slice(0, 3);
    expect(teams).toHaveLength(3);

    const modules = JSON.parse(
      readFileSync(join(set.configDir, "analysis-modules.json"), "utf8"),
    ) as AnalysisModulesConfig;
    const stats = modules.modules.filter((m) => m.view === "team" && m.module === "Stats");
    expect(stats.length).toBeGreaterThan(0);

    const rules = new Map<string, number>();
    let same = 0;
    let checked = 0;
    for (const team of teams) {
      await page.goto(`/analysis?event=${set.event}&team=${team}`);
      await expect(
        page.getByRole("heading", { name: new RegExp(`^Team ${team}\\b`) }),
      ).toBeVisible();
      for (const entry of stats) {
        const region = page.getByRole("region", { name: entry.name, exact: true });
        for (const stat of entry.options.list as Stat[]) {
          const v6 = getPath(input.teams[team], stat.path, undefined);
          // What the page shows is what the engine computed...
          const text = displayValue(v6 ?? null, stat).text;
          await expect(region.locator(`li[data-stat="${stat.name}"]`)).toHaveText(
            new RegExp(`${escape(stat.name)}:\\s*${escape(text)}$`),
          );
          // ...and that is the golden value, or a reviewed divergence accepts the difference.
          const check = golden(team, stat.path, v6);
          expect(
            check.same || check.rule,
            `${team} ${stat.path}: v6 ${String(v6)}, golden ${String(check.legacy)}`,
          ).toBeTruthy();
          checked++;
          if (check.same) same++;
          else rules.set(check.rule!, (rules.get(check.rule!) ?? 0) + 1);
        }
      }
    }
    test.info().annotations.push({
      type: "oracle",
      description: `${checked} values, ${same} the golden value; accepted: ${JSON.stringify(Object.fromEntries(rules))}`,
    });
    // Most are the very number v5 showed.
    expect(same).toBeGreaterThan(checked / 2);
  });
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
