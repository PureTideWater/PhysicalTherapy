#!/usr/bin/env bash
# The interest fix round: the full local suite once, on the final tree.
set -u
source /tmp/claude-0/-home-user-PhysicalTherapy/e935a935-d2ff-5a27-860c-22677590c441/scratchpad/intfix/common.sh
echo "suite start $(date -u +%FT%TZ) head $(git rev-parse HEAD)" >> "$L/summary.txt"
step typecheck flock /tmp/laneb-heavy.lock pnpm typecheck
step lint flock /tmp/laneb-heavy.lock pnpm lint
step lint-copy pnpm lint:copy
step lint-logs pnpm lint:logs
step check-fixtures pnpm check:fixtures
step synth pnpm synth --all
step verify-content pnpm verify-content
step actions-check env BASE=origin/claude/build-platform pnpm actions:check
step toolchain-check env BASE=origin/claude/build-platform pnpm toolchain:check
step dm-migrate flock /tmp/laneb-heavy.lock bash -c "psql $ADMIN -qc 'DROP DATABASE IF EXISTS tp_intpr_fix_1 WITH (FORCE)' -c 'CREATE DATABASE tp_intpr_fix_1' && DATABASE_URL=postgres://postgres:test@localhost:5433/tp_intpr_fix_1 pnpm -s db:migrate"
step dm-check env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_intpr_fix_1 pnpm -s db:domain-model --check
step dm-check-strict env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_intpr_fix_1 pnpm -s db:domain-model --check --strict
step dm-check-approval env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_intpr_fix_1 pnpm -s db:domain-model --check --require-approval
step dm-summary env DATABASE_URL=postgres://postgres:test@localhost:5433/tp_intpr_fix_1 pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list
step dm-drop psql $ADMIN -qc "DROP DATABASE IF EXISTS tp_intpr_fix_1 WITH (FORCE)"
step status-fast git status --porcelain
step unit flock /tmp/laneb-heavy.lock pnpm test --maxWorkers=2
step infra flock /tmp/laneb-heavy.lock pnpm --filter @tp/infra test --maxWorkers=2
step golden flock /tmp/laneb-heavy.lock pnpm test:golden
step oracle env TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3 pnpm test:oracle
step status-unit git status --porcelain
for k in 1 2 3 4; do
  step "db-$k" flock /tmp/laneb-heavy.lock env DATABASE_URL=$ADMIN pnpm test:db --shard=$k/4 --maxWorkers=2
done
step build flock /tmp/laneb-heavy.lock pnpm build
step stamp pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"
step e2e flock /tmp/laneb-heavy.lock env E2E_PREBUILT=1 E2E_PORT=4991 E2E_DATABASE=tp_intpr_fix_2 DATABASE_URL=$ADMIN pnpm test:e2e --workers=2
psql $ADMIN -c "DROP DATABASE IF EXISTS tp_intpr_fix_2 WITH (FORCE)" >> "$L/e2e-drop.log" 2>&1
rm -rf /tmp/tp-e2e-tp_intpr_fix_2-* 2>/dev/null
step status-e2e git status --porcelain
echo "stryker start $(date -u +%FT%TZ)" >> "$L/summary.txt"
rm -rf reports/mutation
SHARDS="money-ledger packets-scan packets-roles packets-roles-cues packets-roles-numbers packets-words-labels packets-words-amounts packets-words-days packets-words-dates packets-words-prose packets-verifier packets-facts packets-rest packets-explain pricing-engine pricing-recompute pricing-rest"
for s in $SHARDS; do
  case $s in money-ledger) pkgs="money ledger";; packets-*) pkgs=packets;; pricing-*) pkgs=pricing;; esac
  step "stryker-$s" flock /tmp/laneb-heavy.lock bash -c "export TP_MUTATION_SHARD=$s; pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs --concurrency 2 && pnpm -s exec tsx tools/stryker/canary/verdict.ts --shard $s && for p in $pkgs; do echo \"stryker ($s): \$p\"; pnpm -s exec tsx tools/stryker/stryker.ts run stryker/\$p.config.mjs --concurrency 2 || exit 1; done; rc=\$?; pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard $s; g=\$?; [ \$rc -eq 0 ] && [ \$g -eq 0 ]"
done
step stryker-gate pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected '["money-ledger","packets-scan","packets-roles","packets-roles-cues","packets-roles-numbers","packets-words-labels","packets-words-amounts","packets-words-days","packets-words-dates","packets-words-prose","packets-verifier","packets-facts","packets-rest","packets-explain","pricing-engine","pricing-recompute","pricing-rest"]'
step status-end git status --porcelain
echo "suite end $(date -u +%FT%TZ)" >> "$L/summary.txt"
echo DONE >> "$L/summary.txt"
