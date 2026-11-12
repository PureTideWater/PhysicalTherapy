#!/bin/bash
# waits for the differential to finish (quiet machine), then one family per fresh process
while pgrep -f review-fix1/diff.mts >/dev/null; do sleep 5; done
cd /home/user/PhysicalTherapy
while IFS= read -r f; do PATH=/opt/node24/bin:$PATH timeout 300 node_modules/.bin/tsx /home/user/review-fix1/fam.mts "$f" >/dev/null 2>>/home/user/review-fix1/out/time.err || echo "$f: FAILED/timeout $?" >> /home/user/review-fix1/out/time.txt; done <<'L'
names50x12 prose
names50x12 prefix2
names50x12 parts(matches)
names50x12 wordsoutoforder
names50x40 prose
names50x12 yensemi
yensemi 1 claim (earlier dearest)
members1000 prose
members1000 digitLF
members1000 nearmiss
members1000 nearmiss-nosep
claims5000 one prose
claims5000 across prose
claims5000 one tok9
claims5000 one nearmiss
claims5000x40 prose
claims5000x40 nearmiss39
claims5000x40 across nearmiss39
allmax prose
allmax across yensemi
tiny claims5000 one prose
tiny claims5000 across prose
tiny claims5000x40 across nearmiss39
tiny allmax across yensemi
tiny names50x40 prose
tiny members1000 prose
L
echo DONE >> /home/user/review-fix1/out/time.txt
