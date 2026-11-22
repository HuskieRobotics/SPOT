/**
 * NF-13 (docs/spec/02, added 2026-11-22): students run SPOT's commands from VS Code's Run and
 * Debug list. VS Code itself cannot run here, so this checks what it would rely on: each entry
 * runs a script that exists, in any terminal a school computer opens, and the guide names it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

interface LaunchConfiguration {
  name: string;
  type: string;
  command?: string;
  program?: string;
  serverReadyAction?: { pattern: string; uriFormat: string };
}
interface Input {
  id: string;
  type: string;
  options?: (string | { label: string; value: string })[];
}

// launch.json may hold comments, as VS Code allows; TypeScript's reader accepts them.
const { config: launch, error } = ts.parseConfigFileTextToJson(
  "launch.json",
  readFileSync(join(".vscode", "launch.json"), "utf8"),
) as { config: { configurations: LaunchConfiguration[]; inputs: Input[] }; error?: unknown };
const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: object }).scripts;
const terminal = launch.configurations.filter((c) => c.type === "node-terminal");
const inputsUsed = (text: string) => [...text.matchAll(/\$\{input:(\w+)\}/g)].map((m) => m[1]);

describe("NF-13: the Run and Debug list", () => {
  it("is a launch.json VS Code can read", () => {
    expect(error).toBeUndefined();
    expect(launch.configurations.length).toBeGreaterThan(0);
    const names = launch.configurations.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("runs one npm script per entry, and the script exists", () => {
    for (const { name, command } of terminal) {
      const match = command?.match(/^npm (?:run ([\w:]+)|(test))(?: -- .*)?$/);
      expect(match, `${name}: ${command}`).not.toBeNull();
      expect(Object.keys(scripts), name).toContain(match![1] ?? match![2]);
    }
  });

  it("chains nothing, which Windows PowerShell 5.1 would refuse (NF-12)", () => {
    for (const { name, command } of terminal) {
      expect(command, name).not.toMatch(/&&|\|\||;|\|/);
    }
  });

  it("defines every input it asks for, and asks for every input it defines", () => {
    const used = new Set(terminal.flatMap((c) => inputsUsed(c.command ?? "")));
    expect([...used].sort()).toEqual(launch.inputs.map((i) => i.id).sort());
  });

  it("offers season folders that exist, and the tutorial's git-ignored copy", () => {
    const season = launch.inputs.find((i) => i.id === "season")!;
    const folders = season.options!.map((o) => (typeof o === "string" ? o : o.value));
    expect(folders[0]).toBe("config");
    expect(folders).toContain("config/seasons/practice");
    for (const folder of folders.filter((f) => f !== "config/seasons/practice")) {
      expect(existsSync(join(folder, "match-scouting.json")), folder).toBe(true);
    }
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\/?config\/seasons\/practice\/?$/m);
  });

  it("opens the browser on the address Next prints, at pages that exist", () => {
    // What `npm run dev` prints once it is listening (Next 16.3).
    const printed = "- Local:         http://localhost:3000\r";
    const opening = launch.configurations.filter((c) => c.serverReadyAction);
    expect(opening.length).toBeGreaterThan(0);
    for (const { name, serverReadyAction } of opening) {
      const url = printed.match(new RegExp(serverReadyAction!.pattern))?.[1];
      expect(url, name).toBe("http://localhost:3000");
      const page = serverReadyAction!.uriFormat.replace("%s", "").replace(/^\//, "");
      expect(existsSync(join("src", "app", page, "page.tsx")), `${name}: /${page}`).toBe(true);
    }
    const debug = launch.configurations.find((c) => c.program);
    expect(existsSync(debug!.program!.replace("${workspaceFolder}/", ""))).toBe(true);
  });

  it("is described where students look: each entry by name", () => {
    const docs = ["README.md", join("docs", "configuration-guide", "README.md")]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const { name } of launch.configurations) expect(docs, name).toContain(name);
  });
});
