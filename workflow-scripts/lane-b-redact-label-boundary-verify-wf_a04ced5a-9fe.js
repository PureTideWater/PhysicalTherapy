export const meta = {
  name: 'lane-b-redact-label-boundary-verify',
  description: 'Fresh-clone verification of PR #115 at b8eea909 that reads CI and checks the description',
  phases: [{ title: 'Verify', detail: 'one verifier' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb'
phase('Verify')
return await agent(`You are the fresh-clone verifier for PR #115 (PureTideWater/PhysicalTherapy, branch co-001/redact-label-boundary, head b8eea909 (resolve the full SHA), base claude/build-platform 17641c88): a redact.ts fix so a sentence end breaks a label's head (MOD-13 seed 460548619). You trust nothing anyone wrote; you check it. Keep ${SP}/progress/verify.md up to date and continue from it if it exists.
Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock; GitHub reads only through the GitHub MCP tools (ToolSearch: mcp__github__pull_request_read, mcp__github__get_job_logs), never gh or curl; never push, commit, comment, approve, mark ready or edit the PR; never write in /home/user/redact-label-boundary, /home/user/PhysicalTherapy or /home/user/ops; no model identifier in what you write; synthetic strings only.
1. Fresh clone into ${SP}/verify-clone; check out the head detached; confirm origin still points at it; pnpm install --frozen-lockfile.
2. Read the PR description (pull_request_read get) and check every claim against the clone and git: the defect and its counterexample (reproduce it against the base's redact.ts with a scratch tsx script outside the repo, and show the head fixes it), the fix's rules, every commit hash and what it touches (ancestor of head), the abbreviations and G2 cases, the over-redaction guards, the residual, the test names and the seed pin, the ADR 0054 entry, the base-merge statements, and the local totals against ${SP}/fix/check.md. List anything false or stale.
3. Boundaries: git diff --stat origin/claude/build-platform...HEAD is only redact.ts, redact.property.test.ts and ADR 0054; no model identifier in added lines or commit messages since the base; trailers present.
4. In the clone: pnpm typecheck; pnpm lint:logs; vitest --project unit packages/model-gateway; pnpm --filter @tp/model-gateway eval. Revert redact.ts to the base's in a scratch copy and show the seed-460548619 test and the class sweep fail, then restore.
5. Read CI on the full head SHA (get_check_runs): every run's conclusion; the four required ones.
Write ${SP}/fix/verify.md and return its full text: verdict PASS or FAIL with the exact list of what must change.`, { label: 'verify115', phase: 'Verify' })