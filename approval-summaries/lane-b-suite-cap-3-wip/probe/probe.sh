#!/usr/bin/env bash
# SUITE-CAP-3 profile, one step per call (run each heavy step under flock /tmp/laneb-heavy.lock).
#
#   probe.sh seed <N> <R|A>                      seed cap3_<spread>_<N>_seed (seed.mts)
#   probe.sh copy <seed> <state a|b|c> <shape>   CREATE DATABASE <seed minus _seed>_<state>_<shape> TEMPLATE <seed>;
#                                                state b: section 4 of 1b's 20261109090000 (claim_by_superseded) by hand;
#                                                state c: sections 3-6 by hand; as tp_owner in one transaction; ANALYZE
#   probe.sh pass <db> <seed> <label> [export]   one reconcile pass in a child under --max-old-space-size=560
#   probe.sh shape <seed> <state> P|7b           copy, then the shape's passes:
#                                                  P:  <db>-pre (a plain reconcile: the approvals) then <db>-P (the export's
#                                                      reconcile: postings only, the measured pass)
#                                                  7b: <db>-7b (the export's reconcile: approvals and postings in one pass)
#   probe.sh drop <db>
#
# Env: TP_REPO (the checkout measured), ADMIN_URL (default the private cluster on 5494), OUT (results), HEAP (560).
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
HERE=$(cd "$(dirname "$0")" && pwd)
: "${TP_REPO:?TP_REPO names the checkout}"
ADMIN_URL=${ADMIN_URL:-postgres://postgres:test@localhost:5494/postgres}
OUT=${OUT:?OUT names the results directory}
HEAP=${HEAP:-560}
mkdir -p "$OUT"
port=$(python3 -c "import sys,urllib.parse as u;print(u.urlparse(sys.argv[1]).port)" "$ADMIN_URL")
psqlc() { psql -h localhost -p "$port" -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
url_of() { python3 -c "import sys,urllib.parse as u;p=u.urlparse(sys.argv[1]);print(p._replace(path='/'+sys.argv[2]).geturl())" "$ADMIN_URL" "$1"; }

step=${1:?step}; shift
case "$step" in
  seed)
    cd "$TP_REPO" && TP_REPO=$TP_REPO ADMIN_URL=$ADMIN_URL OUT=$OUT node --import tsx "$HERE/seed.mts" "$@" 2>&1 | tee "$OUT/seed-$1-$2.log"
    ;;
  copy)
    seed=$1; state=$2; shape=$3; db="${seed%_seed}_${state}_$(echo "$shape" | tr 'A-Z' 'a-z')"
    psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db TEMPLATE $seed"
    case "$state" in
      a) ;;
      b) { echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$HERE/state-b.sql"; echo 'COMMIT;'; } | psqlc -d "$db" ;;
      c) { echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$HERE/state-c.sql"; echo 'COMMIT;'; } | psqlc -d "$db" ;;
      *) echo "state a|b|c" >&2; exit 2 ;;
    esac
    psqlc -d "$db" -c 'ANALYZE'
    echo "$db"
    ;;
  pass)
    db=$1; seed=$2; label=$3; export_csv=${4:-}
    cd "$TP_REPO"
    set +e
    node --max-old-space-size="$HEAP" --expose-gc --import tsx "$HERE/pass.mts" "$(url_of "$db")" "$OUT/$seed/meta.json" "$OUT/$label" ${export_csv:+"$export_csv"} >"$OUT/$label.log" 2>"$OUT/$label.stderr"
    code=$?
    set -e
    echo "$label exit $code: $(cat "$OUT/$label.log")"
    ;;
  shape)
    seed=$1; state=$2; shape=$3
    db=$("$0" copy "$seed" "$state" "$shape" | tail -1)
    if [ "$shape" = P ]; then
      "$0" pass "$db" "$seed" "$db-pre"
      "$0" pass "$db" "$seed" "$db-P" "$OUT/$seed/posting-export.csv"
    else
      "$0" pass "$db" "$seed" "$db-7b" "$OUT/$seed/posting-export.csv"
    fi
    ;;
  drop)
    psqlc -d postgres -c "DROP DATABASE IF EXISTS $1 WITH (FORCE)"
    ;;
  *) echo "unknown step $step" >&2; exit 2 ;;
esac
