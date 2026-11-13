#!/bin/bash
# lay.sh <root> [commit]: lays the base's reader (packages/redact/src/redact.ts and confusables.ts of the commit,
# default 17c234d2) in the gate's layout under <root>/base, and a copy under <root>/proto with proto.mjs run over it
# (a measuring prototype only, outside packages/; nothing in the checkout is written). Queues item 40.
set -euo pipefail
ROOT=$1; BASE=${2:-17c234d2}; REPO=/home/user/PhysicalTherapy
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for n in base proto; do d=$ROOT/$n/packages/model-gateway/src; mkdir -p "$d"
  for f in redact.ts confusables.ts; do git -C $REPO show "$BASE:packages/redact/src/$f" > "$d/$f"; done; done
node "$HERE/proto.mjs" "$ROOT/proto/packages/model-gateway/src/redact.ts"
sha256sum "$ROOT"/base/packages/model-gateway/src/redact.ts "$ROOT"/proto/packages/model-gateway/src/redact.ts
