#!/usr/bin/env bash
# SUITE-CAP-3 profile, shape P's approvals once per N (run under flock /tmp/laneb-heavy.lock):
#   prep.sh pre <seed>                        copy <seed> to <seed minus _seed>_pre in state (b) (claim_by_superseded),
#                                             run the plain reconcile (the approvals: <db>-pre), keep the database
#   prep.sh from <seed> <state a|b|c>         copy <..>_pre to <..>_<state>_p, converting (b) to the state: (a) drops
#                                             claim_by_superseded; (c) adds sections 3, 5 and 6 of 1b's migration; ANALYZE
#   prep.sh P <seed> <state>                  `from`, then the measured pass: the export's reconcile (<db>-P)
# The approvals pass is the same writes whichever state runs it (the triggers check, they never change what is written),
# so P's copies hold the same rows as a per-state pre pass leaves; the pre pass's own time is measured in state (b).
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
HERE=$(cd "$(dirname "$0")" && pwd)
ADMIN_URL=${ADMIN_URL:-postgres://postgres:test@localhost:5494/postgres}
: "${OUT:?}" "${TP_REPO:?}"
port=$(python3 -c "import sys,urllib.parse as u;print(u.urlparse(sys.argv[1]).port)" "$ADMIN_URL")
psqlc() { psql -h localhost -p "$port" -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
step=$1; seed=$2; base=${seed%_seed}
case "$step" in
  pre)
    db=$("$HERE/probe.sh" copy "$seed" b pre | tail -1)
    "$HERE/probe.sh" pass "$db" "$seed" "${base}_b_p-pre"
    ;;
  from)
    state=$3; db="${base}_${state}_p"
    psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db TEMPLATE ${base}_b_pre"
    case "$state" in
      a) psqlc -d "$db" -c 'BEGIN' -c 'SET LOCAL ROLE tp_owner' -c 'DROP INDEX claim_by_superseded' -c 'COMMIT' ;;
      b) ;;
      c) { echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$HERE/state-c-from-b.sql"; echo 'COMMIT;'; } | psqlc -d "$db" ;;
    esac
    psqlc -d "$db" -c 'ANALYZE'
    echo "$db"
    ;;
  P)
    state=$3
    db=$("$0" from "$seed" "$state" | tail -1)
    "$HERE/probe.sh" pass "$db" "$seed" "$db-P" "$OUT/$seed/posting-export.csv"
    ;;
esac
