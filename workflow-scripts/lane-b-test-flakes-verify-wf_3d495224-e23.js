export const meta = {
  name: 'lane-b-test-flakes-verify',
  description: 'Fresh-clone verification of PR #76 at b02435c5: reads CI on the head, checks the diff against the PR description and the reviews, re-runs the changed tests',
  phases: [{ title: 'Verify', detail: 'one agent in a fresh clone, reading CI' }],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/908cdf80-b74d-5a46-a9bb-4f85bd47f11f/scratchpad'
const SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
    ci: { type: 'string', description: 'each required check on b02435c5 and its conclusion, with the unit job counts' },
  },
  required: ['passed', 'blockers', 'notes', 'ci'],
}

phase('Verify')
return await agent(`Context: you work for Lane B of the PaidWhole build (lane rules /home/user/ops/LANES.md; lanes/lane-b.md "Merging"). You are the fresh-clone verification of PR #76 (PureTideWater/PhysicalTherapy, branch co-001/test-flakes, head b02435c5fc1784f16c0ae02d4d2bfe459349c18c, base claude/build-platform at e908c214), which fixes flaky tests; tests only.

Rules:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH.
- Work in a fresh clone /home/user/verify-flakes (git clone -q https://github.com/PureTideWater/PhysicalTherapy /home/user/verify-flakes; checkout co-001/test-flakes; confirm the head). Reuse it if it exists from an interrupted run. Install with flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline.
- Heavy commands only under flock /tmp/laneb-heavy.lock, one at a time; long ones with run_in_background.
- Never commit, push, approve, comment or edit anything on GitHub or in /home/user/ops. No model name or identifier in what you write.
- Save as you go: ${SP}/progress/verify.md; continue from it if it exists.

Check:
1. CI on the head, read through the GitHub MCP tools (ToolSearch "select:mcp__github__pull_request_read,mcp__github__get_job_logs"): every check run on b02435c5, and that the four required checks ('all green', 'mutation', 'screening-capacity gate', 'approval-of-record') succeeded on this head. From the unit job's log (get_job_logs with return_content and a large tail_lines; the output may be saved to a file: grep it), the test counts and that the changed files ran: tools/test/workflows.test.ts (including the simulated Dependabot rewrite test and its nested run passing), apps/worker/src/price/rerun-rule.property.test.ts, packages/packets/src/verifier.test.ts, packages/model-gateway/src/functions/denial-letter.test.ts, tools/test/db-shards.test.ts, tools/golden-worksheet/worksheet.test.ts, with their durations. The unit job took about 15 minutes on b02435c5 against about 6 on 0577b73f: find from both jobs' logs (b02435c5 unit job 122343151149; 0577b73f unit job 122276451275) where the time went (setup steps, a cache, or tests) and whether anything this PR changed made tests slower; report it.
2. The diff (git diff e908c214..HEAD): tests only, no product code, no migration, no workflow file, nothing in LANES.md's "Not while #42 is open" list; every claim in the PR description (gh api repos/PureTideWater/PhysicalTherapy/pulls/76 --jq .body) is true of the diff, and each reviewer finding in its table is resolved as it says.
3. Re-run the six changed test files in the clone (vitest --project unit, under the lock) and they pass.
4. The full local suite record /home/user/ops/approval-summaries/lane-b-test-flakes-fix-suite.md matches the head.
Return passed=true only when nothing blocks the merge.`, { label: 'verify', phase: 'Verify', schema: SCHEMA })