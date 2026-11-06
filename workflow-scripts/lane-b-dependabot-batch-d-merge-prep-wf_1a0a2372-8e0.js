export const meta = {
  name: 'acting-s4-d-merge-prep',
  description: 'PR D (#105): merge base 7bf7b252 once, targeted re-check, one push, description update, fresh-clone verification reading CI',
  phases: [
    { title: 'Merge prep', detail: 'base merge, targeted re-check, push, description' },
    { title: 'Verify', detail: 'fresh clone, CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/d2'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/test-flakes-2'
const BR = 'co-001/test-flakes-2'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}). PR D is #105, draft: branch ${BR}, worktree ${WT}, head 7c97f9c0 (base 4846f043 merged), tests only. Its records: /home/user/ops/designs/lane-b-dependabot-batch-test-flakes-2.md and /home/user/ops/approval-summaries/lane-b-dependabot-batch-D-{review,fix-round}.md; scratch from the earlier run is under /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/d/ (suite.md, pr-body-fix.md). The full local suite ran once on 7c97f9c0 and was green. CI on 7c97f9c0 was green except images (the base's Trivy failure). #107 (the pinned Trivy install) has now merged as 7bf7b252, so CI on the new head should be fully green. Speed rules: merge the base once, right before the push that precedes the merge; CI is the suite of record.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock. Commit messages end with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify. No model identifier in any file, commit or PR text. Never comment, review, approve, mark ready or merge; never write files through the GitHub connector; GitHub reads and writes through mcp__github__ tools (ToolSearch "select:mcp__github__pull_request_read,mcp__github__update_pull_request"). Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Merge prep')
const prep = await agent(`${COMMON}

MERGE PREP: (1) git -C ${WT} fetch origin claude/build-platform; git -C ${WT} merge --no-ff FETCH_HEAD with message "Merge claude/build-platform (7bf7b252: #107) into ${BR}" and the attribution lines (expect no conflict: the base adds only CI and Trivy files); install if the lockfile moved. (2) Targeted re-check under the lock, since the base delta is CI-only: pnpm typecheck; pnpm lint; pnpm check:fixtures; the three changed test files once (action-form.browser, step-timer.browser, csv-arena; counts); tools/test workflows tests (counts). (3) git push origin ${BR}. (4) Update #105's description: read it first, then change the head, base and Checks to this head, note #107's merge as the images fix, and keep every template section and the exact footer. Read it back and compare.
${SAVE('prep.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the base sha merged, the re-check counts and the readback result.`, { label: 'prep:D', phase: 'Merge prep' })

phase('Verify')
const ver = await agent(`${COMMON}

FRESH-CLONE VERIFIER of #105. Merge prep: ${prep}
1. git ls-remote: the head is as reported; the base tip is still 7bf7b252 (or say what moved).
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, re-checked every few minutes with a background "sleep 240" (run_in_background), up to 75 minutes. Do not return before every check run has finished or the time is up. List every run. The required checks (all green, mutation, screening-capacity gate, approval-of-record) must all be success. The images job must have scanned both images; FRM-01, SGN-02 and CAS-41.3 must pass in the unit job (quote their times from the log if they are printed).
3. Fresh clone at the head: install under the lock; the three changed test files; git diff --stat against the merge base: three test files only.
4. Check the description's claims; list stale sentences with exact replacements.
Write /home/user/ops/approval-summaries/lane-b-dependabot-batch-D-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table and the corrections.`, { label: 'verify:D', phase: 'Verify' })
return { prep, ver }
