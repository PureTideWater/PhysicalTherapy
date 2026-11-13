#!/bin/bash
# Item 40's windowed re-read against item 40's head: item 40's generated set (seed 40) and the full gate, head as tree A
# (the whole re-read: the oracle) and headwin as tree B. A PHI class counted is a value the head hides or refuses and the
# windows send in clear. Usage: run.sh <root laid out by lay.mts>. Heavy steps take the lane's lock (inside run.sh/flock).
set -u
ROOT="$1"; D="$(cd "$(dirname "$0")/.." && pwd)"; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate; S40=/home/user/ops/designs/lane-b-redact-item-40/scripts
export PATH=/opt/node24/bin:$PATH
node --no-warnings "$S40/generated-set-40.mts" "$ROOT/corpus40" 40 > "$D/out/item40-generated-set.out" 2>&1
(cd $G && flock /tmp/laneb-heavy.lock node --no-warnings --import ./ts-resolve.mjs --max-old-space-size=6000 "$S40/generated-run-40.mts" "$ROOT/head" "$ROOT/headwin" "$ROOT/corpus40" "$ROOT/gen40" > "$ROOT/gen40.out" 2> "$ROOT/gen40.err"; echo "exit $?" >> "$ROOT/gen40.out")
cp "$ROOT/gen40/summary.json" "$D/out/item40-generated-run.summary.json"; tail -3 "$ROOT/gen40.out" > "$D/out/item40-generated-run.exit"
$G/run.sh "$ROOT/head" "$ROOT/headwin" "$ROOT/gate" --workers 4 --no-cache > "$ROOT/gate.out" 2>&1; echo "exit $?" >> "$ROOT/gate.out"
cp "$ROOT/gate/report.md" "$D/out/item40-gate-head-headwin.report.md"; tail -3 "$ROOT/gate.out" > "$D/out/item40-gate.exit"
