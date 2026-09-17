/**
 * T-3: the active v2 configuration in config/ must validate against the v2 schemas, and, until
 * the 2026 configuration is edited by hand for the new client, must equal the converter's
 * output from config/v1 so that converter and active config cannot drift apart.
 * When the active config is first hand-edited, delete the drift test and keep the rest.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  convertAnalysisModules,
  convertAnalysisPipeline,
  convertMatchScouting,
  convertQr,
} from "@/config/convert/v1-to-v2";
import { deriveKnownActionIds } from "@/config/knownActionIds";
import { validateConfig, type ConfigKind } from "@/config/validate";

const root = process.cwd();
const active = (kind: ConfigKind) =>
  JSON.parse(readFileSync(join(root, "config", `${kind}.json`), "utf8"));
const v1 = (f: string) => JSON.parse(readFileSync(join(root, "config", "v1", f), "utf8"));
const oprStrings = JSON.parse(
  readFileSync(join(root, "tools", "oracle", "fixtures", "opr-strings", "2026mnwi.json"), "utf8"),
) as Record<string, string>;
const opts = { oprStrings, schemaBase: "../src/config/schema" };

describe("active configuration (config/*.json)", () => {
  const kinds: ConfigKind[] = ["match-scouting", "analysis-pipeline", "analysis-modules", "qr"];
  for (const kind of kinds) {
    it(`${kind}.json is valid v2`, () => {
      const r = validateConfig(kind, active(kind));
      expect(r.issues).toEqual([]);
    });
  }

  it("matches the converter output for config/v1 (drift check)", () => {
    expect(active("match-scouting")).toEqual(
      convertMatchScouting(v1("match-scouting.json"), opts).config,
    );
    expect(active("analysis-pipeline")).toEqual(
      convertAnalysisPipeline(v1("analysis-pipeline.json"), opts).config,
    );
    expect(active("analysis-modules")).toEqual(
      convertAnalysisModules(v1("analysis-modules.json"), opts).config,
    );
    expect(active("qr")).toEqual(convertQr(v1("qr.json"), opts).config);
  });

  it("fits the QR id field", () => {
    const known = deriveKnownActionIds(active("match-scouting"));
    const idBits = (active("qr").actionSchema as { key: string; bits: number }[]).find(
      (f) => f.key === "id",
    )!.bits;
    expect(known.length).toBeLessThan(2 ** idBits);
  });
});
