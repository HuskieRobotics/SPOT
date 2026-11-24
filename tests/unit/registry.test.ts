/**
 * T-6 and the logic half of T-6a: the scouter registry (src/sessions/registry.ts, #353) driven
 * event by event, with no network. Named after docs/spec/06 RT-9 to RT-36 and ADR 0006.
 */
import { describe, expect, it } from "vitest";
import { Random } from "@/generate/random";
import { DEFAULT_TENANT, type Assignment, type StartRules } from "@/data/types";
import { validateDocument } from "@/data/validate";
import {
  apply,
  currentAssignment,
  emptyRegistry,
  holderAtEnd,
  holdsCurrent,
  restore,
  wasReplacement,
  type CurrentMatch,
  type DeviceMessage,
  type Effect,
  type RegistryEvent,
  type RegistryState,
} from "@/sessions/registry";

const EVENT = "0123456789abcdef01234567";
const SIX: StartRules = { quorum: 6, startOnFirstScouter: false };

type Slots = CurrentMatch["red"];
const match = (
  number: number,
  teams: (string | null)[] = ["11", "12", "13", "21", "22", "23"],
): CurrentMatch => ({
  number,
  red: teams.slice(0, 3) as Slots,
  blue: teams.slice(3, 6) as Slots,
});

type Without<T> = T extends unknown ? Omit<T, "now"> : never;

class Sim {
  state: RegistryState;
  effects: Effect[] = [];
  error: string | undefined;
  private t = 1_000;

  constructor(rules: StartRules = SIX, state?: RegistryState) {
    this.state = state ?? emptyRegistry(EVENT, rules, DEFAULT_TENANT);
  }

  do(event: Without<RegistryEvent>): this {
    const r = apply(this.state, { ...event, now: this.t++ } as RegistryEvent);
    this.state = r.state;
    this.effects.push(...r.effects);
    this.error = r.error;
    return this;
  }

  signIn(...ids: string[]) {
    for (const id of ids) this.do({ type: "signIn", scouterId: id });
    return this;
  }

  entry(id: string) {
    return this.state.entries[id];
  }

  team(id: string) {
    return this.entry(id)?.team ?? null;
  }

  /** Messages sent to a scouter since the last call. */
  inbox(id: string): DeviceMessage[] {
    const mine = this.effects.filter(
      (e): e is Extract<Effect, { type: "send" }> => e.type === "send" && e.to === id,
    );
    this.effects = this.effects.filter((e) => !mine.includes(e as never));
    return mine.map((e) => e.message);
  }

  kinds(id: string) {
    return this.inbox(id).map((m) => m.kind);
  }

  clear() {
    this.effects = [];
    return this;
  }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe("RT-9 to RT-14a: assignment", () => {
  it("RT-9, RT-11, RT-14: waiting scouters get the robots red 1 to 3, then blue 1 to 3, in sign-in order", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(6));
    expect(ids(6).map((id) => sim.team(id))).toEqual(["11", "12", "13", "21", "22", "23"]);
    expect(sim.inbox("s1")).toContainEqual({
      kind: "assigned",
      view: expect.objectContaining({
        matchNumber: 1,
        team: "11",
        alliance: "red",
        accepted: false,
      }),
    });
    expect(sim.inbox("s4").at(-1)).toMatchObject({ view: { alliance: "blue" } });
  });

  it("RT-14a: a robot never has two holders, so a seventh scouter waits", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(7));
    expect(sim.team("s7")).toBeNull();
    expect(sim.entry("s7").status).toBe("waiting");
    expect(new Set(ids(6).map((id) => sim.team(id))).size).toBe(6);
  });

  it("an empty slot in a manual schedule is not a robot", () => {
    const sim = new Sim()
      .do({
        type: "setMatch",
        match: { number: 1, red: ["11", null, null], blue: [null, "22", null] },
      })
      .signIn(...ids(3));
    expect(ids(3).map((id) => sim.team(id))).toEqual(["11", "22", null]);
  });

  it("RT-11: a disconnected scouter with no robot is not given one until they reconnect", () => {
    const sim = new Sim().signIn("s1").do({ type: "disconnect", scouterId: "s1" });
    sim.do({ type: "setMatch", match: match(1) });
    expect(sim.team("s1")).toBeNull();
    sim.do({ type: "connect", scouterId: "s1" });
    expect(sim.team("s1")).toBe("11");
  });

  it("an assignment holds steady: later sign-ins do not move anyone's robot", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2");
    sim.do({ type: "disconnect", scouterId: "s1" }).signIn("s3");
    expect([sim.team("s1"), sim.team("s2"), sim.team("s3")]).toEqual(["11", "12", "13"]);
  });
});

