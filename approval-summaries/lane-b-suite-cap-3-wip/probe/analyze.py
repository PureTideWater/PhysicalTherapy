#!/usr/bin/env python3
"""SUITE-CAP-3 profile: tables and fits from the pass results (<label>.json and <label>.timeline.ndjson).

Usage: python3 -I analyze.py <results dir> [> profile.md]

Labels are cap3_<spread>_<N>_<state>_<shape>-<pass> (pass: pre, P or 7b). For each pass: the overview; per statement
family (phase/family): count, total seconds, ms per call; and for each (spread, state, pass) measured at two or more N,
the growth exponent k of each family's total time, count and time per call between consecutive N (t ~ N^k), its share
of the pass, and the TypeScript time between statements by phase. Reads results only (IDs, counts, times, heap).
"""
import collections
import glob
import json
import math
import os
import re
import sys

DIR = sys.argv[1]
LABEL = re.compile(r'^cap3_(?P<spread>[ra])_(?P<n>\d+)_(?P<state>[abc])_(?P<shape>p|7b|7bs|7bf)-(?P<pass>pre|P|7b)$')


def load():
    runs = []
    for path in sorted(glob.glob(os.path.join(DIR, 'cap3_*.json'))):
        label = os.path.basename(path)[:-5]
        m = LABEL.match(label)
        if not m:
            continue
        r = json.load(open(path))
        fam = collections.defaultdict(lambda: [0, 0.0])
        tl = os.path.join(DIR, label + '.timeline.ndjson')
        if os.path.exists(tl):
            for line in open(tl):
                s = json.loads(line)
                key = s['ph'] + '/' + s['fam']
                fam[key][0] += 1
                fam[key][1] += s['dt']
        runs.append({**m.groupdict(), 'n': int(m['n']), 'label': label, 'r': r, 'fam': dict(fam)})
    return runs


def decrypts(r):
    return sum(v for k, v in r['crypto'].items() if k.startswith('decrypt '))


def overview(runs):
    print('| run | N | pass s | statements | SQL s | TS between s | heap peak MiB | live after MiB | advisory locks/backend (peak) | decrypts | error |')
    print('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|')
    for x in sorted(runs, key=lambda x: (x['spread'], x['state'], x['pass'], x['n'])):
        r = x['r']
        err = '' if r['error'] is None else f"{r['error']['name']} {r['error'].get('code', '')}"
        print(f"| {x['label']} | {x['n']:,} | {r['passMs']/1000:.1f} | {r['statements']:,} | {r['sqlMs']/1000:.1f} | {r['tsBetweenMs']/1000:.1f} | {r['heap']['sampledPeakMiB']} | {r['heap']['liveAfterMiB']} | {r['locks']['peakPerBackend']:,} | {decrypts(r):,} | {err} |")


def families(runs, top=14):
    for x in sorted(runs, key=lambda x: (x['spread'], x['state'], x['pass'], x['n'])):
        total = x['r']['passMs'] / 1000
        print(f"\n**{x['label']}** (pass {total:.1f} s; TS between statements by phase: " + ', '.join(f"{k} {v['tsMs']/1000:.1f} s" for k, v in x['r']['byPhase'].items() if v['tsMs'] >= 100) + ')\n')
        print('| phase/family | count | total s | share | ms/call |')
        print('|---|---:|---:|---:|---:|')
        for k, (c, ms) in sorted(x['fam'].items(), key=lambda kv: -kv[1][1])[:top]:
            print(f'| {k} | {c:,} | {ms/1000:.1f} | {100*ms/1000/total:.0f}% | {ms/c:.2f} |')


def k(a, b, na, nb):
    if a <= 0 or b <= 0:
        return float('nan')
    return math.log(b / a) / math.log(nb / na)


def fits(runs, minshare=0.02):
    groups = collections.defaultdict(list)
    for x in runs:
        groups[(x['spread'], x['state'], x['pass'] + {'7bs': 's', '7bf': 'f'}.get(x['shape'], ''))].append(x)
    for key, xs in sorted(groups.items()):
        xs.sort(key=lambda x: x['n'])
        if len(xs) < 2:
            continue
        ns = [x['n'] for x in xs]
        print(f"\n**spread {key[0].upper()}, state ({key[1]}), pass {key[2]}**: N = {', '.join(f'{n:,}' for n in ns)}; pass s = {', '.join(f'{x['r']['passMs']/1000:.1f}' for x in xs)}; k(pass) = {', '.join(f'{k(a['r']['passMs'], b['r']['passMs'], a['n'], b['n']):.2f}' for a, b in zip(xs, xs[1:]))}\n")
        print('| phase/family | ' + ' | '.join(f's @{n:,}' for n in ns) + ' | ' + ' | '.join(f'share @{n:,}' for n in ns) + ' | k time | k count | k ms/call |')
        print('|---|' + '---:|' * (2 * len(ns) + 3))
        keys = set()
        for x in xs:
            total = x['r']['passMs']
            keys |= {f for f, (c, ms) in x['fam'].items() if ms >= minshare * total}
        rows = []
        for f in keys:
            vals = [x['fam'].get(f, [0, 0.0]) for x in xs]
            rows.append((vals[-1][1], f, vals))
        ts = [x['r']['tsBetweenMs'] for x in xs]
        for _, f, vals in sorted(rows, reverse=True):
            secs = ' | '.join(f'{v[1]/1000:.1f}' for v in vals)
            shares = ' | '.join(f"{100*v[1]/x['r']['passMs']:.0f}%" for v, x in zip(vals, xs))
            a, b = vals[-2], vals[-1]
            kt = k(a[1], b[1], ns[-2], ns[-1])
            kc = k(a[0], b[0], ns[-2], ns[-1])
            kp = k(a[1] / max(a[0], 1), b[1] / max(b[0], 1), ns[-2], ns[-1]) if a[0] and b[0] else float('nan')
            print(f'| {f} | {secs} | {shares} | {kt:.2f} | {kc:.2f} | {kp:.2f} |')
        print(f"| (TypeScript between statements) | {' | '.join(f'{t/1000:.1f}' for t in ts)} | {' | '.join(f"{100*t/x['r']['passMs']:.0f}%" for t, x in zip(ts, xs))} | {k(ts[-2], ts[-1], ns[-2], ns[-1]):.2f} | | |")


