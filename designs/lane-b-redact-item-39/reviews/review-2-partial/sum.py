import json, sys
for f in sys.argv[1:]:
    rows = [json.loads(l) for l in open(f) if l.strip()]
    print('==', f, len(rows))
    for r in rows:
        s = r['spec']
        key = ' '.join(f"{k}={('U+%04X' % ord(v)) if k == 'marker' else v}" for k, v in s.items() if k not in ('own',))
        if 'failed' in r:
            print(f"{r['tree']:4} {key:60} {r['failed'][:160]}")
            continue
        c, w = r['cold'], r.get('warm')
        def f1(x):
            if x is None: return '-'
            return f"{x['ms']}ms {x['out']} u={x.get('units',0)/1e6:.0f}M" + (f" po={x['poMs']}ms/{x['poCalls']}c/{x['places']}pl" if x.get('poCalls') else '') + (f" win={x['windows']}/fb={x['fallbacks']}" if x.get('windows', -1) > 0 else '') + (' CLEAR!' if x.get('clear') else '')
        print(f"{r['tree']:4} {key:60} len={r['textLen']} cold[{f1(c)}] warm[{f1(w)}] rss={r['rssMB']}MB")
