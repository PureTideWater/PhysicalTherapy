export const meta = {
  name: 'acting-s4-b-verification',
  description: '#94 (Dependabot B) fresh-clone verification at e3fc02e4 reading CI, with a skeptic of the verdict and the fix-round record',
  phases: [
    { title: 'Verify', detail: 'fresh clone, CI read, merge-tree vs every open head, description claims' },
    { title: 'Skeptic', detail: 'try to refute the verdict' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/b'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}) on Lane A's account (rules: /home/user/ops/lanes/acting-lane-b-2026-11-04.md). PR #94 (Dependabot B; branch co-001/deps-aws-cdk-minor-patch; head e3fc02e44cb7b13a2496192d0c4fb8fc04c01f37, draft; base claude/build-platform at 21fa10dfddd73228865f183e34c809946b014441, which e3fc02e4 already merges). Its record: /home/user/ops/approval-summaries/lane-b-dependabot-batch-status.md (whole), the reviews B-review-ci-infra.md and B-review-security-supply.md beside it, the design /home/user/ops/designs/lane-b-dependabot-batch.md. The description as of now: ${SP}/../pr94-body.md (65,122 characters; limit 65,536). The full local suite ran at f463f486; e3fc02e4 had a targeted re-check (description, "Checks"); CI ran on e3fc02e4 (all 30 check runs success or skipped). Speed rules: CI is the suite of record; the merge needs every required check green on this exact head (all green, mutation, screening-capacity gate, approval-of-record) and a fresh-clone verification.
Rules: synthetic data only; every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands (install, typecheck, lint, tests, synth) only under flock /tmp/laneb-heavy.lock (another workflow shares the machine). Read only on GitHub: never comment, review, approve, mark ready, merge, push or write files through the connector. GitHub reads through the mcp__github__ tools (ToolSearch "select:mcp__github__pull_request_read,mcp__github__list_pull_requests,mcp__github__actions_list,mcp__github__get_job_logs"); gh only for search. No model name or identifier in any file. Scratch under ${SP}. Long waits: run_in_background; no foreground sleep.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Verify')
const ver = await agent(`${COMMON}

You are #94's FRESH-CLONE VERIFIER. Do:
1. git ls-remote origin: the branch head is still e3fc02e4 and claude/build-platform still 21fa10df (if either moved, say so first; the verdict is then NOT VERIFIED with the reason).
2. Fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone, check out e3fc02e4. Confirm 21fa10df is its parent (merged base). Under the lock: pnpm install --frozen-lockfile; pnpm install --lockfile-only changes nothing (git diff --exit-code); pnpm typecheck; pnpm lint:logs; pnpm verify-content; pnpm check:fixtures; pnpm synth --all and pnpm exec tsx tools/screening-capacity/watched.ts --write (tree clean); pnpm exec vitest run --project unit infra/test/cli-settings.test.ts and the recorded-textract test (find its path); pnpm --filter @tp/infra test; BASE=origin/claude/build-platform pnpm toolchain:check (networked; a newer-pnpm warning is not this PR's). Check the manifests: every @aws-sdk/* range in apps/web, apps/worker and packages at ^3.1160.0 (B(6)), aws-cdk-lib ^2.275.0, aws-cdk ^2.1146.1, stripe ^23.1.0; the diff against 21fa10df touches no migration, no content/releases/**, no product logic outside what the description lists (git diff --stat 21fa10df e3fc02e4; read anything unexpected).
3. CI on e3fc02e4: every check run (pull_request_read get_check_runs, #94): the four required checks success, nothing failed, every run on this head sha; read the unit job's and mutation gate's log tails to confirm the counts the description states (unit 7,306 / 7,305 passed 1 skipped; db 9,649; e2e 70; golden 376; mutation gate passed).
4. Open PRs now (list_pull_requests state open, base claude/build-platform): for each other open PR, its head sha and draft state; git merge-tree --write-tree of each head against e3fc02e4 and against 21fa10df: which conflict because of #94 (conflict with e3fc02e4 but not with 21fa10df). Is any non-draft, green PR waiting with a file that conflicts with #94 (then #94 must not jump it)? Dependabot #99, #100, #101, and #88/#89 state (closed or open).
5. Description: every claim of the "Merge order" and "Checks" sections still true now (open-PR list and conflicts as of now; heads; counts). List each stale sentence with its exact replacement text (do not edit GitHub).
6. Write ${SP}/../B-verification.md (copy to /home/user/ops/approval-summaries/lane-b-dependabot-batch-B-verification.md; do not commit): commands with results, CI table, merge-tree table, description corrections, and a final line "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Also write /home/user/ops/approval-summaries/lane-b-dependabot-batch-B-fix-round.md (do not commit) if absent: B's fix round from the status file's log and the description (findings applied, commits 337b624c..f463f486, merge prep e6823f5b/e3fc02e4, suite at f463f486), short.
Remove the clone when done.
${SAVE('verify.progress.md', 'each step and its result')}
Return the verdict line, the merge-tree table, and the description corrections (exact old -> new text).`, { label: 'verify:B', phase: 'Verify' })

phase('Skeptic')
const sk = await agent(`${COMMON}

You are the SKEPTIC of #94's verification. Its report:
${ver}
Try to refute it: re-read live state yourself (git ls-remote; get_check_runs for #94 and the head sha each run reports; list of open PRs and their drafts; a merge-tree of two or three heads the verifier called clean or conflicting). Look for anything it missed that should block the merge: a required check not on this head, a failed or still-running run, a ready green PR that #94 would jump in a conflicting file, a migration or content-release change, the description over 65,536 characters, a model identifier or PHI in the diff (grep the diff 21fa10df..e3fc02e4 for "claude-", "opus", "sonnet", "haiku", "fable" in added lines). Do not re-run the heavy suite.
${SAVE('skeptic.progress.md', 'what you checked')}
Return "UPHELD" or "REFUTED: <reasons>", with any extra description corrections (exact old -> new).`, { label: 'skeptic:B', phase: 'Skeptic' })

return { ver, sk }
