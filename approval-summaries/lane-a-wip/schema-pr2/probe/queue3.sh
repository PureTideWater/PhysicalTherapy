#!/usr/bin/env bash
# Schema PR 2, the run of record, second part (after the migration was placed in the checkout at 13:01 UTC): the same
# steps as queue.sh, but a seed is migrated from SEED_REPO, a worktree of the base WITHOUT the new migration, so that
# state "none" is the base's own bodies; the pass's code is TP_REPO's (identical worker code). First waits for the
# step the first queue left running.   env: S, OUT, TP_REPO, SEED_REPO, DRAFT, WAIT_FOR (a file)
set -uo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
P=$S/pr2-probe; OUT=${OUT:-$S/pr2-results}; LOG=$OUT/queue.log
say() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
while [ -n "${WAIT_FOR:-}" ] && { [ ! -f "$WAIT_FOR" ] || pgrep -f "pr2-probe/run.sh" >/dev/null; }; do sleep 5; done
say "queue 3 start: tree $(git -C "$TP_REPO" rev-parse HEAD) seeds from $(git -C "$SEED_REPO" rev-parse HEAD) draft sha256 $(sha256sum "$DRAFT" | cut -c1-16)"
for step in "$@"; do
  set -- $step
  case "$1" in
    base) if [ ! -d "$SEED_REPO/node_modules" ]; then say "base worktree install"; (cd "$SEED_REPO" && pnpm install --frozen-lockfile --offline) >> "$OUT/base-install.log" 2>&1; say "base worktree install rc $?"; fi ;;
    seedR) [ -f "$OUT/seeds/cap3_r_$2_seed/meta.json" ] && continue
      say "seed R $2 (from the base worktree)"; (cd "$SEED_REPO" && TP_REPO=$SEED_REPO ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --import tsx "$P/seed.mts" "$2" R) >> "$LOG" 2>&1; say "seed R $2 done rc $?" ;;
    seedF) [ -f "$OUT/seeds/cap3_fx_$2_seed/meta.json" ] && continue
      say "seed F $2 x (from the base worktree)"; (cd "$SEED_REPO" && TP_REPO=$SEED_REPO ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --stack-size=60000 --import tsx "$P/seedF.mts" "$2" x) >> "$LOG" 2>&1; say "seed F $2 done rc $?" ;;
    run) db="${2%_seed}_$3_$4"; [ -f "$OUT/$db.dump.ndjson" ] && [ -f "$OUT/$db.json" ] && continue
      say "run $2 $3 $4"; (cd /tmp && flock /tmp/laneb-heavy.lock "$P/run.sh" "$2" "$3" "$4") >> "$LOG" 2>&1; say "run $2 $3 $4 done rc $?" ;;
    cmp) say "compare $2 $3: $(python3 -I "$P/compare.py" "$OUT/$2_none_$3.dump.ndjson" "$OUT/$2_pr2_$3.dump.ndjson" 2>&1)" ;;
  esac
done
say "queue 3 end"
