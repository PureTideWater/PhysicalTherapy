#!/usr/bin/env bash
# Usage: run.sh <hist> ; the private cluster on 5494 must be up. Unanalyzed, then ANALYZEd.
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
P=$(dirname "$0"); U=postgres://postgres@localhost:5494/d15
psql -q "$U" -f $P/setup.sql; psql -q "$U" -v hist=$1 -f $P/load.sql
node --expose-gc --max-old-space-size=560 $P/forms.mjs "$U" "hist=$1 unanalyzed"
psql -q "$U" -c 'ANALYZE posting_row, ledger_match'
node --expose-gc --max-old-space-size=560 $P/forms.mjs "$U" "hist=$1 analyzed"
