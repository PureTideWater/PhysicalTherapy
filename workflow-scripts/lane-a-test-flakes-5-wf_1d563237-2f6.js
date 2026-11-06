export const meta = {
  name: 'acting-s4-test-flakes-5',
  description: 'test-flakes-5 (tests only): axe runs before the restarted page has its title; fix at the class in expectAccessible, sweep e2e, red-first proof, draft PR, one review with skeptics, the full suite once, verification on CI',
  phases: [
    { title: 'Build', detail: 'root cause from the CI log, failing-first proof, the helper fix, sweep' },
    { title: 'Review', detail: 'one adversarial review; skeptics' },
    { title: 'Fix', detail: 'one fix round, base merge, full suite once, one push' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/tf5'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/test-flakes-5'
const BR = 'co-001/test-flakes-5'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}). A tests-only flake fix that Lane A's orchestrator put first. Branch ${BR}, worktree ${WT} (base 9c6bb102, installed, no commits). The failure: apps/web/e2e/sign-in-time.spec.ts:213, the step "a valid code pressed on a closed step starts again…". Axe's document-title rule (serious) ran before the restarted page's <title> was set. It hit #115's e2e (2/2) on 83414ebd, run 41885977909. Under CI-07's failOnFlakyTests a pass on retry still fails the job. The fix is at the class: in the shared helper apps/web/e2e/a11y.ts (expectAccessible), wait for a non-empty document.title, or for the expected title where the caller knows it, before axe runs, so every navigation-then-axe step is covered. Add an explicit toHaveTitle at :213 if it reads better. Sweep e2e/ for other axe calls right after a navigation or restart. Tests only: no product code. No new test-matrix ID, unless the existing e2e accessibility row (find it in docs/product/test-matrix.md) needs its text amended. Earlier flake PRs for conventions: designs/lane-b-dependabot-batch-test-flakes-2.md and the test-flakes-3 and test-flakes-4 PRs.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands under flock /tmp/laneb-heavy.lock, which another workflow shares. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify. No model identifier in any text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search (GitHub reads through mcp__github__ tools via ToolSearch); the PR body only through mcp__github__create_pull_request / update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Build')
const build = await agent(`${COMMON}

BUILD:
1. Read the failing job's log (run 41885977909; find the e2e (2/2) job with actions_list list_workflow_jobs, then get_job_logs with return_content). Quote the failure, and how the page reached the axe call (a navigation, a redirect, a client-side restart). Read a11y.ts, the spec at :213, and how the page sets its title (Next metadata, set on render).
2. Failing-first proof: make the race deterministic in a test. For example, a page or route intercept that delays the <title>, or a Playwright route that holds the HTML, so that the old helper fails on document-title and the new one passes. Commit the proof first and run it red for the stated reason (log in ${SP}/logs/). It must be a test-only fixture.
3. The fix in expectAccessible: wait for a non-empty document.title (expect.poll or page.waitForFunction, with a bounded timeout under the test's own), or for the expected title when the caller passes one. Keep the signature backward compatible. Then the sweep: list every axe or expectAccessible call in e2e/, mark which follow a navigation or restart, and pass the expected title or add a toHaveTitle where it reads better.
4. Under the lock: typecheck; lint; then the e2e specs that call the helper (as CI runs them, E2E_PREBUILT=1 on a fresh build), with sign-in-time.spec.ts repeated 10 times (--repeat-each=10). Count the results.
5. Push (git push -u origin ${BR}) and open a DRAFT PR, head ${BR}, base claude/build-platform, title "Tests only: axe waits for the page's title, so a restarted page is not checked before it has one (sign-in-time flake)". Write the description from ${WT}/.github/pull_request_template.md, every section included. Read it back and compare; restore the footer once if it was rewritten.
${SAVE('build.progress.md', 'each step, head and PR number')}
Return the PR number, the head, the root cause, the red/green evidence, the sweep table and the counts.`, { label: 'build', phase: 'Build' })

phase('Review')
const review = await agent(`${COMMON}

The ADVERSARIAL REVIEWER (CI and test infrastructure, plus a skeptic of the race analysis) of the PR (${build}). Use a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone, then check out ${BR}'s head. Read only; remove the clone when done. Check: does the wait hide a real defect, such as a page that never sets a title? Is the timeout bounded and diagnostic? Is the sweep complete (grep every AxeBuilder and expectAccessible call)? Does the red-first proof fail for the stated reason? Does the fix hold under CI-07's failOnFlakyTests? Is anything other than tests changed? Read CI on the head as far as it has run. Findings B/S/N; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE('review.progress.md', 'findings')}`, { label: 'review', phase: 'Review', schema: FINDINGS })
const all = review ? review.findings : []
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on the PR (${build}). It is real only if you confirm it. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Fix')
const fix = review ? await agent(`${COMMON}

The FIX ROUND for the PR (${build}). Confirmed findings: ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, why: f.verdict && f.verdict.reason })))}
1. Apply them in small commits, red then green.
2. Merge the base ONCE: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines).
3. Run the FULL local suite once, under the lock, with counts in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then test:db; build and the stamp; test:e2e (whole, E2E_PREBUILT=1); synth --all and watched.ts --write (clean). Also run sign-in-time.spec.ts with --repeat-each=10.
4. Push once.
5. Update the description: the findings with dispositions, the counts and the head. Read it back.
6. Write /home/user/ops/approval-summaries/lane-a-test-flakes-5-{review,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step')}
Return the head, the base, the dispositions, the counts and the readback.`, { label: 'fix', phase: 'Fix' }) : 'review returned nothing: NOT RUN'

phase('Verify')
const ver = review ? await agent(`${COMMON}

VERIFIER of the PR. Fix round: ${fix}
1. git ls-remote: the head is as reported and the base tip is unchanged (otherwise write "RE-MERGE NEEDED").
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks, for up to 90 minutes. The required checks must all be success, and the e2e jobs must have no flaky result. List every run.
3. Fresh clone at the head: install under the lock; git diff --stat against the merge base (tests only).
4. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-test-flakes-5-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' }) : 'NOT RUN'
return { build, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fix, ver }
