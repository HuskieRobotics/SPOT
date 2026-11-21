/**
 * #330: document 23 records each phase's audit. These checks keep its tables true as the code
 * moves: every requirement it lists is defined in the spec, every oracle rule it names exists, and
 * a requirement it marks as tested is named in a test of the file it points at.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const statusDoc = readFileSync(join(root, "docs/spec/23-requirement-status.md"), "utf8");
const specText = ["docs/spec", "docs/adr"]
  .flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith(".md") && !f.startsWith("23-"))
      .map((f) => readFileSync(join(root, dir, f), "utf8")),
  )
  .join("\n");
const rules = new Set(
  (
    JSON.parse(readFileSync(join(root, "tools/oracle/divergences.json"), "utf8")) as {
      rules: { id: string }[];
    }
  ).rules.map((r) => r.id),
);
const testFile = (name: string) => join(root, "tests/unit", `${name}.test.ts`);

interface Row {
  id: string;
  status: string;
  where: string;
}

/** The rows of every table under "## Phase 1", whose first column is a requirement. */
function rows(): Row[] {
  const out: Row[] = [];
  for (const line of statusDoc.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length !== 5 || cells[1] === "Id" || /^-+$/.test(cells[1])) continue;
    out.push({ id: cells[1], status: cells[2], where: cells[3] });
  }
  return out;
}

const ID = /^[A-Z]{1,4}-\d+[a-z]?$/;
const single = rows().filter((r) => ID.test(r.id));

describe("#330: document 23, the requirement status", () => {
  it("has rows to check", () => {
    expect(single.length).toBeGreaterThan(80);
  });

  it("lists only requirements the spec defines", () => {
    const ids = rows().flatMap((r) => r.id.split(/,\s*|\s+to\s+/).filter((p) => ID.test(p)));
    const undefinedIds = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(specText));
    expect(undefinedIds).toEqual([]);
  });

  it("names oracle rules that exist", () => {
    const named = [...statusDoc.matchAll(/rules? ((?:`[^`]+`(?:, | and )?)+)/g)].flatMap((m) =>
      [...m[1].matchAll(/`([^`]+)`/g)].map((n) => n[1]),
    );
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((n) => !rules.has(n))).toEqual([]);
  });

  it("names each tested requirement in a test of the file it points at", () => {
    const missing: string[] = [];
    for (const row of single) {
      if (!["Done", "Divergence"].includes(row.status) || /"/.test(row.where)) continue;
      const files = [...row.where.matchAll(/`([a-z0-9-]+)`/g)]
        .map((m) => m[1])
        .filter((name) => existsSync(testFile(name)));
      if (files.length === 0) continue;
      const named = files.some((name) =>
        new RegExp(`\\b${row.id}\\b`).test(readFileSync(testFile(name), "utf8")),
      );
      if (!named) missing.push(`${row.id}: ${files.join(", ")}`);
    }
    expect(missing).toEqual([]);
  });
});
