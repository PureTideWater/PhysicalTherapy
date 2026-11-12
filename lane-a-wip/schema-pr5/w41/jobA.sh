#!/bin/bash
# W41 part A: database m1 (statistics never gathered), the plans and the preflight block there.
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q -At"
stamp() { date -u +"%H:%M:%S $*"; }
stamp "create m1"; $P -c "DROP DATABASE IF EXISTS pr5w41_m1" -c "CREATE DATABASE pr5w41_m1 TEMPLATE pr5w41_base"
stamp "load m1"; $P -d pr5w41_m1 -v analyze_empty=0 -v practices=1000 -f load.sql > out/m1_load.txt 2>&1; echo "  exit $?"
stamp "plans, never analyzed"; $P -d pr5w41_m1 -f plans.sql > out/m1_never_plans.txt 2>&1
stamp "preflight, never analyzed, no lock"; $P -d pr5w41_m1 -v lock=0 -f run_preflight.sql > out/m1_never_preflight_lock0.txt 2>&1
stamp "done A"
