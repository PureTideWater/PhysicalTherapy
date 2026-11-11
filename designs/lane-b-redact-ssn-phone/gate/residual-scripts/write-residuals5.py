# Synthetic only. Review round 5 (F10): the residual table's "about" text brought to round 5, and the failSafe rows tagged
# "must-stay" that cc3dd7f6 did not send unchanged re-tagged "must-stay-changed-at-base" (it sent each with a month-word
# part of the name or an amount's digits replaced; the gate's oracle places no identifier in them). No row is added,
# dropped or edited otherwise.
# Usage: python3 -I write-residuals5.py <residuals.json> <must-stay-base.jsonl from gen-residual5.mts>
import json, sys
path, base = sys.argv[1], sys.argv[2]
d = json.load(open(path))
outcome = {}
for line in open(base):
    if line.strip():
        r = json.loads(line)
        outcome[(r['p'], r['letter'])] = r['base']
retagged = 0
for row in d['failSafe']:
    if row['gate'] != 'must-stay':
        continue
    was = outcome[(row['p'], row['letter'])]
    assert was != 'REFUSED', row
    if was != 'UNCHANGED':
        row['gate'] = 'must-stay-changed-at-base'
        retagged += 1
about = d['about']
old_rounds = "the judge's review rounds 1 to 3, each refused"
assert old_rounds in about
about = about.replace(old_rounds, "the judge's review rounds 1 to 4 and review round 5, each refused")
old_fail = 'failSafe: letters cc3dd7f6 sent that this head refuses.'
assert old_fail in about
about = about.replace(old_fail, 'failSafe: letters cc3dd7f6 sent that this head refuses: unchanged (`gate` "must-stay"), with a month-word part of the name or an amount\'s digits replaced and no identifier the gate\'s oracle places (`gate` "must-stay-changed-at-base": review round 5), or from the glued check\'s rows (`gate` "glued-check").')
d['about'] = about
def dump(d):
    items = []
    for k, v in d.items():
        if isinstance(v, list):
            items.append(f'  {json.dumps(k)}: [\n' + ',\n'.join('    ' + json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in v) + '\n  ]')
        else:
            items.append(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}')
    return '{\n' + ',\n'.join(items) + '\n}\n'
open(path, 'w').write(dump(d))
print('retagged', retagged, 'must-stay', sum(1 for r in d['failSafe'] if r['gate'] == 'must-stay'), 'failSafe', len(d['failSafe']))
