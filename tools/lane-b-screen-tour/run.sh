#!/usr/bin/env bash
# Once the server is ready: the repository's journeys that populate the practices, then the tour.
set -uo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
source $S/env.sh
until [ -f $S/ready ]; do
  if ! pgrep -f "$S/(build|serve).sh" >/dev/null && [ ! -f $S/ready ]; then echo "SERVER NOT READY"; tail -20 $S/build.log; exit 1; fi
  sleep 2
done
cd $S
echo "populate start $(date -u +%T)"
./node_modules/.bin/playwright test --config $S/screens.config.ts --project populate --workers 3 --grep-invert "unverified deadline|webhook route" > $S/populate.log 2>&1
echo "populate exit $? at $(date -u +%T)"
grep -E "passed|failed|flaky|skipped|✘" $S/populate.log | tail -12
echo "capture start $(date -u +%T)"
./node_modules/.bin/playwright test --config $S/screens.config.ts --project capture --workers 1 > $S/capture.log 2>&1
echo "capture exit $? at $(date -u +%T)"
tail -5 $S/capture.log
