export const meta = {
  name: 'loader-freeze-into-1b-lane-a',
  description: 'Lane A: the founder-granted release loader freeze fix into SUITE-CAP-1b (patch with its failing-first tests; the grant recorded in ADR 0083 and reconciliation-001), checked, pushed; 1b into interest again; an adversarial check that the diff stays inside the grant',
  phases: [
    { title: 'Loader into 1b', detail: 'apply the patch; record the grant; checks; push' },
    { title: 'Interest', detail: 'merge 1b again; checks; push' },
    { title: 'Verify', detail: 'the diff against the grant text; the content-pipeline checks' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e935a935-d2ff-5a27-860c-22677590c441/scratchpad'
const SESSION = 'https://claude.ai/code/session_019i9ifEG147aKfNHEAsoS7h'
const SC = '/home/user/sc1b', SCBR = 'co-001/suite-cap-1-triage-locks', SC0 = 'ab8c9c2765fac4a42090d1495018ae63d39fcce1'
const IN = '/home/user/interest', INBR = 'co-001/ledger-interest-once', IN0 = 'adf0f5d25023ae66d9d83f275eb976cba34dd53f'
const PATCH = '/home/user/ops/approval-summaries/lane-a-wip/flaky-load/loader-freeze.patch'
const RECORD = '/home/user/ops/approval-summaries/lane-a-wip/flaky-load/record.md'
const GRANT = `Granted: an exception to reconciliation-001's content-pipeline check for the release loader's freeze, as written: after a load commits, loadRelease runs VACUUM (FREEZE, ANALYZE) rule_record and, while pg_class shows rule_record not all-frozen, pauses and runs VACUUM (FREEZE) rule_record again, for up to 180 seconds; its result gains frozen, false only when the wait runs out; loading an already-loaded release writes nothing and runs the same freeze; release:load warns on stderr when not yet frozen; release:rollback does not wait. Everything else in the pipeline stays frozen. It also covers PR 6b-3's original VACUUM.`
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists when you start, an earlier run was interrupted: read it, trust it unless the code says otherwise, and continue. Never return early with work unfinished unless a real blocker stops you, and always finish by returning your structured result.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole; public). You work for Lane A's schema-chain session (GitHub login PureTideWater). SUITE-CAP-1b (${SCBR}; worktree ${SC}; head ${SC0}; ADR 0083; no PR yet) and the interest fix (${INBR}; worktree ${IN}; head ${IN0}; ADR 0084; no PR yet). Never write /home/user/ops, /home/user/ss01 or /home/user/PhysicalTherapy. Open no PR, post no comment.
THE FOUNDER'S GRANT (Tyler Williams, 2026-11-04 ~09:55 UTC, relayed by Lane A's orchestrator session_01TrKDxeLbxVo7t7zwRXFzrg; recorded in /home/user/ops/approval-summaries/founder-asks-2026-10-27.md under "Granted 2026-11-04"), word for word: "${GRANT}"
The root cause and the fix: ${RECORD} (read it whole) and the patch ${PATCH} (4 files: packages/rules/src/loader.ts, tools/release/index.ts, tools/release/rollback.ts, tools/release/load.db.test.ts; made against 22177731; its files are byte-identical at ${SC0} unless git says otherwise).
SPEED WITHOUT LOWERING QUALITY (the co-founder, 2026-11-04): between pushes locally the fast checks (pnpm typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all with no diff), the tests the change touches, pnpm -s db:domain-model --check. 1b's full suite runs once in its PR's fix round, not now.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp). PG_BIN_DIR=/opt/pg18/bin. Heavy commands under 'flock /tmp/laneb-heavy.lock'. Long commands: run_in_background and poll. Databases tp_loader_<role>_<n>, dropped when done. 4 CPUs: workers at 2.
Rules: CLAUDE.md in full; LANES.md rule 6 (merge commits only; generated files regenerated, never hand-merged; shared documents keep both sides). Never write an approval line or approvers.json; never approve or request changes on a PR; never rebase, force, --no-verify or add a .gitleaksignore entry; never write files through the GitHub connector. Never edit content/releases/**, tools/verify-content, .claude/hooks/protect-content.sh, .github/workflows/publish-content.yml, .claude/skills/load-release or any rule table's DDL. No PHI and no model identifier in any file or commit text (the trailer is required). ${ATTR}
Never skip or loosen a test. Report every check with its command and totals.`
const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const PUSHED = { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, summary: { type: 'string' }, checks: CHECKS, open_items: { type: 'array', items: { type: 'string' } } }, required: ['head', 'pushed', 'summary', 'checks', 'open_items'] }

phase('Loader into 1b')
const a = await agent(`${COMMON}

In ${SC} (git pull --no-rebase origin ${SCBR}; head ${SC0}, clean):
1. Apply the patch (git apply --3way ${PATCH}); confirm the four files equal the patch's result. Show failing-first once more on this tree: with the old loader.ts and rollback.ts and the new load.db.test.ts, the new tests fail (as recorded: 5 failed, plus the stopped-load and rollback cases); with the fix they pass.
2. Record the grant: (a) in ADR 0083 (docs/adr/0083-*.md), a dated paragraph under its 1b section naming the defect (the flaky relallvisible, its root cause in two sentences), the fix, and the grant quoted word for word with who and when and where it is recorded; (b) in docs/product/reconciliation-001.md's content-pipeline check (around lines 454 and 472-485: read them), a dated line recording the exception, quoting the grant word for word, and naming the files it covers; (c) wherever the repository lists tools/release/load.db.test.ts as a known flake (search: grep -rn "load.db.test" docs tools .github vitest.config.ts; any flake list or quarantine note), remove that listing; say if none exists. If the repository has a test-matrix row or synth registry entry whose assertedBy should name the new tests (search for tools/release/load.db.test.ts in packages/synth/src/cases and docs/product/test-matrix.md), keep it consistent; add no new row unless the convention requires one (say which).
3. Checks: the fast checks; tools/release/load.db.test.ts 10 times in a row alone (under the lock) and once beside a held-open xid in another database of the cluster (the record's flaky-loop.sh shows how); tools/release/dry-run.db.test.ts; the db test files that import the loader (the record lists 72; run those outside shard 1's own files, or all of them if quicker under the lock); verify-content; pnpm -s db:domain-model --check (unchanged: no schema file is touched).
4. Commit ("rules: the release loader keeps its promise that a loaded release is frozen ... (the founder's exception of 2026-11-04; ADR 0083)" in house style), push ${SCBR}. ${SAVE('loader-1b.md', 'apply, failing-first, records, checks, push')}`, { label: '1b: loader fix + grant records', phase: 'Loader into 1b', schema: PUSHED })
if (!a || !a.pushed) return { error: '1b loader fix not pushed', a }

const v = agent(`${COMMON}

You are an adversarial checker of SUITE-CAP-1b's loader commit(s) ${SC0}..${a.head}. READ-ONLY on every worktree. Clone into ${SP}/v-loader at ${a.head} (git clone /home/user/PhysicalTherapy; origin to GitHub; pnpm install --frozen-lockfile under the lock). Check, with evidence:
1. Every behaviour the diff adds or changes is inside the grant's words: list each change in packages/rules/src/loader.ts, tools/release/index.ts, tools/release/rollback.ts and anything else, and map it to a clause of the grant; anything outside the grant (another file of the pipeline, a changed check or refusal before the transaction, a changed write, lock or withdrawal, a different bound than 180 s, a retry that re-runs ANALYZE beyond what the grant says) is a problem.
2. reconciliation-001's four mechanical content-pipeline checks (read docs/product/reconciliation-001.md) pass: no edit under content/releases; tools/verify-content, .claude/hooks/protect-content.sh and .github/workflows/publish-content.yml unchanged; no DDL on rule_release, rule_record or rule_release_withdrawal; verify-content passes.
3. ADR 0083 and reconciliation-001 quote the grant word for word ("${GRANT}"), with who and when.
4. The new tests are deterministic (they hold the horizon themselves) and would fail on the old loader; run tools/release/load.db.test.ts 5 times; run it once against the old loader.ts/rollback.ts to see the new cases fail.
5. No known-flake listing of load.db.test.ts remains.
Report only real problems. Remove the clone and databases after.`, { label: 'verify: loader within the grant', phase: 'Verify', schema: { type: 'object', properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, evidence: { type: 'string' } }, required: ['title', 'severity', 'evidence'] } }, checks: CHECKS }, required: ['ok', 'problems'] } })

phase('Interest')
const i = await agent(`${COMMON}

In ${IN} (git pull --no-rebase origin ${INBR}; head ${IN0}, clean): git fetch origin ${SCBR}; git merge --no-ff ${a.head} ("Merge SUITE-CAP-1b (${a.head.slice(0, 8)}: the release loader's granted freeze fix) into the interest fix"). Conflicts are unlikely (ADR 0083 and reconciliation-001 may conflict with interest's own records: keep both sides). Regenerate only if a generated file changed. Checks: the fast checks; tools/release/load.db.test.ts and the interest db tests that load a release (search the touched list in ${RECORD}); pnpm -s db:domain-model --check. Push ${INBR}. ${SAVE('loader-interest.md', 'merge, checks, push')}`, { label: 'interest: merge 1b (loader)', phase: 'Interest', schema: PUSHED })

const ver = await v
return { a, ver, i }
