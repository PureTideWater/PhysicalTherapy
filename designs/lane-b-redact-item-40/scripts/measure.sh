#!/bin/bash
# measure.sh <root>: everything Queues item 40's design note measures, in one command, after lay.sh <root>.
# Output goes to ../measure (counts) and <root> (large files). Runs the heavy parts under the lane's lock.
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
ROOT="$(cd "$1" && pwd)"; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; M=$HERE/../measure
G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate; G34=/home/user/ops/designs/lane-b-redact-item-34/scripts
B=$ROOT/base/packages/model-gateway/src; P=$ROOT/proto/packages/model-gateway/src; N="node --import $G/ts-resolve.mjs"
cd "$ROOT"
$N "$HERE/probe.mts" $B $ROOT/probe-base.detail > $M/probe-base-17c234d2.out 2> $ROOT/probe-base.err &
$N "$HERE/probe.mts" $P $ROOT/probe-proto.detail > $M/probe-proto.out 2> $ROOT/probe-proto.err &
$N "$HERE/census.mts" > $M/census.out 2> $ROOT/census.err &
wait
for t in base:$B proto:$P; do $N $G34/units.mts ${t##*:} > $M/units-${t%%:*}.out 2>&1; done
$N "$HERE/fuzz.mts" $B $P > $M/fuzz-base-proto.out 2> $ROOT/fuzz.err
node $G34/generated-set.mts $ROOT/corpus34 34 > /dev/null; mkdir -p $ROOT/gen34
(cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 $G34/generated-run.mts $B $P $ROOT/corpus34 $ROOT/gen34 > $ROOT/gen34.out 2> $ROOT/gen34.err; echo "exit $?" >> $ROOT/gen34.out)
cp $ROOT/gen34/summary.json $M/generated-set-34-base-proto.summary.json 2>/dev/null
$G/run.sh $ROOT/base $ROOT/proto $ROOT/gate --workers 4 --no-cache > $ROOT/gate.out 2>&1; echo "exit $?" >> $ROOT/gate.out
cp $ROOT/gate/report.md $M/gate-base-proto.report.md 2>/dev/null
for t in base:$B proto:$P base2:$B proto2:$P; do $N "$HERE/timing.mts" ${t##*:} > $M/timing-${t%%:*}.out 2>&1; done
echo done > $ROOT/measure.done
