#!/bin/bash
# measure-stage-5b.sh (stage 5b, fix round 1: stage 5a's script with the middle tree "s3" read at 61600c7c, stage 5a's head, so the steps "changed" and "product" show what the fix round changes. Was: measure-stage-5a.sh (stage 5a: stage 4's script, the base read at 4d40557f, the merged base, whose redact.ts and confusables.ts are 17c234d2's byte for byte; a step "product" added for the product's fuzzer, run as stage 4 ran it by hand). Was: measure-stage-4.sh <root> [step ...]: everything stage 4 of Queues item 40 measures (W75; stage 3's script with a third tree and the steps for ruling (A) added): the base
# 17c234d2 against the checkout's reader AS IT IS (packages/redact/src/redact.ts and confusables.ts copied to
# <root>/head in the gate's layout; nothing in the checkout is written), and stage 3's reader (943be057, <root>/s3)
# against it where a step asks what THIS stage changed. Counts go to ./measure, large files to <root>. Steps, in order
# when none is named: lay gen40 gen34 units fuzz changed a4 gate timing. Heavy steps run under the lane's lock.
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
mkdir -p "$1"; ROOT="$(cd "$1" && pwd)"; shift
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; M=$HERE/measure; S40=$HERE/../scripts
REPO=/home/user/PhysicalTherapy; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate; I34=/home/user/ops/designs/lane-b-redact-item-34; I26=/home/user/ops/designs/lane-b-redact-item-26
B=$ROOT/base/packages/model-gateway/src; T=$ROOT/s3/packages/model-gateway/src; H=$ROOT/head/packages/model-gateway/src; N="node --import $G/ts-resolve.mjs"
STEPS="${*:-lay gen40 gen34 units fuzz changed product a4 gate timing}"
for step in $STEPS; do case $step in
lay) mkdir -p "$B" "$T" "$H"
  for f in redact.ts confusables.ts; do git -C $REPO show "4d40557f:packages/redact/src/$f" > "$B/$f"; git -C $REPO show "61600c7c:packages/redact/src/$f" > "$T/$f"; cp "$REPO/packages/redact/src/$f" "$H/$f"; done
  sha256sum "$B/redact.ts" "$T/redact.ts" "$H/redact.ts" > $M/trees.sha256 ;;
gen40) node "$S40/generated-set-40.mts" "$ROOT/corpus40" 40 > $M/generated-set-40.out; mkdir -p $ROOT/gen40
  (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 "$S40/generated-run-40.mts" $B $H "$ROOT/corpus40" "$ROOT/gen40" > "$ROOT/gen40.out" 2> "$ROOT/gen40.err"; echo "exit $?" >> "$ROOT/gen40.out")
  cp $ROOT/gen40/summary.json $M/generated-set-40-base-head.summary.json; tail -2 $ROOT/gen40.out > $M/generated-set-40-base-head.exit ;;
gen34) node $I34/scripts/generated-set.mts $ROOT/corpus34 34 > $M/generated-set-34.out; mkdir -p $ROOT/gen34
  (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 $I34/scripts/generated-run.mts $B $H $ROOT/corpus34 $ROOT/gen34 > $ROOT/gen34.out 2> $ROOT/gen34.err; echo "exit $?" >> $ROOT/gen34.out)
  cp $ROOT/gen34/summary.json $M/generated-set-34-base-head.summary.json; tail -2 $ROOT/gen34.out > $M/generated-set-34-base-head.exit ;;
units) for t in base:$B head:$H; do $N $I34/scripts/units.mts ${t##*:} > $M/units-${t%%:*}.out 2>&1; done ;;
fuzz) for s in 301 302 303; do (cd $G && node --import ./ts-resolve.mjs $I34/scripts/w58/fuzz.mts $B $H $ROOT/fuzz-$s.jsonl $s 20000 > $M/fuzz-$s.out 2>&1) & done; wait ;;
changed) for s in 301 302 303; do (cd $G && node --import ./ts-resolve.mjs "$HERE/fuzz-changed.mts" $T $H $M/fuzz-changed-$s.jsonl $s 20000 > $M/fuzz-changed-$s.out 2>&1) & done; wait ;;
product) (cd $G && node --import ./ts-resolve.mjs "$HERE/fuzz-product-changed.mts" $B $H $ROOT/fuzz-product-base-head.jsonl > $M/fuzz-product-base-head.out 2>&1) & (cd $G && node --import ./ts-resolve.mjs "$HERE/fuzz-product-changed.mts" $T $H $M/fuzz-product-changed-s3-head.jsonl > $M/fuzz-product-s3-head.out 2>&1) & wait ;;
a4) $N $I26/scripts/cost-names.mts $B/redact.ts $H/redact.ts > $M/a4-cost-base-head.out 2>&1; $N $I26/scripts/cost-names.mts $T/redact.ts $H/redact.ts > $M/a4-cost-s3-head.out 2>&1 ;;
gate) $G/run.sh $ROOT/base $ROOT/head $ROOT/gate --workers 4 --no-cache > $ROOT/gate.out 2>&1; echo "exit $?" >> $ROOT/gate.out
  cp $ROOT/gate/report.md $M/gate-base-head.report.md 2>/dev/null; tail -3 $ROOT/gate.out > $M/gate-base-head.exit ;;
timing) for t in base:$B head:$H base2:$B head2:$H; do $N "$S40/timing.mts" ${t##*:} > $M/timing-${t%%:*}.out 2>&1; done ;;
esac; echo "$step done $(date -u +%H:%M:%S)" >> $ROOT/steps.done; done
