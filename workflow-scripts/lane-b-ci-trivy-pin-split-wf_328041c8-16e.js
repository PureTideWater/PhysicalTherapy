export const meta = {
  name: 'acting-s4-ci-trivy-pin-split',
  description: 'Split the Trivy part of #106 into co-001/ci-trivy-pin-2026-11-04 (no capacity-watched path), check the delta, draft PR, verify on CI',
  phases: [
    { title: 'Build', detail: 'new branch from the base with only the Trivy changes' },
    { title: 'Check', detail: 'delta check: nothing lost, nothing watched, nothing of the fetch fix' },
    { title: 'Open', detail: 'push, draft PR, description' },
    { title: 'Verify', detail: 'fresh clone, CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/trivy-pin'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ci-trivy-pin'
const BR = 'co-001/ci-trivy-pin-2026-11-04'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}). PR #106 (co-001/ci-trivy-install-2026-11-04, worktree /home/user/ci-trivy, head 78cd55d2, base 4846f043) is VERIFIED (record /home/user/ops/approval-summaries/lane-b-ci-trivy-install-verification.md; review and fix-round records beside it; scratch /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/trivy/) but its required screening-capacity gate is red. It touches two capacity-watched paths (.github/workflows/screening-capacity.yml and packages/synth/src/cases/matrix.ts; the list is tools/screening-capacity/watched-paths.txt), and the private repository's 2-CPU runner gives RUNNER_TOO_SMALL (the founder's decision, issue #102). Decision: SPLIT. A new branch ${BR} from origin/claude/build-platform (fetch it; it should be 4846f043, or later if something merged) carries ONLY the Trivy part. That means .github/workflows/ci.yml, release.yml and release-dry-run.yml (the pinned install step with TRIVY_CMD/GITHUB_PATH, skip-setup-trivy, the dry run's tools/trivy/** path trigger), tools/trivy/install.sh and release.txt, the check-action-pins release-age rule for tools/trivy and tools/gitleaks release.txt (age.ts, base.ts, check.ts, releases.ts and their tests), the https-only curl in tools/gitleaks/install.sh, the Trivy tests in tools/test/workflows.test.ts, and ADR 0066 and docs/runbooks/ci.md text for the Trivy change only. It must NOT touch any path in watched-paths.txt (check every changed path against it, including its glob lines), nor docs/product/test-matrix.md, matrix.ts or fixtures/synthetic/CI-*. Tests stay under their existing IDs with the row texts unchanged; #106 amends the rows later. It must not carry the private-repository fetch fix, the CI-11 private-repository guard, or the ADR/runbook text about them; that stays in #106. Merge rule: the session marks ready and merges, never you.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. Push with git push -u origin ${BR} from ${WT}. No model identifier in any file, commit or PR text. Never comment, review, approve, mark ready or merge; never write files through the GitHub connector; GitHub reads through mcp__github__ tools (ToolSearch). Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Build')
const build = await agent(`${COMMON}

BUILD the split: git -C /home/user/PhysicalTherapy fetch origin claude/build-platform; git -C /home/user/PhysicalTherapy worktree add -b ${BR} ${WT} FETCH_HEAD; install under the lock. Bring in the Trivy changes from /home/user/ci-trivy (read its commits 4846f043..78cd55d2 and their diffs). Use git checkout <commit> -- <file> for files wholly Trivy's, and edit by hand where a file mixes both (workflows.test.ts, ADR 0066, ci.md): keep only the Trivy hunks and the Trivy wording, with the text reading correctly without the fetch-fix parts. Commits: the install script and pins; the workflows; the pin-age rule; the tests; the ADR and runbook. Then under the lock: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; the Trivy and pin tests (vitest run tools/test tools/check-action-pins, counts); pnpm test (whole unit project, counts); pnpm synth --all and watched.ts --write (clean); pnpm actions:check; actionlint; BASE=origin/claude/build-platform pnpm toolchain:check. Check git diff --name-only against the base vs watched-paths.txt (none may match). Do NOT push.
${SAVE('build.progress.md', 'each commit and check')}
Return: head sha, commits, the changed file list with "none watched" proof, check results.`, { label: 'build', phase: 'Build' })

phase('Check')
const chk = await agent(`${COMMON}

DELTA CHECK of ${WT} (unpushed). Builder: ${build}
Do not commit. Prove: (1) every Trivy behaviour of #106 is present. Diff the three workflows, tools/trivy, check-action-pins and gitleaks between ${BR} and 78cd55d2: they must be identical, except screening-capacity.yml, which must be untouched. (2) No fetch-fix or CI-11-guard hunk is present. (3) The hand-split files (workflows.test.ts, ADR 0066, ci.md) read correctly, and every Trivy test of #106 is kept (count the Trivy-related its in both). (4) No watched path, no matrix row, no fixture. (5) A conflict-surface merge-tree with #106's head and with #86's head (83167b8f): what conflicts and how the second merged resolves it. Report B/S/N with evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

OPEN the PR. Builder: ${build}
Check: ${chk}
1. Fix real check defects (verify each) in small commits; re-run what they touch.
2. git fetch origin claude/build-platform; if it moved, merge it (a merge commit); then push.
3. Draft PR (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): head ${BR}, base claude/build-platform, draft true, title "CI: Trivy installs from its pinned GitHub release, checked by hash (get.trivy.dev no longer resolves)". Description from .github/pull_request_template.md, every section ("None" rather than omitted; required-checks markers exact), under 65,536 characters. Base it on #106's description (read #106 with pull_request_read), limited to the Trivy part. Say: split from #106 so that no capacity-watched path is touched, while #106 keeps the private-repository fetch fix and waits on the founder (#102); #106's two reviews and fix round stand for this subset, and the delta check's result; #106's CI evidence for the Trivy part (images 0 HIGH/CRITICAL on 78cd55d2); this PR's local checks; the relation to #86 and #106 (the second merged resolves). End exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write ${SP}/pr-body.md, create it, read it back with pull_request_read, compare (restore the footer if rewritten).
${SAVE('open.progress.md', 'each step, head and PR number')}
Return the PR number, the head sha and the readback result.`, { label: 'open', phase: 'Open' })

phase('Verify')
const ver = await agent(`${COMMON}

FRESH-CLONE VERIFIER of the new PR (${open}).
1. git ls-remote: the head is as reported; note the base tip.
2. Wait for CI on the head to FINISH (pull_request_read get_check_runs, re-checked every few minutes with a background "sleep 240" command (run_in_background), up to 75 minutes). Do not return until every check run has finished or the time is up. List every check run. Required: all green, mutation, screening-capacity gate (it must PASS: nothing watched changed), approval-of-record. The images job must install the pinned Trivy and scan both images; quote the findings summary. release-dry-run if it ran.
3. Fresh clone at the head: install under the lock; the Trivy and pin tests; actionlint; actions:check; git diff --name-only against the merge base vs tools/screening-capacity/watched-paths.txt (none).
4. Description claims true; list stale sentences with exact replacements.
Write /home/user/ops/approval-summaries/lane-b-ci-trivy-pin-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table, the images summary, and the description corrections.`, { label: 'verify', phase: 'Verify' })

return { build, chk, open, ver }
