#!/bin/bash
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
date -u +"%H:%M:%S start pre1 load"; $P -d pr5_pre1 -f pre_load1.sql > out2/pre1_load.txt 2>&1; echo "exit $?"; touch out2/pre1.loaded
date -u +"%H:%M:%S start pre3 load"; $P -d pr5_pre3 -f pre_load3.sql > out2/pre3_load.txt 2>&1; echo "exit $?"; touch out2/pre3.loaded
date -u +"%H:%M:%S done"
