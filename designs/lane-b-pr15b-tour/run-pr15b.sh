#!/usr/bin/env bash
# PR 15b's tour run (designs/lane-b-pr15b-tour): once serve.sh says ready, the populate journeys and ledger-tour.spec.ts
# together, then capture.spec.ts. Run from anywhere with TOUR_DIR set; after setup.sh and copy-in.sh.
set -uo pipefail
S="${TOUR_DIR:?set TOUR_DIR}"
source $S/env.sh
until [ -f $S/ready ]; do
  if { [ ! -f $S/server.pid ] || ! kill -0 "$(cat $S/server.pid)" 2>/dev/null; } && [ ! -f $S/ready ]; then
    sleep 5
    if { [ ! -f $S/server.pid ] || ! kill -0 "$(cat $S/server.pid)" 2>/dev/null; } && [ ! -f $S/ready ]; then echo "SERVER NOT READY"; exit 1; fi
  fi
  sleep 2
done
cd $S
if [ "${TOUR_SKIP_POPULATE:-}" != 1 ]; then
  echo "populate start $(date -u +%T)"
  ./node_modules/.bin/playwright test --config $S/pr15b.config.ts --project populate --project ledger --workers 3 --grep-invert "webhook route" > $S/populate.log 2>&1
  echo "populate exit $? at $(date -u +%T)"
  grep -E "passed|failed|flaky|skipped|✘" $S/populate.log | tail -15
fi
rm -f $S/progress.log
echo "capture start $(date -u +%T)"
./node_modules/.bin/playwright test --config $S/pr15b.config.ts --project capture --workers 1 > $S/capture.log 2>&1
echo "capture exit $? at $(date -u +%T)"
tail -5 $S/capture.log
tail -2 $S/progress.log
