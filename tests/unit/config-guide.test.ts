/**
 * #321 (gate K-4): the Configuration Guide's tutorial works. "Done when a student who hasn't seen
 * SPOT before can follow it to change a button and see the effect in the preview."
 *
 * This follows docs/configuration-guide/tutorial.md on a copy of the 2025 files, with the edits
 * exactly as the guide prints them, and checks what the guide says each step shows. If a message
 * or a number changes, update the guide with it.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkConfiguration } from "@/config/check";
import { loadMatchScouting } from "@/config/load";
import { formatPreview, formatTeam, previewConfiguration } from "@/config/preview";
import type { ConfigKind } from "@/config/validate";
import { DEFAULT_SETTINGS, initialState, press, recordedActions, skip } from "@/scouting/session";
import { screenButtons } from "@/scouting/view";

const root = process.cwd();
const text = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const guide = text("docs", "configuration-guide", "tutorial.md");
const kinds: ConfigKind[] = ["match-scouting", "analysis-pipeline", "analysis-modules", "qr"];
const season2025 = Object.fromEntries(
  kinds.map((k) => [k, text("config", "seasons", "2025", `${k}.json`)]),
) as Record<ConfigKind, string>;

/** Replace `before` with `after` in `source`, as the student does. */
function edit(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

// Step 4: the end of the Barge button, then the same with the Defense button after it.
const bargeEnd = `            "label": "Barge",
            "color": "#707070",
            "legacyClass": "gray"
          }
        ]`;
const withDefense = `            "label": "Barge",
            "color": "#707070",
            "legacyClass": "gray"
          },
          {
            "id": "teleopDefense",
            "type": "action",
            "gridArea": [2, 4, 3, 7],
            "executables": [],
            "label": "Defense",
            "color": "#3b82f6"
          }
        ]`;

// Step 7: the last line of Team Stats, then the defense line after it.
const aStops = `          {
            "name": "Total A-Stops",
            "path": "counts.aStop",
            "decimals": 0,
            "sort": -1
          }
        ]`;
const defenseLine = `          },
          {
            "name": "Defense per Match",
            "path": "averages.teleopDefense",
            "decimals": 2
          }
        ]`;

// What the guide prints is what the student types.
for (const snippet of [bargeEnd, withDefense, aStops, defenseLine]) {
  if (!guide.includes(snippet)) throw new Error(`tutorial.md no longer shows:\n${snippet}`);
}

const practice = { ...season2025 };
practice["match-scouting"] = edit(season2025["match-scouting"], bargeEnd, withDefense);
practice["analysis-modules"] = edit(
  season2025["analysis-modules"],
  aStops,
  aStops.replace(/\n {10}\}\n {8}\]$/, "\n") + defenseLine,
);

const counts = (sources: Record<ConfigKind, string>) => {
  const r = checkConfiguration(sources);
  return `${r.errors} errors and ${r.warnings} warnings`;
};

describe("#321: the tutorial in docs/configuration-guide works", () => {
  it("step 2: the copy of 2025 starts with the findings the guide names", () => {
    expect(counts(season2025)).toBe("6 errors and 6 warnings");
    expect(guide).toContain("✗ 6 errors and 6 warnings in config/seasons/practice/");
  });

  it("steps 4-5 and 8: the button and the module line add no finding", () => {
    expect(counts(practice)).toBe("6 errors and 6 warnings");
  });

  it("step 5: a missing comma gets the message the guide shows", () => {
    const broken = practice["match-scouting"].replace(
      '"legacyClass": "gray"\n          },\n          {\n            "id": "teleopDefense"',
      '"legacyClass": "gray"\n          }\n          {\n            "id": "teleopDefense"',
    );
    const [f] = checkConfiguration({ ...practice, "match-scouting": broken }).findings;
    expect(guide).toContain(f.message);
    expect(guide).toContain(f.hint!);
  });

  it("step 6: the scouting screen records the button as the guide shows (K-5)", () => {
    expect(guide).toContain("http://localhost:3000/scouting-preview?season=practice");
    const { config } = loadMatchScouting(practice["match-scouting"]);
    const context = { config: config!, settings: DEFAULT_SETTINGS };
    const at = (layer: string, button: string) => ({ layer, button });
    let state = initialState(config!);
    state = press(state, context, at("layer-0", "preloadCoral"), 0);
    state = press(state, context, at("layer-0", "startGame"), 0);
    expect(state.ts).toBe(153000); // "counts down from 153 seconds"
    state = skip(state, context, 1000);
    const defense = screenButtons(state, context, 1000).find((b) => b.id === "teleopDefense");
    expect(defense).toMatchObject({ label: "Defense", gridArea: [2, 4, 3, 7] });
    expect(guide).toContain(`\`teleopDefense [${defense!.gridArea.join(", ")}]\``);
    state = press(state, context, at("layer-2", "teleopDefense"), 1500);
    const recorded = recordedActions(state);
    expect(recorded.map((a) => [a.id, a.phase, a.segment])).toEqual([
      ["preloadCoral", null, null],
      ["teleopDefense", "teleop", null],
    ]);
    expect(guide).toMatch(/2 {2}teleopDefense {2}\d+ {2}teleop {2}null/);
    expect(guide).toContain("1  preloadCoral   153000  null    null");
    expect(recorded[0].ts).toBe(153000);
    // Undo takes it back: the preload and the start are the two presses undo keeps.
    state = press(state, context, at("layer-2", "undo"), 2000);
    expect(recordedActions(state).map((a) => a.id)).toEqual(["preloadCoral"]);
  });

  it("steps 7-8: the preview counts the button and the module shows it", () => {
    const docs = {
      ms: JSON.parse(practice["match-scouting"]),
      pipeline: JSON.parse(practice["analysis-pipeline"]),
      modules: JSON.parse(practice["analysis-modules"]),
    };
    const preview = previewConfiguration(docs);
    const all = formatPreview(preview, { dir: "config/seasons/practice", all: true });
    for (const line of [
      "    counts.teleopDefense  0 … 0 … 5",
      "    counts.teleopDefense  0 … 5 … 11",
      "    averages.teleopDefense  0 … 0.52 … 1.14",
    ]) {
      expect(all.split("\n")).toContain(line);
      expect(guide).toContain(line);
    }
    const shown = formatPreview(preview, { dir: "config/seasons/practice" })
      .split("\n")
      .find((l) => l.includes("Defense per Match"));
    expect(shown?.trim().split(/\s+/)).toEqual(
      "Defense per Match (averages.teleopDefense) 0.00 0.52 1.14 0.00".split(" "),
    );
    const team = formatTeam(preview, "3061").split("\n");
    expect(team).toContain("  Defense per Match: 0.89");
    expect(team).toContain("  Total A-Stops: 0   #1 of 49");
    expect(guide).toContain("Defense per Match: 0.89");
  });

  it("step 9: a misspelled path is caught with a suggestion", () => {
    const typo = practice["analysis-modules"].replace(
      '"averages.teleopDefense"',
      '"averages.teleopDefence"',
    );
    const f = checkConfiguration({ ...practice, "analysis-modules": typo }).findings.find((x) =>
      x.message.includes("teleopDefence"),
    );
    expect(f?.hint).toBe('Did you mean "averages.teleopDefense"?');
    expect(guide).toContain(f!.message);
    expect(guide).toContain(f!.where);
  });
});

