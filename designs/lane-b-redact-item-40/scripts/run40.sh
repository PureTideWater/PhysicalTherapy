#!/bin/bash
# run40.sh <root>: after lay40.sh <root>, builds item 40's generated set and runs it through the gate's worker, the
# base against proto-i (P1, P2, P3, P4) and against proto-ii (R1-4's fallback), under the lane's lock. Counts go to
# ../measure/generated-set-40-<tree>.summary.json; rows to <root>/gen40-<tree>/ (newly-refused.jsonl, failures.jsonl).
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
ROOT="$(cd "$1" && pwd)"; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; M=$HERE/../measure
G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate; B=$ROOT/base/packages/model-gateway/src
node "$HERE/generated-set-40.mts" "$ROOT/corpus40" 40 | tee "$M/generated-set-40.out"
cp "$ROOT/corpus40/manifest.json" "$M/generated-set-40.manifest.json"
for t in proto-i proto-ii; do mkdir -p "$ROOT/gen40-$t"
  (cd $G && flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 "$HERE/generated-run-40.mts" $B "$ROOT/$t/packages/model-gateway/src" "$ROOT/corpus40" "$ROOT/gen40-$t" > "$ROOT/gen40-$t.out" 2> "$ROOT/gen40-$t.err"; echo "exit $?" >> "$ROOT/gen40-$t.out")
  cp "$ROOT/gen40-$t/summary.json" "$M/generated-set-40-base-$t.summary.json" 2>/dev/null; tail -2 "$ROOT/gen40-$t.out"
done
