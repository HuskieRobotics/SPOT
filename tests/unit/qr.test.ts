/**
 * The QR codec (#358): a performance as a QR code and back, for the 2022, 2023, 2025 and 2026
 * configurations (docs/spec/22), and the real 2026 match with the most actions (T-2).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertMatchScouting } from "@/config/convert/v1-to-v2";
import type { MatchScoutingConfig } from "@/config/types";
import { NONCE_LENGTH, newNonce } from "@/data/nonce";
import { performanceKey, type TeamMatchPerformance } from "@/data/types";
import { generate } from "@/generate/synthetic";
import { migrate, type V5Event, type V5Performance } from "@/migrate/v5-to-v6";
import { BitReader, BitWriter } from "@/qr/bits";
import { fromBase45, toBase45 } from "@/qr/base45";
import {
  actionsPerCode,
  decodePerformance,
  encodePerformance,
  NONCE_PATTERN,
  QrError,
  type QrInput,
} from "@/qr/codec";
import { qrLayout } from "@/qr/layout";
import { qrVersion } from "@/qr/render";

const read = (...path: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...path), "utf8"));

const configs: Record<string, MatchScoutingConfig> = {
  2022: convertMatchScouting(read("config", "v1", "match-scouting-2022.json"), {}).config,
  2023: convertMatchScouting(read("config", "v1", "match-scouting-2023.json"), {}).config,
  2025: read("config", "seasons", "2025", "match-scouting.json"),
  2026: read("config", "match-scouting.json"),
};

/** What the code carries; the rest the decoder fills in (DV-5) or the server gives (`_id`). */
function carried(p: QrInput) {
  return {
    eventId: p.eventId,
    level: p.level,
    matchNumber: p.matchNumber,
    team: p.team,
    clientVersion: p.clientVersion,
    submittedAt: p.submittedAt,
    nonce: p.nonce,
    coverage: p.coverage,
    actions: p.actions,
  };
}

function sample(overrides: Partial<QrInput> = {}): QrInput {
  return {
    eventId: "69a5ac455b39b683634e795e",
    level: "qual",
    matchNumber: 12,
    team: "3061",
    clientVersion: "6.0.0",
    submittedAt: 1_772_898_725_697,
    nonce: "k3j9x0a2mq7c",
    coverage: "full",
    actions: [
      {
        id: "preloadFuel",
        ts: 160_000,
        phase: null,
        segment: null,
        segmentKind: null,
        segmentIndex: null,
      },
    ],
    ...overrides,
  };
}

describe("Base45 (RFC 9285)", () => {
  it("encodes the RFC's examples, and reads them back", () => {
    const cases: [string, string][] = [
      ["AB", "BB8"],
      ["Hello!!", "%69 VD92EX0"],
      ["base-45", "UJCLQE7W581"],
      ["ietf!", "QED8WEX0"],
    ];
    for (const [text, code] of cases) {
      const bytes = new TextEncoder().encode(text);
      expect(toBase45(bytes)).toBe(code);
      expect(new TextDecoder().decode(fromBase45(code)!)).toBe(text);
    }
  });

  it("refuses text that is not Base45", () => {
    for (const bad of ["GGW", "abc", "A", "ZZZ"]) expect(fromBase45(bad)).toBeNull();
  });
});

describe("bits", () => {
  it("packs fields of any width, up to 96 bits, and reads them back", () => {
    const w = new BitWriter();
    w.write(5, 3);
    w.write(BigInt("0x69a5ac455b39b683634e795e"), 96);
    w.write(1, 1);
    w.write(0xffff, 16);
    const r = new BitReader(w.bytes());
    expect(r.read(3)).toBe(5);
    expect(r.readBig(96).toString(16)).toBe("69a5ac455b39b683634e795e");
    expect(r.read(1)).toBe(1);
    expect(r.read(16)).toBe(0xffff);
    expect(() => new BitWriter().write(8, 3)).toThrow(RangeError);
  });
});

