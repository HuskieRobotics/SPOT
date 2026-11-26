/**
 * The team list's search (#383; docs/spec/08 AN-13): by number or by name, forgiving a typo, as
 * v5's `fuzzysort` with `allowTypo` did. Written here rather than added as a dependency: the list
 * holds about 40 teams, and the page must work with no connection (OF-6).
 *
 * Matching teams come first by how well they match, then in team order; the others are hidden.
 * An empty query lists every team in team order.
 */
import type { ListedTeam } from "./teams";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The letters of `query` appear in `text` in order (`"wldstng"` in `"wildstang"`). */
function inOrder(query: string, text: string): boolean {
  let i = 0;
  for (const ch of text) if (ch === query[i]) i++;
  return i === query.length;
}

/** At most one letter added, dropped, changed, or two neighbours swapped. */
function oneTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  return (
    a.slice(i + 1) === b.slice(i + 1) || // changed
    a.slice(i + 1) === b.slice(i) || // a letter added in a
    a.slice(i) === b.slice(i + 1) || // a letter dropped from a
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) // swapped
  );
}

/** How well a team matches, lower first; null for no match. */
function score(team: ListedTeam, query: string): number | null {
  const number = team.team.toLowerCase();
  if (number === query) return 0;
  if (number.startsWith(query)) return 1;
  const name = norm(team.nickname ?? "");
  if (!name) return number.includes(query) ? 4 : null;
  if (name.startsWith(query)) return 2;
  const words = name.split(" ");
  if (words.some((w) => w.startsWith(query))) return 3;
  if (number.includes(query) || name.includes(query)) return 4;
  // Typos: a word of the name one letter off, or the letters in order.
  // A query is often the start of a word, so compare it with the word's first letters, one
  // fewer, as many, and one more (a letter added, changed or swapped, or dropped).
  const nearWord = (w: string) =>
    [-1, 0, 1].some((d) => oneTypo(query, w.slice(0, query.length + d)));
  if (query.length >= 4 && words.some(nearWord)) return 5;
  if (query.length >= 4 && inOrder(query.replace(/ /g, ""), name.replace(/ /g, ""))) return 6;
  return null;
}

/** The teams matching `query`, best first; every team, in order, for an empty query. */
export function searchTeams(teams: readonly ListedTeam[], query: string): ListedTeam[] {
  const q = norm(query);
  if (!q) return [...teams];
  return teams
    .map((team, order) => ({ team, order, score: score(team, q) }))
    .filter((t): t is typeof t & { score: number } => t.score !== null)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((t) => t.team);
}
