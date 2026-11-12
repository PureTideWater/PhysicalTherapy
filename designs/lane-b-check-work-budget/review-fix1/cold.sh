#!/bin/bash
while pgrep -f review-fix1/rest.sh >/dev/null; do sleep 3; done
cd /home/user/PhysicalTherapy
R() { PATH=/opt/node24/bin:$PATH timeout 280 node_modules/.bin/tsx /home/user/review-fix1/cold.mts "$@" >>/home/user/review-fix1/out/cold.log 2>&1 || echo "FAILED/timeout $?: $*" >> /home/user/review-fix1/out/cold.txt; }
R 1250 40 one; R 2500 40 one; R 2500 20 one; R 5000 9 one; R 1000 9 one; R 300 40 one
rm -rf /home/user/review-fix1/out/prof; NODE_OPTIONS="--cpu-prof --cpu-prof-dir=/home/user/review-fix1/out/prof" R 1250 40 across
python3 /home/user/review-fix1/prof.py /home/user/review-fix1/out/prof > /home/user/review-fix1/out/prof.txt 2>&1
echo DONE >> /home/user/review-fix1/out/cold.txt
