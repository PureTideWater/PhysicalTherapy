#!/bin/bash
# after-stage-5a.sh <scratch>: stage 4's after-stage-4.sh, counts to stage-5a/measure, the base read at 4d40557f. On a quiet machine, after measure-stage-5a.sh (W75; stage 3's script, with the suites added).
# The 100-letter property (denial-letter.test.ts, 'leaves no identifier in any letter'), six runs on the base's reader
# (17c234d2, written over the checkout's file and put back) and three on the head's, one after another; then the unit
# suites of redact, packets, synth and model-gateway on the head, each to a file under <scratch>, counts to ./measure.
export PATH=/opt/node24/bin:$PATH
S=$1; M=/home/user/ops/designs/lane-b-redact-item-40/stage-5a/measure
cd /home/user/PhysicalTherapy
: > $M/property-100-letters.out
for tree in base head base head base head base head base head base head; do
  if [ $tree = base ]; then git show 4d40557f:packages/redact/src/redact.ts > packages/redact/src/redact.ts; else git checkout -q packages/redact/src/redact.ts; fi
  (cd packages/model-gateway && npx vitest run src/functions/denial-letter.test.ts -t 'leaves no identifier in any letter' --reporter=verbose 2>&1 | grep -a -E 'leaves no identifier' | sed "s/^/$tree: /" >> $M/property-100-letters.out)
done
git checkout -q packages/redact/src/redact.ts; git status --short > $S/after-status.out
: > $M/unit-suites.out
for p in redact packets synth model-gateway; do
  (cd packages/$p && npx vitest run > $S/suite-$p.out 2>&1; echo "exit $?" >> $S/suite-$p.out)
  echo "== $p" >> $M/unit-suites.out; grep -a -E '^ *(Test Files|Tests) |^exit ' $S/suite-$p.out >> $M/unit-suites.out
done
echo done > $S/after.done