describe("RT-24 to RT-30: identity, retention and reconnection (ADR 0006)", () => {
  it("RT-24, F-20: a scouter who drops and returns keeps one entry and the same robot", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2");
    sim.do({ type: "disconnect", scouterId: "s1" }).do({ type: "connect", scouterId: "s1" });
    sim.signIn("s1"); // a reload signs in again
    expect(Object.keys(sim.state.entries)).toEqual(["s1", "s2"]);
    expect(sim.team("s1")).toBe("11");
    expect(sim.entry("s1").connected).toBe(true);
  });

  it("RT-25, F-21: a disconnected scouter's robot is offered to no one else", () => {
    const sim = new Sim()
      .do({ type: "setMatch", match: match(1, ["11", "12", null, null, null, null]) })
      .signIn("s1", "s2");
    sim.do({ type: "start", scouterId: "s1" }).do({ type: "disconnect", scouterId: "s1" });
    sim.signIn("s3");
    expect(sim.team("s1")).toBe("11");
    expect(sim.team("s3")).toBeNull();
  });

  it("RT-27: reconnecting tells the device where it was, without a new assignment prompt", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1");
    sim.do({ type: "accept", scouterId: "s1" }).do({ type: "disconnect", scouterId: "s1" }).clear();
    sim.do({ type: "connect", scouterId: "s1" });
    expect(sim.inbox("s1")).toEqual([
      { kind: "state", view: expect.objectContaining({ team: "11", accepted: true }) },
    ]);
  });

  it("RT-27: a scouter who was scouting comes back scouting the same match and robot", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1");
    sim.do({ type: "adminStart" }).do({ type: "start", scouterId: "s1" });
    sim
      .do({ type: "disconnect", scouterId: "s1" })
      .clear()
      .do({ type: "connect", scouterId: "s1" });
    expect(sim.inbox("s1")).toEqual([
      {
        kind: "state",
        view: expect.objectContaining({
          status: "scouting",
          matchNumber: 1,
          team: "11",
          entered: true,
        }),
      },
    ]);
  });

  it("RT-29: a disconnected scouter stays in the registry until an admin removes them", () => {
    const sim = new Sim().signIn("s1").do({ type: "disconnect", scouterId: "s1" });
    expect(sim.entry("s1")).toMatchObject({ connected: false });
    sim.do({ type: "remove", scouterId: "s1" });
    expect(sim.entry("s1")).toBeUndefined();
    expect(sim.effects).toContainEqual({ type: "removeEntry", id: `${EVENT}:s1` });
  });

  it("a removed scouter's device is signed out, its reconnects refused, and its robot freed", () => {
    const sim = new Sim().do({
      type: "setMatch",
      match: match(1, ["11", null, null, null, null, null]),
    });
    sim.signIn("s1", "s2");
    sim.clear().do({ type: "remove", scouterId: "s1" });
    expect(sim.kinds("s1")).toEqual(["signed-out"]);
    expect(sim.team("s2")).toBe("11");
    sim.clear().do({ type: "connect", scouterId: "s1" });
    expect(sim.error).toMatch(/Not signed in/);
    expect(sim.kinds("s1")).toEqual(["signed-out"]);
  });

  it("DV-15: what is saved never says whether a scouter is connected, and is valid", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2");
    const saved = sim.effects.filter((e) => e.type === "saveEntry");
    expect(saved.length).toBeGreaterThan(0);
    for (const e of saved) {
      expect(Object.keys(e.entry)).not.toContain("connected");
      expect(validateDocument("scouter-session", e.entry).issues).toEqual([]);
    }
    for (const e of sim.effects.filter((e) => e.type === "saveAssignment"))
      expect(validateDocument("assignment", e.assignment).issues).toEqual([]);
  });

  it("DV-15: after a restart everyone is disconnected, keeps their robot, and resumes on reconnect", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2");
    sim.do({ type: "adminStart" }).do({ type: "start", scouterId: "s1" });
    const saved = new Map<string, unknown>();
    const assignments = new Map<string, unknown>();
    for (const e of sim.effects) {
      if (e.type === "saveEntry") saved.set(e.entry._id, e.entry);
      if (e.type === "saveAssignment") assignments.set(e.assignment._id, e.assignment);
    }
    const back = new Sim(
      SIX,
      restore({
        eventId: EVENT,
        tenantId: DEFAULT_TENANT,
        rules: SIX,
        match: match(1),
        entries: [...saved.values()] as never,
        assignments: [...assignments.values()] as never,
        now: 99_999,
      }),
    );
    expect(Object.values(back.state.entries).every((e) => !e.connected)).toBe(true);
    back.signIn("s3");
    expect(back.team("s3")).toBe("13"); // 11 and 12 are still held
    back.do({ type: "connect", scouterId: "s1" });
    expect(back.inbox("s1")).toEqual([
      { kind: "state", view: expect.objectContaining({ status: "scouting", team: "11" }) },
    ]);
  });
});

