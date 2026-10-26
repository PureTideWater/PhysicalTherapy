#!/usr/bin/env bash
# Re-serves the existing build under one hold of the shared lock, from a fresh prepare (serve.sh drops and recreates
# tp_e2e_screens and seeds it): a re-run or a retake without rebuilding. The platform administrator's hardware key
# registers once per database, so every capture needs this fresh prepare.
#   cd $TOUR_DIR && TOUR_MINUTES=<n> flock /tmp/laneb-heavy.lock bash <this directory>/reserve.sh > serve.log 2>&1   (background)
# then bash run.sh as after build.sh, and touch $TOUR_DIR/stop when it ends; serve.log says "server stopped".
set -euo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
[ -f /home/user/screens/apps/web/.next/standalone/apps/web/server.js ] || { echo "no build in /home/user/screens/apps/web/.next: run build.sh or build-only.sh first"; exit 1; }
rm -f $S/ready $S/stop
echo $$ > $S/server.pid  # run.sh watches this process (serve.sh by exec, so the same pid)
echo "lock acquired for re-serve at $(date -u +%T)"
exec bash $S/serve.sh
