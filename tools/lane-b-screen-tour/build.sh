#!/usr/bin/env bash
# One hold of the shared lock: the build, then the server's lifetime (serve.sh), so the build and the server
# run under the same acquisition.
set -euo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
source $S/env.sh
rm -f $S/ready $S/stop $S/built
echo $$ > $S/server.pid  # run.sh watches this process (build, then serve.sh by exec, so the same pid)
cd /home/user/screens/apps/web
echo "lock acquired for build at $(date -u +%T)"
server_env pnpm run build
echo "build done at $(date -u +%T)"
touch $S/built
exec bash $S/serve.sh
