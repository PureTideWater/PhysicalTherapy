export const meta = {
  name: 'acting-s4-cognito-cc-pr1-clean',
  description: 'Rebuild cognito-confidential-client PR 1 on a fresh branch from the current base, with no .gitleaksignore entries; prove the tree equals #112 except the one test line and the base; push through the hook; open the new draft PR',
  phases: [
    { title: 'Rebuild', detail: 'fresh branch, the same changes, no ignore entries' },
    { title: 'Check', detail: 'tree equality and checks' },
    { title: 'Open', detail: 'push, draft PR' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/cc1b'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const OLD = '/home/user/cognito-cc'
const OLDHEAD = '1721a256ffdc481131dd26b89c5a0f4168e63ee4'
const WT = '/home/user/cognito-cc-pr1'
const BR = 'co-001/cognito-confidential-client-pr1'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}), Lane A item cognito-confidential-client, PR 1. Draft PR #112 (branch co-001/cognito-confidential-client, worktree ${OLD}, head ${OLDHEAD}, base 45d7d0c1) was opened with two .gitleaksignore entries added (commits 45b7766f and 1721a256). The pre-push gitleaks scan had flagged the synthetic password on apps/web/src/lib/auth/cognito-provider.test.ts:147 (commit 9d717672). This session's rules forbid adding a .gitleaksignore entry, and a refused push is rewritten, never waved through. Force-pushing is forbidden too, so PR 1 is rebuilt on a NEW branch ${BR}, from the current origin/claude/build-platform (c4941291 or later), in a new worktree ${WT}. Records: the old build's logs and progress are in /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/cc1/; the design is /home/user/ops/designs/lane-a-cognito-confidential-client.md; status /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-status.md.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands under flock /tmp/laneb-heavy.lock. Commit messages end with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
NEVER add or change a .gitleaksignore entry. Never amend, rebase, reset --hard, force or --no-verify. If a push is refused, change the flagged text in a new commit and push again. No model identifier in any text. Never comment, review, approve, mark ready, merge or close on GitHub (the session closes #112); gh only for search; the PR body only through mcp__github__create_pull_request / update_pull_request. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Rebuild')
const rb = await agent(`${COMMON}

REBUILD:
1. git -C /home/user/PhysicalTherapy fetch origin claude/build-platform; then git -C /home/user/PhysicalTherapy worktree add -b ${BR} ${WT} FETCH_HEAD; install under the lock.
2. Bring #112's changes into ${WT} as a few commits, one per concern, following the old slices: 1 (the enrolment rule), 2 (the invitation rule), 3 (SecretHash and the credential errors), 3b (the diff-role deny), 4 (R-11), 5 (ADR 0088, the ADR 0081 edits, SEC-20..23, the runbooks), and the checker's fixes. Take each file's content from ${OLDHEAD} (git -C ${OLD} show ${OLDHEAD}:<path>) for every path in git -C ${OLD} diff --name-only 45d7d0c1 ${OLDHEAD}, EXCEPT .gitleaksignore, which stays exactly as the base has it. Each commit message names the old commits it carries and says the red-first evidence is in #112's history and in the build logs. Where a file also changed on the base since 45d7d0c1, merge both sides by hand (git diff 45d7d0c1 FETCH_HEAD -- <path>) and say so.
3. Rewrite the flagged test line so gitleaks does not match it without any ignore entry, keeping the same assertion. For example, take the synthetic password from the same constant or fixture the test already uses for it, rather than a literal next to a PASSWORD key. Check each other file this PR changes for the same pattern. Run gitleaks as the hook does (read .githooks/pre-push or tools/gitleaks/) over the new commits, and over the working tree's changed files, before pushing.
4. Regenerate with the generators (pnpm synth --all, watched.ts --write) and commit their output if any.
${SAVE('rebuild.progress.md', 'each commit')}
Return the new head, the commits, the base sha and how the line was rewritten.`, { label: 'rebuild', phase: 'Rebuild' })

phase('Check')
const chk = await agent(`${COMMON}

CHECK the rebuild (${rb}). Read only. Prove:
(a) git diff ${OLDHEAD} <new head> -- . ':!.gitleaksignore', minus the base's own changes since 45d7d0c1 (compare with git diff 45d7d0c1 <new base>), equals only the rewritten test line or lines. Show the residual diff.
(b) .gitleaksignore equals the new base's version byte for byte.
(c) gitleaks, run the way the pre-push hook runs it, finds nothing in the new commits.
(d) Under the lock: pnpm typecheck; pnpm lint; lint:copy; lint:logs; check:fixtures; verify-content; vitest run --project unit apps/web (counts); pnpm db:migrate, then the 8 db test files the old integration ran (counts); pnpm --filter @tp/infra test (counts); synth --all and watched.ts --write clean.
Report B/S/N with evidence in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the residual diff, the counts, and a verdict line: "VERDICT: clean" or "VERDICT: defects".`, { label: 'check', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

OPEN the new draft PR. Rebuild: ${rb}
Check: ${chk}
If the check found a B or S defect, fix it in a new commit first and re-run what it touches. Then:
1. git push -u origin ${BR} from ${WT}. If gitleaks refuses, rewrite the flagged text in a new commit and push again. Never touch .gitleaksignore.
2. Read #112's description (pull_request_read get on #112) and make the new PR's description from it. Every template section stays. Head ${BR}, base claude/build-platform, draft true, the same title. Update the head and base, the commit list (the old commits each new one carries), and the checks (the check's counts). Add a short section: "Rebuilt from #112 on a fresh branch: #112 added .gitleaksignore entries for a synthetic test password, which the build's rules forbid; the history could not be rewritten without a forced push, so the same changes were rebuilt here with the test line rewritten, and no ignore entry." End exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Create it with mcp__github__create_pull_request, read it back with pull_request_read, compare, and restore the footer once with update_pull_request if it was rewritten.
${SAVE('open.progress.md', 'each step and the PR number')}
Return the new PR number, the head sha and the readback result.`, { label: 'open', phase: 'Open' })
return { rb, chk, open }
