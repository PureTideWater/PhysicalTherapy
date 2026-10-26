#!/usr/bin/env bash
# Once the server is ready: the repository's journeys that populate the practices, then the tour.
#   TOUR_ONLY=<id>,<prefix>*  restricts the capture to those shots (a retake); its shots merge into shots.json.
#   TOUR_SKIP_POPULATE=1      skips the populate project: a retake on the database an earlier run populated (its kept
#                             sessions in $TOUR_DIR/auth are reused, since an internal persona's key registers once per
#                             database). Without it the database must be fresh (build.sh or reserve.sh prepare it).
set -uo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
source $S/env.sh
until [ -f $S/ready ]; do
  # build.sh (or reserve.sh) writes its pid and execs serve.sh, so one pid covers the build and the server.
  if { [ ! -f $S/server.pid ] || ! kill -0 "$(cat $S/server.pid)" 2>/dev/null; } && [ ! -f $S/ready ]; then
    sleep 5  # build.sh may not have written its pid yet
    if { [ ! -f $S/server.pid ] || ! kill -0 "$(cat $S/server.pid)" 2>/dev/null; } && [ ! -f $S/ready ]; then echo "SERVER NOT READY"; tail -20 $S/build.log $S/serve.log 2>/dev/null; exit 1; fi
  fi
  sleep 2
done
cd $S
if [ "${TOUR_SKIP_POPULATE:-}" != 1 ]; then
  rm -rf $S/auth  # sessions kept from an earlier database are void on this fresh one
  echo "populate start $(date -u +%T)"
  # Every populate spec runs whole, but one test: billing.spec.ts's "the webhook route refuses a body without Stripe's
  # signature, and records nothing" checks a refusal and records nothing, so no screen's record depends on it.
  # packets.spec.ts's "unverified deadline" test runs (the 2026-10-25 tour skipped it): it fills SYNTHETIC OTHER
  # PRACTICE PACKET DEADLINES, the blocked export and the export waiting for the reviewer's attestation (route map).
  ./node_modules/.bin/playwright test --config $S/screens.config.ts --project populate --workers 3 --grep-invert "webhook route" > $S/populate.log 2>&1
  echo "populate exit $? at $(date -u +%T)"
  grep -E "passed|failed|flaky|skipped|✘" $S/populate.log | tail -12
else
  echo "populate skipped (TOUR_SKIP_POPULATE=1): capturing on the database an earlier run populated"
fi
[ -z "${TOUR_ONLY:-}" ] && rm -f $S/progress.log
echo "capture start $(date -u +%T)${TOUR_ONLY:+ (TOUR_ONLY=$TOUR_ONLY)}"
# The retake specs (contract, mapping) need a tour's ids.json and a fresh database: redo.sh.
./node_modules/.bin/playwright test --config $S/screens.config.ts --project capture --workers 1 tour.spec.ts > $S/capture.log 2>&1
echo "capture exit $? at $(date -u +%T)"
tail -5 $S/capture.log
grep -E "^[0-9:]+ (DONE|COVERAGE|RECORDS)" $S/progress.log 2>/dev/null | tail -4
