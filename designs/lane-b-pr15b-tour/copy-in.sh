#!/usr/bin/env bash
# After setup.sh: the head's LED e2e helpers and LED-14..18 fixtures into /home/user/screens (needed by the base build;
# a no-op at the head), and this directory's runner and specs into $TOUR_DIR.
set -euo pipefail
S="${TOUR_DIR:?set TOUR_DIR}"
here=$(cd "$(dirname "$0")" && pwd)
head=origin/co-001/pr-15b-ledger-payment-terms
cd /home/user/screens
git checkout "$head" -- apps/web/e2e/ledger.ts apps/web/e2e/ledger-patient-share.spec.ts fixtures/synthetic/LED-14 fixtures/synthetic/LED-15 fixtures/synthetic/LED-16 fixtures/synthetic/LED-17 fixtures/synthetic/LED-18
git reset -q
mkdir -p "$S/pr15b"
cp "$here/ledger-tour.spec.ts" "$here/capture.spec.ts" "$S/pr15b/"
cp "$here/pr15b.config.ts" "$here/run-pr15b.sh" "$S/"
echo "copied at $(git rev-parse --short HEAD); status: $(git status --porcelain | wc -l) changed paths"
