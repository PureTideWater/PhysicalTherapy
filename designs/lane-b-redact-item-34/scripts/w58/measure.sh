#!/bin/bash
# Every measure of the head 483ac960 against a97d73e4, each to a file.
S=/tmp/claude-0/-home-user-PhysicalTherapy/f344a4ea-3385-5c28-91fb-5af3309c1929/scratchpad; O=$S/out; REPO=/home/user/PhysicalTherapy; H=17028cfa
export PATH=/opt/node24/bin:$PATH
OPS=/home/user/ops/designs; GATE=$OPS/lane-b-redact-ssn-phone/gate; I=$OPS/lane-b-redact-item-34
T=$S/trees-$H; for t in base:a97d73e4 head:$H; do n=${t%%:*}; c=${t##*:}; d=$T/$n/packages/model-gateway/src; mkdir -p $d; for f in redact.ts confusables.ts; do git -C $REPO show $c:packages/redact/src/$f > $d/$f; done; done
A=$T/base/packages/model-gateway/src; B=$T/head/packages/model-gateway/src
date > $O/start; (cd $GATE && for t in $A $B; do node --import ./ts-resolve.mjs $I/scripts/units.mts $t; done > $O/units-$H.out 2>&1)
bash $I/scripts/generated.sh $S/gen-$H a97d73e4 $H > $O/generated-$H.out 2>&1; echo "exit $?" >> $O/generated-$H.out
(cd $GATE && bash run.sh $A $B $S/gate-$H --workers 4 --no-cache > $O/gate-$H.out 2>&1; echo "exit $?" >> $O/gate-$H.out)
(cd $GATE && node --import ./ts-resolve.mjs --max-old-space-size=6000 $I/scripts/differ.mts $A $B $GATE/corpus $O/differ-$H.jsonl 2 > $O/differ-shard2-$H.out 2>&1; echo "exit $?" >> $O/differ-shard2-$H.out)
for side in rr:base hr:head; do d=${side%%:*}; t=${side##*:}
  bash $OPS/lane-b-redact-item-26/tools/lay.sh /home/user/bt/$d $T/$t/packages/model-gateway/src > $O/lay-$d.out 2>&1; echo "lay exit $?" >> $O/lay-$d.out
  (cd /home/user/bt/$d/work && O=/home/user/bt/$d/work/pr PREV=/home/user/bt/rr/work/pr bash battery.sh > $O/battery-$d-r.stdout 2>&1) &
  (cd /home/user/bt/$d/work && O=/home/user/bt/$d/work/pf PREV=/home/user/bt/rr/work/pf bash battery-fresh.sh > $O/battery-$d-f.stdout 2>&1) &
  wait
  cp /home/user/bt/$d/work/pr/fuzz-all.out $O/battery-${d}-recorded-$H.out; cp /home/user/bt/$d/work/pf/fuzz-all.out $O/battery-${d}-fresh-$H.out
done
echo ALL DONE > $O/measure-$H.done
