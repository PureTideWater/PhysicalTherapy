#!/bin/sh
# determinism on Node 24 and Node 22 (three modes each), then claims reruns in fresh processes
cd /home/user/PhysicalTherapy || exit 1
R=/home/user/review-time
for m in fresh after reversed; do PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx $R/determinism.mts $m; done
for m in fresh after reversed; do PATH=/opt/node22/bin:$PATH timeout 280 node_modules/.bin/tsx $R/determinism.mts $m; done
for a in "prose 200" "prose 1000" "yen 1000" "asemi 400"; do PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx $R/claims.mts $a; done
