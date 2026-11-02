#!/usr/bin/env bash
# SUITE-CAP-3 candidate-fix runs: one shape of one seed in one state, with the code of one checkout, under its own
# database name so the base and the candidate run side by side from the same template. Run under the heavy lock.
#   runcap3.sh <label base|try> <seed> <state a|c> <shape 7b|P> [dump]
# label base: TP_REPO=$S/cap3-base, OUT=$S/cap3-results-base2; label try: TP_REPO=$S/cap3-try, OUT=$S/cap3-results-try.
# With `dump`, each pass's writes are dumped (dump.py) for the equality diff; the database is dropped at the end.
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
HERE=$(cd "$(dirname "$0")" && pwd)
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad
label=$1; seed=$2; state=$3; shape=$4; dump=${5:-}
case "$label" in base) export TP_REPO=$S/cap3-base OUT=$S/cap3-results-base2 ;; try) export TP_REPO=$S/cap3-try OUT=$S/cap3-results-try ;; *) exit 2 ;; esac
export ADMIN_URL=postgres://postgres:test@localhost:5494/postgres
SEEDS=$S/cap3-results-seeds
mkdir -p "$OUT"
psqlc() { psql -h localhost -p 5494 -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
url_of() { echo "postgres://postgres:test@localhost:5494/$1"; }
db="${seed%_seed}_${state}_$(echo "$shape" | tr 'A-Z' 'a-z')_$label"
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db TEMPLATE $seed"
case "$state" in
  a) ;;
  c) { echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$HERE/state-c.sql"; echo 'COMMIT;'; } | psqlc -d "$db" ;;
  m) { echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$HERE/state-c.sql"; cat "$HERE/state-m.sql"; echo 'COMMIT;'; } | psqlc -d "$db" ;;
  l) { echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$HERE/state-c.sql"; cat "$HERE/state-l.sql"; echo 'COMMIT;'; } | psqlc -d "$db" ;;
esac
psqlc -d "$db" -c 'ANALYZE'
pass() { # <out label> [export]
  cd "$TP_REPO"
  set +e
  node --max-old-space-size=560 --expose-gc --import tsx "$HERE/pass.mts" "$(url_of "$db")" "$SEEDS/$seed/meta.json" "$OUT/$1" ${2:+"$2"} >"$OUT/$1.log" 2>"$OUT/$1.stderr"
  code=$?
  set -e
  echo "$1 exit $code: $(cat "$OUT/$1.log")"
  if [ -n "$dump" ]; then python3 -I "$HERE/dump.py" 5494 "$db" "$seed" > "$OUT/$1.dump.ndjson"; fi
}
if [ "$shape" = P ]; then
  pass "$db-pre"
  pass "$db-P" "$SEEDS/$seed/posting-export.csv"
else
  pass "$db-7b" "$SEEDS/$seed/posting-export.csv"
fi
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
