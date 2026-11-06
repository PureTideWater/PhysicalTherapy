#!/usr/bin/env python3
"""SUITE-CAP-3: the base's and the candidate's passes side by side. Usage: beforeafter.py <scratchpad>"""
import glob, json, os, sys
S = sys.argv[1]
def load(path):
    try:
        d = json.load(open(path))
    except Exception:
        return None
    return None if 'skipped' in d else d
def fam(d, *names):
    return sum(v['ms'] for k, v in d['byFamily'].items() if any(k == n or k.startswith(n) for n in names)) / 1000
def dec(d):
    return sum(v for k, v in d['crypto'].items() if k.startswith('decrypt'))
rows = []
for path in sorted(glob.glob(f'{S}/cap3-results*/cap3_*.json')):
    d = load(path)
    if d is None or 'byFamily' not in d:
        continue
    name = os.path.basename(path)[:-5]
    src = os.path.basename(os.path.dirname(path)).replace('cap3-results', '') or '-profile'
    rows.append((name, src, d['n'], d['passMs'] / 1000, d['passMs'] / 1000 - fam(d, 'insert.entry'), fam(d, 'insert.entry'), fam(d, 'stages.insert'), fam(d, 'claimLines'), fam(d, 'candidates'), d['tsBetweenMs'] / 1000, d['statements'], dec(d), d['heap'].get('sampledPeakMiB'), d['locks']['peakPerBackend'], d['after'].get('posted_cents'), d['after'].get('stage_events')))
print('| run | source | N | pass s | pass less ledger_entry inserts s | ledger_entry inserts s | line_status inserts s | claimLines s | candidate queries s | TS s | statements | decrypts | heap peak MiB | locks/backend | posted cents | stage events |')
print('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for r in sorted(rows, key=lambda r: (r[0].split('_')[1], r[2], r[0])):
    print('| ' + ' | '.join(str(round(x, 1)) if isinstance(x, float) else f'{x:,}' if isinstance(x, int) and not isinstance(x, bool) else str(x) for x in r) + ' |')
