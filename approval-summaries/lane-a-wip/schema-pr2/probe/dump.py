#!/usr/bin/env python3
"""Schema PR 2 (the ledger lookups) equality dump, from SUITE-CAP-3's probe/dump.py with ledger_match read in seq order: the rows a reconcile pass wrote, canonical, so two passes from the same seed template
(the base and a candidate) can be diffed. Usage: dump.py <port> <db> <seed db> > out.ndjson
Rows of the tables the pass writes, in their observable order (seq where the table has one, else physical insertion
order), every column but the row's own id and its timestamps, each UUID that is new since the seed replaced by
<table>#<ordinal>, and ciphertext columns replaced by whether they are set. SYNTHETIC databases only; the output holds
identifiers, codes, stages and cents, never decrypted text (it is written to the scratchpad and diffed, never logged)."""
import json, re, subprocess, sys
port, db, seed = sys.argv[1], sys.argv[2], sys.argv[3]
TABLES = [('ledger_match', 'seq'), ('ledger_entry', 'seq'), ('line_status', 'seq'), ('payer_response', 'ctid'), ('submission', 'ctid'),
          ('notification', 'ctid'), ('audit_event', 'ctid'), ('source_document', 'ctid'), ('posting_row', 'ctid'), ('eft_row', 'ctid'), ('case', 'id')]
CIPHER = {'reason', 'claim_reference', 'note', 'patient_control_number', 'body', 'detail'}
TS = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
def q(database, sql):
    return subprocess.run(['psql', '-h', 'localhost', '-p', port, '-U', 'postgres', '-d', database, '-qAt', '-c', sql], check=True, capture_output=True, text=True).stdout.splitlines()
def exists(database, table):
    return q(database, f"SELECT to_regclass('public.\"{table}\"') IS NOT NULL")[0] == 't'
def ids(database, table):
    return set(q(database, f'SELECT id::text FROM "{table}"')) if exists(database, table) else set()
def rows(database, table, order):
    if not exists(database, table):
        return []
    key = "(ctid::text::point)[0], (ctid::text::point)[1]" if order == 'ctid' else order
    return [json.loads(line) for line in q(database, f'SELECT row_to_json(t) FROM (SELECT * FROM "{table}" ORDER BY {key}) t')]
new = {}
for table, order in TABLES:
    before = ids(seed, table)
    for i, row in enumerate(r for r in rows(db, table, order) if r['id'] not in before):
        new[row['id']] = f'{table}#{i}'
def canon(v, col):
    if col in CIPHER:
        return v is not None
    if isinstance(v, str):
        if TS.match(v):
            return 'ts'
        if UUID.match(v):
            return new.get(v, v)
    if isinstance(v, list):
        return [canon(x, col) for x in v]
    if isinstance(v, dict):
        return {k: canon(x, k) for k, x in sorted(v.items())}
    return v
# Since migration 20261110090000 a match has a seq, the order the ledger made its matches in, and settleMatches writes
# its posted and deposited entries in that order. The rule is checked here; compare.py compares every row in order,
# ledger_match by its seq and every entry by its own.
print(json.dumps({'_t': '_check', 'settle_entries_in_match_order': q(db, """
  SELECT coalesce(bool_and(a = b), true) FROM (
    SELECT row_number() OVER (ORDER BY e.seq) AS a, row_number() OVER (ORDER BY m.seq, e.seq) AS b
      FROM ledger_entry e JOIN ledger_match m ON m.id = e.match_id WHERE e.stage IN ('posted', 'deposited')) x""")[0]}))
for table, order in TABLES:
    for row in rows(db, table, order):
        out = {'_t': table, '_id': new.get(row['id'], row['id'])}
        for col, v in sorted(row.items()):
            if col in ('id', 'created_at', 'updated_at', 'set_at', 'matched_at', 'occurred_at', 'opened_at', 'scan_at', 'uploaded_at', 'received_at'):
                continue
            out[col] = canon(v, col)
        print(json.dumps(out, sort_keys=True, default=str))
