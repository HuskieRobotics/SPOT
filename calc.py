#!/usr/bin/env python3
"""
frc_contribution_model.py

Estimates the average number of points each robot contributes to its alliance
from a season's worth of match scores.

THE MODEL
---------
For a match with red robots (a,b,c) and blue robots (d,e,f):

    p_a + p_b + p_c = red_score
    p_d + p_e + p_f = blue_score

where p_i is robot i's contribution in points per match.  Every match becomes
two rows of a big linear system  A·p = s  (each row has three 1's).

There are far more matches than robots, so the system is over-determined and
inconsistent (alliances over-/under-perform in any single match).  We solve it
by *weighted* least squares with a ridge penalty:

    minimise   Σ_m  w_m · (A_m·p − s_m)²   +   λ · Σ_i (p_i − μ)²

  w_m  per-match weight  (recency via --decay, playoffs via --playoff-weight)
  λ    ridge strength    (--ridge); keeps the system solvable when robots
       only ever play together, and shrinks small-sample robots toward μ
  μ    field average points per robot slot = total points / total slots
       (shrinking toward μ instead of 0 keeps estimates unbiased)

Normal equations:   (AᵀWA + λI) p = AᵀWs + λμ·1

Standard errors come from  σ²·(AᵀWA + λI)⁻¹ , σ² = residual variance.

No third-party dependencies (pure Python linear algebra).
"""

import argparse
import math
import re
import sys

MATCH_RE = re.compile(r'^(Quals|Playoff Match|Finals)\s+(\d+)$', re.IGNORECASE)


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------
def parse_matches(text):
    """Pull every match line out of the score-report text."""
    matches = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.lower().startswith('alliances'):      # stop before alliance/playoff listings
            break
        m = MATCH_RE.match(line)
        if m:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                tok = lines[j].split()
                if len(tok) >= 8 and all(t.isdigit() for t in tok[:8]):
                    v = [int(t) for t in tok[:8]]
                    stage = 'qual' if m.group(1).lower() == 'quals' else 'playoff'
                    matches.append({
                        'label': ' '.join(line.split()),
                        'stage': stage,
                        'red': v[0:3], 'blue': v[3:6],
                        'red_score': v[6], 'blue_score': v[7],
                    })
                    i = j
        i += 1
    return matches