describe("RT-12a, BL-34: the three start rules (ADR 0006)", () => {
  it("quorum: six connected waiting scouters on the match send all of them in", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(5));
    expect(ids(5).some((id) => sim.entry(id).entered)).toBe(false);
    sim.signIn("s6");
    for (const id of ids(6)) expect(sim.kinds(id)).toContain("enter-match");
  });

  it("RT-30, F-22: a disconnected scouter does not count toward the quorum", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(5));
    sim.do({ type: "disconnect", scouterId: "s1" }).signIn("s6");
    expect(ids(6).some((id) => sim.entry(id).entered)).toBe(false);
    sim.do({ type: "connect", scouterId: "s1" });
    expect(ids(6).every((id) => sim.entry(id).entered)).toBe(true);
  });

  it("a lower quorum suits a smaller team", () => {
    const sim = new Sim({ quorum: 3, startOnFirstScouter: false })
      .do({ type: "setMatch", match: match(1) })
      .signIn("s1", "s2", "s3");
    expect(["s1", "s2", "s3"].every((id) => sim.entry(id).entered)).toBe(true);
  });

  it("admin start sends in only the current match's connected waiting scouters", () => {
    // Five robots, so six scouters never reach the quorum of six on their own.
    const sim = new Sim()
      .do({ type: "setMatch", match: match(1, ["11", "12", "13", "21", "22", null]) })
      .signIn(...ids(6));
    sim.do({ type: "disconnect", scouterId: "s2" }).clear().do({ type: "adminStart" });
    expect(sim.kinds("s1")).toEqual(["enter-match"]);
    expect(sim.kinds("s2")).toEqual([]); // disconnected
    expect(sim.kinds("s6")).toEqual([]); // no robot
    sim.do({ type: "connect", scouterId: "s2" });
    expect(sim.entry("s2").entered).toBe(false); // admin start is not standing
  });

  it("BL-34, issue 34: with start on first scouter off (the default), one scouter starting pulls in no one", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1");
    sim.do({ type: "adminStart" }).do({ type: "start", scouterId: "s1" });
    sim.clear().signIn("s2");
    expect(sim.kinds("s2")).toEqual(["state", "assigned"]);
  });

  it("start on first scouter, when on: a scouter starting sends in everyone waiting, and latecomers", () => {
    const sim = new Sim({ quorum: 6, startOnFirstScouter: true })
      .do({ type: "setMatch", match: match(1) })
      .signIn("s1", "s2");
    sim.do({ type: "adminStart" }).clear().signIn("s3");
    expect(sim.entry("s3").entered).toBe(false); // nobody has started yet
    sim.do({ type: "start", scouterId: "s1" });
    expect(sim.kinds("s3")).toContain("enter-match");
    sim.signIn("s4");
    expect(sim.entry("s4").entered).toBe(true);
  });

  it("RT-30, F-22: a stale scouting entry never pulls anyone in", () => {
    const sim = new Sim({ quorum: 6, startOnFirstScouter: true })
      .do({ type: "setMatch", match: match(1) })
      .signIn("s1");
    sim.do({ type: "adminStart" }).do({ type: "start", scouterId: "s1" });
    sim.do({ type: "disconnect", scouterId: "s1" }).signIn("s2");
    expect(sim.entry("s2").entered).toBe(false);
  });

  it("the quorum fires once per match", () => {
    const sim = new Sim({ quorum: 2, startOnFirstScouter: false })
      .do({ type: "setMatch", match: match(1) })
      .signIn("s1", "s2");
    expect(sim.entry("s2").entered).toBe(true);
    sim.signIn("s3", "s4");
    expect([sim.entry("s3").entered, sim.entry("s4").entered]).toEqual([false, false]);
  });
});

