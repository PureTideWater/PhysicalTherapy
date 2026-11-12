#!/bin/sh
cd /home/user/PhysicalTherapy || exit 1
for a in "asemi 1000" "yen 1000" "prose 1000"; do FIX=1 PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx /home/user/review-time/claims.mts $a; done
