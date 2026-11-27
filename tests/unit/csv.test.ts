/**
 * The CSV export (#388; docs/spec/08 AN-26 to AN-26b, BL-232, F-7, F-27, SEC-8, T-2): the
 * columns, the quoting, and missing values as empty cells. The browser test downloads the file
 * (`analysis.spec.ts`).
 */
import { describe, expect, it } from "vitest";
import { csvFileName, numberField, teamsCsv, textField } from "@/analysis/csv";
import type { Dataset } from "@/analysis/engine";

const dataset = {
  tmps: [{ team: "254", scouterId: "S12345", notes: "CharlotteCao" }],
  teams: {
    // Out of order: the file is in team order.
    "3061": {
      averages: { shoot: 2, climb: 1 },
      averageScores: { auto: 10.5 },
      cycles: { shooting: { averageTime: 4.25, averageTimeComplete: 5 } },
    },
    "254": {
      averages: { shoot: 3, pass: 0, defense: NaN },
      averageScores: { auto: null },
      cycles: { shooting: { averageTime: 3 }, storing: { averageTime: 2, averageTimeComplete: 1 } },
    },
    // No groups at all.
    "2338B": {},
  },
} as unknown as Dataset;

const lines = (csv: string) => csv.split("\r\n").filter((l) => l !== "");

describe("AN-26, AN-26a: v5's columns from the dataset the page has, for every key any team has", () => {
  it("Team #, averages, average scores, then each cycle's time and time complete", () => {
    const [header] = lines(teamsCsv(dataset));
    expect(header.split(",")).toEqual([
      "Team #",
      // In the order the teams have them, team by team.
      "shoot Average",
      "pass Average",
      "defense Average",
      "climb Average",
      "auto Score Average",
      "shooting Cycle Average Time",
      "storing Cycle Average Time",
      "shooting Cycle Average Time Complete",
      "storing Cycle Average Time Complete",
    ]);
  });

  it("a row per team, in team order, numbers as they are", () => {
    const [, ...rows] = lines(teamsCsv(dataset));
    expect(rows).toEqual(["254,3,0,,,,3,2,,1", "2338B,,,,,,,,,", "3061,2,,,1,10.5,4.25,,5,"]);
  });
});

describe("AN-26: a nested group, as v6's per-period counts, gives a column per value", () => {
  it("named by the value's path, in the order the teams have them", () => {
    const csv = teamsCsv({
      tmps: [],
      teams: {
        "1": { averages: { auto: { Shoot: 2, Pass: 0 }, teleop: { Shoot: 5 } } },
        "2": { averages: { auto: { Shoot: 1, "a.b": 3 }, total: 4 } },
      },
    } as unknown as Dataset);
    expect(lines(csv)).toEqual([
      "Team #,auto.Shoot Average,auto.Pass Average,teleop.Shoot Average,auto.a.b Average,total Average",
      "1,2,0,5,,",
      "2,1,,,3,4",
    ]);
  });
});

describe("F-27: a missing value is an empty cell, not 0 (decided 2026-11-27)", () => {
  it("missing, null, NaN, infinite or not a number: empty; 0 stays 0", () => {
    expect([undefined, null, NaN, Infinity, "3", true].map(numberField)).toEqual([
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect([0, -1.5, 1 / 3].map(numberField)).toEqual(["0", "-1.5", String(1 / 3)]);
  });
});

describe("RFC 4180: headers are quoted when they must be", () => {
  it("a comma, a quote or a line break is quoted, quotes doubled", () => {
    expect(textField("plain Average")).toBe("plain Average");
    expect(textField("a,b Average")).toBe('"a,b Average"');
    expect(textField('say "hi" Average')).toBe('"say ""hi"" Average"');
    expect(textField("two\nlines")).toBe('"two\nlines"');
    expect(textField(" padded")).toBe('" padded"');
  });

  it("a field a spreadsheet would take for a formula starts with '", () => {
    expect(textField("=1+1 Average")).toBe("'=1+1 Average");
    expect(textField("-x,y")).toBe('"\'-x,y"');
    expect(textField("@sum")).toBe("'@sum");
  });

  it("a key with a comma gives one quoted column, so every row has as many fields", () => {
    const csv = teamsCsv({
      tmps: [],
      teams: { "1": { averages: { "a,b": 1, c: 2 } } },
    } as unknown as Dataset);
    expect(lines(csv)).toEqual(['Team #,"a,b Average",c Average', "1,1,2"]);
  });
});

describe("SEC-8, AN-26b: team values only", () => {
  it("nothing from a performance, so no scouter, reaches the file", () => {
    const csv = teamsCsv(dataset);
    expect(csv).not.toContain("S12345");
    expect(csv).not.toContain("CharlotteCao");
  });

  it("the file is named for the event", () => {
    expect(csvFileName("2026mnwi_official")).toBe("2026mnwi_official.csv");
    expect(csvFileName("odd name/../x")).toBe("odd_name_.._x.csv");
  });
});
