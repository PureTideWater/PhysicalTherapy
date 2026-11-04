export const meta = {
  name: 'acting-s4-pr106-merge-prep',
  description: '#106 (private-repository fetch fix, CI-11 guard): base merge keeping #107, conflict check, targeted re-check, push, description, verification on CI',
  phases: [
    { title: 'Merge prep', detail: 'base merge, resolution, re-check, push, description' },
    { title: 'Check', detail: 'resolution check' },
    { title: 'Verify', detail: 'fresh clone, CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/pr106'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ci-trivy'
const BR = 'co-001/ci-trivy-install-2026-11-04'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}). PR #106 (branch ${BR}, worktree ${WT}, draft, head 78cd55d2, base 4846f043). It carries the pinned Trivy install AND the screening-capacity "changes" job's fetch fix for a private repository (no blob:none; fetch-depth 0; contents: read), the CI-11 private-repository guard and the CI-11/CI-21 row texts. It was VERIFIED (records /home/user/ops/approval-summaries/lane-b-ci-trivy-install-{review,fix-round,verification}.md; scratch /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/trivy/). Its Trivy part was split out as #107, which merged as 7bf7b252; the base is now df4daff7 or later (it also has #105). The repository is PUBLIC again (07:10Z), so the capacity gate's runner has 4 CPUs and can pass. The orchestrator: #106 is still worth merging, since it keeps the gate working if the repository goes private again. Do one base merge, keeping #107's text, then push, CI, ready and merge (the session does the ready and merge, never you). The delta check of #107 predicted the conflicts: ADR 0066 (2 hunks) and workflows.test.ts (1); ci.md merges cleanly. Its N1: keep #107's Trivy amendment under its own heading as merged, and put #106's private-repository text under its own heading, so the ADR credits each branch rightly. The files #106 shares with #107 must end equal to the base's versions, except where #106 adds the private-repository parts.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock; another workflow (UX PR 7's build) shares the machine. Commit messages end with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators (synth for fixtures). No model identifier in any file. Never comment, review, approve, mark ready or merge; never write through the connector; GitHub through mcp__github__ tools (ToolSearch). Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Merge prep')
const prep = await agent(`${COMMON}

MERGE PREP: git -C ${WT} fetch origin claude/build-platform; git -C ${WT} merge --no-ff FETCH_HEAD. Resolve as described; regenerate generated files (pnpm synth --all for the CI fixtures, watched.ts --write). Then verify: git diff FETCH_HEAD HEAD shows only #106's private-repository parts (the screening-capacity.yml checkout, the CI-11 guard tests, the ADR 0066 and ci.md private-repository text, the CI-11/CI-21 rows in test-matrix.md, matrix.ts and fixtures), with no Trivy differences from the base. Commit the merge with a message naming the base sha and #107, and the attribution lines. Targeted re-check under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; vitest run tools/test tools/check-action-pins packages/synth (counts); pnpm synth --all and watched.ts --write (clean); pnpm actions:check; actionlint; BASE=origin/claude/build-platform pnpm toolchain:check. Push: git push origin ${BR}. Update #106's description: read it first; now it is the private-repository fetch fix and the CI-11 guard, with the Trivy part merged as #107; the repository is public again, and the change stays to keep the gate working if it goes private; the head, the base, the re-check; every template section; the exact footer. Read it back and compare.
${SAVE('prep.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the base merged, how each conflict was resolved, git diff --stat FETCH_HEAD..HEAD, the re-check counts and the readback result.`, { label: 'prep:106', phase: 'Merge prep' })

phase('Check')
const chk = await agent(`${COMMON}

RESOLUTION CHECK of #106's new head. Prep: ${prep}
Read only. Confirm: no Trivy behaviour differs from the base (diff the three workflows outside screening-capacity.yml, tools/trivy, tools/check-action-pins and tools/gitleaks against origin/claude/build-platform: all identical); the ADR 0066 headings credit #107 and #106 rightly and the text reads correctly; workflows.test.ts keeps both #107's Trivy block and #106's private-repository block once each, with nothing duplicated or dropped; the CI-11/CI-21 rows describe both; the fixtures equal what synth produces. Report B/S/N with evidence in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check:106', phase: 'Check' })

phase('Verify')
const ver = await agent(`${COMMON}

FRESH-CLONE VERIFIER of #106. Prep: ${prep}
Resolution check: ${chk}
If the check found a B or S defect, report NOT VERIFIED with it and stop. Otherwise:
1. git ls-remote: the head is as reported; note the base tip.
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, re-checked every few minutes with a background "sleep 240" (run_in_background), up to 75 minutes. List every run. Required: all green, mutation, screening-capacity gate (it measures, since #106 touches watched paths; it must PASS on the 4-CPU runner: quote the capacity job's runner line and verdict), approval-of-record. The changes job must succeed with the token-less full fetch. Quote the S4 middle-run time and any advisory warnings.
3. Fresh clone at the head: install under the lock; vitest run tools/test (counts); actionlint; actions:check; git diff --stat against the merge base.
4. Check the description's claims; list stale sentences with exact replacements.
Write /home/user/ops/approval-summaries/lane-b-ci-trivy-install-verification-2.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table, the capacity verdict and the corrections.`, { label: 'verify:106', phase: 'Verify' })
return { prep, chk, ver }
