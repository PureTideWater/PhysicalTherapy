#!/bin/sh
cd /home/user/PhysicalTherapy || exit 1
PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx /home/user/review-time/nullspent.mts
for a in "asemi 1" "yensemi 1" "prose 1" "digitLF 1"; do FIX=1 PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx /home/user/review-time/claims.mts $a; done
grep -rn "holdsIdentifier(\|checkWorkOf(" --include=*.ts packages apps 2>/dev/null | grep -v "\.test\.ts\|packages/redact/src/redact.ts" | cut -c1-220
