/**
 * T-3: the stored-document schemas (docs/spec/21-data-model-v2.md). These are the same schemas
 * that back the MongoDB collection validators, so what they refuse is what the database refuses.
 */
import { describe, expect, it } from "vitest";
import {
  COLLECTIONS,
  getDocumentValidator,
  validateDocument,
  type DocumentKind,
} from "@/data/validate";
import {
  DEFAULT_TENANT,
  NOT_FLAGGED,
  type Scouter,
  type SpotEvent,
  type TeamMatchPerformance,
} from "@/data/types";

const oid = (c: string) => c.repeat(24).slice(0, 24);

const performance = (): TeamMatchPerformance => ({
  _id: oid("a"),
  tenantId: DEFAULT_TENANT,
  eventId: oid("b"),
  matchNumber: 12,
  team: "3061",
  scouterId: "123456",
  source: "app",
  clientVersion: "1.0",
  submittedAt: 1772809355374,
  matchKey: "12-3061-123456-abc",
  nonce: "abc",
  coverage: "full",
  superseded: false,
  flag: { ...NOT_FLAGGED },
  notes: null,
  tags: [],
  actions: [
    {
      id: "Storing",
      ts: 118400,
      phase: "teleop",
      segment: "shift",
      segmentKind: "active",
      segmentIndex: 2,
    },
    {
      id: "AttemptL1",
      ts: 150000,
      phase: "auto",
      segment: null,
      segmentKind: null,
      segmentIndex: null,
      other: { pos: { x: 40, y: 60 } },
    },
  ],
});

const event = (): SpotEvent => ({
  _id: oid("c"),
  tenantId: DEFAULT_TENANT,
  code: "2026mnwi_official",
  tbaKey: "2026mnwi",
  label: "official",
  eventCode: "HUSKIE26",
  eventCodeRotatedAt: 1772809355374,
});

const scouter = (): Scouter => ({
  _id: "123456",
  tenantId: DEFAULT_TENANT,
  displayName: "Alex Rivera",
  aliases: [],
  legacy: false,
  createdAt: 1772809355374,
});

describe("document schemas", () => {
  for (const kind of ["team-match-performance", "event", "scouter"] as DocumentKind[]) {
    it(`${kind} compiles and names a collection`, () => {
      expect(() => getDocumentValidator(kind)).not.toThrow();
      expect(COLLECTIONS[kind]).toBeTruthy();
    });
  }

  it("accepts well-formed documents", () => {
    expect(validateDocument("team-match-performance", performance()).issues).toEqual([]);
    expect(validateDocument("event", event()).issues).toEqual([]);
    expect(validateDocument("scouter", scouter()).issues).toEqual([]);
  });

  it("DM-1a: refuses a team that arrived as a number", () => {
    const p = { ...performance(), team: 3061 };
    expect(validateDocument("team-match-performance", p).issues).toContainEqual({
      path: "team",
      message: "must be string",
    });
  });

  it("BL-308: accepts a B robot and refuses keys that are not team keys", () => {
    expect(
      validateDocument("team-match-performance", { ...performance(), team: "2338B" }).issues,
    ).toEqual([]);
    for (const team of ["frc3061", "03061", "2338b", "2338BB", ""]) {
      const issues = validateDocument("team-match-performance", { ...performance(), team }).issues;
      expect(issues.map((i) => i.path)).toContain("team");
    }
  });

  it("refuses a per-action _id, which v5 stored and v6 does not", () => {
    const p = performance();
    (p.actions[0] as unknown as Record<string, unknown>)._id = oid("d");
    expect(validateDocument("team-match-performance", p).issues).toContainEqual({
      path: "actions.0",
      message: 'unknown property "_id"',
    });
  });

  it("requires the placement fields, even when they are null", () => {
    const p = performance();
    delete (p.actions[0] as unknown as Record<string, unknown>).phase;
    expect(validateDocument("team-match-performance", p).issues).toContainEqual({
      path: "actions.0",
      message: 'missing required property "phase"',
    });
  });

  it("requires a tenant on every document", () => {
    for (const [kind, doc] of [
      ["team-match-performance", performance()],
      ["event", event()],
      ["scouter", scouter()],
    ] as unknown as [DocumentKind, Record<string, unknown>][]) {
      delete doc.tenantId;
      expect(validateDocument(kind, doc).issues).toContainEqual({
        path: "(root)",
        message: 'missing required property "tenantId"',
      });
    }
  });

  it("allows a performance with no scouter, for a scanned QR code", () => {
    expect(
      validateDocument("team-match-performance", {
        ...performance(),
        scouterId: null,
        source: "qr",
      }).ok,
    ).toBe(true);
  });

  it("refuses an unknown source and an unknown flag source", () => {
    expect(
      validateDocument("team-match-performance", { ...performance(), source: "socket" }).ok,
    ).toBe(false);
    const p = performance();
    p.flag = { flagged: true, reason: "replaced", source: "robot" as never, at: 1 };
    expect(validateDocument("team-match-performance", p).ok).toBe(false);
  });

  it("accepts the machine flag a replacement produces (RT-36)", () => {
    const p = performance();
    p.coverage = "partial";
    p.flag = {
      flagged: true,
      reason: "Scouter replaced mid-match",
      source: "machine",
      at: 1772809355374,
    };
    expect(validateDocument("team-match-performance", p).issues).toEqual([]);
  });
});