describe("CS-14, CC-7: the layout is derived from match-scouting.json", () => {
  it("2026: 48 ids in 6 bits, 17 periods in 5, a 160 s match in 18", () => {
    const layout = qrLayout(configs[2026]);
    expect(layout.buttons).toHaveLength(48);
    expect(layout.placements).toHaveLength(17);
    expect(layout.bits).toEqual({ button: 6, placement: 5, ts: 18 });
    expect(layout.actionBits).toEqual({ plain: 30, positioned: 44 });
  });

  it("2025: one period per phase and one before the match", () => {
    const layout = qrLayout(configs[2025]);
    expect(layout.placements.map((p) => p.phase)).toEqual([null, "auto", "teleop"]);
    expect(layout.bits.placement).toBe(2);
  });

  it("DM-15a: moving buttons between layers keeps the fingerprint; adding one changes it", () => {
    const config = structuredClone(configs[2025]);
    const before = qrLayout(config).fingerprint;
    config.layout.layers.reverse();
    for (const layer of config.layout.layers) layer.buttons.reverse();
    expect(qrLayout(config).fingerprint).toBe(before);
    config.extraActionIds.push("newThing");
    expect(qrLayout(config).fingerprint).not.toBe(before);
  });
});

describe("T-2: round trip over generated matches", () => {
  for (const season of Object.keys(configs)) {
    it(`${season}: decoding gives back every field the code carries`, () => {
      const config = configs[season];
      const layout = qrLayout(config);
      const { performances } = generate({ config, seed: `qr-${season}`, matches: 12 });
      expect(performances.length).toBeGreaterThan(0);
      for (const [i, p] of performances.entries()) {
        const input: TeamMatchPerformance = {
          ...p,
          level: i % 5 === 0 ? "playoff" : "qual",
          team: i % 7 === 0 ? `${p.team}B` : p.team,
          coverage: i % 3 === 0 ? "partial" : "full",
        };
        const decoded = decodePerformance(encodePerformance(input, layout), layout);
        expect(carried(decoded)).toEqual(carried({ ...input, clientVersion: "6.0.0" }));
        expect(decoded).toMatchObject({
          source: "qr",
          scouterId: null,
          superseded: false,
          matchKey: performanceKey(input.level, input.matchNumber, input.team, input.nonce),
        });
      }
    });
  }

  it("keeps positions, which v5's codes dropped", () => {
    const layout = qrLayout(configs[2026]);
    const { performances } = generate({ config: configs[2026], seed: "qr-pos", matches: 20 });
    const positioned = performances.filter((p) => p.actions.some((a) => a.other?.pos));
    expect(positioned.length).toBeGreaterThan(0);
    for (const p of positioned)
      expect(decodePerformance(encodePerformance(p, layout), layout).actions).toEqual(p.actions);
  });
});

describe("T-2: the real 2026 match with the most actions", () => {
  it("fits one code at error correction M", () => {
    const config = configs[2026];
    const layout = qrLayout(config);
    const { performances } = migrate(
      {
        performances: read(
          "tools",
          "oracle",
          "fixtures",
          "db",
          "2026Rebuilt.teamMatchPerformances.json",
        ) as V5Performance[],
        events: read("tools", "oracle", "fixtures", "db", "2026Rebuilt.events.json") as V5Event[],
      },
      { config, now: 1_800_000_000_000 },
    );
    const largest = performances.reduce((a, b) => (b.actions.length > a.actions.length ? b : a));
    // A v6 device's nonce (v5's were shorter) and version; the rest is the real record.
    const input = { ...largest, nonce: "k3j9x0a2mq7c", clientVersion: "6.0.0" };
    const text = encodePerformance(input, layout);
    const bytes = fromBase45(text)!.length;
    const version = qrVersion(text);
    console.info(
      `T-2: the largest real 2026 match, ${largest.actions.length} actions ` +
        `(${largest.actions.filter((a) => a.other?.pos).length} with positions), is ${bytes} bytes, ` +
        `${text.length} characters: QR version ${version} at M (${17 + 4 * version} modules a side). ` +
        `One code holds ${actionsPerCode(layout)} actions, or ${actionsPerCode(layout, true)} with positions.`,
    );
    expect(largest.actions.length).toBe(68);
    expect(version).toBeLessThanOrEqual(20);
    expect(carried(decodePerformance(text, layout))).toEqual(carried(input));
  });
});

