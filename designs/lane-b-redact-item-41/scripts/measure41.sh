#!/bin/bash
# measure41.sh <root> [step ...]: everything Queues item 41 (b) measures, after lay41.sh <root>. Three pairs, each
# A against B: base/base-m (mending alone, on 4d40557f's reader), base/head-m (the bar: nothing the base redacts or
# refuses may be shown or sent), head/head-m (what mending changes on item 40, and which of its refusals it gives
# back). Steps: gen40 gate unseen residuals sweeps (PAIRS, UNSEEN_TREES, RESIDUAL_TREES choose trees; protos41.py lays
# head-s5, head-f, head-ph for the orchestrator's widening, and sweeps runs item 40's own sweeps on them). Item 40's scripts and the gate are run in place, unchanged. Counts go to
# ../measure; rows (synthetic) stay under <root>. Heavy steps run under the lane's lock.
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
ROOT="$(cd "$1" && pwd)"; shift; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; M=$HERE/../measure
I40=/home/user/ops/designs/lane-b-redact-item-40; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate
src() { echo $ROOT/$1/packages/model-gateway/src; }
PAIRS=${PAIRS:-"base:base-m base:head-m head:head-m"}
for step in ${*:-gen40 gate unseen residuals}; do case $step in
gen40) [ -f $ROOT/corpus40/manifest.json ] || node $I40/scripts/generated-set-40.mts $ROOT/corpus40 40 > $M/generated-set-40.out
  for p in $PAIRS; do a=${p%%:*}; b=${p#*:}; o=$ROOT/gen40-$a-$b; mkdir -p $o
    (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 $I40/scripts/generated-run-40.mts $(src $a) $(src $b) $ROOT/corpus40 $o > $o.out 2> $o.err; echo "exit $?" >> $o.out)
    cp $o/summary.json $M/generated-set-40-$a-$b.summary.json; tail -2 $o.out > $M/generated-set-40-$a-$b.exit; done ;;
gate) for p in $PAIRS; do a=${p%%:*}; b=${p#*:}; o=$ROOT/gate-$a-$b
    $G/run.sh $ROOT/$a $ROOT/$b $o --workers 4 --no-cache > $o.out 2>&1; echo "exit $?" >> $o.out
    cp $o/report.md $M/gate-$a-$b.report.md; tail -3 $o.out > $M/gate-$a-$b.exit; done ;;
unseen) for t in ${UNSEEN_TREES:-head head-m}; do (cd $G && node --import ./ts-resolve.mjs $I40/stage-3/every-unseen.mts $(src $t) $ROOT/unseen-$t.detail > $M/every-unseen-$t.out 2>&1); done ;;
residuals) for t in ${RESIDUAL_TREES:-head}; do (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 $HERE/residuals.mts $(src $t) $ROOT/corpus40 $G/corpus > $M/residuals-$t.out 2>&1); done ;;
sweeps) (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs $I40/stage-2/every.mts $(src head-ph) > $M/every-identifier-head-ph.out 2>&1)
  for t in head-f head-s5; do (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs $I40/stage-4/other-names.mts $(src $t) > $M/other-names-$t.out 2>&1); done ;;
esac; echo "$step done $(date -u +%H:%M:%S)" >> $ROOT/steps.done; done
