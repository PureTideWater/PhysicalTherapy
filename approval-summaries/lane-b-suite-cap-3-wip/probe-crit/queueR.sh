#!/usr/bin/env bash
# Completeness check: spread R at 2,000 (seed.mts, base code), candidate with and without state nk, dumps compared.
set -uo pipefail
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad; OUT=$S/cap3-results-crit; LOG=$OUT/queueR.log
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
if [ ! -f $OUT/seeds/cap3_r_2000_seed/meta.json ]; then
  echo "$(date -u +%FT%TZ) seed R 2000" >> $LOG
  (cd $S/cap3-base2 && TP_REPO=$S/cap3-base2 ADMIN_URL=postgres://postgres:test@localhost:5494/postgres OUT=$OUT/seeds flock /tmp/laneb-heavy.lock node --import tsx $S/cap3-probe/seed.mts 2000 R) >> $LOG 2>&1
fi
for prep in none nk; do
  [ -f $OUT/cap3_r_2000_cand_${prep}_7b_r1-7b.json ] && continue
  echo "$(date -u +%FT%TZ) run R $prep" >> $LOG
  (cd /tmp && flock /tmp/laneb-heavy.lock $S/cap3-probe-crit/runcrit.sh cand cap3_r_2000_seed $prep 7b r1 dump) >> $LOG 2>&1
done
echo "$(date -u +%FT%TZ) queueR end" >> $LOG
