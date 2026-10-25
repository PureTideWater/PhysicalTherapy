export const meta = {
  name: 'lane-b-pr15-fix',
  description: 'Lane B PR 15 (#45) fix round: the ten review nits, then the full local suite once, one push, the PR body',
  phases: [
    { title: 'Fix', detail: 'verify and fix the ten nits (tests and documents only)' },
    { title: 'Suite', detail: 'adversarial re-read, the full local suite once (one heavy step at a time), push, PR body' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/pr15'
const ATTRIB = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4'
const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy. Draft PR #45 (co-001/pr-15-ledger-tests, head 0e56e01, base claude/build-platform at 9c57d2d): PR 15, ledger tests LED-12 and LED-13, tests and documents only, under the founder's ruling L1 (a). CLAUDE.md is in your context. Design: /home/user/ops/designs/lane-b-pr15-ledger-tests.md. Build summary ${OUT}/build-summary.md. CI on 0e56e01 is all green.
- Two adversarial reviews found 0 blocking, 0 should_fix and 10 nits: ${OUT}/findings.json (reviewer "payment-engine" or "test-integrity", id, severity, file, line, issue, evidence, fix; ids repeat across reviewers, so name each as <reviewer>/<id>); full reviews ${OUT}/review-payment-engine.md and ${OUT}/review-test-integrity.md. The co-founder asks that every recommended fix be made.
- The co-founder decides for the founder on Lane B's work (LANES.md delegation of 2026-10-25) and asked for every recommended option: LED-12's row wording as the design recommends is his approved wording (record it so in reconciliation-001 item 15 if it does not already say so).
- Hard rules: tests and documents only; no non-test change under packages/ledger/src or apps/worker/src/reconcile; under packages/ledger/src only NEW it blocks or NEW test files (git diff --numstat 9c57d2d -- packages/ledger/src: 0 deletions); LED-01 to LED-11 and the oracle's five existing cases unchanged; no migration; synthetic data only; no model identifier anywhere but the attribution lines.
- Worktree /home/user/pr15 (branch co-001/pr-15-ledger-tests, tracking origin, installed). Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 localhost:5433 (postgres:test), DATABASE_URL=postgres://postgres:test@localhost:5433/postgres. MACHINE SAFETY (a container restart stopped earlier runs today): run EVERY command that starts vitest, tsc, eslint, Next, Playwright or a database suite under flock /tmp/laneb-heavy.lock, one at a time, never two at once, never in the background; e2e at --workers=2. Another workflow (PR #44's suite) shares the machine and the lock.
- Commits in the repository's style, ending with exactly:
${ATTRIB}
- Never force, never --no-verify; only the Suite agent pushes and edits the PR.`
const FIX_SCHEMA = { type: 'object', properties: { head: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } }, dispositions: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'rejected'] }, commit: { type: 'string' }, note: { type: 'string' } }, required: ['finding', 'disposition', 'commit', 'note'] } }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } } }, required: ['head', 'commits', 'dispositions', 'checks'] }
phase('Fix')
const fix = await agent(`${CTX}

You are the fixer. Verify each of the ten nits against the code at 0e56e01, then fix it the best way, or reject it with evidence. Each behaviour-adding assertion must be shown to fail on a ledger mutant or a broken premise first, then pass (for example payment-engine/N-1, the case state after the take-back per ADR 0042; test-integrity/N-1, assert the premise that the line can still post and deposit its 30.00 after the take-back; payment-engine/N-4, a period that ends on the recoupment's date). Comments and documents state exactly what the tests pin (payment-engine/N-2, N-3, N-6; test-integrity/N-4). test-integrity/N-2 is the PR body's rule-6 section: write the two missing interactions into ${OUT}/fix-round.md for the suite runner to put in the body. Run under the lock: the ledger db tests and the ledger oracle (DATABASE_URL), pnpm exec vitest run --project unit packages/ledger packages/synth, pnpm synth --all with a clean diff, git diff --numstat 9c57d2d -- packages/ledger/src, pnpm typecheck, pnpm lint. Commit; do not push. Write ${OUT}/fix-round.md. Return the structured summary.`, { label: 'fix', phase: 'Fix', schema: FIX_SCHEMA })
if (!fix) throw new Error('The fixer returned nothing.')
phase('Suite')
const suite = await agent(`${CTX}

You are the fix round's suite runner, in /home/user/pr15. The fixer committed (head ${fix.head}); its dispositions:
${JSON.stringify(fix.dispositions, null, 1)}
1. Re-read git diff 0e56e01..HEAD adversarially and fix what you find (commit).
2. git fetch origin claude/build-platform: if it moved past 9c57d2d (PR #44, ci-mutation, may merge first), merge it with a merge commit under LANES rule 6, keeping both (LED rows after LED-11, CI rows where they are, both totals.test.ts blocks; the lockfile regenerated with pnpm install, never hand-merged; then pnpm synth --all), and if the LED-13 property kills a mutant recorded in tools/stryker/equivalent/ledger.json, remove that record. If it has not moved, say so.
3. The FULL local suite once on the head, each step under the lock, recording each result: pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm verify-content; the freeze (pnpm -s exec tsx tools/engine-freeze/check.ts <merge base>); pnpm synth --all with a clean diff; pnpm synth --large; pnpm test (coverage; ledger 100% branches); pnpm test:golden; pnpm test:oracle (pyx12 agrees on every synthetic 835); pnpm licenses:check; actionlint .github/workflows/*.yml; pnpm db:migrate then the full pnpm test:db on PG18; the full pnpm test:e2e (find its database and port in apps/web/e2e/env.ts; 51 expected). Every step must pass; root-cause and fix any failure, then rerun what it affects.
4. Push once: git push origin co-001/pr-15-ledger-tests (the hook runs; never force, never --no-verify).
5. Update PR #45's body with the GitHub MCP tool update_pull_request (ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"; read it first; never gh for the write, which rewrites the body's ending): the reviewer findings table one row per finding (<reviewer>/<id>, one line, resolution with commit); a "Fix round" checks table with every suite command and its result; the rule-6 section completed from ${OUT}/fix-round.md; the base merge if done. Keep the ending exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4
Read it back and confirm. Write ${OUT}/fix-suite.md. Return a short summary: the head, what you checked, every suite result, and anything open.`, { label: 'suite', phase: 'Suite' })
if (!suite) throw new Error('The suite runner returned nothing.')
return { fix, suite }