describe("RT-31 to RT-36: release and replacement", () => {
  const dead = () => {
    // s1 holds 11 and their phone dies; s7 is waiting with no robot.
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(7));
    sim.do({ type: "disconnect", scouterId: "s1" });
    return sim;
  };

  it("RT-31, RT-32: an admin releases a disconnected scouter's robot, and the pool gives it to someone waiting", () => {
    const sim = dead().clear().do({ type: "release", scouterId: "s1" });
    expect(sim.team("s1")).toBeNull();
    expect(sim.team("s7")).toBe("11");
    expect(sim.kinds("s7")).toEqual(["assigned"]);
  });

  it("RT-32: or the admin names the replacement", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(8));
    sim.do({ type: "release", scouterId: "s1", to: "s8" });
    expect(sim.team("s8")).toBe("11");
    expect(sim.team("s7")).toBeNull();
  });

  it("RT-32: refuses a replacement who is not signed in, not connected, or already holds a robot", () => {
    const sim = dead();
    const before = sim.state;
    for (const to of ["nobody", "s1", "s2"]) {
      sim.do({ type: "release", scouterId: "s3", to });
      expect(sim.error).toBeTruthy();
      expect(sim.state).toBe(before);
    }
    sim
      .do({ type: "disconnect", scouterId: "s7" })
      .do({ type: "release", scouterId: "s3", to: "s7" });
    expect(sim.error).toMatch(/not connected/);
  });

  it("RT-31: nothing is ever released automatically, however long a scouter is away", () => {
    const sim = dead();
    for (let i = 0; i < 50; i++) sim.signIn(`late${i}`);
    expect(sim.team("s1")).toBe("11");
  });

  it("RT-33: a released scouter who reconnects waits, and never gets that robot back in that match", () => {
    const sim = new Sim()
      .do({ type: "setMatch", match: match(1, ["11", "12", null, null, null, null]) })
      .signIn("s1", "s2");
    sim.do({ type: "disconnect", scouterId: "s1" }).do({ type: "release", scouterId: "s1" });
    expect(sim.team("s1")).toBeNull();
    sim.do({ type: "connect", scouterId: "s1" });
    expect(sim.team("s1")).toBeNull(); // 11 is free, but not for s1
    expect(sim.entry("s1").status).toBe("waiting");
    sim.signIn("s3");
    expect(sim.team("s3")).toBe("11");
  });

  it("RT-32, RT-33: an admin may hand the robot back by naming the scouter released from it", () => {
    const sim = new Sim()
      .do({ type: "setMatch", match: match(1, ["11", null, null, null, null, null]) })
      .signIn("s1", "s2");
    sim.do({ type: "release", scouterId: "s1" });
    expect(sim.team("s2")).toBe("11");
    sim.do({ type: "release", scouterId: "s2", to: "s1" });
    expect(sim.error).toBeUndefined();
    expect(sim.team("s1")).toBe("11");
    expect(holderAtEnd(sim.state.assignments["1:11"])?.scouterId).toBe("s1");
  });

  it("RT-34: a replacement after the match is under way joins at once and is marked as joining late", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(7));
    sim.do({ type: "adminStart" });
    for (const id of ids(6)) sim.do({ type: "start", scouterId: id });
    sim
      .do({ type: "disconnect", scouterId: "s1" })
      .clear()
      .do({ type: "release", scouterId: "s1" });
    expect(sim.kinds("s7")).toEqual(["assigned", "enter-match"]);
    const a = sim.state.assignments["1:11"];
    expect(a.holders.map((h) => [h.scouterId, h.ended, h.afterStart])).toEqual([
      ["s1", "released", false],
      ["s7", null, true],
    ]);
  });

  it("RT-34, RT-36: a release before anyone starts is a clean substitution", () => {
    const sim = dead().do({ type: "release", scouterId: "s1" });
    const a = sim.state.assignments["1:11"];
    expect(a.holders.at(-1)).toMatchObject({ scouterId: "s7", afterStart: false });
    expect(sim.entry("s7").entered).toBe(false);
  });

  it("RT-35: the scouter who held the robot when the match ended is the replacement, not the original", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn(...ids(7));
    sim.do({ type: "adminStart" });
    for (const id of ids(6)) sim.do({ type: "start", scouterId: id });
    sim.do({ type: "release", scouterId: "s1" });
    sim.do({ type: "finish", scouterId: "s7" });
    const a = sim.state.assignments["1:11"];
    expect(holderAtEnd(a)?.scouterId).toBe("s7");
    expect(wasReplacement(a, "s7")).toBe(true);
    expect(wasReplacement(a, "s1")).toBe(false);
    expect(wasReplacement(sim.state.assignments["1:12"], "s2")).toBe(false);
  });

  it("RT-35: a robot whose holder signed out before the match ended has no holder at the end", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1");
    sim.do({ type: "signOut", scouterId: "s1" });
    expect(holderAtEnd(sim.state.assignments["1:11"])).toBeNull();
  });
});

