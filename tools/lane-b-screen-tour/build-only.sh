#!/usr/bin/env bash
# The build alone, under one hold of the shared lock, released when the build ends (for example while the capture spec
# is still being written). reserve.sh then serves it under its own hold, from a fresh prepare.
#   cd $TOUR_DIR && flock /tmp/laneb-heavy.lock bash <this directory>/build-only.sh > build.log 2>&1   (in the background)
set -euo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
source $S/env.sh
rm -f $S/built
cd /home/user/screens/apps/web
echo "lock acquired for build at $(date -u +%T)"
server_env pnpm run build
touch $S/built
echo "build done; lock released at $(date -u +%T) (serve it with reserve.sh)"
