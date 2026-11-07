export const meta = {
  name: 'lane-b-pages-child-process-verify',
  description: 'PR #130 fresh-clone verification reading CI on 43a81626, with a completeness critic',
  phases: [
    { title: 'Verify', detail: 'one fresh-clone verifier reading CI' },
    { title: 'Critic', detail: 'completeness critic on the verification' },
  ],
}
const HEAD = '43a81626d310450eba77d17bc9651df53d992965'
const PROG = '/home/user/ops/approval-summaries/lane-a-pages-child-process-wip/progress'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/pcp'
const COMMON = `Context: PaidWhole build, PureTideWater/PhysicalTherapy. PR #130 (draft, co-001/pages-child-process -> claude/build-platform, head ${HEAD}, base cc3dd7f6): contract pages are read in a child process (packages/contracts/src/evidence/pages.ts, page-reader.ts) with its own heap bound, a deadline and memory kill kept until close, no core files; infra/test/heap.test.ts guards the worker task's heap flag; ADR 0071/0033 amended; SEC-24. Records: status /home/user/ops/approval-summaries/lane-a-pages-child-process-status.md, reviews lane-a-pages-child-process-review-*.md, progress ${PROG}/ (fix-*, lb-*). Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH first; heavy commands under flock /tmp/laneb-heavy.lock; READ ONLY on GitHub and the repository: never push, comment, review, approve, edit the PR, mark ready or merge; never write through the GitHub connector. CI: gh api repos/PureTideWater/PhysicalTherapy/commits/${HEAD}/check-runs and actions runs/jobs; job logs via gh api (actions/jobs/<id>/logs) or the MCP get_job_logs tool (load with ToolSearch). The PR body: gh api repos/PureTideWater/PhysicalTherapy/pulls/130 --jq .body.`
const VER = { type: 'object', properties: { pass: { type: 'boolean' },
  issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] }, fix: { type: 'string' } }, required: ['what', 'evidence', 'severity', 'fix'] } },
  summary: { type: 'string' } }, required: ['pass', 'issues', 'summary'] }

phase('Verify')
const v = await agent(`${COMMON}

YOUR TASK: the fresh-clone verification of PR #130 before merge. Assume something is wrong until shown otherwise. Keep ${PROG}/lb-verify.md up to date as you go (continue from it if it exists).
1. git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/vx-pcp; fetch co-001/pages-child-process; confirm its head is ${HEAD} and that origin/claude/build-platform is an ancestor (the up-to-date rule).
2. CI on ${HEAD}: every check run completed success (or skipped by design: say which and why); the required ones — all green, mutation, screening-capacity gate, approval-of-record — succeeded on this exact sha; read the logs of unit, db shards, e2e, mutation/gate and the capacity gate; record totals and compare with the PR description's local totals; flag any test skipped in CI that is not skipped locally, any warning that is really a failure, and the capacity gate's figures for the worker's memory.
3. The diff: git diff origin/claude/build-platform...${HEAD}; every behaviour claim in the PR description matches the code; no migration, no PHI/real data, no model identifier, no .gitleaksignore change, no lockfile change; SEC-24 present in test-matrix and synth registry with its test.
4. Independently re-run, under the lock in the clone after pnpm install --frozen-lockfile: vitest for packages/contracts, infra and the worker's bundle test after the worker build; typecheck. Try one adversarial probe of the reader's bounds of your own design (e.g. a synthetic oversized/hostile input through documentPages) and confirm it is refused within bounds.
5. Remove the clone. Classify issues blocking/should/nit. pass = no blocking and no should.`, { label: 'verify', phase: 'Verify', schema: VER })
if (!v) throw new Error('verifier returned nothing; resume')

phase('Critic')
const c = await agent(`${COMMON}

COMPLETENESS CRITIC of the verification below. What did it not check that a merge of this PR depends on (a required check not read, a log not opened, a claim taken on trust, the up-to-date rule, an open review thread, a conflict, an ordering constraint such as infra/lib/heap.ts's flag shipping before this)? Check each gap yourself, read only (use a fresh clone /home/user/cx-pcp if needed, then remove it). Keep ${PROG}/lb-verify-critic.md up to date. Verification: ${JSON.stringify(v)}`, { label: 'critic', phase: 'Critic', schema: VER })
return { v, c }
