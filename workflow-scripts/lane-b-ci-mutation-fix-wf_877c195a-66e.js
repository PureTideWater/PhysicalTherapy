export const meta = {
  name: 'lane-b-ci-mutation-fix',
  description: 'Lane B ci-mutation (PR #44) fix round: two fixers in parallel (money-path tests and records; tooling, workflow and docs), then merge, rule-6 merge with ci-speed if it has merged, the full local suite once, one push, the PR body',
  phases: [
    { title: 'Fix', detail: 'FA: payment-engine findings; FB: tooling, workflow and documents findings' },
    { title: 'Suite', detail: 'merge, rule 6 if #43 merged, full suite once, push, PR body' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-mutation'
const ATTRIB = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4'

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy. Draft PR #44 (co-001/ci-mutation, head 9099fac, base claude/build-platform at 49514e8): CI 4 of 4, audit #54, mutation testing on every money package (Stryker 10.1.1; gate above 85% with no unexplained survivor; equivalents in tools/stryker/equivalent/<package>.json). CLAUDE.md is in your context. Design: /home/user/ops/designs/lane-b-ci.md section 3.4. Build summary ${OUT}/build-summary.md. CI on 9099fac: mutation.yml all six shards and the mutation gate green.
- Two adversarial reviews found 2 blocking, 8 should_fix and 12 nits: ${OUT}/findings.json (each with reviewer "payment-engine" or "ci-tooling-security", id, severity, file, line, issue, evidence, fix); the full reviews ${OUT}/review-payment-engine.md and ${OUT}/review-ci-tooling-security.md. Finding ids repeat across reviewers (both have a B1): always name a finding as <reviewer>/<id>.
- The founder's standing rule: only the best option, never weighted by build effort; every finding that holds is fixed, nits included. The co-founder (who now decides for the founder on Lane B's work, LANES.md delegation of 2026-10-25) asks that every recommended fix be made.
- Hard rules (unchanged): no non-test change under packages/pricing (the engine freeze); packages/ledger/src by NEW it blocks or NEW test files only (0 deletions); the one non-test money change is packages/money/src/cents.ts:85; fixtures/golden unchanged; no migration; no test weakened or deleted; no model identifier anywhere but the attribution lines. Behaviour of the frozen engine itself (for example how it orders a NaN line number, or that it prices a malformed year basis at the records in force) is NOT changed here: a test that pins questionable engine behaviour must describe it as the frozen engine's current behaviour, not as its rule, and the fixer records it for Lane A's PR 6c (engine corrections) in its report.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 localhost:5433 (postgres:test). Chromium 1194 in /opt/pw-browsers. Another workflow shares the machine: wrap EVERY heavy command in flock /tmp/laneb-heavy.lock <command> (stryker, typecheck, lint, pnpm test, test:golden, vitest db runs, synth --all, e2e).
- Commits in the repository's style, each ending with exactly:
${ATTRIB}
- Never force, never --no-verify. Only the Suite agent pushes or edits the PR. Never change /home/user/PhysicalTherapy's or /home/user/ops's working trees.`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' }, branch: { type: 'string' }, head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    dispositions: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string', description: '<reviewer>/<id>' }, severity: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'rejected'] }, commit: { type: 'string' }, note: { type: 'string' } }, required: ['finding', 'severity', 'disposition', 'commit', 'note'] } },
    for_lane_a: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'branch', 'head', 'commits', 'dispositions', 'for_lane_a', 'checks', 'open_items'],
}

phase('Fix')
const fixes = await parallel([
  () => agent(`${CTX}

You are fixer FA, worktree /home/user/ci-mutation-fa, branch co-001/ci-mutation-fa (at 9099fac, installed). You own every payment-engine/* finding (B1, S1, S2, N1, N2, N3, N5; and N4, which is for Lane A only: record it, change nothing in the engine) and you own these files only: packages/{money,pricing,ledger,packets}/src/**/*.test.ts (ledger by additions only), tools/golden-worksheet/*.test.ts, tools/stryker/equivalent/*.json. For each finding verify it yourself, then fix it the best way or reject it with evidence. B1: the two pricing records a NaN lineNo tells apart are not equivalents: delete the records and kill the mutants with tests that pass on the frozen engine. S1: decide by the declared types whether the rounding.ts:26 mutant is a true equivalent (record it, with reason, and drop the type-violating kill) or a real refusal (assert its exact class and message); state why. S2: a malformed in-type year basis priced at the records in force is the frozen engine's current behaviour, not its rule: reword the test to say so, and record it for Lane A's 6c. N3: reasons cite code, not line numbers. N5: one claimRelease helper; runEngineOnGolden removed only if nothing uses it. After the record changes, rerun every affected shard (narrow first, then the shard) and the gate for the packages you touched: no unexplained survivor, every score above 85%. Checks: your tests; pnpm exec vitest run --project unit packages/money packages/pricing packages/ledger packages/packets; pnpm test:golden; the freeze (pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8); git diff --numstat 9099fac -- packages/ledger/src (0 deletions); pnpm typecheck; pnpm lint. Commit; do not push. Write ${OUT}/fix-fa.md. Return the structured summary.`, { label: 'fix:money-paths', phase: 'Fix', schema: FIX_SCHEMA }),
  () => agent(`${CTX}

You are fixer FB, worktree /home/user/ci-mutation-fb, branch co-001/ci-mutation-fb (at 9099fac, installed). You own every ci-tooling-security/* finding (B1, SF1 to SF6, N1 to N7) and these files only: tools/stryker/** except tools/stryker/equivalent/*.json, tools/screening-capacity/{watched.ts,watched.test.ts}, .github/workflows/mutation.yml, tools/test/workflows.test.ts's mutation block, vitest.mutation.config.ts, stryker/**, and the documents (docs/adr/0066's Part 4 and header, 0064, 0047; docs/runbooks/ci.md's mutation section; PRD 18 rows; the build summary's rule-6 notes go in your report, not in a repository file). For each finding verify it yourself, then fix it the best way or reject it with evidence; every behaviour fix fails first. At least: B1, a PR that deletes or renames a money test or data file, or moves one into the exclusion list, affects that package (closures from the merge base as well as the head, deleted paths included); SF1, the gate checks per FILE that every file a shard holds was run; SF2, mutation.yml and the gate fail closed on missing or garbled changes outputs; SF3, the Node version is pinned exactly for mutation runs (and the Unicode-dependent records hold to it, or a canary case detects a Unicode data change), choosing the best sound way; SF4, the data-file guard catches the path forms the review lists; SF5, ADR 0066's header keeps Part 4's provenance (the F6 ruling, the ADRs it amends, PRD 17, CI-15 to CI-17) in a form that merges mechanically with ci-speed's header; SF6, importClosure resolves every pnpm-workspace.yaml package and their exports the way vitest.mutation.config.ts aliases them (conditions, arrays, ./* patterns), without changing the screening-capacity watched list (its test proves it); N1, the gate refuses reviewedBy equal to proposedBy and a reviewedOn in the future; N2 to N7 as the review says, if they hold. Checks: pnpm exec vitest run tools/stryker tools/screening-capacity tools/test; actionlint; the canary 5 of 5; the gate over the money-ledger shard's fresh report; pnpm typecheck; pnpm lint. Commit; do not push. Write ${OUT}/fix-fb.md. Return the structured summary.`, { label: 'fix:tooling', phase: 'Fix', schema: FIX_SCHEMA }),
])
const missing = ['fix:money-paths', 'fix:tooling'].filter((_, i) => !fixes[i])
if (missing.length) throw new Error('A fixer returned nothing: ' + missing.join(', '))

const SUITE_SCHEMA = {
  type: 'object',
  properties: {
    head: { type: 'string' }, pushed: { type: 'boolean' }, base_merged: { type: 'string', description: 'which claude/build-platform commit was merged in, or "not merged: #43 still open"' },
    suite: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    scores: { type: 'string' },
    adversarial_reread: { type: 'string' },
    pr_body_updated: { type: 'boolean' },
    for_lane_a: { type: 'array', items: { type: 'string' } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['head', 'pushed', 'base_merged', 'suite', 'scores', 'adversarial_reread', 'pr_body_updated', 'for_lane_a', 'open_items'],
}

phase('Suite')
const suite = await agent(`${CTX}

You are the fix round's suite runner, in /home/user/ci-mutation (branch co-001/ci-mutation tracking origin/co-001/ci-mutation, at 9099fac, installed). The fixers finished on local branches co-001/ci-mutation-fa and co-001/ci-mutation-fb; their summaries:
${JSON.stringify(fixes, null, 1)}
1. Merge both (git merge --no-ff); fix any seam.
2. git fetch origin claude/build-platform. If it has moved past 49514e8 (PR #43, ci-speed, merged), merge origin/claude/build-platform into this branch with a merge commit now (LANES rule 6, the PR merged second resolves keeping both): follow the rule-6 recipe in ${OUT}/build-summary.md as corrected by ci-tooling-security/SF5, N5 and N7 and by fixer FB's report (ADR 0066 one header carrying every part's provenance, Parts 1 to 4 in order at one heading level; the runbook sections; CI-15 to CI-17 in ci-speed's CI table and its intro no longer calling them reserved; the synth registry and CASE_MODULES; workflows.test.ts's mutation block and ci-speed's timeouts table; vitest.config.ts both hunks; README, ADR 0064, reconciliation-001 by section; pnpm-lock.yaml regenerated with pnpm install, never hand-merged; then pnpm synth --all). If it has not moved, say so and do not merge.
3. Re-read git diff 9099fac..HEAD adversarially and fix what you find (commit).
4. Run the FULL local suite once on the head, each step under flock /tmp/laneb-heavy.lock, recording every result: pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm verify-content; the freeze against the merge base; the scope checks of design 3.4.4 step 1; pnpm synth --all with a clean diff; pnpm synth --large; pnpm test (coverage; money 100% branches); pnpm test:golden; pnpm test:oracle; pnpm licenses:check; actionlint; the full pnpm test:db on PG18 (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres, after pnpm db:migrate); the full pnpm test:e2e (find its database and port from apps/web/e2e/env.ts; 51 expected); the canary; ALL SIX shards one after another and the gate (every package above 85%, no unexplained survivor; give the scores). Every step must pass; root-cause and fix any failure, then rerun what it affects.
5. Push once: git push origin co-001/ci-mutation (the hook runs; never force, never --no-verify).
6. Update PR #44's body with update_pull_request (ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"; read it first): the "Reviewer agents' findings" table one row per finding (<reviewer>/<id>, severity, one line, resolution with commit); a "Fix round" checks table with every suite command and result and the scores; the base merge if done; a line listing what goes to Lane A's 6c. Keep the ending exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4
Read it back and confirm. Write ${OUT}/fix-suite.md. Return the structured summary.`, { label: 'suite', phase: 'Suite', schema: SUITE_SCHEMA })
if (!suite) throw new Error('The suite runner returned nothing.')
return { fixes, suite }
