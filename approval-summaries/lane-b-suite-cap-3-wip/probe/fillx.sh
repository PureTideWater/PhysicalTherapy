#!/usr/bin/env bash
# SUITE-CAP-3 profile, the shared-ledger control (run under flock /tmp/laneb-heavy.lock):
#   fillx.sh <seed> <state> [rows]
# Copies <seed> in <state> as <seed minus _seed>_<state>_7bf, then gives ledger_entry ROWS (default 100,000) SYNTHETIC
# rows of another tenant (a practice id that names no practice; amounts 100.00, random ids; approved/posted pairs per
# line), written as superuser with session_replication_role = replica (no triggers, no foreign keys: the rows only make
# the table the size a running multi-tenant deployment's is; RLS keeps them out of the pass), ANALYZE, then step 7b's
# pass (<db>-7b). A seeded database's ledger is empty when the pass's trigger and function plans are made and cached; a
# running deployment's is not (statsx.sh restores statistics only, and the planner rescales them to the table's actual
# pages, so it cannot show this). The control separates that from real growth.
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
HERE=$(cd "$(dirname "$0")" && pwd)
ADMIN_URL=${ADMIN_URL:-postgres://postgres:test@localhost:5494/postgres}
: "${OUT:?}" "${TP_REPO:?}"
seed=$1; state=$2; rows=${3:-100000}
port=$(python3 -c "import sys,urllib.parse as u;print(u.urlparse(sys.argv[1]).port)" "$ADMIN_URL")
psqlc() { psql -h localhost -p "$port" -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
db=$("$HERE/probe.sh" copy "$seed" "$state" 7bf | tail -1)
psqlc -d "$db" <<SQL
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on)
SELECT '00000000-0000-4000-8000-00000000f111'::uuid, l.case_id, l.line_id, s.stage, 10000,
       CASE s.stage WHEN 'approved' THEN 'claim' ELSE 'posting_row' END, gen_random_uuid(), gen_random_uuid(), date '2026-01-01' + (l.i % 300)
  FROM (SELECT i, gen_random_uuid() AS line_id, ('00000000-0000-4000-8000-' || lpad(to_hex(i % 500), 12, '0'))::uuid AS case_id
          FROM generate_series(1, ($rows / 2)) AS i) l
 CROSS JOIN (VALUES ('approved'), ('posted')) AS s (stage);
COMMIT;
ANALYZE ledger_entry;
SQL
echo "$db: ledger_entry filled with $(psqlc -d "$db" -c "SELECT count(*) FROM ledger_entry") other-tenant rows"
"$HERE/probe.sh" pass "$db" "$seed" "$db-7b" "$OUT/$seed/posting-export.csv"
