#!/bin/bash
# Rebuild the scratch layout battery/README.md describes. Arg: refresh  (only re-copy the head's files into fix, fix3, inst, snap)
set -euo pipefail
D=/home/user/ops/designs/lane-b-redact-ssn-phone-leaks; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate
W=/home/user/work; L=/home/user/leaks; S=packages/model-gateway/src; SNAP=${SNAP:-/home/user/snap17}
if [ "${1:-}" != refresh ]; then
  cp -r $D/battery/b1fix $D/battery/c1fix $D/battery/d2p6 $D/battery/stress16.mts $D/battery/prop-head.mts $W/
  cp $G/leaks-scripts/cmp.mts $G/leaks-scripts/rows.mts $G/leaks-scripts/revdiff.mjs $G/ts-resolve.mjs $G/ts-resolve-hooks.mjs $W/
  rm -rf $W/b2fix $W/d2fix; cp -r $D/reviews/b2 $W/b2fix; cp -r $D/reviews/d2 $W/d2fix
  for r in c1 c2 g1 g2 h1 h2 i1 i2 j k; do rm -rf /home/user/review-$r; cp -r $D/reviews/$r /home/user/review-$r; done
  mkdir -p /home/user/review-d1; rm -rf /home/user/review-d1/d1; cp -r $D/reviews/d1 /home/user/review-d1/d1; mkdir -p /home/user/review-d1/d1/out /home/user/review-d1/d1/inst
  i=12; for c in 91e1527a 8e599038 a66fee45 24ad1075 f2f9f05e; do mkdir -p $W/p$i/before/$S; for f in redact.ts confusables.ts; do git -C $L show $c:$S/$f > $W/p$i/before/$S/$f; done; i=$((i+1)); done
  mkdir -p $W/p11; cp $D/base-merge/resolve.py $W/p11/
  rm -rf /home/user/gate; cp -r $G /home/user/gate
  for d in /home/user/review-c1/aea:aea2852d /home/user/review-c2/aea:aea2852d /home/user/review-c2/h405:405314b4; do mkdir -p ${d%%:*}/$S; for f in redact.ts confusables.ts; do git -C $L show ${d##*:}:$S/$f > ${d%%:*}/$S/$f 2>/dev/null || rm -f ${d%%:*}/$S/$f; done; done
  mkdir -p /home/user/review-c1/out $W/c1fix/out /home/user/review-d2 /home/user/review-j/t /home/user/review-k/t
  ln -sfn $L /home/user/redact-range-glued
fi
mkdir -p /home/user/fix/$S /home/user/fix3/$S
cp $L/$S/redact.ts $L/$S/confusables.ts /home/user/fix/$S/
cp $L/$S/confusables.ts /home/user/fix3/$S/
EXPORT='export const __t = { unbracketed, letterSubject, matchesIn, unmarked, written, merge, chainLeft, masked, survivorLeft };'
{ cat $L/$S/redact.ts; echo "$EXPORT"; } > /home/user/review-d1/d1/inst/redact.ts
cp $L/$S/confusables.ts /home/user/review-d1/d1/inst/ 2>/dev/null || true
mkdir -p /home/user/review-c1/inst/$S; cp /home/user/review-d1/d1/inst/redact.ts $L/$S/confusables.ts /home/user/review-c1/inst/$S/
python3 - <<'PY'
import re
src=open('/home/user/leaks/packages/model-gateway/src/redact.ts',encoding='utf-8').read()
i=src.index('function survivorIn(')
# end of function: first "\n}\n" after i
j=src.index('\n}\n',i)+3
body=src[i:j]
print('--- survivorIn tail (head) ---'); print('\n'.join(body.rstrip().split('\n')[-8:]))
open('/home/user/work/survivorIn.head.txt','w').write(body)
PY
rm -rf $SNAP; mkdir -p $SNAP/packages/model-gateway; cp -r $L/packages/model-gateway/src $SNAP/packages/model-gateway/src
echo layout done
