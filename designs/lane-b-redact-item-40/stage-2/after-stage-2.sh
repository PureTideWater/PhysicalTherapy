#!/bin/bash
# The 100-letter property (denial-letter.test.ts, 'leaves no identifier in any letter'), three runs on the base's reader
# and three on the head's, one after another on a quiet machine; then the four unit suites on the head.
export PATH=/opt/node24/bin:$PATH
S=/tmp/claude-0/-home-user-PhysicalTherapy/e1774162-c3fc-50b9-a705-dbe1d88abf32/scratchpad/w72; M=/home/user/ops/designs/lane-b-redact-item-40/stage-2/measure
until grep -q '^timing done' $S/root/steps.done; do sleep 5; done
cd /home/user/PhysicalTherapy
: > $M/property-100-letters.out
for tree in base head base head base head; do
  if [ $tree = base ]; then git show 17c234d2:packages/redact/src/redact.ts > packages/redact/src/redact.ts; else git checkout -q packages/redact/src/redact.ts; fi
  (cd packages/model-gateway && npx vitest run src/functions/denial-letter.test.ts -t 'leaves no identifier in any letter' --reporter=verbose 2>&1 | grep -a -E 'leaves no identifier' | sed "s/^/$tree: /" >> $M/property-100-letters.out)
done
git checkout -q packages/redact/src/redact.ts; git status --short > $S/after-status.out
for p in redact packets synth model-gateway; do (cd packages/$p && npx vitest run > $S/unit-$p.out 2>&1; echo "$p exit $?" >> $S/units.exit); done
echo done > $S/after.done