def quad(ns, ts):
    """Least squares t = a*N + b*N^2 (no constant: a pass of nothing costs nothing); exact for two points."""
    s11 = sum(n * n for n in ns); s12 = sum(n ** 3 for n in ns); s22 = sum(n ** 4 for n in ns)
    y1 = sum(n * t for n, t in zip(ns, ts)); y2 = sum(n * n * t for n, t in zip(ns, ts))
    det = s11 * s22 - s12 * s12
    return ((y1 * s22 - y2 * s12) / det, (s11 * y2 - s12 * y1) / det)


def projections(runs, at=(10000, 20000), minshare=0.02):
    """Each family's time fitted to a*N + b*N^2 over the measured N, projected; the linear and quadratic parts apart."""
    groups = collections.defaultdict(list)
    for x in runs:
        groups[(x['spread'], x['state'], x['pass'] + {'7bs': 's', '7bf': 'f'}.get(x['shape'], ''))].append(x)
    for key, xs in sorted(groups.items()):
        xs.sort(key=lambda x: x['n'])
        if len(xs) < 2:
            continue
        ns = [x['n'] for x in xs]
        keys = set()
        for x in xs:
            keys |= {f for f, (c, ms) in x['fam'].items() if ms >= minshare * x['r']['passMs']}
        print(f"\n**spread {key[0].upper()}, state ({key[1]}), pass {key[2]}** (fit over N = {', '.join(f'{n:,}' for n in ns)})\n")
        print('| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | ' + ' | '.join(f'projected s @{n:,}' for n in at) + ' | ' + ' | '.join(f'quadratic share @{n:,}' for n in at) + ' |')
        print('|---|---:|---:|' + '---:|' * (2 * len(at)))
        tot = [0.0] * len(at)
        rows = []
        for f in keys:
            ts = [x['fam'].get(f, [0, 0.0])[1] for x in xs]
            a, b = quad(ns, ts)
            rows.append((a * at[-1] + b * at[-1] ** 2, f, a, b))
        rest = [x['r']['passMs'] - sum(x['fam'].get(f, [0, 0.0])[1] for f in keys) for x in xs]
        a, b = quad(ns, rest)
        rows.append((a * at[-1] + b * at[-1] ** 2, '(everything else, TS included)', a, b))
        for _, f, a, b in sorted(rows, reverse=True):
            proj = [a * n + b * n * n for n in at]
            tot = [t + p for t, p in zip(tot, proj)]
            print(f"| {f} | {a:.3f} | {b*1000:.4f} | " + ' | '.join(f'{p/1000:.0f}' for p in proj) + ' | ' + ' | '.join(f"{100*b*n*n/p:.0f}%" if p > 0 else '' for n, p in zip(at, proj)) + ' |')
        print('| **pass** | | | ' + ' | '.join(f'**{t/1000:.0f}**' for t in tot) + ' | ' + ' |' * len(at))


def states(runs):
    """Per (spread, N, pass): each family's seconds in states a, b, c side by side: what 1b's index and its lock/trigger changes remove."""
    groups = collections.defaultdict(dict)
    for x in runs:
        if x['shape'] in ('7bs', '7bf'):
            continue
        groups[(x['spread'], x['n'], x['pass'])][x['state']] = x
    for key, by in sorted(groups.items()):
        if len(by) < 2:
            continue
        st = sorted(by)
        print(f"\n**spread {key[0].upper()}, N {key[1]:,}, pass {key[2]}**: pass s " + ', '.join(f"({s}) {by[s]['r']['passMs']/1000:.1f}" for s in st) + '\n')
        print('| phase/family | ' + ' | '.join(f'({s}) s' for s in st) + ' | ' + ' | '.join(f'({s}) ms/call' for s in st) + ' |')
        print('|---|' + '---:|' * (2 * len(st)))
        keys = set()
        for s in st:
            keys |= {f for f, (c, ms) in by[s]['fam'].items() if ms >= 0.02 * by[s]['r']['passMs']}
        for f in sorted(keys, key=lambda f: -by[st[0]]['fam'].get(f, [0, 0.0])[1]):
            v = [by[s]['fam'].get(f, [0, 0.0]) for s in st]
            print(f'| {f} | ' + ' | '.join(f'{ms/1000:.1f}' for c, ms in v) + ' | ' + ' | '.join(f'{ms/c:.2f}' if c else '' for c, ms in v) + ' |')
        print('| (TypeScript between statements) | ' + ' | '.join(f"{by[s]['r']['tsBetweenMs']/1000:.1f}" for s in st) + ' |' + ' |' * len(st))
        print('| advisory locks per backend (peak) | ' + ' | '.join(f"{by[s]['r']['locks']['peakPerBackend']:,}" for s in st) + ' |' + ' |' * len(st))


runs = load()
print('## Overview\n')
overview(runs)
print('\n## Fits (k between the two largest N; t ~ N^k)\n')
fits(runs)
print('\n## Projections (each family a*N + b*N^2)\n')
projections(runs)
print('\n## States side by side\n')
states(runs)
print('\n## Families per pass\n')
families(runs)
