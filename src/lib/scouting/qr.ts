/**
 * Offline QR payload for one TeamMatchPerformance.
 *
 * Unlike legacy SPOT (which indexed into a fixed id enumeration and broke on ids it did not
 * know), the payload carries its own id dictionary, so every action id — including composite
 * shift ids — survives. Field positions are kept. The JSON is deflate-compressed + base64url.
 */
import type { TeamMatchPerformance } from "../types";

const PREFIX = "SPOT6:";

interface Packed {
  v: 1;
  t: number;
  c: string;
  s: string;
  r: number;
  m: number;
  e: string;
  d: string;
  p?: string;
  pr?: number;
  k?: string | null;
  sv?: number;
  ids: string[];
  /** Flattened [idIndex, ts/10, idIndex, ts/10, ...] */
  a: number[];
  /** actionIndex → [x, y] */
  pos?: Record<number, [number, number]>;
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function encodeTmp(tmp: TeamMatchPerformance): Promise<string> {
  const ids: string[] = [];
  const index = new Map<string, number>();
  const a: number[] = [];
  const pos: Record<number, [number, number]> = {};
  tmp.actionQueue.forEach((act, i) => {
    if (!index.has(act.id)) {
      index.set(act.id, ids.length);
      ids.push(act.id);
    }
    a.push(index.get(act.id)!, Math.round(act.ts / 10));
    if (act.other?.pos) pos[i] = [act.other.pos.x, act.other.pos.y];
  });
  const packed: Packed = {
    v: 1,
    t: tmp.timestamp,
    c: tmp.clientVersion,
    s: tmp.scouterId,
    r: tmp.robotNumber,
    m: tmp.matchNumber,
    e: tmp.eventNumber,
    d: tmp.matchId_rand,
    p: tmp.projectId,
    pr: tmp.projectRevision,
    k: tmp.matchKey ?? null,
    sv: tmp.scoringVersion,
    ids,
    a,
    ...(Object.keys(pos).length ? { pos } : {}),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(packed));
  return PREFIX + toB64(await pipeThrough(bytes, new CompressionStream("deflate-raw")));
}

export async function decodeTmp(text: string): Promise<TeamMatchPerformance> {
  if (!text.startsWith(PREFIX)) throw new Error("Not a SPOT v6 QR code.");
  const json = new TextDecoder().decode(await pipeThrough(fromB64(text.slice(PREFIX.length)), new DecompressionStream("deflate-raw")));
  const p = JSON.parse(json) as Packed;
  const actionQueue = [];
  for (let i = 0; i < p.a.length; i += 2) {
    const n = i / 2;
    const xy = p.pos?.[n];
    actionQueue.push({ id: p.ids[p.a[i]], ts: p.a[i + 1] * 10, ...(xy ? { other: { pos: { x: xy[0], y: xy[1] } } } : {}) });
  }
  return {
    timestamp: p.t,
    clientVersion: p.c,
    scouterId: p.s,
    robotNumber: p.r,
    matchNumber: p.m,
    eventNumber: p.e,
    matchId_rand: p.d,
    matchId: `${p.m}-${p.r}-${p.s}-${p.d}`,
    projectId: p.p,
    projectRevision: p.pr,
    matchKey: p.k ?? null,
    scoringVersion: p.sv,
    flagged: false,
    actionQueue,
  };
}
