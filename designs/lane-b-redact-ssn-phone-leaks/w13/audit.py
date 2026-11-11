# Make the audit copy (/home/user/fix3) and the fuzzers pointed at it (/home/user/work/p12/fza) from the head's redact.ts
import os, shutil, subprocess, sys
L='/home/user/leaks/packages/model-gateway/src/redact.ts'
src=open(L,encoding='utf-8').read()
old="""  if (!strict || !departs.left || read === 'survivor') {
    return read;
  }
  const base = survivorRead(text, false, departs);
  return base === 'survivor' || read === null ? base : read;
}
"""
new="""  if (!strict || read === 'survivor') {
    return read;
  }
  const flagged = departs.left;
  const base = survivorRead(text, false, departs);
  const worse = base === 'survivor' || read === null ? base : read;
  if (!flagged && worse !== read) {
    console.error('DEPART ' + JSON.stringify({ read, base, text: text.slice(0, 400) }));
  }
  return flagged ? worse : read;
}
"""
assert src.count(old)==1
aud=src.replace(old,new)
os.makedirs('/home/user/fix3/packages/model-gateway/src',exist_ok=True)
open('/home/user/fix3/packages/model-gateway/src/redact.ts','w',encoding='utf-8').write(aud)
fza='/home/user/work/p12/fza'
if len(sys.argv)<2:
    shutil.rmtree(fza,ignore_errors=True); os.makedirs(fza)
    for name,srcdir in [('b1fix','/home/user/work/b1fix'),('c1fix','/home/user/work/c1fix'),('d1','/home/user/review-d1/d1'),('d2p6','/home/user/work/d2p6')]:
        shutil.copytree(srcdir, f'{fza}/{name}')
    n=0
    for root,_,files in os.walk(fza):
        for f in files:
            if f.endswith('.mts') or f.endswith('.mjs'):
                p=os.path.join(root,f); s=open(p,encoding='utf-8').read()
                if '/home/user/fix/' in s:
                    open(p,'w',encoding='utf-8').write(s.replace('/home/user/fix/','/home/user/fix3/')); n+=1
    print('files repointed',n)
EXPORT='export const __t = { unbracketed, letterSubject, matchesIn, unmarked, written, merge, chainLeft, masked, survivorLeft };\n'
os.makedirs(f'{fza}/d1/inst',exist_ok=True)
open(f'{fza}/d1/inst/redact.ts','w',encoding='utf-8').write(aud+EXPORT)
shutil.copy('/home/user/leaks/packages/model-gateway/src/confusables.ts',f'{fza}/d1/inst/confusables.ts')
print('audit copy done')
