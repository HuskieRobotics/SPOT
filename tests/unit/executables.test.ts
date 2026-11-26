/**
 * Extension executables (#362; ADR 0005; docs/spec/05 SC-38; docs/spec/12 T-10; docs/spec/20 CC-3):
 * registering one, checking its options, and running it in the session, where it can change what
 * the scouter sees but nothing that is recorded, and undo puts back what it changed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkConfiguration } from "@/config/check";
import { validateExecutableOptions } from "@/config/check/executables";
import { builtInExecutables } from "@/config/check/references";
import { loadMatchScouting } from "@/config/load";
import matchScoutingSchema from "@/config/schema/match-scouting.schema.json";
import type { Executable, MatchScoutingConfig } from "@/config/types";
import {
  BUILT_IN_EXECUTABLES,
  createExecutables,
  EXECUTABLE_NAME,
  extensionExecutables,
} from "@/scouting/executables";
import {
  defineExecutable,
  type ExecutableInput,
  type ExecutableView,
  type ExtensionExecutable,
} from "@/scouting/extension-api";
import { pressLimit } from "@/scouting/extensions/examples/pressLimit";
import {
  DEFAULT_SETTINGS,
  initialState,
  isShown,
  press,
  recordedActions,
  undo,
  type ScoutingContext,
  type SessionState,
} from "@/scouting/session";

const source = readFileSync(join(process.cwd(), "config", "match-scouting.json"), "utf8");
const c2026 = JSON.parse(source) as MatchScoutingConfig;

// The example is added here unless someone has registered it for real, as the guide describes;
// registering it twice would throw.
const registered = extensionExecutables.some((x) => x.name === "pressLimit");
const example: readonly ExtensionExecutable[] = registered ? [] : [pressLimit];
const withExample = (...more: ExtensionExecutable[]) => createExecutables([...more, ...example]);

/** 2026's configuration with `executables` on one button. */
function withExecutables(layer: string, button: string, executables: Executable[]) {
  const config = structuredClone(c2026);
  const b = config.layout.layers.find((l) => l.id === layer)!.buttons.find((x) => x.id === button)!;
  b.executables = executables;
  return config;
}

/** The part of the state an extension may change. */
const viewOf = (s: SessionState): ExecutableView => ({
  variables: s.variables,
  highlights: s.highlights,
  hidden: s.hidden,
});

afterEach(() => vi.restoreAllMocks());

// ------------------------------------------------------------------------- registration

