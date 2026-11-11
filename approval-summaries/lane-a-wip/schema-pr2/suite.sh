#!/usr/bin/env bash
# Schema PR 2: the full local suite once, on the final tree (from the interest fix's suite.sh; the mutation run is
# CI's: this PR changes no source file a mutation shard covers). Output per step in $L; summary.txt holds each exit.
set -u
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
S=$1; L=$S/suite; ADMIN=postgres://postgres:test@localhost:5433/postgres
cd /home/user/PhysicalTherapy
step() { n=$1; shift; local t0=$(date +%s); "$@" > "$L/$n.log" 2>&1; echo "$n exit $? ($(( $(date +%s) - t0 )) s)" >> "$L/summary.txt"; }
echo "suite start $(date -u +%FT%TZ) head $(git rev-parse HEAD) base $(git rev-parse origin/claude/build-platform)" > "$L/summary.txt"
step typecheck pnpm typecheck
step lint pnpm lint
step lint-copy pnpm lint:copy
step lint-logs pnpm lint:logs
step check-fixtures pnpm check:fixtures
step synth pnpm synth --all
step verify-content pnpm verify-content
step dm-migrate bash -c "psql $ADMIN -qc 'DROP DATABASE IF EXISTS tp_pr2_suite_1 WITH (FORCE)' -c 'CREATE DATABASE tp_pr2_suite_1' && DATABASE_URL=postgres://postgres:test@localhost:5433/tp_pr2_suite_1 pnpm -s db:migrate"
step dm-check env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_pr2_suite_1 pnpm -s db:domain-model --check
step dm-check-strict env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_pr2_suite_1 pnpm -s db:domain-model --check --strict
step dm-check-approval env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_pr2_suite_1 pnpm -s db:domain-model --check --require-approval
step dm-summary env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_pr2_suite_1 pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list
step dm-drop psql $ADMIN -qc "DROP DATABASE IF EXISTS tp_pr2_suite_1 WITH (FORCE)"
step status-fast git status --porcelain
step unit pnpm test --maxWorkers=2
step infra pnpm --filter @tp/infra test --maxWorkers=2
step golden pnpm test:golden
step oracle env TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3 pnpm test:oracle
step status-unit git status --porcelain
for k in 1 2 3 4; do
  step "db-$k" env DATABASE_URL=$ADMIN pnpm test:db --shard=$k/4 --maxWorkers=2
done
step build pnpm build
step stamp pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"
step e2e env E2E_PREBUILT=1 E2E_PORT=4991 E2E_DATABASE=tp_pr2_suite_2 DATABASE_URL=$ADMIN pnpm test:e2e --workers=2 --trace off
psql $ADMIN -c "DROP DATABASE IF EXISTS tp_pr2_suite_2 WITH (FORCE)" >> "$L/e2e-drop.log" 2>&1
rm -rf /tmp/tp-e2e-tp_pr2_suite_2-* 2>/dev/null
step status-end git status --porcelain
echo "suite end $(date -u +%FT%TZ)" >> "$L/summary.txt"; echo DONE >> "$L/summary.txt"
cat "$L/summary.txt"; for f in status-fast status-unit status-end; do echo "== $f"; cat "$L/$f.log"; done