describe("BL-54: changing the match", () => {
  it("correcting the current match's teams takes back only the robots that left it", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2", "s3");
    sim.clear().do({ type: "setMatch", match: match(1) });
    expect(sim.effects).toEqual([]); // the same teams: nothing happens
    sim.do({ type: "setMatch", match: match(1, ["11", "99", "13", "21", "22", "23"]) });
    expect([sim.team("s1"), sim.team("s2"), sim.team("s3")]).toEqual(["11", "99", "13"]);
    expect(sim.kinds("s1")).toEqual([]);
    expect(sim.kinds("s2")).toEqual(["unassigned", "assigned"]);
    expect(sim.state.assignments["1:12"].holders[0]).toMatchObject({
      scouterId: "s2",
      ended: "unassigned",
    });
  });

  it("re-assigns everyone who has not started, and tells them", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2");
    sim.clear().do({ type: "setMatch", match: match(2, ["31", "32", "33", "41", "42", "43"]) });
    expect(sim.kinds("s1")).toEqual(["unassigned", "assigned"]);
    expect(sim.kinds("s2")).toEqual(["unassigned", "assigned"]);
    expect([sim.team("s1"), sim.team("s2")]).toEqual(["31", "32"]);
  });

  it("someone still scouting the old match finishes it, then gets the new one", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1", "s2");
    sim.do({ type: "adminStart" }).do({ type: "start", scouterId: "s1" });
    sim.do({ type: "setMatch", match: match(2, ["31", "32", "33", "41", "42", "43"]) });
    expect([sim.entry("s1").matchNumber, sim.team("s1"), sim.entry("s1").status]).toEqual([
      1,
      "11",
      "scouting",
    ]);
    expect(sim.team("s2")).toBe("31");
    sim.do({ type: "finish", scouterId: "s1" }).do({ type: "ready", scouterId: "s1" });
    expect([sim.entry("s1").matchNumber, sim.team("s1")]).toEqual([2, "32"]);
  });

  it("a scouter who finished the current match keeps its robot until the match changes", () => {
    const sim = new Sim().do({ type: "setMatch", match: match(1) }).signIn("s1");
    sim.do({ type: "adminStart" }).do({ type: "start", scouterId: "s1" });
    sim.do({ type: "finish", scouterId: "s1" }).do({ type: "ready", scouterId: "s1" }).signIn("s2");
    expect([sim.entry("s1").status, sim.team("s1"), sim.team("s2")]).toEqual([
      "complete",
      "11",
      "12",
    ]);
    sim.do({ type: "setMatch", match: match(2) });
    expect(sim.entry("s1")).toMatchObject({ status: "waiting", matchNumber: 2 });
  });

  it("saves the old match's history, and keeps it, so going back to that match continues it", () => {
    const sim = new Sim()
      .do({ type: "setMatch", match: match(1) })
      .signIn("s1")
      .clear();
    sim.do({ type: "setMatch", match: match(2) });
    const saved = sim.effects.filter((e) => e.type === "saveAssignment").map((e) => e.assignment);
    expect(saved).toContainEqual(
      expect.objectContaining({
        matchNumber: 1,
        team: "11",
        holders: [expect.objectContaining({ scouterId: "s1", ended: "unassigned" })],
      }),
    );
    expect(Object.keys(sim.state.assignments).sort()).toEqual(["1:11", "2:11"]);
    sim.do({ type: "release", scouterId: "s1" }).signIn("s2");
    sim.do({ type: "setMatch", match: match(1) });
    // s1 was released from 11 in match 2 only; in match 1 the history continues.
    expect(sim.state.assignments["1:11"].holders.map((h) => [h.scouterId, h.ended])).toEqual([
      ["s1", "unassigned"],
      ["s1", null],
    ]);
  });
});

