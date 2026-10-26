export const meta = {
  name: 'lane-b-superseded-rerun-verify',
  description: 'PR #50: fresh-clone verification reading CI, adversarial re-review of the fix round, re-taken screens with a UX re-check',
  phases: [{ title: 'Verify' }, { title: 'Screens' }, { title: 'UX recheck' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const HEAD = 'a3c583d924bf31408a1618d9f381e07433928722'
const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' },
      evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'title', 'evidence', 'fix'] } },
  },
  required: ['verdict', 'summary', 'findings'],
}
const COMMON = `Lane B PR #50, PureTideWater/PhysicalTherapy, "A superseded re-run cannot be accepted (combined audit #10)", branch co-001/superseded-rerun, head ${HEAD} (= fix round 81b7b0c plus a clean merge of claude/build-platform 4d99df8). First commit 961783a; base at the start 6ddd587. Records on claude/build-ops (/home/user/ops): design designs/lane-b-superseded-rerun.md, review findings approval-summaries/lane-b-superseded-rerun-review-findings.md, fix-round dispositions and suite approval-summaries/lane-b-superseded-rerun-fix-round.md, status approval-summaries/lane-b-superseded-rerun-status.md. Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; heavy commands one at a time under flock /tmp/laneb-heavy.lock; change nothing in /home/user/superseded-rerun; commit or push nothing; synthetic data only.`

phase('Verify')
const verifyP = parallel([
  () => agent(`${COMMON}

YOU ARE THE FRESH-CLONE VERIFICATION (lane-b.md "Merging" step 4: one agent in a fresh clone, reading CI).
1. Clone fresh: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/verify-clone && cd there && git checkout ${HEAD} (detached). Install (pnpm install --frozen-lockfile, under the lock). Run under the lock: pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs, pnpm check:fixtures, pnpm vitest run packages/synth, the unit tests of apps/worker/src/price and apps/web/src/components (vitest --project unit with those paths), and the db tests apps/worker/src/price/rerun.db.test.ts and apps/web/src/lib/routes/reruns-routes.db.test.ts against a fresh migrated database (find how the db project picks its database, e.g. DATABASE_URL on PG18 port 5433 and pnpm db:migrate; use a database name of your own and drop it after). Check the engine freeze: git diff --stat 6ddd587 ${HEAD} -- packages/pricing/src ':!**/*.test.ts' is empty; no file under packages/db/migrations changed by this PR's own commits (git diff 961783a^1..${HEAD} minus the base merge: compare git diff --name-only 4d99df8 ${HEAD}); no file of PR #42 (/tmp/claude-0/pr42-files.txt) changed except docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts; no model identifier in the diff (grep -iE 'claude|opus|sonnet|haiku|gpt|anthropic' over git diff 4d99df8 ${HEAD}, judging each hit).
2. Verify the records against the code: every disposition in the fix-round summary is true in the code at ${HEAD} (spot-check each one by reading the code and the test that asserts it); the test-matrix rows PRC-25..PRC-28 match packages/synth/src/cases/matrix.ts word for word and each row's assertedBy files assert it; the ADR 0037 amendment matches the code (reason codes, messages, lock, rule).
3. Read CI on ${HEAD}: wait until every check run on that commit has completed (poll gh api repos/PureTideWater/PhysicalTherapy/commits/${HEAD}/check-runs?per_page=100 every 2 minutes with a background loop or the Monitor tool; never a foreground sleep), then report each check's conclusion. For test totals use the GitHub MCP tool get_job_logs (load via ToolSearch "select:mcp__github__get_job_logs"; return_content true, tail_lines large) on the unit, db (1/4..4/4), e2e (1/2, 2/2) jobs and record each job's runner totals (passed/failed/skipped). If a check fails: root-cause it from its log, say whether it is this PR's (with evidence) and what fix is needed; if it is the known screening e2e flake recorded in /home/user/ops/LANES.md "Handed to Lane A", say so with the evidence.
${SAVE('verify-fresh.md', 'each step, its result and counts, each CI check as it completes')}
Return verdict pass only if every local check passes, every record matches the code, and CI on ${HEAD} is all green; findings for anything else.`, { label: 'verify-fresh-clone', phase: 'Verify', schema: FINDINGS }),
  () => agent(`${COMMON}

YOU ARE AN ADVERSARIAL RE-REVIEW of the fix round's delta: git -C /home/user/superseded-rerun diff 961783a 81b7b0c (41 files). The first review's findings and the fixers' dispositions are in the records above. Apply both checklists: /home/user/superseded-rerun/.claude/agents/payment-engine-reviewer.md and security-reviewer.md. Focus where the fix round added new risk:
- apps/worker/src/price/execute.ts: the restart when a later completed_at exists (PricedOutOfOrder, PRICING_TRANSACTIONS = 5): livelock or starvation under several executions; whether it can fail runs that should complete (e.g. a busy practice with many runs; a stuck or very long run); interaction with the existing per-practice lock and job retries; whether it really makes completed_at order equal read order; anything it does to the monitor chain and price.large tests.
- apps/worker/src/price/diff.ts compareAcceptance / acceptanceHeldBy and the heldByIds binding in acceptRun: correctness of "exactly what accepting changes" (every line whose pricing in effect would change, no more, no fewer), the 200 cap on heldByIds (what happens past 200?), a denial of acceptance by a crafted form, tenant scoping of the new SQL, audited reads.
- in-effect.ts: the split clause via pricing_run_split() (scope, NULL handling, approved_at ties), NEWER_BECAUSE, RERUN_ACCEPTANCE.
- apps/web/src/lib/http/next.ts and components/action-form.tsx (UX-3, UX-6): the change touches every form in the app — any form whose error display or focus regresses (read the forms that use ActionForm and runAction; check the existing tests), any client-side leak, any infinite refresh loop.
- the route's input schema (replacesId, heldByIds) and refusal mapping; no identifier or value in a message; audit on success only.
Verify each finding concretely (a failing sequence or input, file:line), and try to refute it yourself first. You may run tests in a scratch worktree (git -C /home/user/superseded-rerun worktree add --detach ${SP}/rereview-wt 81b7b0c; remove it at the end) under the lock.
${SAVE('rereview.md', 'each finding as you confirm it')}
Return verdict pass if nothing blocking or should-fix remains.`, { label: 'rereview-fix-delta', phase: 'Verify', schema: FINDINGS }),
])

