#!/bin/bash
# The battery's seeded generators on FRESH seeds (and the scripts whose trees the first layout lacked), head = the shim in /home/user/fix.
cd /home/user/work && export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"; O=/home/user/battery-out/fresh; mkdir -p $O
{ (cd /home/user/review-c1 && node repro.mts > $O/c1.out 2>&1); (cd /home/user/review-c2 && node repro.mts > $O/c2.out 2>&1)
  (cd b1fix && node fuzz1.mts 20000 90217 > $O/fuzz1.out 2>&1; tail -1 $O/fuzz1.out; node fuzz2.mts 20000 90233 > $O/fuzz2.out 2>&1; tail -1 $O/fuzz2.out; node fuzz3.mts 30000 90239 2 > $O/fuzz3.out 2>&1; tail -1 $O/fuzz3.out)
  (cd c1fix && node fz2.mts 150 90247 > $O/fz2.out 2>&1; head -3 $O/fz2.out; node withheld.mts 120 90263 2>&1 | head -3)
  (cd /home/user/review-d1/d1 && node fz.mts 120 90271 > $O/fz.out 2>&1; grep -v '^{"k"' $O/fz.out | tail -1; node fz3.mts 120 90281 letter > $O/fz3.out 2>&1; grep -v '^{"k"' $O/fz3.out | tail -1)
  (cd /home/user/review-h1 && node gen.mts 100 90289 > $O/h1-gen.out 2>&1; grep "^## gen" $O/h1-gen.out | cut -c1-200; node enum.mts 100 > $O/h1-enum.out 2>&1; tail -2 $O/h1-enum.out | cut -c1-200)
  (cd /home/user/review-g1 && node gen.mts 2000 90313 > $O/g1gen.out 2>&1; tail -4 $O/g1gen.out | cut -c1-300)
  (cd /home/user/review-j && node fuzz.mts 90323 8000 120 > $O/j-fuzz.out 2>&1; tail -6 $O/j-fuzz.out | cut -c1-260; node fuzz3.mts 90331 10000 > $O/j-fuzz3.out 2>&1; tail -4 $O/j-fuzz3.out | cut -c1-260)
  (cd /home/user/review-k && for part in A H1 B C; do node gen.mts $part 90347 > $O/k-gen-$part.out 2>&1; tail -2 $O/k-gen-$part.out | cut -c1-260; done)
  (cd d2p6 && node fuzz-letters.mts 12000 90353 > $O/fl.out 2>&1; grep -vE '^\s*$' $O/fl.out | head -4 | cut -c1-200)
  node stress16.mts /home/user/fix/packages/model-gateway/src/redact.ts prop-head.mts 20000 90359 > $O/stress.out 2>&1; grep "^MOD-16 runs" $O/stress.out
  (cd /home/user/review-g2 && node c.mts 90371 > $O/g2c.out 2>&1; grep -c RATE $O/g2c.out)
  echo "fresh done $(date -u +%H:%M:%S)"; } > $O/all.out 2>&1
