#!/usr/bin/env bash
# Second queue: the F seeds at 6,000 and 10,000 (seedF.mts, base code), then runrev steps (queue-rev.sh's format, or
# "seedF <N>"). Each step under the heavy lock; resumable.
set -uo pipefail
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad
R=$S/cap3-probe; OUT=$S/cap3-results-rev; LOG=$OUT/queue2.log
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
for step in "$@"; do
  set -- $step
  if [ "$1" = seedF ]; then
    [ -f "$OUT/seeds/cap3_f${3:-}_$2_seed/meta.json" ] && continue
    echo "$(date -u +%FT%TZ) seedF $2 ${3:-}" >> $LOG
    (cd $S/cap3-base2 && TP_REPO=$S/cap3-base2 ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --stack-size=60000 --import tsx $R/seedF.mts "$2" ${3:-}) >> $LOG 2>&1
    continue
  fi
  "$R/queue-rev.sh" "$step"
done
echo "$(date -u +%FT%TZ) queue2 end" >> $LOG
