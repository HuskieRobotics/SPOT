/** Team keys (DM-1a, BL-308): src/data/team.ts. */
import { describe, expect, it } from "vitest";
import { compareTeamKeys, isTeamKey, teamNumber, teamSuffix, toTeamKey } from "@/data/team";

describe("DM-1a / BL-308: team keys", () => {
  it("normalizes every source to one string form", () => {
    expect(toTeamKey(3061)).toBe("3061"); // FIRST API, v5 documents
    expect(toTeamKey("3061")).toBe("3061");
    expect(toTeamKey("frc3061")).toBe("3061"); // TBA team_key
    expect(toTeamKey("frc2338B")).toBe("2338B");
    expect(toTeamKey(" FRC2338b ")).toBe("2338B");
  });

  it("rejects what is not a team", () => {
    for (const v of [0, -1, 3.5, Number.NaN, "", "0", "03061", "2338BB", "B", "123456", null, {}])
      expect(toTeamKey(v)).toBeNull();
    expect(isTeamKey(3061)).toBe(false);
  });

  it("splits a key into number and suffix", () => {
    expect(teamNumber("2338B")).toBe(2338);
    expect(teamSuffix("2338B")).toBe("B");
    expect(teamSuffix("3061")).toBe("");
  });

  it("sorts numerically, then by suffix", () => {
    expect(["3061", "2338B", "254", "2338", "2338C"].sort(compareTeamKeys)).toEqual([
      "254",
      "2338",
      "2338B",
      "2338C",
      "3061",
    ]);
  });
});
