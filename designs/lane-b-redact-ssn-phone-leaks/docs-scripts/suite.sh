#!/bin/bash
# The full local suite, once, on the merged head of co-001/redact-ssn-phone-leaks. Each step's output goes to
# $O/<step>.log and one line per step to $O/summary.txt. Heavy steps take the lane's heavy-step lock.
set -u
export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH
export TP_ORACLE_PYTHON=/home/user/work/oracle-venv/bin/python
cd /home/user/leaks
O=/home/user/work/p15/suite; mkdir -p "$O"; : > "$O/summary.txt"
ADMIN=postgres://postgres:test@localhost:5433/postgres
HEAVY="flock /tmp/laneb-heavy.lock"
step() { local name=$1; shift; local start; start=$(date +%s); ( "$@" ) > "$O/$name.log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - start ))s head=$(git rev-parse --short HEAD)" | tee -a "$O/summary.txt"; }
step typecheck pnpm -s typecheck
step lint pnpm -s lint
step lint-logs pnpm -s lint:logs
step lint-copy pnpm -s lint:copy
step check-fixtures pnpm -s check:fixtures
step verify-content pnpm -s verify-content
step synth-all bash -c 'pnpm -s synth --all; echo "git status lines: $(git status --short | wc -l)"'
step watched bash -c 'pnpm exec tsx tools/screening-capacity/watched.ts --write; echo "git status lines: $(git status --short | wc -l)"'
step unit $HEAVY pnpm -s test
step golden $HEAVY pnpm -s test:golden
step oracle $HEAVY pnpm -s test:oracle
step eval $HEAVY pnpm -s --filter @tp/model-gateway eval
for n in 1 2 3 4; do
  db=leaks_suite_db$n
  psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $db WITH (FORCE)" -qc "CREATE DATABASE $db" > /dev/null 2>&1
  step "db-$n" bash -c "export DATABASE_URL=postgres://postgres:test@localhost:5433/$db; pnpm -s db:migrate && $HEAVY pnpm -s test:db --shard=$n/4"
  psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $db WITH (FORCE)" > /dev/null 2>&1
done
step stryker-affected pnpm exec tsx tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform
step engine-freeze pnpm exec tsx tools/engine-freeze/check.ts "$(git merge-base HEAD origin/claude/build-platform)"
step build bash -c "$HEAVY pnpm -s build && git rev-parse HEAD > apps/web/.next/BUILD_COMMIT && echo stamped \$(cat apps/web/.next/BUILD_COMMIT)"
step e2e bash -c "export E2E_PREBUILT=1 E2E_DATABASE=leaks_suite_e2e E2E_PORT=3197 E2E_ADMIN_URL=$ADMIN; $HEAVY pnpm -s test:e2e --workers=2 --trace off"
psql "$ADMIN" -qc "DROP DATABASE IF EXISTS leaks_suite_e2e WITH (FORCE)" > /dev/null 2>&1
echo "suite done $(date -u +%H:%M:%S)" | tee -a "$O/summary.txt"
