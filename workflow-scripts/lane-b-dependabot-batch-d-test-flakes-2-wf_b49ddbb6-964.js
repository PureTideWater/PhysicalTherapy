export const meta = {
  name: 'acting-s4-d-test-flakes-2',
  description: 'PR D (co-001/test-flakes-2, tests only): design, failing-first build, check, draft PR, one adversarial review with skeptics, one fix round (base merge, suite once, one push), fresh-clone verification reading CI',
  phases: [
    { title: 'Design', detail: 'from the investigation and challenge; CAS-41.3 measured' },
    { title: 'Build', detail: 'failing-first test, monotonic wait, CAS-41.3 timeout' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Open', detail: 'push and draft PR, description read back' },
    { title: 'Review', detail: 'one adversarial review (CI/test infra and race skeptic lenses); skeptic per B/S finding' },
    { title: 'Fix', detail: 'one fix round: base merge, full suite once, one push' },
    { title: 'Verify', detail: 'fresh clone, reads CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/d'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/test-flakes-2'
const BR = 'co-001/test-flakes-2'
const INV = '/home/user/ops/designs/lane-b-dependabot-batch/test-flakes-2-investigation.md'
const CHAL = '/home/user/ops/designs/lane-b-dependabot-batch/test-flakes-2-challenge.md'
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch-test-flakes-2.md'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}) on Lane A's account (rules: /home/user/ops/lanes/acting-lane-b-2026-11-04.md, its speed rules). PR D, assigned by Lane B's orchestrator 2026-11-02 06:22 UTC (ruling at the top of /home/user/ops/approval-summaries/lane-b-dependabot-batch-status.md): branch ${BR}, worktree ${WT} (at 88708069, installed; claude/build-platform is 21fa10df or later; #94 may merge into it meanwhile). TESTS ONLY: (1) FRM-01 (apps/web/src/components/action-form.browser.test.tsx, the S-SEC-2 case at :366; helper shownCount near :58-60) waits for an exact data-shown value that the code under test moves past within ~35-50 ms; make the wait monotonic (data-shown >= N), with a test proving the old exact wait could hang (the investigation's forced reproduction); (2) apps/worker/src/report/csv-arena.test.ts:151 (CAS-41.3) timed out at its 5 s default under runner load on #92's merge run (push run 41376674140 attempt 1, job 125058323085): an explicit timeout sized from its measured runtime, or the reason why not. No new test-matrix IDs. No product code change, no dependency change. Investigation ${INV}; challenge ${CHAL} (HOLDS with corrections: the cause is inferred, not observed). An earlier flake PR's records for conventions: /home/user/ops/approval-summaries/lane-b-test-flakes-status.md and -fix-suite.md. Merge rule: merges when verified and green; the session marks ready and merges, never you.

Rules: synthetic data only; every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands (install, typecheck, lint, tests, browser tests, synth) only under flock /tmp/laneb-heavy.lock; another workflow shares the machine. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. Push from ${WT} with git push -u origin ${BR} (the pre-push hook runs; a refused push is fixed, never forced). No model name or identifier in any file, commit or PR text. Never comment, review, approve, mark ready or merge on GitHub; never write files through the GitHub connector. Long waits: run_in_background; no foreground sleep. Write under /home/user/ops only the files your task names (never commit there); scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Design')
const design = await agent(`${COMMON}

You write the DESIGN ${DESIGN} (new file). Read the investigation and the challenge whole. First: git -C ${WT} fetch origin claude/build-platform && git -C ${WT} merge --ff-only FETCH_HEAD (the branch has no commits of its own, so it starts on the current base), then under the lock pnpm install --frozen-lockfile in ${WT}. Measure CAS-41.3: run apps/worker/src/report/csv-arena.test.ts 20 times (pnpm exec vitest run --project unit apps/worker/src/report/csv-arena.test.ts --reporter=json or verbose) and record CAS-41.3's per-run ms; read its CI times from the unit job logs of recent ci runs (about 10, mcp__github__ tools via ToolSearch "select:mcp__github__actions_list,mcp__github__get_job_logs") and the timed-out run's; size the timeout (e.g. 4x the observed CI max, rounded up, with reasoning, and consistent with other per-test timeouts in the repo) and say whether a timeout is the right fix or the test should change. Sections: the two flakes, root causes with the challenge's corrections (inferred vs observed), the exact changes (file:line, the helper's new semantics, every call site and why monotonic is right for each; a call site that needs EXACTLY N keeps an exactness assertion after the wait), the failing-first test that proves the exact wait can hang (deterministic: drive data-shown past N between polls), what is NOT changed and why, FRM-01 and CAS-41.3 matrix rows (unchanged unless the assertion wording changes), risks, the PR plan. Keep it tight.
${SAVE('design.progress.md', 'measurements and sections written')}
Return the design's summary and the CAS-41.3 measurements.`, { label: 'design:D', phase: 'Design' })

phase('Build')
const build = await agent(`${COMMON}

You are the BUILDER of PR D. The design (${DESIGN}):
${design}
Build it in ${WT}: (1) the failing-first commit: the test that proves the exact wait can hang (red on behaviour against the current helper; save the red log in ${SP}/logs/); (2) the monotonic helper and its call sites (green); (3) CAS-41.3's explicit timeout (or the design's alternative). Under the lock: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm check:fixtures; the two test files each run 30 times in a loop (count passes; any failure is a defect); pnpm exec vitest run on apps/web/src/components (browser project as the repo configures it) and apps/worker/src/report (counts); pnpm synth --all and watched.ts --write (git clean). Do NOT push.
${SAVE('build.progress.md', 'each commit and check')}
Write ${SP}/build.md and return: head sha, commits, red/green evidence, loop results, checks.`, { label: 'build:D', phase: 'Build' })

phase('Check')
const chk = await agent(`${COMMON}

You are the ADVERSARIAL CHECKER of PR D's commits in ${WT} (not pushed). Do not commit. The builder's report:
${build}
Try to break it: is the failing-first test red on the old helper for the stated reason (not a different timeout or a typo)? Does each call site still prove what it meant to (exactness kept where needed)? Mutate the helper back to exact in a scratch copy and confirm the new test fails; mutate the product (form-issues.tsx or what renders data-shown) in a scratch copy to show a summary twice or never and confirm FRM-01 still catches it; restore. Is CAS-41.3's timeout sized from evidence, and does it hide a real slowness? Only test files changed (git diff --stat origin/claude/build-platform...HEAD)? Report defects B/S/N with evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check:D', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

You OPEN PR D. The builder's report:
${build}
The checker's review:
${chk}
1. Fix every real defect the checker found (check each yourself) in small commits; re-run what each touches (the 30-run loop if a test changed).
2. Push: git push -u origin ${BR} (no base merge now; the fix round merges the base once before the last push).
3. Open the DRAFT PR (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): owner PureTideWater, repo PhysicalTherapy, title "Tests only: FRM-01's refusal count waits monotonically, CAS-41.3 gets a measured timeout (two CI flakes)", head ${BR}, base claude/build-platform, draft true. Description from ${WT}/.github/pull_request_template.md, every section ("None" rather than omitted; required-checks markers exactly as the template has them), under 65,536 characters: the red push run on 88708069 (ci 41386010790, job 125086906641) and #92's merge run (41376674140) as evidence; root causes with the challenge's correction; the changes; the failing-first proof; the 30-run loops; the CAS-41.3 measurements and sizing; tests only, no matrix ID; the 06:22 UTC assignment; the merge rule; what waits on a person (None). End exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write it to ${SP}/pr-body.md, create the PR, read it back (pull_request_read get) into ${SP}/pr-body-readback.md, compare (identical apart from trailing newlines; restore the footer with update_pull_request if the connector rewrote it).
${SAVE('open.progress.md', 'each step, head and PR number')}
Return the PR number, the pushed head sha and the readback result.`, { label: 'open:D', phase: 'Open' })

phase('Review')
const review = await agent(`${COMMON}

You are the ADVERSARIAL REVIEWER of PR D (${open}). Fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-review, check out the PR's head; install under the lock if you run tests; read only; remove it when done. Two lenses, both yours:
(a) CI and TEST INFRASTRUCTURE: are the new and changed tests deterministic, in the right Vitest project and browser setup, sized for CI's runners; does the monotonic helper weaken any assertion; does CAS-41.3's timeout follow the repo's conventions; read CI on the PR's head as far as it has run (the unit job's times for these two files).
(b) SKEPTIC OF THE RACE ANALYSIS: try to show the cause is something else (the harness's observer, React batching, a real product defect in what sets data-shown, Chromium scheduling) and that the monotonic wait only hides it. Reproduce the original failure on the base tree if you can and show whether the fix removes it for the stated reason; grep every other exact-value attribute wait in the repo's browser tests (data-shown, waitForSelector with exact attribute values) and say whether D should cover them.
Findings B/S/N with where, a concrete scenario, evidence and the fix; "sound" says what you checked and found sound.
${SAVE('review.progress.md', 'findings so far')}`, { label: 'review:D', phase: 'Review', schema: FINDINGS })
const all = review ? review.findings : []
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on PR D (${open}); real only if you confirm it; give correctedFix if the fix is wrong. Read the PR's head in a fresh clone or the worktree (read only).
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`D review: ${all.length} findings, ${confirmed.length} confirmed`)

phase('Fix')
const fix = await agent(`${COMMON}

You run PR D's FIX ROUND (one round). PR: ${open}
Confirmed findings (use correctedFix where given):
${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
What the reviewer found sound: ${review ? review.sound : 'n/a'}
1. Apply every confirmed finding in small commits (test-only; one that needs a product change becomes a proposal in ${SP}/proposals.md, not made).
2. Merge the base ONCE now: git fetch origin claude/build-platform; if it moved, git merge --no-ff FETCH_HEAD (a merge commit, message with the attribution lines); pnpm install --frozen-lockfile if the lockfile moved.
3. The full local suite once on this final tree, under the lock, counts in ${SP}/suite.md: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; pnpm test (the whole unit project including the browser project, counts); the two changed files 30 times each (passes); pnpm test:golden; pnpm synth --all and watched.ts --write (clean); tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform (expected none). test:db, e2e and Stryker are not touched by a test-only change outside their projects: say so and leave them to CI (speed rule 1).
4. Push once.
5. Update the PR description (read it first; every template section; the review's findings with dispositions; the suite with counts; the head and base) with update_pull_request, read it back and compare.
6. Write /home/user/ops/approval-summaries/lane-b-dependabot-batch-D-review.md and -D-fix-round.md (short; do not commit).
${SAVE('fix.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the base it merged, each finding's disposition, the suite counts, the readback result.`, { label: 'fix:D', phase: 'Fix' })

phase('Verify')
const ver = await agent(`${COMMON}

You are PR D's FRESH-CLONE VERIFIER. The fix round's report:
${fix}
1. git ls-remote origin: the branch head equals the reported head; note claude/build-platform's tip.
2. Wait for CI on that head to finish (pull_request_read get_check_runs; re-check with background waits of a few minutes, no foreground sleep; up to about 60 minutes). Every check run on the head sha: the required checks all green, mutation, screening-capacity gate, approval-of-record success; nothing failed. Read the unit job's log for FRM-01 and CAS-41.3's runtimes and counts.
3. Fresh clone at the head: install under the lock; typecheck; the two changed test files once each; git diff --stat against the merge base: tests only (and nothing under content/releases, migrations, product code).
4. Description: every claim true (head, counts, CI); list stale sentences with exact replacements.
5. Is the base merged into the head the current tip? If not, say how far behind and whether any file conflicts (merge-tree).
Write /home/user/ops/approval-summaries/lane-b-dependabot-batch-D-verification.md (do not commit) ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table, and description corrections.`, { label: 'verify:D', phase: 'Verify' })

return { design, build, chk, open, findings: all.length, confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title}`), fix, ver }
