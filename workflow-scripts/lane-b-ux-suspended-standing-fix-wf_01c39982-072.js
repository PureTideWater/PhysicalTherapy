export const meta = {
  name: 'lane-b-ux-suspended-standing-fix',
  description: 'Fix round for PR #56: every review finding, then the full local suite once',
  phases: [{ title: 'Fix', detail: 'one fixer' }, { title: 'Suite', detail: 'base merge if moved, the full local suite' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4b2d015a-84c8-5610-8630-1a03db5b4a46/scratchpad'
const WT = '/home/user/ux-suspended-standing'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}); if it exists from an interrupted run, read it and continue.`
const RULES = `Work only in ${WT} (branch co-001/ux-suspended-standing, head a1c41855, PR #56). Never touch /home/user/PhysicalTherapy, never push, never rebase. Synthetic data only; no model identifier in any file; never edit a file in ${SP}/pr42-files.txt except docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts (this PR's rows only); no migration; NEVER run prettier. If PostgreSQL on 5433 is down, start it as HANDOFF.md says. Node: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Every heavy command only as flock /tmp/laneb-heavy.lock <command>, one at a time. Commit messages end with exactly these two lines after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbDNvf4ojucLA3uyPfs1FC`
const RESULT = { type: 'object', properties: { commits: { type: 'array', items: { type: 'string' } }, dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, resolution: { type: 'string' } }, required: ['id', 'resolution'] } }, checks: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, proposals: { type: 'array', items: { type: 'string' } } }, required: ['commits', 'dispositions', 'checks', 'summary', 'proposals'] }
phase('Fix')
const fix = await agent(`You are the fixer of PaidWhole PR #56's fix round (one account standing on the billing page). ${RULES}
${SAVE('ss-fix.md', 'each finding done and what remains')}
The reviews: ${SP}/ss-reviews.json ("correctness": SSC-01 to SSC-04; "ux": UX-1 to UX-9). Read them whole. Every finding is accepted; implement each per its fix, with these decisions:
- SSC-02 wins over UX-3 and UX-9: a closed organization is promised no reopening anywhere (no "reopen" in any customer string); its combined hold says the invoice "is still owed" with no clause about runs; its next step is the ticket "if you have a question about the closure"; its plan refusal "A closed organization takes no new plan." (with the ticket as a link if UX-9 asks for a link); the invoices empty state for a closed organization does not offer a plan (UX-3) and makes no reopen promise.
- SSC-01: the holding count (same predicate as billing_standing) through organizationBilling; words for one vs several held invoices; a db test with two invoices failed 31 and 45 days ago (pay the holding one; the refusal persists and the standing names the second).
- SSC-03: the ACH caveat on the past-due notice and hold; the stop as a UTC timestamp if the page's utc() helper makes it read well.
- SSC-04: the closed check folded into the subscription claim insert, keeping the early read for the message.
- UX-1 (the past-due hold's wording when suspended), UX-2 (footnote only with prices on screen), UX-4 (closed neutral tone, status role unless an invoice is held; console badge too), UX-5 (scroll margin on the Pay target, or html scroll-padding once), UX-6 ("Suspended by PaidWhole" in the console too), UX-7 (the console's firm-aware hold words), UX-8 ("reinstates" consistently, in the notice, lifted words, the ticket detail and e2e), and any later UX finding in the file, per its fix.
Update the BIL-05/BIL-06 rows (test-matrix.md and matrix.ts identical), fixtures via pnpm synth --all, account-standing.test.tsx, standing.test.ts, billing-routes.db.test.ts and e2e/billing.spec.ts to match. Then run typecheck, eslint on changed files, lint:copy, the unit tests for the changed files, synth --all and the db tests the diff touches (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres). Commit. Report each finding's resolution with its commit.`, { label: 'ss-fixer', phase: 'Fix', schema: RESULT })
phase('Suite')
const suite = await agent(`You are the suite runner of PaidWhole PR #56's fix round. ${RULES}
${SAVE('ss-suite.md', 'each step and result as it finishes')}
The fixer reports: ${JSON.stringify(fix)}
1. Re-read git -C ${WT} diff a1c41855..HEAD against ${SP}/ss-reviews.json and the dispositions; fix anything wrong or inconsistent in a new commit.
2. If origin/claude/build-platform moved past 88a0e4e9, merge it with a merge commit (LANES rule 6; both lanes' rows kept; lockfile via pnpm install).
3. The full local suite once on the final head, each command under flock /tmp/laneb-heavy.lock, in the order and with the exact commands of /home/user/ops/approval-summaries/lane-b-materiality-cents-fix-suite.md (read it; e2e used E2E_ADMIN_URL on 5433): install --frozen-lockfile; check:fixtures; typecheck; lint; lint:copy; lint:logs; verify-content; the engine-freeze check against the merge base; synth --all then git diff --exit-code; pnpm test (files, passed, skipped); test:golden; test:oracle; db:migrate on a fresh database then test:db in six shards (counts); build, stamp, e2e with E2E_PREBUILT=1 and two shards (counts; BIL-06 included; a failure only in screening.spec.ts SCR-01..07 at the outcome-stage read is the known flake: re-run that spec once and record both); tools/stryker/affected.ts then the gate. Fix any failure the diff causes in a new commit and re-run.
4. Write ${SP}/ss-fix-suite.md (commits, dispositions, each command and counts). Do not push.`, { label: 'ss-suite', phase: 'Suite', schema: RESULT })
return { fix, suite }