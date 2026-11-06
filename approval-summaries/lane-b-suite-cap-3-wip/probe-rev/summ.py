#!/usr/bin/env python3
"""SUITE-CAP-3 review: one row per measured pass in cap3-results-rev (times in seconds): the pass, its share of pg-boss's
900 s attempt, per-family times from the client timeline (calls in brackets), the nested figures from pg_stat_statements
(the case refresh's UPDATE "case" and buffer hits of the candidate searches) and track_functions (case_rules,
ledger_line_net), heap, decrypts, statements, locks. Usage: summ.py <results dir> [name filter]"""
import glob, json, os, sys
d = sys.argv[1]; flt = sys.argv[2] if len(sys.argv) > 2 else ''
def fam(j, *names):
    ms = sum(j['byFamily'].get(n, {}).get('ms', 0) for n in names); c = sum(j['byFamily'].get(n, {}).get('count', 0) for n in names)
    return f"{ms/1000:.1f} [{c}]"
def pss(base, needle):
    p = base + '.pss.tsv'
    if not os.path.exists(p):
        return None
    calls = ms = hits = 0
    for line in open(p):
        f = line.rstrip('\n').split('\t')
        if len(f) >= 7 and needle in f[6]:
            calls += int(f[0]); ms += int(f[1]); hits += int(f[2])
    return calls, ms, hits
def func(base, name):
    p = base + '.functions.tsv'
    if not os.path.exists(p):
        return None
    for line in open(p):
        f = line.rstrip('\n').split('\t')
        if f[0] == name:
            return int(f[1]), int(f[2])
    return (0, 0)
hdr = ['run', 'pass s', '% of 900 s', 'byPatient s [calls] (hits)', 'byControl s [calls]', 'claimLines s [calls]', 'line_status insert s [stmts]', 'UPDATE case [calls] s', 'case_rules [calls] s', 'ledger_entry insert s [calls]', 'ledger_line_net [calls] s', 'ledger_match insert s', 'TS between s', 'stmts', 'decrypts', 'heap peak MiB', 'locks/backend', 'approved/posted/cents']
print('| ' + ' | '.join(hdr) + ' |'); print('|' + '---|' * len(hdr))
for p in sorted(glob.glob(os.path.join(d, '*.json'))):
    if flt not in os.path.basename(p) or p.endswith('meta.json'):
        continue
    j = json.load(open(p)); base = p[:-5]
    bp = pss(base, 's.procedure_code = $6') or (0, 0, 0)
    bp2 = pss(base, 'named (ix, claim_id) AS') or (0, 0, 0)
    hits = bp[2] + bp2[2]
    upd = pss(base, 'UPDATE "case" c SET updated_at') or (0, 0, 0)
    cr = func(base, 'case_rules') or (0, 0); ln = func(base, 'ledger_line_net') or (0, 0)
    dec = sum(v for k, v in j['crypto'].items() if k.startswith('decrypt'))
    a = j['after']
    row = [os.path.basename(base), f"{j['passMs']/1000:.1f}", f"{j['passMs']/9000:.1f}%", fam(j, 'candidates.byPatient', 'candidates.passPatient') + f" ({hits/1e6:.1f} M)", fam(j, 'candidates.byControl', 'candidates.passControl'), fam(j, 'claimLines'), fam(j, 'stages.insert'),
           f"[{upd[0]}] {upd[1]/1000:.1f}", f"[{cr[0]}] {cr[1]/1000:.1f}", fam(j, 'insert.entry'), f"[{ln[0]}] {ln[1]/1000:.1f}", fam(j, 'insert.match'), f"{j['tsBetweenMs']/1000:.1f}", str(j['statements']), str(dec), str(j['heap']['sampledPeakMiB']), str(j['locks']['peakPerBackend']),
           f"{a['approved']}/{a['posted']}/{a['posted_cents']}" + ('' if j['error'] is None else ' FAILED')]
    print('| ' + ' | '.join(row) + ' |')
