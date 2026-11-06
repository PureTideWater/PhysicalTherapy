#!/usr/bin/env python3
"""Compares two dumps of the same seed and shape (dump.py output), e.g. the base's and the candidate's: identical or the
first differing rows by table. Usage: compare2.py <base dump> <candidate dump> [<base dump> <candidate dump> ...]"""
import glob, json, os, re, sys
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
pairs = sys.argv[1:]
for other, path in zip(pairs[0::2], pairs[1::2]):
    if not os.path.exists(other):
        print(f'{os.path.basename(path)}: no base dump'); continue
    checks = []
    def norm(lines):
        keep, settle = [], []
        for line in lines:
            row = json.loads(line)
            if row['_t'] == 'source_document' and isinstance(row.get('s3_key'), str):
                row['s3_key'] = UUID.sub('<id>', row['s3_key']); line = json.dumps(row, sort_keys=True)
            if row['_t'] == '_check':
                checks.append(row['settle_entries_in_match_order']); continue
            if row['_t'] == 'ledger_entry' and row.get('stage') in ('posted', 'deposited'):
                row.pop('seq', None); row.pop('_id', None); settle.append(json.dumps(row, sort_keys=True))
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