# --------------------------------------------------------------------------
# Tiny linear algebra (Gaussian elimination / Gauss-Jordan)
# --------------------------------------------------------------------------
def solve(A, b):
    """Solve A x = b for a square, non-singular A (list of lists)."""
    n = len(A)
    M = [A[i][:] + [b[i]] for i in range(n)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            raise ValueError('singular matrix — try a larger --ridge')
        M[col], M[piv] = M[piv], M[col]
        pv = M[col][col]
        for r in range(col + 1, n):
            f = M[r][col] / pv
            if f:
                for c in range(col, n + 1):
                    M[r][c] -= f * M[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = M[r][n] - sum(M[r][c] * x[c] for c in range(r + 1, n))
        x[r] = s / M[r][r]
    return x


def invert(A):
    """Gauss-Jordan inverse; returns None if singular."""
    n = len(A)
    M = [A[i][:] + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            return None
        M[col], M[piv] = M[piv], M[col]
        pv = M[col][col]
        for c in range(2 * n):
            M[col][c] /= pv
        for r in range(n):
            if r != col and M[r][col]:
                f = M[r][col]
                for c in range(2 * n):
                    M[r][c] -= f * M[col][c]
    return [row[n:] for row in M]


# --------------------------------------------------------------------------
# Model fitting
# --------------------------------------------------------------------------
def fit(matches, ridge=0.5, decay=1.0, playoff_weight=1.0):
    teams = sorted({t for m in matches for t in m['red'] + m['blue']})
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    N = len(matches)
    if n == 0 or N == 0:
        raise ValueError('no matches / teams found')

    total = sum(m['red_score'] + m['blue_score'] for m in matches)
    mu = total / (6.0 * N)                       # average points per robot slot

    G = [[0.0] * n for _ in range(n)]            # AᵀWA
    h = [0.0] * n                                # AᵀWs
    for k, m in enumerate(matches):
        w = 1.0
        if 0.0 < decay < 1.0:
            w *= decay ** (N - 1 - k)            # recency weighting
        if m['stage'] == 'playoff':
            w *= playoff_weight
        for tl, sc in ((m['red'], m['red_score']), (m['blue'], m['blue_score'])):
            ids = [idx[t] for t in tl]
            for a in ids:
                h[a] += w * sc
                for b in ids:
                    G[a][b] += w

    for i in range(n):
        G[i][i] += ridge
        h[i] += ridge * mu

    p = solve(G, h)

    # residual statistics
    rss = 0.0
    for m in matches:
        pr = sum(p[idx[t]] for t in m['red'])
        pb = sum(p[idx[t]] for t in m['blue'])
        rss += (pr - m['red_score']) ** 2 + (pb - m['blue_score']) ** 2
    dof = max(1, 2 * N - n)
    sigma2 = rss / dof
    cov = invert(G)
    se = [math.sqrt(max(0.0, sigma2 * cov[i][i])) if cov else float('nan')
          for i in range(n)]

    # naive per-robot stats for comparison
    stats = {}
    for t in teams:
        apps = [m for m in matches if t in m['red'] or t in m['blue']]
        raw = sum((m['red_score'] if t in m['red'] else m['blue_score']) for m in apps)
        stats[t] = {'matches': len(apps),
                    'raw_avg': raw / len(apps) if apps else 0.0}

    return {'teams': teams, 'idx': idx, 'p': p, 'se': se, 'mu': mu,
            'stats': stats, 'rss': rss, 'sigma': math.sqrt(sigma2),
            'n_matches': N, 'ridge': ridge, 'decay': decay}


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------
def print_report(model, top=None, as_csv=False):
    order = sorted(model['teams'], key=lambda t: -model['p'][model['idx'][t]])
    if top:
        order = order[:top]

    if as_csv:
        print('rank,team,est_points_per_match,std_error,matches,avg_alliance_score')
        for i, t in enumerate(order, 1):
            j = model['idx'][t]
            st = model['stats'][t]
            print(f"{i},{t},{model['p'][j]:.1f},{model['se'][j]:.1f},"
                  f"{st['matches']},{st['raw_avg']:.1f}")
        return

    print(f"Matches parsed        : {model['n_matches']}")
    print(f"Robots (teams)        : {len(model['teams'])}")
    print(f"Field avg / robot     : {model['mu']:.1f} pts")
    print(f"Residual RMSE         : {model['sigma']:.1f} pts per alliance")
    print(f"Ridge λ               : {model['ridge']:g}")
    print(f"Recency decay         : {model['decay']:g}")
    print()
    print(f"{'#':>3}  {'Team':>6}  {'Est pts/match':>13}  {'±SE':>6}  "
          f"{'Matches':>7}  {'Avg alliance':>12}")
    print('-' * 58)
    for i, t in enumerate(order, 1):
        j = model['idx'][t]
        st = model['stats'][t]
        print(f"{i:>3}  {t:>6}  {model['p'][j]:>13.1f}  {model['se'][j]:>6.1f}  "
              f"{st['matches']:>7}  {st['raw_avg']:>12.1f}")


def _cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def predict(model, red, blue):
    def pts(t):
        return model['p'][model['idx'][t]] if t in model['idx'] else model['mu']

    print('\nRed alliance')
    for t in red:
        flag = '' if t in model['idx'] else '   (unknown team, using field avg)'
        print(f"  {t:>6}: {pts(t):6.1f} pts/match{flag}")
    print(f"  {'TOTAL':>6}: {sum(pts(t) for t in red):6.1f} predicted")

    print('\nBlue alliance')
    for t in blue:
        flag = '' if t in model['idx'] else '   (unknown team, using field avg)'
        print(f"  {t:>6}: {pts(t):6.1f} pts/match{flag}")
    print(f"  {'TOTAL':>6}: {sum(pts(t) for t in blue):6.1f} predicted")

    margin = sum(pts(t) for t in red) - sum(pts(t) for t in blue)
    sd = math.sqrt(2.0) * model['sigma']
    p_red = _cdf(margin / sd) if sd > 0 else (1.0 if margin > 0 else 0.0)
    print(f"\nPredicted margin: {margin:+.1f}   "
          f"P(red wins) = {p_red * 100:.1f}%")


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(
        description='Weighted least-squares model of FRC robot point contributions.',
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('file', nargs='?',
                    default='data.txt',
                    help='score report file, or "-" for stdin (default: %(default)s)')
    ap.add_argument('--ridge', type=float, default=0.5,
                    help='ridge strength λ (default 0.5; use 0 for plain least squares)')
    ap.add_argument('--decay', type=float, default=1.0,
                    help='recency weight per match, e.g. 0.99 (default 1.0 = off)')
    ap.add_argument('--playoff-weight', type=float, default=1.0,
                    help='extra weight on playoff/final matches (default 1.0)')
    ap.add_argument('--quals-only', action='store_true',
                    help='ignore playoff matches')
    ap.add_argument('--top', type=int, default=30,
                    help='show top N robots (default 30; 0 = all)')
    ap.add_argument('--csv', action='store_true', help='machine-readable output')
    ap.add_argument('--predict', nargs=6, type=int, metavar='TEAM',
                    help='predict: --predict R1 R2 R3 B1 B2 B3')
    args = ap.parse_args(argv)

    if args.file == '-':
        text = sys.stdin.read()
    else:
        try:
            with open(args.file, encoding='utf-8', errors='replace') as f:
                text = f.read()
        except OSError as e:
            sys.exit(f"Could not read '{args.file}': {e}\n"
                     f"Pass the score-report path as the first argument.")

    matches = parse_matches(text)
    if args.quals_only:
        matches = [m for m in matches if m['stage'] == 'qual']
    if not matches:
        sys.exit('No matches found — check the file format.')

    model = fit(matches, ridge=args.ridge, decay=args.decay,
                playoff_weight=args.playoff_weight)

    print_report(model, top=(args.top or None), as_csv=args.csv)

    if args.predict:
        predict(model, args.predict[:3], args.predict[3:])


if __name__ == '__main__':
    main()