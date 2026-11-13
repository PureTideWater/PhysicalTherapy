#!/bin/bash
# The timing battery: every variant over W25's rows and the growth rows, each row in a fresh process (call 1 cold, then
# warm). Runs alone on the machine (after the gate), under the lane's heavy lock. Usage: battery.sh [variants...]
set -u
D="$(cd "$(dirname "$0")" && pwd)"; OUT="$D/out/battery.txt"
cd /home/user/PhysicalTherapy
ROWS="300:15:one:tiny 1000:9:one:tiny 1250:40:one:tiny 2000:9:one:tiny 4000:9:one:tiny 6300:9:one:tiny 9400:6:one:tiny 14000:4:one:tiny 18500:3:one:tiny 1000:9:across:tiny 3000:9:one:prose 7000:4:one:prose 1000:9:one:listed 6300:9:one:listed"
for v in ${*:-base viewmap cache ac aclazy acproc acnokeep}; do
  for r in $ROWS; do
    IFS=: read -r k len shape letter <<< "$r"
    calls=5; [ "$v" = base ] || [ "$v" = viewmap ] || [ "$v" = cache ] && [ "$k" -ge 6300 ] && calls=3
    VARIANT=$v CALLS=$calls flock /tmp/laneb-heavy.lock timeout 900 /opt/node24/bin/node --no-warnings "$D/run.mts" "$k" "$len" "$shape" "$letter" >> "$OUT" 2>&1 || echo "$v $r FAILED $?" >> "$OUT"
  done
done
echo "battery done $(date -u +%H:%M:%S)" >> "$OUT"
