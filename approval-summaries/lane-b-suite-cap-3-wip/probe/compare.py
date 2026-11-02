#!/usr/bin/env python3
"""Compares the base's and the candidate's dumps of the same seed, state and shape (dump.py output): per pass,
identical or the first differing rows by table. Usage: compare.py <base results dir> <try results dir>"""
import glob, json, os, sys
base, cand = sys.argv[1], sys.argv[2]
for path in sorted(glob.glob(os.path.join(cand, '*_try-*.dump.ndjson'))):
    name = os.path.basename(path).replace('_try-', '_base-')
    other = os.path.join(base, name)
    if not os.path.exists(other):
        print(f'{os.path.basename(path)}: no base dump'); continue
    checks = []
    def norm(lines):
        keep, settle = [], []
        for line in lines:
            row = json.loads(line)
            if row['_t'] == '_check':
                checks.append(row['settle_entries_in_match_order']); continue
            if row['_t'] == 'ledger_entry' and row.get('stage') in ('posted', 'deposited'):
                row.pop('seq', None); settle.append(json.dumps(row, sort_keys=True))
            else:
                keep.append(line)
        return keep + sorted(settle)
    a = norm(open(other).read().splitlines()); b = norm(open(path).read().splitlines())
    by = {}
    for line in b:
        by[json.loads(line)['_t']] = by.get(json.loads(line)['_t'], 0) + 1
    if a == b:
        print(f'{os.path.basename(path)}: IDENTICAL [settle order rule {checks}] ({len(b)} rows: ' + ', '.join(f'{k} {v}' for k, v in sorted(by.items())) + ')')
    else:
        diff = [i for i in range(max(len(a), len(b))) if i >= len(a) or i >= len(b) or a[i] != b[i]]
        print(f'{os.path.basename(path)}: DIFFERS at {len(diff)} rows; first {diff[:3]}')
        for i in diff[:2]:
            print('  base', a[i][:300] if i < len(a) else None); print('  try ', b[i][:300] if i < len(b) else None)
