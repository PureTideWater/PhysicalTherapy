#!/bin/bash
# The battery as it ran on 74c32149 (2026-11-11 15:38 to 16:12 UTC), then the gate on both base trees (to 16:27 UTC).
# It expects the container layout README.md beside this file describes (scratch trees, reviewers' folders, /home/user/work).
# Give fresh seeds on each run: the ones below are the ones already used on 74c32149.
# Output: $O/fuzz-all.out (one summary line per script) and one file per script. Run it with NO lock around it: the gate's
# run.sh takes /tmp/laneb-heavy.lock itself.
cd /home/user/work && export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"; O=${O:-/home/user/work/p17}; PREV=${PREV:-/home/user/work/p16}; SNAP=${SNAP:-/home/user/snap17}; mkdir -p $O /home/user/gate-out/$(basename $O)-ef3 /home/user/gate-out/$(basename $O)-cc3
{ echo "== rows (the head is /home/user/fix)"; node rows.mts /home/user/fix/packages/model-gateway/src/redact.ts 2>&1 | tail -5 | head -3
  echo "== the reviews' reproduction scripts: lines that differ from the run before"
  (cd b1fix && node repro.mts > $O/b1.out 2>&1); (cd b2fix && node repro.mts > $O/b2.out 2>&1); (cd /home/user/review-c1 && node repro.mts > $O/c1.out 2>&1); (cd /home/user/review-c2 && node repro.mts > $O/c2.out 2>&1); (cd /home/user/review-d1/d1 && node probe4.mts > $O/d1p4.out 2>&1)
  for n in b1 b2 c1 c2 d1p4; do echo "$n: $(diff $PREV/$n.out $O/$n.out | grep -c '^>') lines differ"; done
  (cd d2fix && node probe1.mts > $O/d2-probe1.out 2>&1; grep -h "^## " $O/d2-probe1.out | cut -c1-150)
  echo "== PHI fuzzers (flips = the base refused, the head sent; expect 0 but the month-named patient M's, ruling B)"
  (cd b1fix && node fuzz1.mts 20000 53 > $O/fuzz1-53.out 2>&1; tail -1 $O/fuzz1-53.out; node fuzz2.mts 20000 59 > $O/fuzz2-59.out 2>&1; tail -1 $O/fuzz2-59.out; node fuzz1.mts 20000 227 > $O/fuzz1-227.out 2>&1; tail -1 $O/fuzz1-227.out; node fuzz2.mts 20000 229 > $O/fuzz2-229.out 2>&1; tail -1 $O/fuzz2-229.out; node fuzz3.mts 30000 61 2>&1 | tail -2)
  (cd c1fix && node fz2.mts 150 233 > $O/fz2-233.out 2>&1; head -3 $O/fz2-233.out; node withheld.mts 120 239 2>&1 | head -3)
  # fz.mts seed 5923 is the run that found the withheld letter (SENT_WITHHELD 1, SHOWS 1): keep it, and add a fresh seed.
  (cd /home/user/review-d1/d1 && node fz.mts 120 5923 > $O/fz-5923.out 2>&1; grep -v '^{"k"' $O/fz-5923.out | tail -1; node fz.mts 120 6131 > $O/fz-6131.out 2>&1; grep -v '^{"k"' $O/fz-6131.out | tail -1; node fz3.mts 120 6143 letter > $O/fz3-6143.out 2>&1; grep -v '^{"k"' $O/fz3-6143.out | tail -1)
  echo "== the audit variant: DEPART lines (expect 0)"
  (cd /home/user/work/p12/fza/b1fix && node fuzz1.mts 20000 241 > $O/audit-fuzz1.out 2> $O/audit-fuzz1.err; node fuzz2.mts 20000 251 > $O/audit-fuzz2.out 2> $O/audit-fuzz2.err; cd ../c1fix && node fz2.mts 120 257 > $O/audit-fz2.out 2> $O/audit-fz2.err; cd ../d2p6 && node fuzz-letters.mts 12000 31 > $O/audit-fl.out 2> $O/audit-fl.err); echo "DEPART: $(cat $O/audit-*.err | grep -c '^DEPART')"
  echo "== the PHI reviews' generators (head against their before and base; expect base flags 0)"
  (cd /home/user/review-h1 && node fam.mts 28 i ii iii iv > $O/h1-fam.out 2>&1; grep -c "vsBefore" $O/h1-fam.out; NOMARKS=1 node gen.mts 100 79 > $O/h1-gen-nomarks.out 2>&1; grep "^## gen" $O/h1-gen-nomarks.out | cut -c1-200; node gen.mts 60 83 > $O/h1-gen-marks.out 2>&1; grep "^## gen" $O/h1-gen-marks.out | cut -c1-200; node enum.mts 100 > $O/h1-enum.out 2>&1; grep "^## enum" $O/h1-enum.out | cut -c1-200; node tight.mts 90 13 > $O/h1-tight.out 2>&1; grep "^## tight" $O/h1-tight.out | cut -c1-200)
  (cd /home/user/review-i1 && node fam.mts > $O/i1-fam.out 2>&1; tail -4 $O/i1-fam.out | cut -c1-300; node ivshapes.mts > $O/i1-ivshapes.out 2>&1; tail -2 $O/i1-ivshapes.out | cut -c1-300; node marks.mts > $O/i1-marks.out 2>&1; tail -2 $O/i1-marks.out | cut -c1-300)
  (cd /home/user/review-g1 && node gen.mts 2000 7127 > $O/g1gen-7127.out 2>&1; tail -4 $O/g1gen-7127.out | cut -c1-300)
  echo "== reviewer J's and K's generators"
  (cd /home/user/review-j && node fuzz.mts 41 8000 120 > $O/j-fuzz.out 2>&1; tail -14 $O/j-fuzz.out | cut -c1-260; node fuzz3.mts 43 10000 > $O/j-fuzz3.out 2>&1; tail -8 $O/j-fuzz3.out | cut -c1-260; node probe.mts > $O/j-probe.out 2>&1; grep -c "BASE-" $O/j-probe.out; node time.mts > $O/j-time.out 2>&1; tail -14 $O/j-time.out | cut -c1-220)
  (cd /home/user/review-k && for part in A H1 B C; do node gen.mts $part 7 > $O/k-gen-$part.out 2>&1; tail -3 $O/k-gen-$part.out | cut -c1-260; done; node edge.mts > $O/k-edge.out 2>&1; tail -6 $O/k-edge.out | cut -c1-260)
  echo "== must-stay"
  (cd d2p6 && node fuzz-letters.mts 12000 11 > $O/fl.out 2>&1; grep -vE '^\s*$' $O/fl.out | head -4 | cut -c1-200)
  node stress16.mts /home/user/fix/packages/model-gateway/src/redact.ts prop-head.mts 20000 42 > $O/stress42.out 2>&1; grep "^MOD-16 runs" $O/stress42.out
  (cd /home/user/review-g2 && node c.mts 12 > $O/g2c-12.out 2>&1; grep "RATE" $O/g2c-12.out | grep -v "head refuses/changes 0 \|head refuses 0," | cut -c1-200)
  (cd /home/user/review-h2 && TREES=head,before,base node m.mts layouts > $O/h2-m-layouts.out 2>&1; grep "^## " $O/h2-m-layouts.out | cut -c1-220 | head -30; TREES=head,before,base node s.mts > $O/h2-s.out 2>&1; grep "^## " $O/h2-s.out | cut -c1-220 | head -12)
  (cd /home/user/review-i2 && node main.mts layouts > $O/i2-layouts.out 2>&1; grep "^## " $O/i2-layouts.out | cut -c1-220 | head -40; node forms.mts > $O/i2-forms.out 2>&1; tail -6 $O/i2-forms.out | cut -c1-220; node a1.mts > $O/i2-a1.out 2>&1; tail -6 $O/i2-a1.out | cut -c1-220; node time.mts > $O/i2-time.out 2>&1; tail -12 $O/i2-time.out | cut -c1-200)
  echo "== the new property, every letter of its space (expect leftAsWrittenAndSent 0, baseRefusedHeadSent 0, headShowsWhatBaseHides 0)"; (cd /home/user/work/w13 && node enum.mts > $O/enum.out 2>&1; head -1 $O/enum.out | cut -c1-400)
  echo "battery done $(date -u +%H:%M:%S)"; } > $O/fuzz-all.out 2>&1
# The gate: tree A = ef3e8d20 (nothing it protects may be sent), then tree A = cc3dd7f6 (the acceptance: SSN 0, phone 0).
G=/home/user/gate-out/$(basename $O)
cd /home/user/gate && bash run.sh /home/user/tree-ef3 $SNAP $G-ef3 --workers 4 --skip-timing > $G-ef3/run.log 2>&1; echo "exit=$?" >> $G-ef3/run.log
bash run.sh /home/user/tree-cc3 $SNAP $G-cc3 --workers 4 > $G-cc3/run.log 2>&1; echo "exit=$?" >> $G-cc3/run.log
for d in $G-ef3 $G-cc3; do echo "== $d"; tail -n 1 $d/run.log | cut -c1-100; grep -nE '^(### )|^none|^max A' $d/report.md | cut -c1-140; done
# Replay each class against the last run (letter for letter): node /home/user/work/revdiff.mjs <old out dir> <new out dir> <class> [show]
