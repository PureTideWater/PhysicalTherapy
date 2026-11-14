#!/bin/bash
# The new timing tests' quantities: idle, then under 4 busy loops (all 4 cores), each step under the shared lock.
N=/opt/node24/bin/node
L="flock /tmp/laneb-heavy.lock timeout 600"
cd /home/user/item39
echo "## idle: G-1 quantities HEAD"; REPO=/home/user/item39 $L $N --no-warnings /home/user/rv2/tests.mts 6
echo "## idle: G-1 quantities BASE"; REPO=/home/user/PhysicalTherapy $L $N --no-warnings /home/user/rv2/tests.mts 1
echo "## idle: cold script (tsx), 1000 x6, 6300 x2"
for i in 1 2 3 4 5 6; do $L node_modules/.bin/tsx packages/model-gateway/src/test-support/many-identifiers.ts 1000; done
for i in 1 2; do $L node_modules/.bin/tsx packages/model-gateway/src/test-support/many-identifiers.ts 6300; done
echo "## idle: vitest rows (a) and (b)"
$L pnpm --filter @tp/model-gateway exec vitest run src/redact.matching.test.ts -t 'G-1|cold' 2>&1 | tail -12
echo "## loaded (4 busy loops on 4 cores)"
$L bash -c '
for i in 1 2 3 4; do /opt/node24/bin/node -e "for(;;){}" & done
sleep 1
REPO=/home/user/item39 /opt/node24/bin/node --no-warnings /home/user/rv2/tests.mts 5
for i in 1 2 3 4 5; do node_modules/.bin/tsx packages/model-gateway/src/test-support/many-identifiers.ts 1000; done
pnpm --filter @tp/model-gateway exec vitest run src/redact.matching.test.ts -t "G-1|cold" 2>&1 | tail -12
kill $(jobs -p)
'
echo "## done"