describe("#321: the guide's links lead somewhere", () => {
  const dir = join(root, "docs", "configuration-guide");
  const pages = readdirSync(dir).filter((f) => f.endsWith(".md"));
  /** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens. */
  const slug = (heading: string) =>
    heading
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 _-]/g, "")
      .replace(/ /g, "-");
  const anchors = (file: string) =>
    new Set(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => /^#{1,6} /.test(l))
        .map((l) => slug(l.replace(/^#+ /, ""))),
    );

  it.each(pages)("%s", (page) => {
    const source = readFileSync(join(dir, page), "utf8");
    const links = [...source.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links.filter((l) => !/^https?:/.test(l))) {
      const [file, anchor] = link.split("#");
      const target = file ? resolve(dir, file) : join(dir, page);
      expect([link, existsSync(target)]).toEqual([link, true]);
      if (anchor) expect([link, anchors(target).has(anchor)]).toEqual([link, true]);
    }
  });

  it("the start page lists every chapter", () => {
    const start = readFileSync(join(dir, "README.md"), "utf8");
    for (const page of pages.filter((p) => p !== "README.md")) {
      expect(start).toContain(`](${page})`);
    }
  });
});

describe("#333 (gate K-6): the new-game checklist covers what was collected", () => {
  const checklist = text("docs", "configuration-guide", "new-game-checklist.md");

  it.each([
    // Season set-up
    ["archive last season", "config/seasons/<last year>/"],
    ["drift test", "tests/unit/config-active.test.ts"],
    ["database and event", "A database and an event"],
    // match-scouting.json
    ["match length", '"totalMs"'],
    ["field pause", '"pauseMs"'],
    ["segments and kinds", '"alternate"'],
    ["fixed kinds", "fixed kinds"],
    ["layers and buttons", "Screens and buttons"],
    ["field picture", '"fieldMap"'],
    ["qr.json bits", "qr.json"],
    // analysis-pipeline.json
    ["period filters, not composite ids", "filters and grouping"],
    ["worst values", '"divByZero"'],
    ["ifNone", '"ifNone"'],
    ["sumAverage countPaths", '"countPaths"'],
    ["rating map", '"ratings"'],
    ["cycle capacity", '"capacity"'],
    ["match length in countMatches", "`countMatches`"],
    ["score-breakdown prefixes", "Score-breakdown prefixes"],
    ["knownIds", '"knownIds"'],
    ["component OPRs", '"componentOprs"'],
    // analysis-modules.json
    ["module paths exist", "every path a module shows exists"],
    ["rating bands", '"ratingBands"'],
    // Week 0
    ["config:check after every change", "After every change"],
    ["config:preview", "npm run config:preview"],
    ["scout Week 0 from the webcast", "Scout Week 0 from the webcast"],
    ["fix before week 1", "Fix what Week 0 showed"],
  ])("%s", (_item, phrase) => {
    expect(checklist).toContain(phrase);
  });
});
