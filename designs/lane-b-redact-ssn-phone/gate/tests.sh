#!/bin/bash
# Runs a tree's three redaction test files (MOD-13/14/15/16, LABEL_BOUNDARY_SEED, the timing rows) in a scratch mirror,
# then the property file under each MOD-16 CI seed as fast-check's global seed. Never writes in the tree.
# Usage: tests.sh <tree root or packages/model-gateway dir> <outdir>
set -uo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
GATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(cd "$1" && pwd)"; [ -d "$T/packages/model-gateway" ] && T="$T/packages/model-gateway"
OUT="$2"; mkdir -p "$OUT"
SHA=$(sha256sum "$T/src/redact.ts" | cut -c1-12)
M="$GATE/trees/mirror-$SHA"
if [ ! -d "$M/packages/model-gateway/src" ]; then
  mkdir -p "$M/packages/model-gateway"
  ln -sfn /home/user/redact-range-glued/node_modules "$M/node_modules"
  cp /home/user/redact-range-glued/tsconfig.base.json "$M/tsconfig.base.json"
  for d in src config eval prompts test-fixtures package.json tsconfig.json; do [ -e "$T/$d" ] && cp -r "$T/$d" "$M/packages/model-gateway/"; done
  ln -sfn /home/user/redact-range-glued/packages/model-gateway/node_modules "$M/packages/model-gateway/node_modules"
  printf "import fc from 'fast-check';\nconst seed = Number(process.env.FC_SEED ?? '0');\nif (seed !== 0) fc.configureGlobal({ seed });\n" > "$M/packages/model-gateway/fc-seed.setup.ts"
  echo "export default { cacheDir: '$M/.vite', test: { include: ['src/**/*.test.ts'], testTimeout: 600000, setupFiles: ['./fc-seed.setup.ts'] } };" > "$M/packages/model-gateway/vitest.seed.config.mts"
fi
cd "$M/packages/model-gateway"
flock /tmp/laneb-heavy.lock ./node_modules/.bin/vitest run --config vitest.seed.config.mts --root "$M/packages/model-gateway" src/redact.property.test.ts src/redact.test.ts src/functions/denial-letter.test.ts > "$OUT/tests.log" 2>&1
echo "three files: $(grep -E '^ +Tests ' "$OUT/tests.log")"
grep -E '✗|×|FAIL' "$OUT/tests.log" | head -20
for s in 1034253323 383403599 -1074798020; do
  FC_SEED=$s flock /tmp/laneb-heavy.lock ./node_modules/.bin/vitest run --config vitest.seed.config.mts --root "$M/packages/model-gateway" src/redact.property.test.ts > "$OUT/seed-$s.log" 2>&1
  echo "property file, global seed $s: $(grep -E '^ +Tests ' "$OUT/seed-$s.log")"
  grep -E '×|FAIL|Counterexample' "$OUT/seed-$s.log" | head -6
done