phase('Screens')
const screens = await agent(`${COMMON}

Re-take the AFTER screenshots on ${HEAD}, because the fix round changed what the screens show (UX-1..UX-9 and the exact acceptance diff). Follow ${SP}/progress/screens-after.md exactly (the same tool /home/user/ops/tools/lane-b-screen-tour, the same spec /home/user/ops/designs/lane-b-superseded-rerun/capture/superseded.spec.ts, heavy lock for build and serve, the stop file, server-stopped check, cleanup), with TOUR_DIR=${SP}/screens-after2 and TOUR_REF=${HEAD}. If the spec needs adapting to the new wording or the refusal flow (the form now posts replacesId and heldByIds; focus moves to the explanation after a refused accept), adapt it only in ways that still run on the base, and record each change. Write ${SP}/screens-after2/shots.json with the same file names and state names as ${SP}/screens-after/shots.json.
${SAVE('screens-after2.md', 'each step, each run with its result, the lock and server state')}
Return the shot list (file, state, width) and any problem.`, { label: 'screens-after2', phase: 'Screens' })

phase('UX recheck')
const ux = await agent(`${COMMON}

YOU RE-CHECK THE UX AND BRAND FINDINGS after the fix round. The first UX review's findings UX-1..UX-9 are in /home/user/ops/approval-summaries/lane-b-superseded-rerun-review-findings.md, the fixers' dispositions in .../lane-b-superseded-rerun-fix-round.md. Screens: BEFORE ${SP}/screens-before/png, first AFTER ${SP}/screens-after/png, re-taken AFTER on ${HEAD} ${SP}/screens-after2/png (shots.json in each; the capture agent reported: ${typeof screens === 'string' ? screens : JSON.stringify(screens)}). View the pairs with Read. For each UX finding: fixed or not, with the shot names. Then review the new screens freshly against the same standard as the first review (/home/user/ops/designs/lane-b-ux-review-brief.md "What it judges against"; .claude/rules/brand.md; PRD cross-cutting requirements; WCAG 2.1 AA): any new wording, layout at 390 px, the acceptance diff table at 390 px, the long run names (runName with seconds) wrapping, focus and announcements. Read the component code for states not captured.
${SAVE('ux-recheck.md', 'each finding checked and each new finding, with shot names')}
Return verdict pass if nothing blocking or should-fix remains (file = the component or page; evidence = shot names).`, { label: 'ux-recheck', phase: 'UX recheck', schema: FINDINGS })

const [fresh, rereview] = await verifyP
return { fresh, rereview, screens, ux }
