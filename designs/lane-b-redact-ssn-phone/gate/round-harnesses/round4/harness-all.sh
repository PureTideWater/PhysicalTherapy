#!/bin/bash
# Round-4 fixer: every harness against the live candidate (A = cc3dd7f6). Output: fix-4/out/final/
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
R=/tmp/claude-0/-home-user-PhysicalTherapy/b3c6553f-bf86-5901-9a05-bd89989a0ff9/scratchpad/rg-judge; F=$R/fix-4; O=$F/out/final; mkdir -p $O; : > $O/summary.txt
T=/home/user/rg-cand-b/node_modules/.bin/tsx; FR=$R/review-phi-4/frames4.json
cd $F/hp; echo "gap: $(flock /tmp/laneb-heavy.lock $T gap.mts $O/gap.jsonl 2>&1 | tail -1)" >> $O/summary.txt
for h in init2 short5 short4 own4 numid4; do echo "$h: $(flock /tmp/laneb-heavy.lock $T $h.mts $FR $O/$h.jsonl 2>&1 | tail -1)" >> $O/summary.txt; done
echo "heldmis: $(flock /tmp/laneb-heavy.lock $T heldmis.mts $O/heldmis.jsonl 2>&1 | tail -1)" >> $O/summary.txt
echo "perm: $(flock /tmp/laneb-heavy.lock $T perm.mts 2>&1 | grep -c 'cand: REFUSED') of 8 refused" >> $O/summary.txt
cd $F/hg; for h in natural4 natural5; do flock /tmp/laneb-heavy.lock $T $h.mts $O/$h.hits > $O/$h.out 2>&1; echo "$h: $(tail -1 $O/$h.out)" >> $O/summary.txt; done
cd $F/hs; for h in repro1 mod extra; do flock /tmp/laneb-heavy.lock $T $h.mts > $O/$h.out 2>&1; done
echo "repro1 same: $(grep -c '^same' $O/repro1.out) of $(grep -c '^same\|^B-ONLY\|^DIFF' $O/repro1.out)" >> $O/summary.txt
flock /tmp/laneb-heavy.lock $T dirty.mts $O/dirty.hits > $O/dirty.out 2>&1; echo "dirty: $(tail -1 $O/dirty.out)" >> $O/summary.txt
cd $F/h3; for h in units units2 extra natural2; do flock /tmp/laneb-heavy.lock $T $h.mts $O/r3-$h.hits > $O/r3-$h.out 2>&1; echo "r3-$h: $(tail -1 $O/r3-$h.out | cut -c1-160)" >> $O/summary.txt; done
cd $F/rows; flock /tmp/laneb-heavy.lock $T r4.mts > $O/r4.out 2>&1; echo "r4 rows: $(cut -f1 $O/r4.out | sort | uniq -c | tr '\n' ' ')" >> $O/summary.txt
echo HARNESS-DONE >> $O/summary.txt
