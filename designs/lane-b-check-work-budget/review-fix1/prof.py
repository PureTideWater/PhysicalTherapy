import json,sys,glob,collections
for f in glob.glob(sys.argv[1]+'/*.cpuprofile'):
    p=json.load(open(f)); nodes={n['id']:n for n in p['nodes']}; self=collections.Counter()
    dt=p['timeDeltas']
    for s,d in zip(p['samples'],dt):
        cf=nodes[s]['callFrame']; self[(cf['functionName'] or '(anon)', cf['url'].split('/')[-1], cf['lineNumber']+1)]+=d
    tot=sum(self.values())
    if tot<2e6: continue
    print(f.split('/')[-1], 'total ms', tot//1000)
    for k,v in self.most_common(8): print('  %5.1f%%  %s  %s:%d'%(100*v/tot,*k))
