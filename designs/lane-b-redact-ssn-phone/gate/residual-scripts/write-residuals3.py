# Synthetic only. Round 3 of the judge's review (PHIJ3-1): re-pin src/redact.residuals.json.
# - drops the ownIdentifierA rows the held date-of-birth token rule now refuses (unpadded seven-digit "1121975")
# - adds every letter of the round's dobperm harness that this head still sends with the date of birth in clear: the
#   two-digit-year compacts of four or five digits no rule reads (ruling A'), gate tag "PHIJ3-1-dob".
# Usage: python3 -I write-residuals3.py <residuals.json> <dobperm.jsonl>
import json, sys
path, perm = sys.argv[1], sys.argv[2]
d = json.load(open(path))
A = d['ownIdentifierA']
before = len(A)
A[:] = [r for r in A if r.get('token') != '1121975']
dropped = before - len(A)
def patient(names, dob, members, claims):
    want = {'names': names, 'datesOfBirth': [dob], 'memberIds': members, 'claimNumbers': claims}
    for i, p in enumerate(d['patients']):
        if p == want:
            return i
    d['patients'].append(want)
    return len(d['patients']) - 1
seen = {(r['letter'], r['p']) for r in A}
added = 0
for line in open(perm):
    if not line.strip():
        continue
    r = json.loads(line)
    sent = r['l'] if r['b'] == 'SENT' else r['b']
    assert r['a'] == 'REFUSED' and sent != 'REFUSED' and r['t'] in sent, r
    p = patient(['JANE Q ZEPHYRA'], r['dob'], ['SYNMEMBER0042'], ['SYNCLAIM0001'])
    if (r['l'], p) in seen:
        continue
    seen.add((r['l'], p))
    A.append({'p': p, 'gate': 'PHIJ3-1-dob', 'letter': r['l'], 'sent': sent, 'token': r['t']})
    added += 1
def dump(d):
    items = []
    for k, v in d.items():
        if isinstance(v, list):
            items.append(f'  {json.dumps(k)}: [\n' + ',\n'.join('    ' + json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in v) + '\n  ]')
        else:
            items.append(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}')
    return '{\n' + ',\n'.join(items) + '\n}\n'
open(path, 'w').write(dump(d))
print('dropped', dropped, 'added', added, 'ownIdentifierA', len(A), 'patients', len(d['patients']))
