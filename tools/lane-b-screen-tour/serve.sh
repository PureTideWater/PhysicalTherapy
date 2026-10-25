#!/usr/bin/env bash
# Holds the shared lock for the server's lifetime (build.sh execs it under the lock): prepares the synthetic
# database, starts the standalone build, waits for the stop file or TOUR_MINUTES (default 22), then stops it.
set -uo pipefail
S="${TOUR_DIR:?set TOUR_DIR to the tour's working directory, a folder in this session's scratchpad (README, Set-up)}"
source $S/env.sh
rm -f $S/ready  # build.sh cleared stop; a stop touched during the build ends the server once it is up
cd /home/user/screens/apps/web
if fuser 3297/tcp >/dev/null 2>&1; then echo "port 3297 is already taken: end that server first (fuser -k 3297/tcp)"; exit 1; fi
# The repository's e2e webServer runs prepare.ts first (playwright.config.ts): it drops and recreates the database and
# seeds the personas. A capture registers the platform administrator's hardware key once per database, so every
# capture starts from a fresh prepare.
echo "preparing tp_e2e_screens at $(date -u +%T)"
../../node_modules/.bin/tsx e2e/prepare.ts || { echo "prepare failed"; exit 1; }
echo "server starting at $(date -u +%T)"
server_env env PORT=3297 bash scripts/start-standalone.sh > $S/server.log 2>&1 &
up=0
for i in $(seq 1 120); do
  if curl -sf -o /dev/null http://127.0.0.1:3297/sign-in; then echo "server ready at $(date -u +%T)"; touch $S/ready; up=1; break; fi
  sleep 1
done
if [ "$up" != 1 ]; then echo "server did not answer in 120 s"; fuser -k 3297/tcp >/dev/null 2>&1; exit 1; fi
end=$(( $(date +%s) + ${TOUR_MINUTES:-22}*60 ))
# Wait on the server itself answering, not on lsof (which ended this loop at once on 2026-10-25 and released the lock
# while the server ran on).
# Three misses in a row end it (one slow answer under a capture's load does not).
miss=0
while [ ! -f $S/stop ] && [ "$(date +%s)" -lt "$end" ] && [ "$miss" -lt 3 ]; do
  if curl -sf -o /dev/null --max-time 20 http://127.0.0.1:3297/sign-in; then miss=0; else miss=$((miss+1)); fi
  sleep 5
done
echo "stopping server at $(date -u +%T)"
fuser -k 3297/tcp >/dev/null 2>&1
for i in $(seq 1 15); do fuser 3297/tcp >/dev/null 2>&1 || break; sleep 1; done
fuser 3297/tcp >/dev/null 2>&1 && echo "server still up on 3297" || echo "server stopped at $(date -u +%T)"
wait 2>/dev/null