describe("the encoder refuses what it cannot carry exactly", () => {
  const layout = qrLayout(configs[2026]);
  const refuses = (input: QrInput, message: RegExp) => {
    expect(() => encodePerformance(input, layout)).toThrow(QrError);
    expect(() => encodePerformance(input, layout)).toThrow(message);
  };

  it("DM-15c: a team number above 65535, but not a B team", () => {
    refuses(sample({ team: "70000" }), /team numbers stop at 65535/);
    const b = decodePerformance(encodePerformance(sample({ team: "2338B" }), layout), layout);
    expect(b.team).toBe("2338B");
  });

  it("an id that is not a button, a period the configuration lacks, a time outside the match", () => {
    const action = sample().actions[0];
    refuses(sample({ actions: [{ ...action, id: "dance" }] }), /"dance".*not a button/);
    refuses(sample({ actions: [{ ...action, phase: "overtime" }] }), /period/);
    refuses(sample({ actions: [{ ...action, ts: 160_001 }] }), /time outside the match/);
  });

  it("a position that is not whole percentages, and anything else in `other`", () => {
    const action = sample().actions[0];
    refuses(
      sample({ actions: [{ ...action, other: { pos: { x: 101, y: 5 } } }] }),
      /whole percentages/,
    );
    refuses(sample({ actions: [{ ...action, other: { color: "red" } }] }), /color/);
  });

  it("a match too large for one code, with what to do instead", () => {
    const action = { ...sample().actions[0], other: { pos: { x: 5, y: 5 } } };
    const many = Array.from({ length: actionsPerCode(layout, true) + 1 }, () => action);
    refuses(sample({ actions: many }), /too large for one QR code.*sync it/);
    expect(() => encodePerformance(sample({ actions: many.slice(1) }), layout)).not.toThrow();
  });

  it("a nonce or version it cannot carry", () => {
    refuses(sample({ nonce: "NOT-A-NONCE" }), /nonce/);
    refuses(sample({ clientVersion: "v6" }), /major\.minor\.patch/);
  });
});

describe("the decoder refuses a code it cannot read rightly", () => {
  const layout = qrLayout(configs[2026]);
  const text = encodePerformance(sample(), layout);

  it("DM-15a: a code from another configuration", () => {
    const other = qrLayout(configs[2025]);
    expect(() => decodePerformance(text, other)).toThrow(/different scouting configuration/);
  });

  it("text that is not a SPOT code, such as a v5 code or a link", () => {
    for (const bad of ["AQAAaaWsRVs5toNjTnle", "https://spot.example/?join=TSTCDE"])
      expect(() => decodePerformance(bad, layout)).toThrow(/not a SPOT match code/);
  });

  it("a code cut short, or from another format", () => {
    expect(() => decodePerformance(text.slice(0, -6), layout)).toThrow(QrError);
    const bytes = fromBase45(text)!;
    bytes[0] = 9;
    expect(() => decodePerformance(toBase45(bytes), layout)).toThrow(/format 9/);
  });
});

describe("DV-11: a device's nonce", () => {
  it("is 12 base-36 characters, and a QR code carries it", () => {
    const nonces = new Set(Array.from({ length: 200 }, newNonce));
    expect(nonces.size).toBe(200);
    for (const n of nonces) {
      expect(n).toHaveLength(NONCE_LENGTH);
      expect(n).toMatch(NONCE_PATTERN);
    }
  });
});
