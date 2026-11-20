/**
 * "Did you mean …?" for names a student typed: the closest candidate by edit distance, ignoring
 * case, when it is close enough to be a likely typo. Used for transformer names, option names,
 * button ids and period ids (docs/spec/09 TR-10, #317).
 */
export function suggest(name: string, candidates: Iterable<string>): string | null {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length];
  };
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    if (c === name) continue;
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best !== null && bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
}
