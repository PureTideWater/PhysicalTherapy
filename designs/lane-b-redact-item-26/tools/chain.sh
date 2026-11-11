#!/bin/bash
# The gate (A = f3f5a642, B = the head), then the battery four times in parallel: head and base-as-head, recorded and fresh seeds.
cd /home/user/gate && bash run.sh /home/user/snapA /home/user/snapB /home/user/gate-out/i26-2 --workers 4 > /home/user/gate-out/i26-2/run.log 2>&1; echo "exit=$?" >> /home/user/gate-out/i26-2/run.log
date -u +"gate done %H:%M:%S" >> /home/user/bt/chain.log
for r in hr rr; do (O=/home/user/bt/$r/out PREV=/home/user/bt/$r/none bash /home/user/bt/$r/work/battery.sh > /home/user/bt/$r/battery.log 2>&1; echo "exit=$?" >> /home/user/bt/$r/battery.log) & done
for r in hf rf; do (O=/home/user/bt/$r/out PREV=/home/user/bt/$r/none bash /home/user/bt/$r/work/battery-fresh.sh > /home/user/bt/$r/battery.log 2>&1; echo "exit=$?" >> /home/user/bt/$r/battery.log) & done
wait
date -u +"batteries done %H:%M:%S" >> /home/user/bt/chain.log
