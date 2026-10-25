#!/usr/bin/env bash
# The second hold of the shared lock: a fresh synthetic database, the existing build served, the contracts journey,
# the one shot, then the server stopped and the database dropped.
set -uo pipefail
S=/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/screens
source $S/env.sh
echo "lock acquired for retake at $(date -u +%T)"
cd /home/user/screens/apps/web
../../node_modules/.bin/tsx e2e/prepare.ts
server_env env PORT=3297 bash scripts/start-standalone.sh > $S/server2.log 2>&1 &
for i in $(seq 1 120); do curl -sf -o /dev/null http://127.0.0.1:3297/sign-in && break; sleep 1; done
echo "server ready at $(date -u +%T)"
cd $S
./node_modules/.bin/playwright test --config $S/screens.config.ts --project populate --workers 1 contracts.spec.ts > $S/populate2.log 2>&1
echo "contracts journey exit $? at $(date -u +%T)"
./node_modules/.bin/playwright test --config $S/screens.config.ts --project capture --workers 1 contract.spec.ts > $S/capture2.log 2>&1
echo "capture exit $? at $(date -u +%T)"
for n in $(fuser 3297/tcp 2>/dev/null); do kill $n; done
for i in $(seq 1 15); do fuser 3297/tcp >/dev/null 2>&1 || break; sleep 1; done
fuser 3297/tcp >/dev/null 2>&1 && echo "server still up" || echo "server stopped at $(date -u +%T)"
PGPASSWORD=test psql -h localhost -p 5433 -U postgres -d postgres -c "DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)"
rm -rf /tmp/tp-e2e-tp_e2e_screens-billing /tmp/tp-e2e-tp_e2e_screens-dev-auth /tmp/tp-e2e-tp_e2e_screens-documents /tmp/tp-e2e-tp_e2e_screens-mail /tmp/tp-e2e-tp_e2e_screens-model-outputs
echo "released at $(date -u +%T)"
