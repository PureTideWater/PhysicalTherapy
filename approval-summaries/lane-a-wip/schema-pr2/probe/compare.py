#!/usr/bin/env python3
"""Compares two dumps of the same seed (dump.py output): the base's bodies against the new ones. Every row is compared
in its order (ledger_match by seq, ledger_entry and line_status by seq), seq values included. If that differs, it also
says whether the rows are the same as a set, so an order difference is told from a row difference.
Usage: compare.py <before dump> <after dump> [<before> <after> ...]"""
import json, os, re, sys
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
def load(path):
    rows, checks = [], []
    for line in open(path).read().splitlines():
        row = json.loads(line)
        if row['_t'] == '_check':
            checks.append(row['settle_entries_in_match_order']); continue
        if row['_t'] == 'source_document' and isinstance(row.get('s3_key'), str):
            row['s3_key'] = UUID.sub('<id>', row['s3_key'])
        rows.append(json.dumps(row, sort_keys=True))
    return rows, checks
bad = 0
pairs = sys.argv[1:]
for before, after in zip(pairs[0::2], pairs[1::2]):
    a, ca = load(before); b, cb = load(after)
    by, cents = {}, {}
    for line in b:
        row = json.loads(line); by[row['_t']] = by.get(row['_t'], 0) + 1
        if row['_t'] == 'ledger_entry':
            cents[row['stage']] = cents.get(row['stage'], 0) + int(row['amount_cents'])
    name = os.path.basename(after)
    if a == b and ca == cb:
        print(f'{name}: IDENTICAL row for row, in order, seq included [settle entries in match seq order: before {ca}, after {cb}] ({len(b)} rows: ' + ', '.join(f'{k} {v}' for k, v in sorted(by.items())) + '); entry cents by stage ' + json.dumps(cents, sort_keys=True))
    else:
        bad = 1
        diff = [i for i in range(max(len(a), len(b))) if i >= len(a) or i >= len(b) or a[i] != b[i]]
        print(f'{name}: DIFFERS at {len(diff)} of {max(len(a), len(b))} rows; settle order rule before {ca}, after {cb}; same as a set: {sorted(a) == sorted(b)}; first {diff[:3]}')
        for i in diff[:2]:
            print('  before', a[i][:300] if i < len(a) else None); print('  after ', b[i][:300] if i < len(b) else None)
sys.exit(bad)
