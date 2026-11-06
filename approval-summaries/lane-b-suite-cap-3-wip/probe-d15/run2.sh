#!/usr/bin/env bash
# Usage: run2.sh <n>: tables ANALYZEd empty, then n claim matches and n new posting rows (the 6,000-line pass's shape).
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
P=$(dirname "$0"); U=postgres://postgres@localhost:5494/d15
psql -q "$U" -f $P/setup.sql 2>/dev/null; psql -q "$U" -c 'ANALYZE posting_row, ledger_match'; psql -q "$U" -v n=$1 -f $P/load2.sql
node --expose-gc --max-old-space-size=560 $P/forms.mjs "$U" "trap n=$1 (analyzed empty, then loaded)"
