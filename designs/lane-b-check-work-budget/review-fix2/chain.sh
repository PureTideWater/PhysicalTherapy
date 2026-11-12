#!/bin/bash
# One process at a time. Synthetic data only.
cd /home/user/PhysicalTherapy || exit 1
export PATH=/opt/node24/bin:$PATH
T=node_modules/.bin/tsx; R=/home/user/review-fix2; O=$R/out/chain.log
run() { local limit=$1; shift; echo "### $* (BUDGET=${BUDGET:-lifted})" >> $O; timeout "$limit" "$@" >> $O 2>&1; local rc=$?; [ $rc -ne 0 ] && echo "### exit $rc$( [ $rc -eq 124 ] && echo ' (stopped at the time limit)')" >> $O; }
export BUDGET=420000000
for s in c:6300:9 c:14000:4 c:18500:3 a:6300:9 a:14000:4 d:9400:6 m:6300:9 u:6300:9 c:1420:40 e:300000:0 n:118:40 w:285:50 w:1:14000; do run 150 $T $R/b.mts $s tiny; done
for s in "c:3000:9 prose" "c:7000:4 prose" "c:7000:4 near" "c:3000:9 near" "a:7000:4 prose" "n:60:40 near" "c:700:40 prose"; do run 200 $T $R/b.mts $s; done
for s in "5000x40 one (" "5000x40 across" "5000x40 one," "13400x9" "30100x4 one" "30100x4 across" "60100x2" "6700x9" "15100x4" "13300x9" "29900x4 one" "29900x4 across"; do run 150 $T $R/r.mts "$s"; done
unset BUDGET
run 60 $T $R/e.mts
export BUDGET=420000000
for f in "allmax prose" "allmax across yensemi" "claims5000x40 prose" "names50x40 prose" "names50x12 wordsoutoforder" "members1000 nearmiss"; do run 220 $T /home/user/review-fix1/fam.mts "$f"; done
for f in "tiny allmax prose" "tiny claims5000x40 prose" "tiny names50x40 prose"; do run 120 $T /home/user/review-fix1/fam.mts "$f"; done
unset BUDGET
for seed in 7 8 9; do run 236 $T /home/user/review-fix1/diff.mts $seed 1000; done
run 236 $T $R/diff2.mts 5 600
run 200 $T $R/e.mts slow
echo "### CHAIN DONE" >> $O
