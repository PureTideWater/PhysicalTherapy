#!/bin/bash
# The differential gate for redact-range-glued. Usage: run.sh <treeA> <treeB> <outdir> [gate options]
# treeA/treeB: a checkout root or a packages/model-gateway/src directory. Runs under the heavy lock.
# Builds the fixed corpus first if gate/corpus is missing (deterministic; harvest under gate/harvest must exist).
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
GATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ $# -lt 3 ]; then echo "usage: run.sh <treeA> <treeB> <outdir> [--workers N] [--limit N] [--no-cache] [--skip-timing] [--timing-only]" >&2; exit 2; fi
A="$(cd "$1" && pwd)"; B="$(cd "$2" && pwd)"; OUT="$3"; shift 3
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
if [ ! -f "$GATE/corpus/manifest.json" ]; then
  if [ ! -d "$GATE/harvest/runs" ]; then (cd "$GATE/gen" && flock /tmp/laneb-heavy.lock node harvest-all.mts); fi
  (cd "$GATE/gen" && flock /tmp/laneb-heavy.lock node --max-old-space-size=8000 build-corpus.mts)
fi
cd "$GATE"
flock /tmp/laneb-heavy.lock node --import "$GATE/ts-resolve.mjs" --max-old-space-size=6000 gate.mts "$A" "$B" "$OUT" "$@" 2> "$OUT/gate.stderr"
echo "report: $OUT/report.md"
