/**
 * T-3 (seed): every legacy v1 configuration file in config/v1 must parse and have the
 * top-level shape documented in docs/spec/04-configuration.md. This is the starting point for
 * the JSON Schema v2 validation tests; it protects the converter's inputs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "config", "v1");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

// Known-invalid legacy files (documented in config/v1/README.md). Kept for the record.
const knownInvalid = new Set(["analysis-pipeline-2024.json"]);

type Json = Record<string, unknown>;
const load = (f: string): unknown => JSON.parse(readFileSync(join(dir, f), "utf8"));

describe("legacy v1 configuration files", () => {
  it("has the expected inventory", () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
    expect(files).toContain("match-scouting.json");
    expect(files).toContain("analysis-pipeline.json");
    expect(files).toContain("analysis-modules.json");
    expect(files).toContain("qr.json");
  });

  for (const f of files) {
    if (knownInvalid.has(f)) {
      it(`${f} is known-invalid JSON (legacy)`, () => {
        expect(() => load(f)).toThrow();
      });
      continue;
    }
    it(`${f} parses`, () => {
      expect(() => load(f)).not.toThrow();
    });
  }

  for (const f of files.filter(
    (f) => f.startsWith("match-scouting") && !f.includes("template") && !knownInvalid.has(f),
  )) {
    it(`${f} has timing and a button grid`, () => {
      const c = load(f) as Json;
      const timing = c.timing as Json;
      const layout = c.layout as Json;
      expect(typeof timing.totalTime).toBe("number");
      expect(Array.isArray(layout.layers)).toBe(true);
      const buttons = (layout.layers as Json[][]).flat();
      for (const b of buttons) {
        expect(typeof b.id).toBe("string");
        expect(["action", "undo", "none", "match-control", "label"]).toContain(b.type);
        expect(Array.isArray(b.gridArea)).toBe(true);
        expect(Array.isArray(b.executables)).toBe(true);
      }
    });
  }

  for (const f of files.filter((f) => f.startsWith("analysis-pipeline") && !knownInvalid.has(f))) {
    it(`${f} is an ordered list of transformer instances`, () => {
      const entries = load(f) as Json[];
      expect(Array.isArray(entries)).toBe(true);
      for (const t of entries) {
        expect(["tmp", "team"]).toContain(t.type);
        expect(typeof t.name).toBe("string");
        expect(typeof t.outputPath).toBe("string");
      }
    });
  }

  for (const f of files.filter((f) => f.startsWith("analysis-modules"))) {
    it(`${f} is a list of module instances`, () => {
      const entries = load(f) as Json[];
      expect(Array.isArray(entries)).toBe(true);
      for (const m of entries) {
        expect(["team", "match"]).toContain(m.view);
        expect(typeof m.module).toBe("string");
        expect(typeof m.options).toBe("object");
      }
    });
  }

  it("qr.json declares id first (docs/spec/03, DM-15)", () => {
    const q = load("qr.json") as { ACTION_SCHEMA: { key: string; bits: number }[] };
    expect(q.ACTION_SCHEMA[0].key).toBe("id");
  });
});
