#!/bin/bash
# The 100-letter property (denial-letter.test.ts, 'leaves no identifier in any letter'), three runs on the base's reader
# and three on the head's, one after another on a quiet machine, and then three of a 100-letter set in which every
# letter holds an unseen character (the same property's letters with U+0085 after each: the check twice).
export PATH=/opt/node24/bin:$PATH
S=/tmp/claude-0/-home-user-PhysicalTherapy/3b20d968-e1eb-5124-8ada-e8b86b077fc0/scratchpad/w74; M=/home/user/ops/designs/lane-b-redact-item-40/stage-3/measure
until [ -f $S/measured.done ]; do sleep 10; done
cd /home/user/PhysicalTherapy
: > $M/property-100-letters.out
for tree in base head base head base head; do
  if [ $tree = base ]; then git show 17c234d2:packages/redact/src/redact.ts > packages/redact/src/redact.ts; else git checkout -q packages/redact/src/redact.ts; fi
  (cd packages/model-gateway && npx vitest run src/functions/denial-letter.test.ts -t 'leaves no identifier in any letter' --reporter=verbose 2>&1 | grep -a -E 'leaves no identifier' | sed "s/^/$tree: /" >> $M/property-100-letters.out)
done
git checkout -q packages/redact/src/redact.ts; git status --short > $S/after-status.out
echo done > $S/after.done
