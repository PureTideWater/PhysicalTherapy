#!/usr/bin/env bash
# Holds the shared lock for the server's lifetime: starts the standalone build, waits for the stop file
# (or 22 minutes), then stops it.
set -uo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
source $S/env.sh
rm -f $S/stop $S/ready
echo "server starting at $(date -u +%T)"
cd /home/user/screens/apps/web
server_env env PORT=3297 bash scripts/start-standalone.sh > $S/server.log 2>&1 &
pid=$!
for i in $(seq 1 120); do
  if curl -sf -o /dev/null http://127.0.0.1:3297/sign-in; then echo "server ready at $(date -u +%T)"; touch $S/ready; break; fi
  sleep 1
done
end=$(( $(date +%s) + 22*60 ))
while [ ! -f $S/stop ] && [ "$(date +%s)" -lt "$end" ] && lsof -tiTCP:3297 -sTCP:LISTEN >/dev/null 2>&1; do sleep 2; done
echo "stopping server at $(date -u +%T)"
for n in $(lsof -tiTCP:3297 -sTCP:LISTEN 2>/dev/null); do kill $n 2>/dev/null; done
kill $pid 2>/dev/null; sleep 2
wait $pid 2>/dev/null
echo "server stopped at $(date -u +%T)"
