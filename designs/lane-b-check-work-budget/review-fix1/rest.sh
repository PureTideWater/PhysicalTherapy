#!/bin/bash
cd /home/user/PhysicalTherapy
T() { PATH=/opt/node24/bin:$PATH timeout 240 node_modules/.bin/tsx "$@" >>/home/user/review-fix1/out/rest.log 2>&1 || echo "FAILED/timeout $?: $*" >> /home/user/review-fix1/out/rest.log; }
T /home/user/review-fix1/calcheck.mts
for w in 2 3 4; do echo "WORDS=$w:" >> /home/user/review-fix1/out/time.txt; WORDS=$w T /home/user/review-fix1/fam.mts "names50 plainwords prose"; done
for f in "names50x40 prose" "names50x12 prefix2" "names50x12 yensemi" "claims5000x40 prose" "members1000 digitLF" "yensemi 1 claim (earlier dearest)"; do TRIAL=1 T /home/user/review-fix1/fam2.mts "$f"; done
for f in "tiny claims5000x40 across nearmiss39" "tiny claims5000 across prose" "tiny names50x40 prose" "tiny members1000 prose" "tiny allmax across yensemi" "allmax prose" "allmax across yensemi"; do T /home/user/review-fix1/fam.mts "$f"; done
echo DONE >> /home/user/review-fix1/out/rest.log
