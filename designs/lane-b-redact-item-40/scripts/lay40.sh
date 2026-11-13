#!/bin/bash
# lay40.sh <root>: stage 1's four trees, outside packages/ (nothing in the checkout is written): lay.sh's base and proto
# (P1, P2, P3), then proto-i (proto and P4, ruling 3) and proto-ii (the same with R1-4's fallback (ii) in place of P2).
set -euo pipefail
ROOT=$1; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; export PATH=/opt/node24/bin:$PATH
"$HERE/lay.sh" "$ROOT"
for n in proto-i proto-ii; do mkdir -p "$ROOT/$n"; rm -rf "$ROOT/$n/packages"; cp -r "$ROOT/proto/packages" "$ROOT/$n/"; done
node "$HERE/proto-r3.mjs" "$ROOT/proto-i/packages/model-gateway/src/redact.ts"
node "$HERE/proto-r3.mjs" "$ROOT/proto-ii/packages/model-gateway/src/redact.ts" --ii
sha256sum "$ROOT"/proto-i*/packages/model-gateway/src/redact.ts