describe("RT-14a: random sequences never give a robot two holders", () => {
  const scouters = ids(9);
  const events = (r: Random): Without<RegistryEvent> => {
    const s = r.pick(scouters);
    const roll = r.int(0, 99);
    if (roll < 20) return { type: "signIn", scouterId: s };
    if (roll < 32) return { type: "disconnect", scouterId: s };
    if (roll < 44) return { type: "connect", scouterId: s };
    if (roll < 52) return { type: "start", scouterId: s };
    if (roll < 58) return { type: "finish", scouterId: s };
    if (roll < 64) return { type: "ready", scouterId: s };
    if (roll < 68) return { type: "accept", scouterId: s };
    if (roll < 74)
      return { type: "release", scouterId: s, to: r.chance(0.5) ? r.pick(scouters) : undefined };
    if (roll < 77) return { type: "remove", scouterId: s };
    if (roll < 80) return { type: "signOut", scouterId: s };
    if (roll < 86) return { type: "adminStart" };
    if (roll < 88)
      return {
        type: "setRules",
        rules: { quorum: r.int(1, 6), startOnFirstScouter: r.chance(0.5) },
      };
    const n = r.int(1, 4);
    return {
      type: "setMatch",
      match: match(n, [`${n}1`, `${n}2`, `${n}3`, `${n}4`, `${n}5`, `${n}6`]),
    };
  };

  for (const seed of ["a", "b", "c", "d", "e"]) {
    it(`seed ${seed}: 2,000 events`, () => {
      const r = new Random(seed);
      const sim = new Sim();
      // Holdings an admin handed out by naming the scouter: `${scouter}:${match}:${team}:${from}`.
      const named = new Set<string>();
      const releasedFrom = (scouterId: string, a: Assignment | undefined, before = Infinity) =>
        a?.holders.some(
          (h) => h.scouterId === scouterId && h.ended === "released" && h.from < before,
        ) ?? false;
      for (let i = 0; i < 2000; i++) {
        const event = events(r);
        sim.do(event);
        const s = sim.state;
        if (event.type === "release" && event.to !== undefined && !sim.error) {
          const team = sim.team(event.to)!;
          const h = currentAssignment(s, team)!.holders.at(-1)!;
          named.add(`${event.to}:${s.match!.number}:${team}:${h.from}`);
        }
        const holders = Object.values(s.entries).filter((e) => holdsCurrent(s, e));
        // RT-14a: one holder per robot.
        const teams = holders.map((e) => e.team);
        expect(new Set(teams).size, `event ${i}`).toBe(teams.length);
        for (const e of holders) {
          const a = currentAssignment(s, e.team!);
          // The assignment history agrees with the entries.
          const open = a?.holders.filter((h) => h.until === null) ?? [];
          expect(
            open.map((h) => h.scouterId),
            `event ${i}`,
          ).toEqual([e.scouterId]);
          // RT-33: a released scouter never gets that robot back in that match on their own.
          // An admin may hand it back by naming them (RT-32).
          const h = open[0];
          if (!named.has(`${e.scouterId}:${e.matchNumber}:${e.team}:${h.from}`))
            expect(releasedFrom(e.scouterId, a, h.from), `event ${i}`).toBe(false);
        }
        // RT-11, RT-25: a connected waiting scouter with no robot means every free robot is one
        // they were released from.
        if (s.match) {
          const free = [...s.match.red, ...s.match.blue].filter(
            (t): t is string => t !== null && !teams.includes(t),
          );
          for (const e of Object.values(s.entries))
            if (e.connected && e.status === "waiting" && !holdsCurrent(s, e))
              for (const t of free)
                expect(releasedFrom(e.scouterId, currentAssignment(s, t)), `event ${i}`).toBe(true);
        }
      }
    });
  }
});
