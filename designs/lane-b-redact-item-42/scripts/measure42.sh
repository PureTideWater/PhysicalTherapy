#!/bin/bash
# measure42.sh <root> [step ...]: everything Queues item 42's design note measures, after lay42.sh <root>. Synthetic
# data only. Counts go to ../measure; rows (synthetic) and large files stay under <root>. Item 40's generated-run and
# the gate are run in place, unchanged. Steps:
#   gen42    the generated set (generated-set-42.mts) into <root>/corpus42
#   census   census42.mts on the base's reader over set 42, set 40 and the gate's 975,489 letters (four processes)
#   false    false-finds42.mts: numbers a real-shaped letter's digits spell; name words in ordinary text
#   run42    set 42 through the gate's worker, base against each tree in TREES (what the base sends, what each closes)
#   gate     the gate, base against each tree in GATE_TREES (the bar: no PHI class; refusals; the slowest letter)
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
ROOT="$(cd "$1" && pwd)"; shift; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; M=$HERE/../measure
I40=/home/user/ops/designs/lane-b-redact-item-40; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate
src() { echo $ROOT/$1/packages/model-gateway/src; }
N="node --import ./ts-resolve.mjs"
TREES=${TREES:-"r1 r2 p1 p2 gc gcr ga"}; GATE_TREES=${GATE_TREES:-"R P"}
for step in ${*:-gen42 census false run42 gate}; do case $step in
gen42) node $HERE/generated-set-42.mts $ROOT/corpus42 42 > $M/generated-set-42.out; cp $ROOT/corpus42/manifest.json $M/generated-set-42.manifest.json ;;
census) [ -f $ROOT/corpus40/manifest.json ] || node $I40/scripts/generated-set-40.mts $ROOT/corpus40 40 > /dev/null
  (cd $G && $N $HERE/census42.mts $(src base) $ROOT/corpus42 $ROOT/census-g42 > $ROOT/census-g42.out 2>&1 &
   $N $HERE/census42.mts $(src base) $ROOT/corpus40 $ROOT/census-g40 > $ROOT/census-g40.out 2>&1 &
   for s in 0,1 2,3 4,5 6,7; do $N $HERE/census42.mts $(src base) ./corpus $ROOT/census-gate-${s/,/} $s > $ROOT/census-gate-${s/,/}.out 2>&1 & done; wait)
  node $HERE/summarize42.mjs "The gate's 975,489 letters" $ROOT/samples-gate.jsonl $ROOT/census-gate-01 $ROOT/census-gate-23 $ROOT/census-gate-45 $ROOT/census-gate-67 > $M/census-gate.md
  node $HERE/summarize42.mjs "Generated set 40" $ROOT/samples-g40.jsonl $ROOT/census-g40 > $M/census-g40.md
  node $HERE/summarize42.mjs "Generated set 42" $ROOT/samples-g42.jsonl $ROOT/census-g42 > $M/census-g42.md ;;
false) (cd $G && $N $HERE/false-finds42.mts $(src base) /home/user/PhysicalTherapy/docs > $M/false-finds.md 2> $ROOT/false-finds.err) ;;
run42) for b in $TREES; do o=$ROOT/gen42-base-$b; mkdir -p $o
    (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 $I40/scripts/generated-run-40.mts $(src base) $(src $b) $ROOT/corpus42 $o > $o.out 2> $o.err; echo "exit $?" >> $o.out)
    tail -2 $o.out > $M/generated-set-42-base-$b.exit; done
  node $HERE/summarize-run42.mjs $ROOT $TREES > $M/generated-set-42.counts.md ;;
gate) for b in $GATE_TREES; do o=$ROOT/gate-base-$b
    $G/run.sh $ROOT/base $ROOT/$b $o --workers 4 --no-cache > $o.out 2>&1; echo "exit $?" >> $o.out
    cp $o/report.md $M/gate-base-$b.report.md; tail -3 $o.out > $M/gate-base-$b.exit; done ;;
esac; echo "$step done $(date -u +%H:%M:%S)" >> $ROOT/steps.done; done
