#!/usr/bin/env bash
# SUITE-CAP-3 profile, the stats control (run under flock /tmp/laneb-heavy.lock):
#   statsx.sh <seed> <state> <stats db>
# Copies <seed> in <state> as <seed minus _seed>_<state>_7bs, then overwrites the planner statistics of the ledger and
# stage tables (ledger_entry, ledger_match, line_status, line_status_head when present) with those of <stats db> (a
# database a full 7b pass of the same seed left, analyzed), through PostgreSQL 18's pg_restore_relation_stats and
# pg_restore_attribute_stats, then runs step 7b's pass (<db>-7b). It separates what in a pass grows because the seed's
# ledger was empty when the trigger plans were made (stats a new database has, not a running one) from real growth.
# Statistics are values of the columns' distributions (synthetic rows); nothing is printed of them.
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
HERE=$(cd "$(dirname "$0")" && pwd)
ADMIN_URL=${ADMIN_URL:-postgres://postgres:test@localhost:5494/postgres}
: "${OUT:?}" "${TP_REPO:?}"
seed=$1; state=$2; src=$3
port=$(python3 -c "import sys,urllib.parse as u;print(u.urlparse(sys.argv[1]).port)" "$ADMIN_URL")
psqlc() { psql -h localhost -p "$port" -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
db=$("$HERE/probe.sh" copy "$seed" "$state" 7bs | tail -1)
gen="
SELECT format('SELECT pg_restore_relation_stats(%L,%L,%L,%L,%L,%s::integer,%L,%s::real,%L,%s::integer);',
              'schemaname','public','relname',c.relname,'relpages',c.relpages,'reltuples',c.reltuples,'relallvisible',c.relallvisible)
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('ledger_entry','ledger_match','line_status','line_status_head')
UNION ALL
SELECT format('SELECT pg_restore_attribute_stats(%s);', concat_ws(',',
         format('%L,%L,%L,%L,%L,%L,%L,%s::boolean,%L,%s::real,%L,%s::integer,%L,%s::real', 'schemaname','public','relname',s.tablename,'attname',s.attname,'inherited',quote_literal(s.inherited::text),'null_frac',s.null_frac,'avg_width',s.avg_width,'n_distinct',s.n_distinct),
         CASE WHEN s.most_common_vals IS NOT NULL THEN format('%L,%L,%L,%L::real[]','most_common_vals',s.most_common_vals::text,'most_common_freqs',s.most_common_freqs::text) END,
         CASE WHEN s.histogram_bounds IS NOT NULL THEN format('%L,%L','histogram_bounds',s.histogram_bounds::text) END,
         CASE WHEN s.correlation IS NOT NULL THEN format('%L,%s::real','correlation',s.correlation) END))
  FROM pg_stats s WHERE s.schemaname = 'public' AND s.tablename IN ('ledger_entry','ledger_match','line_status','line_status_head')
   AND EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid WHERE c.relname = s.tablename AND a.attname = s.attname AND c.relnamespace = 'public'::regnamespace)"
psqlc -d "$src" -c "$gen" > "$OUT/$db.stats.sql"
psqlc -d "$db" -f "$OUT/$db.stats.sql" > /dev/null
echo "$db: $(grep -c relation_stats "$OUT/$db.stats.sql") relations, $(grep -c attribute_stats "$OUT/$db.stats.sql") columns restored from $src"
"$HERE/probe.sh" pass "$db" "$seed" "$db-7b" "$OUT/$seed/posting-export.csv"