describe("ADR 0005, #362: registering an extension executable", () => {
  const all = [...extensionExecutables, ...example];

  it.each(all.map((x) => [x.name, x] as const))(
    "%s: a usable name, a summary, and a schema that compiles and rejects an unknown option",
    (_, x) => {
      expect(x.name).toMatch(EXECUTABLE_NAME);
      expect(x.summary.trim().length).toBeGreaterThan(0);
      expect(validateExecutableOptions(x, { notAnOption: 1 })).toContainEqual(
        expect.objectContaining({ message: 'unknown property "notAnOption"' }),
      );
    },
  );

  it("refuses a name no button could use, a built-in's name, and a name registered twice", () => {
    const named = (name: string) => defineExecutable({ ...pressLimit, name });
    expect(() => createExecutables([named("press-limit")])).toThrow(
      'extension executable "press-limit": a name starts with a letter and has only letters, digits and _',
    );
    expect(() => createExecutables([named("hide")])).toThrow(
      'extension executable "hide": "hide" is a built-in executable; choose another name',
    );
    expect(() => createExecutables([named("twice"), named("twice")])).toThrow(
      'extension executable "twice" is registered twice',
    );
  });

  it("the session's built-in types are the schema's", () => {
    expect([...BUILT_IN_EXECUTABLES].sort()).toEqual(
      builtInExecutables(matchScoutingSchema.$defs.executable).sort(),
    );
  });

  it("OF-1: nothing under src/scouting, extensions included, imports Node, reads files, or fetches", () => {
    // The session runs on the phone, also with no connection.
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
      });
    const offending = files(join(process.cwd(), "src", "scouting")).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [/from "node:/, /from "(fs|path|child_process|os)"/, /\brequire\(/, /\bfetch\(/]
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${file}: ${pattern}`);
    });
    expect(offending).toEqual([]);
  });

  it("the extension index exports executables only, one line each, alphabetical", () => {
    for (const x of extensionExecutables) expect(typeof x.execute).toBe("function");
    const index = readFileSync(
      join(process.cwd(), "src", "scouting", "extensions", "index.ts"),
      "utf8",
    );
    const code = index
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//") && line !== "export {};");
    for (const line of code) expect(line).toMatch(/^export \{ \w+ \} from "\.\/[\w-]+";$/);
    expect(code).toEqual([...code].sort((a, b) => a.localeCompare(b)));
    expect(code).toHaveLength(extensionExecutables.length);
  });
});

// ------------------------------------------------------------------------- config:check

describe("CC-3, #362: config:check checks an executable's name and options", () => {
  function check(executables: Executable[], set = withExample()) {
    const config = withExecutables("layer-0", "preloadFuel", executables);
    const report = checkConfiguration(
      { "match-scouting": JSON.stringify(config) },
      { generated: false, executables: set },
    );
    return report.findings
      .filter((f) => f.where.startsWith('layer "layer-0" › button "preloadFuel"'))
      .map((f) => [f.severity, f.where, f.message, f.hint]);
  }
  const at = 'layer "layer-0" › button "preloadFuel" › executable 1 (pressLimit)';

  it("an extension's options that pass are not reported", () => {
    expect(check([{ type: "pressLimit", max: 8 }])).toEqual([]);
  });

  it("an unknown name is an error, with the name it is closest to", () => {
    expect(check([{ type: "presLimit", max: 8 }])).toEqual([
      [
        "error",
        'layer "layer-0" › button "preloadFuel" › executable 1 (presLimit) › type',
        'There is no executable "presLimit".',
        'Did you mean "pressLimit"?',
      ],
    ]);
  });

  it("options are checked against the extension's own schema", () => {
    const hint = "pressLimit: Hide the button once it has been pressed max times in the match.";
    expect(check([{ type: "pressLimit", maks: 8 }])).toEqual([
      ["error", at, 'missing required property "max"', hint],
      ["error", `${at} › maks`, 'unknown property "maks"; did you mean "max"?', hint],
    ]);
    expect(check([{ type: "pressLimit", max: 0 }])).toEqual([
      ["error", `${at} › max`, "must be >= 1", hint],
    ]);
  });

  it("a schema that does not compile is reported as a bug in the extension", () => {
    const broken = defineExecutable({
      ...pressLimit,
      name: "broken",
      optionsSchema: { type: "object", propertiez: {} },
    });
    const [finding] = check([{ type: "broken" }], createExecutables([broken]));
    expect(finding[0]).toBe("error");
    expect(finding[2]).toMatch(/^The options schema of executable "broken" does not compile/);
    expect(finding[3]).toBe(
      "This is a bug in the executable's code, not in the configuration. Ask whoever wrote the extension to fix it.",
    );
  });

  it("CS-17: the server refuses a configuration naming an executable the app does not have", () => {
    const loaded = loadMatchScouting(
      JSON.stringify(withExecutables("layer-0", "preloadFuel", [{ type: "notBuiltIn" }])),
    );
    expect(loaded.config).toBeNull();
    expect(loaded.errors.map((f) => f.message)).toEqual(['There is no executable "notBuiltIn".']);
  });
});

// ------------------------------------------------------------------------- in the session

/** One scouter on 2026's configuration, with extension executables of the test's own. */
function session(config: MatchScoutingConfig, ...executables: ExtensionExecutable[]) {
  const context: ScoutingContext = {
    config,
    settings: DEFAULT_SETTINGS,
    executables: withExample(...executables),
  };
  let state = initialState(config);
  return {
    context,
    get state() {
      return state;
    },
    set state(s: SessionState) {
      state = s;
    },
    press(button: string, layer = "layer-0") {
      state = press(state, context, { layer, button }, 0);
      return state;
    },
    undo() {
      state = undo(state, context);
      return state;
    },
  };
}

describe("T-10: undo puts back what an extension executable changed", () => {
  it("the example hides its button on the last press it allows, and undo shows it again", () => {
    const s = session(withExecutables("layer-0", "preloadFuel", [{ type: "pressLimit", max: 3 }]));
    const ref = { layer: "layer-0", button: "preloadFuel" };
    s.press("preloadFuel");
    s.press("preloadFuel");
    expect(isShown(s.state, ref)).toBe(true);
    const before = s.state;
    s.press("preloadFuel");
    expect(isShown(s.state, ref)).toBe(false);
    expect(recordedActions(s.state).map((a) => a.id)).toEqual(Array(3).fill("preloadFuel"));

    s.undo();
    expect(isShown(s.state, ref)).toBe(true);
    expect(viewOf(s.state)).toEqual(viewOf(before));
    expect(s.state.queue).toEqual(before.queue);
  });

  it("every kind of change, before and after a built-in on the same button, in either order", () => {
    // Sets a new variable, changes one, removes one; adds a highlight and drops one; hides a
    // button and shows a hidden one.
    const everything = defineExecutable({
      name: "everything",
      summary: "Changes every part of the view",
      optionsSchema: { type: "object", additionalProperties: false },
      execute: (view) => {
        const variables: Record<string, string | number | boolean> = { ...view.variables };
        delete variables.gone;
        return {
          variables: { ...variables, added: true, changed: 2 },
          highlights: [...view.highlights.filter((h) => h !== "lit"), "preloadNone"],
          hidden: [...view.hidden.filter((h) => h !== "layer-0:preloadNone"), "layer-1:aStop"],
        };
      },
    });
    for (const order of [
      [{ type: "everything" }, { type: "setVariable", name: "changed", value: 3 }],
      [{ type: "setVariable", name: "changed", value: 3 }, { type: "everything" }],
    ] as Executable[][]) {
      const config = withExecutables("layer-0", "preloadFuel", order);
      config.rules.undo.minQueueLength = 0;
      const s = session(config, everything);
      s.state = {
        ...s.state,
        variables: { changed: 1, gone: "x", kept: "y" },
        highlights: ["lit", "other"],
        hidden: ["layer-0:preloadNone"],
      };
      const before = s.state;
      s.press("preloadFuel");
      expect(viewOf(s.state)).not.toEqual(viewOf(before));
      s.undo();
      expect(viewOf(s.state)).toEqual(viewOf(before));
    }
  });
});

describe("SC-38: an extension executable cannot change what the session records", () => {
  const plain = session(c2026);
  plain.press("preloadFuel");
  const recorded = recordedActions(plain.state);

  /** Press 2026's preload button with `execute` as its executable; what was recorded, and logged. */
  function pressWith(execute: ExtensionExecutable["execute"]) {
    const misbehaving = defineExecutable({
      name: "misbehaving",
      summary: "Does what it should not",
      optionsSchema: { type: "object", additionalProperties: false },
      execute,
    });
    const config = withExecutables("layer-0", "preloadFuel", [{ type: "misbehaving" }]);
    const kept = structuredClone(config);
    const s = session(config, misbehaving);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    s.press("preloadFuel");
    const logged = errors.mock.calls.map((c) => String(c[0]));
    errors.mockRestore();
    expect(recordedActions(s.state)).toEqual(recorded);
    expect(config).toEqual(kept);
    return { state: s.state, logged };
  }

  it("is given frozen copies: changing what it was given is a mistake, reported, and the press records", () => {
    const attempts: ExtensionExecutable["execute"][] = [
      (view) => {
        (view.variables as Record<string, unknown>).x = 1;
        return view;
      },
      (view, { earlier }) => {
        (earlier as unknown[]).push(earlier[0]);
        return view;
      },
      (view, { press }) => {
        press.button = "preloadNone";
        return view;
      },
      (view, { config }) => {
        config.layout.layers[0].buttons[1].id = "renamed";
        return view;
      },
    ];
    for (const attempt of attempts) {
      const { state, logged } = pressWith(attempt);
      expect(viewOf(state)).toEqual(viewOf(initialState(c2026)));
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatch(
        /^The "misbehaving" executable on button "preloadFuel" failed: .+\. The press was recorded without it\.$/,
      );
    }
  });

  it("a throw, or something that is not a view, is reported and the press records without it", () => {
    const wrong: [ExtensionExecutable["execute"], string][] = [
      [
        () => {
          throw new Error("no data");
        },
        "no data",
      ],
      [() => undefined as unknown as ExecutableView, "it returned no view"],
      [
        (view) =>
          ({ ...view, variables: { held: { piece: "cone" } } }) as unknown as ExecutableView,
        'variable "held" is {"piece":"cone"}, not a string, number or true/false',
      ],
      [
        (view) => ({ ...view, variables: { count: NaN } }),
        'variable "count" is null, not a string, number or true/false',
      ],
      [
        (view) => ({ ...view, hidden: "layer-0:preloadFuel" }) as unknown as ExecutableView,
        "hidden is not a list of buttons",
      ],
    ];
    for (const [execute, message] of wrong) {
      const { state, logged } = pressWith(execute);
      expect(viewOf(state)).toEqual(viewOf(initialState(c2026)));
      expect(logged).toEqual([
        `The "misbehaving" executable on button "preloadFuel" failed: ${message}. The press was recorded without it.`,
      ]);
    }
  });

  it("anything it returns besides the view is ignored", () => {
    const { state, logged } = pressWith(
      (view) => ({ ...view, queue: [], status: "submitted", clock: null }) as ExecutableView,
    );
    expect(logged).toEqual([]);
    expect(state.status).toBe("pre-match");
    expect(state.queue).toHaveLength(1);
  });

  it("sees its options without the type, the press, the presses before it, and the settings", () => {
    const inputs: ExecutableInput<Record<string, unknown>>[] = [];
    const watching = defineExecutable({
      name: "watching",
      summary: "Keeps what it is given",
      optionsSchema: { type: "object" },
      execute: (view, input) => {
        inputs.push(input as ExecutableInput<Record<string, unknown>>);
        return view;
      },
    });
    const s = session(
      withExecutables("layer-1", "aStop", [{ type: "watching", note: "auto stop" }]),
      watching,
    );
    s.state = press(s.state, s.context, { layer: "layer-0", button: "preloadFuel" }, 0);
    s.state = press(s.state, s.context, { layer: "layer-0", button: "startGame" }, 1000);
    s.state = press(s.state, s.context, { layer: "layer-1", button: "aStop" }, 3000);
    expect(inputs).toHaveLength(1);
    const [input] = inputs;
    expect(input.options).toEqual({ note: "auto stop" });
    expect(input.press).toMatchObject({ layer: "layer-1", button: "aStop", type: "action" });
    expect(input.press.placement.phase).toBe("auto");
    expect(input.press.ts).toBe(c2026.timing.totalMs - 2000);
    expect(input.earlier.map((p) => p.button)).toEqual(["preloadFuel", "startGame"]);
    expect(input.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("on an undo button, runs after the undo and sees the presses left", () => {
    const counting = defineExecutable({
      name: "counting",
      summary: "Counts the presses left",
      optionsSchema: { type: "object", additionalProperties: false },
      execute: (view, { press, earlier }) => ({
        ...view,
        variables: { ...view.variables, left: earlier.length, by: press.button },
      }),
    });
    const s = session(withExecutables("layer-1", "undo", [{ type: "counting" }]), counting);
    s.state = press(s.state, s.context, { layer: "layer-0", button: "preloadFuel" }, 0);
    s.state = press(s.state, s.context, { layer: "layer-0", button: "startGame" }, 1000);
    s.state = press(s.state, s.context, { layer: "layer-1", button: "aStop" }, 2000);
    s.state = press(s.state, s.context, { layer: "layer-1", button: "undo" }, 3000);
    expect(s.state.queue).toHaveLength(2);
    expect(s.state.variables).toEqual({ left: 2, by: "undo" });
  });

  it("a type the session does not have does nothing, so a press still records", () => {
    const s = session(withExecutables("layer-0", "preloadFuel", [{ type: "notBuiltIn" }]));
    s.press("preloadFuel");
    expect(recordedActions(s.state)).toEqual(recorded);
  });
});
