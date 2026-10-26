export const meta = {
  name: 'lane-b-pr15b-verify',
  description: 'Lane B PR 15b (#51): fresh-clone verification of the head, reading CI',
  phases: [{ title: 'Verify', detail: 'fresh clone, scope and invariants, focused suites, mutation gate, CI from its logs, records and description' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const OUT = SP + '/pr15b-verify'
const HEAD = args.head
const BASE = args.base
phase('Verify')
const v = await agent(`PaidWhole, repo PureTideWater/PhysicalTherapy. CLAUDE.md is in your context. You are the fresh-clone verifier of PR #51 (co-001/pr-15b-ledger-payment-terms, head ${HEAD.slice(0, 7)}, which has merged claude/build-platform ${BASE.slice(0, 7)} with a merge commit under LANES.md rule 6): PR 15b, ledger amounts in payment terms (combined audit #12, ADR 0067). The design: /home/user/ops/designs/lane-b-pr15b.md; the reviews and fix-round records: /home/user/ops/approval-summaries/lane-b-pr15b-*; the status: lane-b-pr15b-status.md. You wrote none of it: verify adversarially. The account's weekly usage is near its limit: be efficient, but cut no check.
Save as you go: keep ${SP}/progress/verify.md up to date (each check and result); if it exists when you start, continue from it.

Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. PG18 at localhost:5433 (postgres:test). Every command that starts vitest, tsc, eslint, Stryker, a build or a database suite under flock /tmp/laneb-heavy.lock, one at a time, in the foreground. GitHub reads: mcp__github__* tools via ToolSearch (pull_request_read get_check_runs, get_job_logs with return_content and tail_lines) or gh api; no GitHub writes, no comment, no review, no push.

1. git clone -q https://github.com/PureTideWater/PhysicalTherapy ${OUT}/verify && cd ${OUT}/verify && git checkout -q ${HEAD}; pnpm install --frozen-lockfile --prefer-offline. Remove the clone at the end.
2. Scope and invariants against the original base 6ddd587 and against ${BASE.slice(0, 7)} (git diff ${BASE.slice(0, 7)} ${HEAD.slice(0, 7)} is the PR's own change): packages/ledger/src: only payment.ts, payment.test.ts and one added export line in index.ts (0 deletions elsewhere); nothing under packages/pricing (non-test), packages/db/migrations, docs/product/domain-model.md, fixtures/golden, content/releases; apps/worker/src/reconcile/ledger.db.test.ts byte-identical; LED-01..LED-13 fixtures and expected.json unchanged; the ledger oracle's six original cases and harness unchanged (only appended cases); stryker/shards.json lists payment.ts; tools/screening-capacity/watched-paths.txt equals what tools/screening-capacity/watched.ts derives; no model identifier, no float arithmetic on money, no PHI-shaped value in the diff; every commit of the PR ends with the two attribution lines; of PR #42's files (gh api 'repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1' and page=2; is #42 still open?) only test-matrix.md, reconciliation-001.md, packages/synth/src/cases/{matrix,registry}.ts and watched-paths.txt are touched.
3. pnpm synth --all writes nothing; pnpm check:fixtures; the focused db run with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (pnpm db:migrate first): vitest run --project db apps/worker/src/reconcile apps/worker/src/report apps/web/src/lib/routes/reconciliation-routes.db.test.ts; and vitest run --project unit packages/ledger packages/synth apps/web/src/components/reconciliation.
4. The money-ledger mutation shard: canary first (5 of 5), then TP_MUTATION_SHARD=money-ledger pnpm -s exec tsx tools/stryker/shards.ts money-ledger, then tools/stryker/gate.ts --shard money-ledger: payment.ts at 100%, every survivor a recorded equivalent.
5. CI on ${HEAD.slice(0, 7)}, from its own logs (wait if still running: poll get_check_runs no more often than every 3 minutes, up to 60 minutes): every check green (all green, mutation with its shards and the money-ledger canary, screening-capacity gate, approval-of-record, db 1-4, e2e 1-2, unit). Record the unit, db and e2e test counts from CI's own logs.
6. Records: ADR 0067, PRD 13 and 12 edits, reconciliation-001 item 15b, test-matrix rows LED-14..LED-18 word for word in matrix.ts, the registry's assertedBy pointing at tests that exist; the rulings named with who and when (the founder's adoption of 2026-10-20 ~15:10 UTC; the co-founder's standing ruling of 2026-10-26 ~00:20 UTC for Q1/Q2); the stored case close recorded as handed to Lane A.
7. Adversarial: pick three findings from the reviews and re-checks (one blocking from each of the payment-engine review, re-check 1 and re-check 2: B1, R1, RR1) and confirm the fix holds by its test; and read the PR description (pull_request_read get) for anything false or stale at ${HEAD.slice(0, 7)} (it lists 1eb8415 as the last merged head; the new merge of ${BASE.slice(0, 7)} is not yet in it — note what to add).
8. Write ${OUT}/verify-summary.md in the house format of /home/user/ops/approval-summaries/lane-b-pr15-verify-summary.md. Verdict pass only if every check passes and no blocking or should_fix finding stands (a stale description sentence is a nit unless it misstates scope, a ruling or a result).`, { label: 'verify', phase: 'Verify', schema: {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] }, head_verified: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { check: { type: 'string' }, result: { type: 'string' }, pass: { type: 'boolean' } }, required: ['check', 'result', 'pass'] } },
    ci: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } },
  },
  required: ['verdict', 'head_verified', 'checks', 'ci', 'findings'],
} })
if (!v) throw new Error('The verifier returned nothing; PR #51 is not verified.')
return v
