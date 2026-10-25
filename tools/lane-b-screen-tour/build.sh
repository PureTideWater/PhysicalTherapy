#!/usr/bin/env bash
# One hold of the shared lock: the build, then the server's lifetime (serve.sh), so the build and the server
# run under the same acquisition.
set -euo pipefail
S=/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/screens
source $S/env.sh
cd /home/user/screens/apps/web
echo "lock acquired for build at $(date -u +%T)"
server_env pnpm run build
echo "build done at $(date -u +%T)"
touch $S/built
exec bash $S/serve.sh
