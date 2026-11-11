#!/usr/bin/env bash
# Schema PR 2's measurement queue: seeds, then passes, each step under the heavy lock; resumable (a step whose result
# exists is skipped). Steps: "seedR <N>", "seedF <N>" (with the harness's other tenants), "run <seed> <none|pr2> <tag>",
# "cmp <seed minus _seed> <tag>".   env: S, TP_REPO, DRAFT
set -uo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
P=$S/pr2-probe; OUT=$S/pr2-results; LOG=$OUT/queue.log; mkdir -p "$OUT/seeds"
say() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
say "queue start: tree $(git -C "$TP_REPO" rev-parse HEAD) draft sha256 $(sha256sum "$DRAFT" | cut -c1-16)"
for step in "$@"; do
  set -- $step
  case "$1" in
    seedR) [ -f "$OUT/seeds/cap3_r_$2_seed/meta.json" ] && continue
      say "seed R $2"; (cd "$TP_REPO" && ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --import tsx "$P/seed.mts" "$2" R) >> "$LOG" 2>&1; say "seed R $2 done rc $?" ;;
    seedF) [ -f "$OUT/seeds/cap3_fx_$2_seed/meta.json" ] && continue
      say "seed F $2 x"; (cd "$TP_REPO" && ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --stack-size=60000 --import tsx "$P/seedF.mts" "$2" x) >> "$LOG" 2>&1; say "seed F $2 done rc $?" ;;
    run) db="${2%_seed}_$3_$4"; [ -f "$OUT/$db.dump.ndjson" ] && [ -f "$OUT/$db.json" ] && continue
      say "run $2 $3 $4"; (cd /tmp && flock /tmp/laneb-heavy.lock "$P/run.sh" "$2" "$3" "$4") >> "$LOG" 2>&1; say "run $2 $3 $4 done rc $?" ;;
    cmp) say "compare $2 $3: $(python3 -I "$P/compare.py" "$OUT/$2_none_$3.dump.ndjson" "$OUT/$2_pr2_$3.dump.ndjson" 2>&1)" ;;
  esac
done
say "queue end"
