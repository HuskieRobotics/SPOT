/**
 * The data model round-trips through a real MongoDB (DV-1 to DV-11, DM-1a, BL-308), using the
 * in-memory server every database test will share.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "@/generate/synthetic";
import { compareTeamKeys } from "@/data/team";
import { validateDocument } from "@/data/validate";
import type { MatchScoutingConfig } from "@/config/types";
import type { TeamMatchPerformance } from "@/data/types";
import { startMongo, type TestMongo } from "../support/mongo";

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config", "match-scouting.json"), "utf8"),
) as MatchScoutingConfig;
const dataset = generate({ config, seed: "mongo", matches: 10, bTeams: 6 });

describe("MongoDB round trip", () => {
  let mongo: TestMongo;

  beforeAll(async () => {
    mongo = await startMongo();
    // Copies: the driver adds nothing to our objects, but a test should not depend on that.
    await mongo.db
      .collection<TeamMatchPerformance>("teamMatchPerformances")
      .insertMany(dataset.performances.map((p) => structuredClone(p)));
  }, 180_000); // the first run downloads mongod

  afterAll(async () => {
    await mongo?.stop();
  });

  it("reads back exactly what was written, still valid", async () => {
    const stored = await mongo.db
      .collection<TeamMatchPerformance>("teamMatchPerformances")
      .find({}, { sort: { matchNumber: 1, submittedAt: 1 } })
      .toArray();
    expect(stored).toEqual(dataset.performances);
    for (const p of stored)
      expect(validateDocument("team-match-performance", p).issues).toEqual([]);
  });

  it("DM-1a / BL-308: finds a B robot by its string key and sorts team keys correctly", async () => {
    const collection = mongo.db.collection<TeamMatchPerformance>("teamMatchPerformances");
    const teams = (await collection.distinct("team")).sort(compareTeamKeys);
    const b = teams.find((t) => t.endsWith("B"));
    expect(b).toBeDefined();
    expect(await collection.countDocuments({ team: b })).toBe(
      dataset.performances.filter((p) => p.team === b).length,
    );
    expect(teams.indexOf(b!.slice(0, -1))).toBe(teams.indexOf(b!) - 1);
  });
});
