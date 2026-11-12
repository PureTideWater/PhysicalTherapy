#!/bin/sh
cd /home/user/PhysicalTherapy || exit 1
R=/home/user/review-time
PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx $R/refuse.mts > $R/out/log-refuse.txt 2>&1
PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx $R/prof.mts yensemi 1 > $R/out/log-prof.txt 2>&1
PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx $R/prof.mts yen 400 >> $R/out/log-prof.txt 2>&1
for a in "yensemi 1" "asemi 1000" "prose 3000"; do PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx $R/claims.mts $a; done
