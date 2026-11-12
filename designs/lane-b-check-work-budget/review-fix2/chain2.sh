#!/bin/bash
# One process at a time. Synthetic data only.
cd /home/user/PhysicalTherapy || exit 1
export PATH=/opt/node24/bin:$PATH
T=node_modules/.bin/tsx; R=/home/user/review-fix2; O=$R/out/chain2.log
run() { local limit=$1; shift; echo "### $*" >> $O; local s=$SECONDS; timeout "$limit" "$@" >> $O 2>&1; local rc=$?; echo "### exit $rc after $((SECONDS - s)) s" >> $O; }
run 236 $T /home/user/review-fix1/diff.mts 7 250
run 236 $T $R/diff2.mts 5 200
for seed in 8 9 10 11; do run 236 $T /home/user/review-fix1/diff.mts $seed 250; done
run 236 $T $R/diff2.mts 6 200
run 200 $T $R/e.mts slow
echo "### CHAIN DONE" >> $O
