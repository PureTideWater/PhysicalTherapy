#!/bin/bash
# lay.sh <root> <dir holding the head's redact.ts and confusables.ts> : the battery's layout (battery/README.md) under <root>.
set -euo pipefail
ROOT=$1; SRC=$2; REPO=/home/user/PhysicalTherapy
D=/home/user/ops/designs/lane-b-redact-ssn-phone-leaks; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate
rm -rf "$ROOT"; mkdir -p $ROOT/work $ROOT/fix/packages/model-gateway/src $ROOT/fix3/packages/model-gateway/src
cp $SRC/redact.ts $SRC/confusables.ts $ROOT/fix/packages/model-gateway/src/
cp -r $D/battery/b1fix $D/battery/c1fix $D/battery/d2p6 $ROOT/work/; cp $D/battery/stress16.mts $D/battery/prop-head.mts $ROOT/work/
cp $G/leaks-scripts/cmp.mts $G/leaks-scripts/rows.mts $G/leaks-scripts/revdiff.mjs $G/ts-resolve.mjs $G/ts-resolve-hooks.mjs $ROOT/work/
cp -r $D/reviews/b2 $ROOT/work/b2fix; cp -r $D/reviews/d2 $ROOT/work/d2fix
for r in c1 c2 g1 g2 h1 h2 i1 i2 j k; do cp -r $D/reviews/$r $ROOT/review-$r; done
mkdir -p $ROOT/review-d1 $ROOT/review-d2 $ROOT/review-l; cp -r $D/reviews/d1 $ROOT/review-d1/d1; mkdir -p $ROOT/review-d1/d1/out $ROOT/review-d1/d1/inst
EXPORT='export const __t = { unbracketed, letterSubject, matchesIn, unmarked, written, merge, chainLeft, masked, survivorLeft };'
{ cat $SRC/redact.ts; echo "$EXPORT"; } > $ROOT/review-d1/d1/inst/redact.ts; cp $SRC/confusables.ts $ROOT/review-d1/d1/inst/
python3 - "$SRC/redact.ts" "$ROOT/fix3/packages/model-gateway/src/redact.ts" <<'PY'
import sys
s=open(sys.argv[1],encoding='utf-8').read()
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
assert s.count(old)==1
open(sys.argv[2],'w',encoding='utf-8').write(s.replace(old,new))
PY
cp $SRC/confusables.ts $ROOT/fix3/packages/model-gateway/src/
mkdir -p $ROOT/work/p12/fza; cp -r $ROOT/work/b1fix $ROOT/work/c1fix $ROOT/work/d2p6 $ROOT/work/p12/fza/; cp -r $ROOT/review-d1/d1 $ROOT/work/p12/fza/d1
grep -rl '/home/user/fix/' $ROOT/work/p12/fza | xargs -r sed -i 's#/home/user/fix/#/home/user/fix3/#g'
{ cat $ROOT/fix3/packages/model-gateway/src/redact.ts; echo "$EXPORT"; } > $ROOT/work/p12/fza/d1/inst/redact.ts
for pair in p16:f2f9f05e p15:24ad1075 p14:a66fee45 p13:8e599038 p12:91e1527a; do p=${pair%%:*}; c=${pair##*:}; mkdir -p $ROOT/work/$p/before/packages/model-gateway/src
  for f in redact.ts confusables.ts; do git -C $REPO show $c:packages/model-gateway/src/$f > $ROOT/work/$p/before/packages/model-gateway/src/$f; done; done
# The battery without its gate tail (the gate runs apart, against f3f5a642).
sed '/^# The gate: tree A/,$d' $D/battery/battery.sh > $ROOT/work/battery.sh
if [ "$ROOT" != /home/user ]; then
  for t in tree-ef3 tree-cc3 gate; do ln -s /home/user/$t $ROOT/$t; done
  grep -rlI '/home/user/' $ROOT --include=*.mts --include=*.mjs --include=*.sh --include=*.ts | grep -v '/packages/model-gateway/src/\|/inst/' | xargs -r sed -i "s#/home/user/#$ROOT/#g"
fi
# Fresh seeds for the second run.
sed -E -e 's/fuzz1.mts 20000 47 /fuzz1.mts 20000 2903 /; s/fuzz1-47/fuzz1-a/g; s/fuzz2.mts 20000 29 /fuzz2.mts 20000 2909 /; s/fuzz2-29/fuzz2-a/g; s/fuzz1.mts 20000 181 /fuzz1.mts 20000 3001 /; s/fuzz1-181/fuzz1-b/g; s/fuzz2.mts 20000 191 /fuzz2.mts 20000 3011 /; s/fuzz2-191/fuzz2-b/g; s/fuzz3.mts 30000 17 /fuzz3.mts 30000 2917 /' \
  -e 's/fz2.mts 150 193 /fz2.mts 150 2927 /; s/withheld.mts 120 197 /withheld.mts 120 2939 /; s/fz.mts 120 5923 /fz.mts 120 7919 /; s/fz3.mts 120 6029 /fz3.mts 120 7927 /' \
  -e 's/fuzz1.mts 20000 199 /fuzz1.mts 20000 2953 /; s/fuzz2.mts 20000 211 /fuzz2.mts 20000 2957 /; s/fz2.mts 120 223 /fz2.mts 120 2963 /; s/fuzz-letters.mts 12000 29 /fuzz-letters.mts 12000 2969 /' \
  -e 's/gen.mts 100 71 /gen.mts 100 2971 /; s/gen.mts 60 73 /gen.mts 60 2999 /; s/tight.mts 90 11 /tight.mts 90 3019 /; s/gen.mts 2000 7109 /gen.mts 2000 7933 /; s/fuzz.mts 31 8000 120 /fuzz.mts 3023 8000 120 /; s/fuzz3.mts 37 10000 /fuzz3.mts 3037 10000 /' \
  -e 's/fuzz-letters.mts 12000 11 /fuzz-letters.mts 12000 3049 /; s/prop-head.mts 20000 42 /prop-head.mts 20000 3061 /' $ROOT/work/battery.sh > $ROOT/work/battery-fresh.sh
echo "laid $ROOT from $SRC"
