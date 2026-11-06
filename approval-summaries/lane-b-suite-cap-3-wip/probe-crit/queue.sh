#!/usr/bin/env bash
# Completeness-check queue: seeds then runcrit steps, each under the heavy lock; resumable.
set -uo pipefail
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad; R=$S/cap3-probe; C=$S/cap3-probe-crit; OUT=$S/cap3-results-crit; LOG=$OUT/queue.log
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
for step in "$@"; do
  set -- $step
  if [ "$1" = seedF ]; then
    [ -f "$OUT/seeds/cap3_fx_$2_seed/meta.json" ] && continue
    echo "$(date -u +%FT%TZ) seedF $2 x" >> $LOG
    (cd $S/cap3-base2 && TP_REPO=$S/cap3-base2 ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --stack-size=60000 --import tsx $R/seedF.mts "$2" x) >> $LOG 2>&1
    echo "$(date -u +%FT%TZ) seedF $2 done" >> $LOG
    continue
  fi
  db="${2%_seed}_$1_$3_$(echo "$4" | tr 'A-Z' 'a-z')_$5"
  [ -f "$OUT/$db-7b.json" ] && continue
  echo "$(date -u +%FT%TZ) run $step" >> $LOG
  (cd /tmp && flock /tmp/laneb-heavy.lock "$C/runcrit.sh" "$@") >> $LOG 2>&1
  echo "$(date -u +%FT%TZ) done $step" >> $LOG
done
echo "$(date -u +%FT%TZ) queue end" >> $LOG
