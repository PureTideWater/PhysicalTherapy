export const meta = {
  name: 'lane-b-dependabot-batch-a-push-verify',
  description: 'PR A (#90): merge the moved base, re-check what it touched, one push, description rewritten and read back, fix-round record; then the fresh-clone verification reading CI on that head',
  phases: [
    { title: 'Push', detail: 'base merge, targeted re-check, push, description, record' },
    { title: 'Verify', detail: 'fresh clone, CI on the head, description vs code' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/fix-A'
const SESSION = 'https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx'
const WT = '/home/user/deps-anthropic-sdk-1'
const BR = 'co-001/deps-anthropic-sdk-1'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy, Lane B item "dependabot-batch" (${SESSION}). PR A is #90, branch ${BR}, worktree ${WT}, remote head 06f79c07, local head 442d7a81 (the fix round: base 43565235 merged in as f5664b5b, every review finding applied, the full local suite green at 442d7a81: ${SP}/suite.md). Description changes prepared in ${SP}/description-changes.md; the design corrections and the status-file proposals it mentions are ALREADY applied on claude/build-ops (designs/lane-b-dependabot-batch.md :36, :122-128, 8.7; approval-summaries/lane-b-dependabot-batch-status.md "Proposals (outside this PR)", items 1-8). The base then moved to 4eaf7124 (#92, UX PR 6 sign-in; shares test-matrix.md, synth matrix.ts and registry.ts with A in separate places; trial merge clean): ${SP}/logs/base-move-*.txt.
Pacing (the co-founder, 2026-11-02 02:10 UTC): finish to merge with no stage skipped, but spend nothing that does not change the outcome: do NOT re-run the whole suite; re-run only what the base merge touches; CI runs the full suite on the merged head.
Merge rule (2026-11-01 20:36 UTC): a verified, green PR merges as soon as it is ready; order only between conflicting PRs (A conflicts only with #94, in packages/model-gateway/package.json).

Rules: synthetic data only; every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands only under flock /tmp/laneb-heavy.lock; commits end with a blank line and exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify. Generated files only by their generators. No model name or identifier in any file, commit or PR text. Never comment, review, approve or merge on GitHub; never touch a Dependabot PR. Long waits: run_in_background with an until-loop; no foreground sleep.`

const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Push')
const push = await agent(`${COMMON}

You are the PUSHER.
1. git fetch origin claude/build-platform. Merge it into ${BR} with a merge commit ("Merge claude/build-platform into ${BR}" plus the two lines). Resolve any conflict keeping both sides; generated files by their generators.
2. Re-check what the merge touched, under the lock: pnpm install --frozen-lockfile; pnpm synth --all (git clean); pnpm exec tsx tools/screening-capacity/watched.ts --write (git clean, or commit what it writes as "regenerate watched paths"); pnpm verify-content; pnpm check:fixtures (or the repo's fixtures check as CI's static job runs it); pnpm typecheck; pnpm lint; pnpm exec vitest run --project unit packages/synth packages/model-gateway apps/web (counts); tools/stryker/affected.ts against the new base (expected none). Record each in ${SP}/suite-merge.md.
3. If the base moves again before you push, merge again and repeat step 2 only for what that move touches.
4. Push once: git push origin ${BR} (pre-push hook; a refused push of unpushed commits: git reset --soft origin/${BR}, remove the flagged text, commit again in the same split, push).
5. Refresh the conflict list: git fetch the heads of every open PR (gh api 'repos/PureTideWater/PhysicalTherapy/pulls?state=open&per_page=50') and git merge-tree --write-tree each against your pushed head; list which conflict and in which files.
6. Rewrite the PR description (ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"; read the current body with pull_request_read get first). Keep the template's sections and required-checks markers exactly; every section, "None" rather than omitted; under 65,536 characters. Apply every entry of ${SP}/description-changes.md (sections 1-7), with the conflict list from step 5 and #92 named as merged. Add: the review findings table (all 18 distinct findings and the fix-round check's S1 and N1-N10, each with its commit or "description" or "deferred: the item's status file, Proposals (outside this PR), item <n>"); the full local suite at 442d7a81 from ${SP}/suite.md with counts, and the targeted re-check on the merged head from ${SP}/suite-merge.md; the pushed head sha; the merge order under the 20:36 UTC rule. Write it to ${SP}/pr-body.md, set it with update_pull_request, read it back (pull_request_read get, and gh api repos/PureTideWater/PhysicalTherapy/pulls/90 --jq .body) into ${SP}/pr-body-readback.md, compare (identical apart from trailing newlines; if the connector rewrote the footer, set it again and read back). It ends with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
7. Write the fix-round record /home/user/ops/approval-summaries/lane-b-dependabot-batch-A-fix-round.md (do not commit): the PR, pushed head, every finding with its disposition, the full suite at 442d7a81 with counts, the targeted re-check after the base merge, the checker's findings, the conflicts, and what the verification must read on CI. Shorten non-commit 64-hex digests to 8 hex and an ellipsis.
${SAVE('push2.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the re-check results, the conflict list, the readback result, and anything the session must decide.`, { label: 'push:A', phase: 'Push' })

phase('Verify')
const verify = await agent(`${COMMON}

You are the FRESH-CLONE VERIFIER of PR #90 (pipeline stage 6). The pusher's report:
${push}

1. git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/verify-clone && check out the pushed head. Read only: never push, comment, review or approve.
2. Wait for CI on that head to finish: poll gh api repos/PureTideWater/PhysicalTherapy/commits/<head>/check-runs?per_page=100 in a background until-loop (every 60 s, up to 90 minutes) until no run is queued or in_progress. Then read every check run: name, conclusion, and for the four required checks (all green, mutation, screening-capacity gate, approval-of-record) their logs' verdict lines (GitHub MCP get_job_logs with return_content and a large tail_lines). Record the unit, db, e2e and golden counts from the job logs and compare them with the local suite (${SP}/suite.md) plus what the base merge added; explain any difference. If a check is red, root-cause it from its log and say whether it is this PR's (red on the base too?).
3. In the clone, under the lock: pnpm install --frozen-lockfile; run pnpm exec vitest run --project unit packages/model-gateway and pnpm test:golden (counts); confirm the lockfile, synth fixtures and watched paths match their generators (pnpm install --lockfile-only, pnpm synth --all, watched.ts --write leave git clean).
4. Read the PR description back (pull_request_read get) and check every factual claim against the code, CI and the records: versions and ages, test names and counts, the findings table's commits (each sha exists on the branch and does what the row says), the conflict list (re-run merge-tree yourself), the template's sections all present, the footer exact.
5. Write /home/user/ops/approval-summaries/lane-b-dependabot-batch-A-verification.md (do not commit): the head, every check with its conclusion, the counts, what you ran, every claim checked, and a verdict line "VERIFIED" or "NOT VERIFIED: <reasons>". Remove the clone when done.
${SAVE('verify.progress.md', 'CI state, what you checked and found')}
Return: the verdict, the head sha, the four required checks' conclusions, and any defect with evidence.`, { label: 'verify:A', phase: 'Verify' })

return { push, verify }