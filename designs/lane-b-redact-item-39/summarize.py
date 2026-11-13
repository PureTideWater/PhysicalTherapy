# Reads out/battery.txt and writes out/battery-table.md: per row, each variant's cold and warm whole check (redaction
# then check, one counter) at the reference speed (calibration 144 ms), heap growth, the outcome and the output's hash
# (the same hash on every variant: the same letters sent or refused, the same text). Usage: python3 -I summarize.py <dir>
import re, sys, collections
d = sys.argv[1]
rows = collections.OrderedDict(); variants = []
pat = re.compile(r'^(\S+)\s+(\d+)x(\d+)\s+(\S+)\s+(\S+)\s+cold\s+(\d+) ms .*?warm\s+(\d+) ms \| ref x[\d.]+: cold\s+(\d+) warm\s+(\d+) \| heap \+(\d+) MB rss \+(\d+) MB \| (\S+) \| out \d+ sha (\w+) \| cal (\d+) \| units (\w+) \(redaction (\d+)\)')
for line in open(f'{d}/out/battery.txt'):
    m = pat.match(line)
    if not m: continue
    v, k, ln, shape, letter, cold, warm, rcold, rwarm, heap, rss, outs, sha, cal, units, redaction = m.groups()
    # Past the budget in the redaction the check never runs: the redaction's count is the letter's.
    units = redaction if units == 'undefined' else units
    key = f'{int(k):,} x {ln}, {shape}, {letter}'
    rows.setdefault(key, {})[v] = dict(cold=int(rcold), warm=int(rwarm), heap=int(heap), out=outs.split(',')[0], sha=(len(outs.split(',')), sha), units=int(units))
    if v not in variants: variants.append(v)
out = ['| identifiers, letter | ' + ' | '.join(variants) + ' | same output, same units |', '|---|' + '---:|' * len(variants) + '---|']
for key, by in rows.items():
    cells = []
    for v in variants:
        r = by.get(v)
        cells.append('' if r is None else f"{r['cold']/1000:.2f} / {r['warm']/1000:.2f} s, {r['heap']} MB")
    # The hash is over every call's outcome and text, so it is compared among runs of the same number of calls.
    groups = {}
    for r in by.values(): groups.setdefault(r['sha'][0], set()).add(r['sha'][1])
    units = {r['units'] for r in by.values()}
    same = all(len(g) == 1 for g in groups.values()) and len(units) == 1
    out.append(f'| {key} | ' + ' | '.join(cells) + f" | {'yes' if same else 'NO ' + str(groups) + str(units)} ({next(iter(by.values()))['out']}, {next(iter(units)):,} units) |")
open(f'{d}/out/battery-table.md', 'w').write('Cold (call 1) / warm (best of calls 2-5, or 2-3 for the slow rows) whole check, at the reference speed; heap growth over the run. Same output: the outcome and text of every call hash alike among runs of as many calls, and call 1 spent the same units on the counter.\n\n' + '\n'.join(out) + '\n')
print('\n'.join(out))
