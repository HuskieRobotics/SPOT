/**
 * How a match is named on screen (DV-17, RT-22a): "Qual 12", "Playoff 5", or "Final 2" for a
 * final, as the field shows FRC's double-elimination playoff.
 *
 * A match from TBA is a final when its key says so (`2026mnwi_f1m2`). A typed playoff match has
 * no such key; numbers 14 to 16 are the finals, as in FRC's bracket.
 */
import type { MatchLevel } from "@/data/types";
import { BRACKET_MATCHES } from "./tba";

const FINAL_MATCHES = 3;

export function matchLabel(level: MatchLevel, number: number, key?: string): string {
  if (level === "qual") return `Qual ${number}`;
  const final = key?.match(/_f\d+m(\d+)$/);
  if (final) return `Final ${final[1]}`;
  const typed = key === undefined || key.startsWith("manual_");
  // The finals are at most three matches, so 14 to 16 (FINAL_MATCHES).
  return typed && number > BRACKET_MATCHES && number <= BRACKET_MATCHES + FINAL_MATCHES
    ? `Final ${number - BRACKET_MATCHES}`
    : `Playoff ${number}`;
}
