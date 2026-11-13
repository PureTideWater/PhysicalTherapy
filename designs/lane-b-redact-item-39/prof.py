# Self time by function from a V8 .cpuprofile directory (top 15). Usage: python3 prof.py <dir>
import json, sys, os, collections
d = sys.argv[1]; f = max([os.path.join(d, x) for x in os.listdir(d) if x.endswith('.cpuprofile')], key=os.path.getsize)
p = json.load(open(f)); nodes = {n['id']: n for n in p['nodes']}
dt = collections.Counter(); 
for i, s in enumerate(p['samples']): dt[s] += p['timeDeltas'][i]
self_ = collections.Counter()
for nid, t in dt.items():
    cf = nodes[nid]['callFrame']; self_[(cf['functionName'] or '(anon)') + ' ' + os.path.basename(cf['url']) + ':' + str(cf['lineNumber'] + 1)] += t
tot = sum(self_.values())
for k, v in self_.most_common(15): print(f'{v/1000:9.0f} ms {100*v/tot:5.1f}%  {k}')
