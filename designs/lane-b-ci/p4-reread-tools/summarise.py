# Parses replay.out + replay2.out; prints per-PR current/narrowed and totals under the seven-shard means.
import re,sys
M={'money-ledger':4.46,'packets-scan':6.95,'packets-rest':13.01,'packets-explain':11.84,'pricing-engine':7.30,'pricing-recompute':3.93,'pricing-rest':5.90}
SH={'money':['money-ledger'],'ledger':['money-ledger'],'packets':['packets-scan','packets-rest','packets-explain'],'pricing':['pricing-engine','pricing-recompute','pricing-rest']}
def cost(pkgs):
    s=set()
    for p in pkgs: s.update(SH[p])
    return sum(M[x] for x in s), len(s)
recs={}
for f in sys.argv[1:]:
    cur=None
    for line in open(f):
        m=re.match(r'^#(\d+) (\w+) \((\d+) files\)',line)
        if m: cur=m.group(1); recs[cur]={'head':m.group(2),'files':m.group(3),'reasons':[]}; continue
        m=re.match(r'^  (current|narrowed): \[(.*?)\] shards (\d+)',line)
        if m and cur: recs[cur][m.group(1)]=[x for x in m.group(2).split(', ') if x]; continue
        if cur and line.startswith('    '): recs[cur]['reasons'].append(line.strip())
        m=re.match(r'^  (inert|global): (.*)',line)
        if m and cur: recs[cur][m.group(1)]=m.group(2).strip()
meta={l.split('\t')[0]:l.rstrip('\n').split('\t') for l in open('/home/user/laneb-sp/p4reread/tmp/all-prs-full.tsv')}
def cls(p): return 'full' if len(p)==4 else ('none' if not p else 'partial')
tot={'n':0,'full_c':0,'full_n':0,'saved':0,'narrowed':0,'widened':0}
for n in sorted(recs,key=int):
    r=recs[n]; c=r.get('current',[]); w=r.get('narrowed',[])
    cc,cs=cost(c); nc,ns=cost(w)
    st=meta[n][1]; merged='merged' if meta[n][2]!='-' else st
    print(f"#{n:>3} {merged:6} cur {cls(c):7} [{','.join(c)}] ({cs}) -> P4 {cls(w):7} [{','.join(w)}] ({ns}) saved {cc-nc:6.2f}")
    tot['n']+=1; tot['full_c']+=cls(c)=='full'; tot['full_n']+=cls(w)=='full'; tot['saved']+=cc-nc; tot['narrowed']+= (cc-nc)>0.001; tot['widened']+= (nc-cc)>0.001
print(tot)
