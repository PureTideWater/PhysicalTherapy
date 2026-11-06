export const meta = {
  name: 'lane-b-dependabot-batch-d-test-flakes-2',
  description: 'PR D (co-001/test-flakes-2, tests only): design, build (failing-first), check, push and draft PR, two adversarial reviews with skeptics, one fix round with the suite, one push',
  phases: [
    { title: 'Design', detail: 'from the FRM-01 investigation and its challenge; CAS-41.3 measured' },
    { title: 'Build', detail: 'failing-first test, monotonic wait, CAS-41.3 timeout' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Open', detail: 'push and draft PR, description read back' },
    { title: 'Review', detail: 'CI/test infrastructure; skeptic of the race analysis; skeptics per finding' },
    { title: 'Fix', detail: 'one fix round, suite, one push' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/d'
const SESSION = 'https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx'
const WT = '/home/user/test-flakes-2'
const BR = 'co-001/test-flakes-2'
const INV = '/home/user/ops/designs/lane-b-dependabot-batch/test-flakes-2-investigation.md'
const CHAL = '/home/user/ops/designs/lane-b-dependabot-batch/test-flakes-2-challenge.md'
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch-test-flakes-2.md'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy, Lane B item "dependabot-batch" (${SESSION}). PR D, assigned by Lane B's orchestrator at 2026-11-02 06:22 UTC: branch ${BR}, worktree ${WT} (at 88708069, NOT yet installed; claude/build-platform is now 21fa10df or later). TESTS ONLY: (1) FRM-01 (apps/web/src/components/action-form.browser.test.tsx, the S-SEC-2 case at :366; helper shownCount at :58-60) waits for an exact data-shown value that the code under test moves past within ~35-50 ms; make the wait monotonic (data-shown >= N), with a test proving the old exact wait could hang (the investigation's forced reproduction); (2) if cheap, apps/worker/src/report/csv-arena.test.ts:151 (CAS-41.3) timed out at its 5 s default under runner load on #92's merge run (push run 41376674140 attempt 1, job 125058323085): give it an explicit timeout sized from its measured runtime, or record why not. No new test-matrix IDs (FRM-01 and CAS-41.3 exist). No product code change, no dependency change. The investigation is ${INV}; its challenge (verdict: HOLDS, with corrections; the cause is inferred, not observed) is ${CHAL}. Merge rule: merges as soon as verified and green (orchestrator 08:52 UTC); the session marks ready and merges, never you. Pacing (the co-founder, 2026-11-02 02:10 UTC): no stage skipped, nothing spent that does not change the outcome.

Rules: synthetic data only; every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands (install, typecheck, lint, tests, browser tests) only under flock /tmp/laneb-heavy.lock; another workflow (PR B's merge prep) shares the machine. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. No model name or identifier in any file, commit or PR text. Never comment, review, approve, mark ready or merge on GitHub. Long waits: run_in_background; no foreground sleep. Write under /home/user/ops only the files your task names; write scratch under ${SP}.`

const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Design')
const design = await agent(`${COMMON}

You write the DESIGN ${DESIGN} (new file; do not commit). Read the investigation and the challenge whole. Then measure CAS-41.3: in ${WT}, under the lock, pnpm install --frozen-lockfile (first git -C ${WT} merge --ff-only origin/claude/build-platform after git fetch origin claude/build-platform, so the worktree is on the current base), then run apps/worker/src/report/csv-arena.test.ts 20 times (pnpm exec vitest run --project unit apps/worker/src/report/csv-arena.test.ts) and record CAS-41.3's per-run ms; read its CI times from the unit job logs of the last ~20 ci runs (gh api, this repository only) and the timed-out run's; size the timeout (for example 4x the observed CI p99, rounded up, with the reasoning) and say whether a timeout is the right fix or the test should change instead. Design sections: the two flakes, root causes with the challenge's corrections (inferred vs observed), the exact changes (file:line, the new helper semantics, which call sites change and why monotonic is correct for each, the failing-first test that proves the exact wait can hang, e.g. driving data-shown past N between polls deterministically), what is NOT changed and why, the test-matrix rows FRM-01 and CAS-41.3 (text unchanged unless their assertion wording changes), risks, and the PR plan (commits, checks). Keep it tight.
${SAVE('design.progress.md', 'measurements and sections written')}
Return the design's summary and the CAS-41.3 measurements.`, { label: 'design:D', phase: 'Design' })

phase('Build')
const build = await agent(`${COMMON}

You are the BUILDER of PR D. The design (${DESIGN}):
${design}
Build it in ${WT}: (1) the failing-first commit: the test that proves the exact wait can hang (red on behaviour against the current helper; save the red log in ${SP}/logs/); (2) the monotonic helper and its call sites (green); (3) CAS-41.3's explicit timeout (or the design's alternative). Then under the lock: pnpm typecheck; pnpm lint; pnpm lint:logs; the two test files each run 30 times in a loop (count passes; any failure is a defect); pnpm exec vitest run --project unit apps/web/src/components apps/worker/src/report (counts); pnpm synth --all and watched.ts --write (git clean). Do NOT push.
${SAVE('build.progress.md', 'each commit and check')}
Write ${SP}/build.md and return: head sha, commits, red/green evidence, loop results, checks.`, { label: 'build:D', phase: 'Build' })

phase('Check')
const chk = await agent(`${COMMON}

You are the ADVERSARIAL CHECKER of PR D's commits in ${WT} (not pushed). Do not commit. The builder's report:
${build}
Try to break it: is the failing-first test red on the old helper for the stated reason (not a different timeout or a typo)? Does the monotonic wait still prove what each call site meant to prove (a call site that needed EXACTLY N, e.g. to prove no extra summary appeared, must keep an exactness check after the wait)? Mutate the helper back to exact in a scratch copy and confirm the new test fails; mutate the product (form-issues.tsx) to show a summary twice or not at all and confirm FRM-01's assertions still catch it. Is CAS-41.3's timeout sized from evidence, and does it hide a real slowness? Only test files changed? Report defects B/S/N with evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check:D', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

You OPEN PR D. The builder's report:
${build}
The checker's review:
${chk}
1. Fix every real defect the checker found (check each yourself) in small commits; re-run what each touches (and the 30-run loops if a test changed).
2. git fetch origin claude/build-platform; if it moved, merge it in with a merge commit.
3. Push: git push -u origin ${BR}.
4. Open the DRAFT PR (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): owner PureTideWater, repo PhysicalTherapy, title "Tests only: FRM-01's refusal count waits monotonically, CAS-41.3 gets a measured timeout (two CI flakes)", head ${BR}, base claude/build-platform, draft true. Description from ${WT}/.github/pull_request_template.md, every section, "None" rather than omitted, required-checks markers exact, under 65,536 characters: the red push run on 88708069 (ci 41386010790, job 125086906641) and #92's merge run (41376674140) as the evidence; the root causes with the challenge's correction (inferred, reproduced, not observed); the changes; the failing-first proof; the 30-run loops; the CAS-41.3 measurements and sizing; that it changes tests only and no matrix ID; the orchestrator's 06:22 UTC assignment; the merge rule; what waits on a person (None). End exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write it to ${SP}/pr-body.md, create the PR, read it back (pull_request_read get and gh api .../pulls/<n> --jq .body) into ${SP}/pr-body-readback.md, compare (identical apart from trailing newlines; restore the footer if the connector rewrote it).
${SAVE('open.progress.md', 'each step, head and PR number')}
Return the PR number, the pushed head sha and the readback result.`, { label: 'open:D', phase: 'Open' })

phase('Review')
const LENSES = [
  { key: 'ci-infra', focus: `CI and TEST INFRASTRUCTURE: are the new and changed tests deterministic, in the right Vitest project and browser setup, sized for CI's runners; does the monotonic helper weaken any assertion; does CAS-41.3's timeout follow the repo's conventions (vitest.config, other per-test timeouts); read CI on the PR's head as far as it has run (all jobs, the unit job's times for these two files).` },
  { key: 'race-skeptic', focus: `A SKEPTIC OF THE RACE ANALYSIS: try to show the root cause is something else (the harness's MutationObserver, React batching, a real product defect in form-issues.tsx or action-form.tsx, Chromium scheduling) and that the monotonic wait only hides it. Reproduce the original failure on the base tree and show whether the fix removes it for the stated reason; check every other exact-count wait in the repo's browser tests for the same hazard (grep data-shown and waitForSelector with exact attribute values) and say whether D should cover them.` },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are an ADVERSARIAL REVIEWER of PR D (${open}). Work in a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-${l.key}, check out the PR's head; read only; remove it when done. Your focus: ${l.focus}
Findings B/S/N with where, a concrete scenario, evidence and the fix.
${SAVE(`review-${l.key}.progress.md`, 'findings so far')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on PR D; real only if you confirm it; give correctedFix if the fix is wrong.
${JSON.stringify(f, null, 1)}`, { label: `verify:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`D reviews: ${all.length} findings, ${confirmed.length} confirmed`)

phase('Fix')
const fix = await agent(`${COMMON}

You run PR D's FIX ROUND (one round). Confirmed findings (use correctedFix where given):
${JSON.stringify(confirmed, null, 1)}
What the reviewers checked and found sound:
${JSON.stringify(reviews.filter(Boolean).map(r => ({ lens: r.lens, sound: r.sound })), null, 1)}
1. Apply every confirmed finding in small commits (a test-only change; a finding that needs a product change is recorded as a proposal, not made).
2. The suite once, under the lock, recording counts in ${SP}/suite.md: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm test (the whole unit project, counts); the two changed test files 30 times each (passes); pnpm synth --all and watched.ts --write (clean); tools/stryker/affected.ts (expected none). test:db, e2e and Stryker are not touched by a unit-test-only change: say so and leave them to CI (pacing).
3. git fetch origin claude/build-platform; merge it if it moved (merge commit); push once.
4. Update the PR description (read it first; every template section; the review findings table with dispositions; the suite with counts; the head) and read it back as before.
5. Write the reviews and fix round as /home/user/ops/approval-summaries/lane-b-dependabot-batch-D-review.md and -D-fix-round.md (do not commit).
${SAVE('fix.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, each finding's disposition, the suite counts, the readback result.`, { label: 'fix:D', phase: 'Fix' })

return { design, build, chk, open, reviews: all.length, confirmed: confirmed.map(f => f.id), fix }