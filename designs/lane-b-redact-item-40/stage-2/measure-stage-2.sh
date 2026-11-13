#!/bin/bash
# measure-stage-2.sh <root> [step ...]: everything stage 2 of Queues item 40 measures (W72), the base 17c234d2 against
# the checkout's reader AS IT IS (packages/redact/src/redact.ts and confusables.ts copied to <root>/head in the gate's
# layout; nothing in the checkout is written). Counts go to ./measure, large files to <root>. Steps, in order when
# none is named: lay every-base every gen40 gen34 units fuzz gate timing. Heavy steps run under the lane's lock.
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
mkdir -p "$1"; ROOT="$(cd "$1" && pwd)"; shift
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; M=$HERE/measure; S40=$HERE/../scripts
REPO=/home/user/PhysicalTherapy; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate; I34=/home/user/ops/designs/lane-b-redact-item-34
B=$ROOT/base/packages/model-gateway/src; H=$ROOT/head/packages/model-gateway/src; N="node --import $G/ts-resolve.mjs"
STEPS="${*:-lay every-base every gen40 gen34 units fuzz gate timing}"
for step in $STEPS; do case $step in
lay) mkdir -p "$B" "$H"
  for f in redact.ts confusables.ts; do git -C $REPO show "17c234d2:packages/redact/src/$f" > "$B/$f"; cp "$REPO/packages/redact/src/$f" "$H/$f"; done
  sha256sum "$B/redact.ts" "$H/redact.ts" > $M/trees.sha256 ;;
every-base) $N "$HERE/every.mts" $B $ROOT/every-base.detail > $M/every-identifier-base-17c234d2.out 2> $ROOT/every-base.err ;;
every) $N "$HERE/every.mts" $H $ROOT/every-head.detail > $M/every-identifier-head.out 2> $ROOT/every-head.err ;;
gen40) node "$S40/generated-set-40.mts" "$ROOT/corpus40" 40 > $M/generated-set-40.out; mkdir -p $ROOT/gen40
  (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 "$S40/generated-run-40.mts" $B $H "$ROOT/corpus40" "$ROOT/gen40" > "$ROOT/gen40.out" 2> "$ROOT/gen40.err"; echo "exit $?" >> "$ROOT/gen40.out")
  cp $ROOT/gen40/summary.json $M/generated-set-40-base-head.summary.json; tail -2 $ROOT/gen40.out > $M/generated-set-40-base-head.exit ;;
gen34) node $I34/scripts/generated-set.mts $ROOT/corpus34 34 > $M/generated-set-34.out; mkdir -p $ROOT/gen34
  (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 $I34/scripts/generated-run.mts $B $H $ROOT/corpus34 $ROOT/gen34 > $ROOT/gen34.out 2> $ROOT/gen34.err; echo "exit $?" >> $ROOT/gen34.out)
  cp $ROOT/gen34/summary.json $M/generated-set-34-base-head.summary.json; tail -2 $ROOT/gen34.out > $M/generated-set-34-base-head.exit ;;
units) for t in base:$B head:$H; do $N $I34/scripts/units.mts ${t##*:} > $M/units-${t%%:*}.out 2>&1; done ;;
fuzz) for s in 301 302 303; do (cd $G && node --import ./ts-resolve.mjs $I34/scripts/w58/fuzz.mts $B $H $ROOT/fuzz-$s.jsonl $s 20000 > $M/fuzz-$s.out 2>&1) & done; wait ;;
gate) $G/run.sh $ROOT/base $ROOT/head $ROOT/gate --workers 4 --no-cache > $ROOT/gate.out 2>&1; echo "exit $?" >> $ROOT/gate.out
  cp $ROOT/gate/report.md $M/gate-base-head.report.md 2>/dev/null; tail -3 $ROOT/gate.out > $M/gate-base-head.exit ;;
timing) for t in base:$B head:$H base2:$B head2:$H; do $N "$S40/timing.mts" ${t##*:} > $M/timing-${t%%:*}.out 2>&1; done ;;
esac; echo "$step done $(date -u +%H:%M:%S)" >> $ROOT/steps.done; done
