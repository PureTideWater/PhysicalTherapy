export const meta = {
  name: 'lane-b-test-flakes-fix-suite',
  description: 'Fix round of PR #76: the full local suite once on b02435c5 in /home/user/test-flakes, each command under the lock, results recorded',
  phases: [{ title: 'Suite', detail: 'the full local suite once, in lanes/lane-b.md order' }],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/908cdf80-b74d-5a46-a9bb-4f85bd47f11f/scratchpad'
const OUT = '/home/user/ops/approval-summaries/lane-b-test-flakes-fix-suite.md'

const SCHEMA = {
  type: 'object',
  properties: {
    allPassed: { type: 'boolean' },
    rows: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' }, passed: { type: 'boolean' } }, required: ['command', 'result', 'passed'] } },
    failures: { type: 'array', items: { type: 'string' }, description: 'each failure with its cause and whether the diff caused it' },
    unitCounts: { type: 'string' },
  },
  required: ['allPassed', 'rows', 'failures', 'unitCounts'],
}

phase('Suite')
return await agent(`Context: you work for Lane B of the PaidWhole build (lane rules /home/user/ops/LANES.md). PR #76 (branch co-001/test-flakes, worktree /home/user/test-flakes, local head b02435c5, not yet pushed) fixes flaky tests; tests only. Run the FULL LOCAL SUITE ONCE on that head, as lanes/lane-b.md says: unit; golden; oracle; test:db in shards one after another; build, stamp, then e2e with E2E_PREBUILT=1; the mutation shards the change affects, then the gate.

Rules:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH (the default node is 22).
- Every heavy command under the shared lock: flock /tmp/laneb-heavy.lock <command>, one at a time. Long commands: run_in_background and wait for the notification (the Bash tool refuses a long foreground sleep).
- Never commit, push, checkout, reset, stash or edit tracked files; never comment on GitHub. Confirm git -C /home/user/test-flakes rev-parse --short HEAD is b02435c5 and the tree is clean before and after.
- No model name or identifier in anything you write. Synthetic data only.
- Save as you go: keep ${SP}/progress/fix-suite.md up to date (each command and its result as it finishes). If it exists when you start, an earlier run was interrupted: read it and continue from the first command without a result.

Use exactly the commands and order of /home/user/ops/approval-summaries/lane-b-materiality-cents-fix-suite.md's "Full local suite" table (read the whole file, including how e2e was run: E2E_ADMIN_URL on the PG18 cluster at 5433, the build and stamp commands, two e2e shards), adapted to this worktree: pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm verify-content; the engine-freeze check against the merge base (git merge-base HEAD origin/claude/build-platform); pnpm synth --all then git diff --exit-code; pnpm test (record files, passed, skipped); pnpm test:golden; pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3); db:migrate on a fresh database on 5433 then test:db in six shards one after another (counts), dropping the database after; build, stamp, e2e with E2E_PREBUILT=1 in two shards (counts; a failure only in screening.spec.ts SCR-01..07 at the outcome-stage read is a known flake: re-run that spec once and record both); then the mutation shards this diff affects (tools/stryker/affected.ts against the merge base decides; packages/packets' test file changed, so expect the packets shards) and the gate. Find each exact command in package.json scripts, tools/stryker and .github/workflows/ci.yml / mutation.yml where the table does not give it.

If a command fails, decide from its output whether the diff caused it (the diff: git -C /home/user/test-flakes diff e908c214..HEAD). Do not fix anything; record it. Write the results table to ${OUT} (a markdown file in the same shape as the materiality one: title, head, a table of command and result, then failures) and return the structured result.`, { label: 'fix-suite', phase: 'Suite', schema: SCHEMA })