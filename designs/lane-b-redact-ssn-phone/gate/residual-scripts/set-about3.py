# Synthetic only. Round 3 of the judge's review: the residual table's "about" text (where its scripts are kept, its rounds).
# Usage: python3 -I set-about3.py <residuals.json>
import json, sys
path = sys.argv[1]
d = json.load(open(path))
about = d['about']
old_rounds = "the judge's review rounds 1 and 2, each refused"
assert old_rounds in about
about = about.replace(old_rounds, "the judge's review rounds 1 to 3, each refused")
old_regen = 'Regenerate from a gate run with the scripts kept beside the gate, never by hand.'
assert old_regen in about
about = about.replace(old_regen, "Regenerate only from a gate run and the rounds' harness runs, with the gate and the scripts that write this file (synthetic only) kept in the ops repository (claude/build-ops) at designs/lane-b-redact-ssn-phone/gate/, never by hand; co-001/redact-ssn-phone-leaks owns the next regeneration.")
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
print('about updated')
