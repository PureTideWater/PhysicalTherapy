export const meta = {
  name: 'pr6b1-verify',
  description: 'PR 6b-1 (#35) fresh-clone verification at e50c310: clean install, scope, freeze output, proofs read from CI logs, CI green, a short summary for the founder',
  phases: [{ title: 'Verify', detail: 'one agent, fresh clone, reads CI instead of rerunning it' }],
}

const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const HEAD = 'e50c31017b2dc2d588af02ad9f3c845cb56443c7'
const RESULT = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pass', 'fail'] },
  checks: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['what', 'passed', 'evidence'] } },
  problems: { type: 'array', items: { type: 'string' } },
  summary_file: { type: 'string' },
}, required: ['verdict', 'checks', 'problems', 'summary_file'] }

phase('Verify')
const v = await agent(`You are the independent fresh-clone verifier of PR 6b-1, draft pull request #35 in PureTideWater/PhysicalTherapy, branch co-001/pr-06b-zip4-engine, head ${HEAD}, base claude/build-platform at 8e33cb3. It is the engine's ZIP+4 locality lookup under the founder's freeze exception of 2026-10-18 11:47 UTC, with the founder's answers of 2026-10-21 to PR 6b's Q3 (a) and Q4 (a) granted as exceptions. No migration. CI is green on this head; you READ CI rather than rerunning the identical suite. Change nothing in any worktree, push nothing, post nothing on GitHub.

Sources: the plan /home/user/ops/designs/pr6b-plan.md lines 88-125 (6b-1's contents), 233-240 (builders), 453-545 (acceptance checks and the fresh-clone verification's list); the handoff /home/user/ops/HANDOFF.md from the line "6b-1 built" to the end (what the build, review and fix rounds did, including e50c310's temp-directory fix).

Prove each, with evidence:
1. Clean start: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/pr6b1-verify (or clone /home/user/PhysicalTherapy and fetch origin), check out ${HEAD} exactly, PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH, pnpm install --frozen-lockfile passes.
2. Scope: git diff --name-only $(git merge-base origin/claude/build-platform ${HEAD}) ${HEAD}: every path belongs to the 6b-1 work (the plan's owned files, the build's documented extras such as packages/synth matrix and pinned-tables, the review round's files: the Stryker runner patch and canary, .github/workflows/mutation.yml, tools/engine-freeze, reconciliation-001, README, ADRs 0029/0033/0034/0047/0064). No migration; no file under apps/; docs/product/domain-model.md, approvers.json and content/releases untouched; fixtures/golden only adds G196-G199 and edits QUESTIONS.md and README.md; releases 900001-900005 byte-identical.
3. The freeze tool: PR_NUMBER=35 pnpm -s exec tsx tools/engine-freeze/check.ts <merge-base> passes and lets through exactly the five engine files (types, reasons, trace, engine, recompute), G196-G199 and the two golden docs; git diff --stat <merge-base> ${HEAD} -- packages/pricing ':!**/*.test.ts' lists only those five files.
4. Proofs from CI's own logs (GitHub MCP tool mcp__github__get_job_logs, loaded with ToolSearch "select:mcp__github__get_job_logs,mcp__github__pull_request_read"; job ids on ${HEAD}: check 119624873121, mutation 119624873224, capacity 119624872825; if a log is large, it is saved to a file: grep it): the Engine freeze step's summary; the differential test's annotated counts (150 claims and 326 lines, 20,000 generated claims) and that it ran (not skipped); unit, golden (154 claims, 330 lines), oracle, test:db and e2e results; the mutation job's canary and score against its break; the capacity verdict.
5. CI is green on ${HEAD}: every check run completed successfully (pull_request_read get_check_runs for #35), and #35 is mergeable.
6. The documents say what was ruled and no more: reconciliation-001 records Q3 (a) and Q4 (a) of 2026-10-21 as granted exceptions and PR 5's trigger on rule_release_withdrawal as a departure put to the founder (never as granted); ADR 0064 matches the code (the two ENGINE_ERROR details no_locality_plus_four and zip_plus_four_not_in_locality_map, ENGINE_VERSION phase-two/2, O1 the ZIP9 layout unconfirmed).
7. Write a short plain-language summary for the founder to ${SP}/pr6b1-verify/summary.md: what 6b-1 changes and why, what proves it (with the numbers), what it does not do yet (6b-2 wires it to practices and the screening), and the open items (O1 the CMS ZIP9 layout to confirm before real content loads; specialist Q37; the PR 5 trigger ruling; required checks and rulesets). Plain words, short.
Delete your clone afterwards except the summary. Report the verdict (pass only if every check passed), each check with its evidence, and any problem.`, { label: 'verify: 6b-1 at e50c310', phase: 'Verify', schema: RESULT })
if (!v) throw new Error('the verifier returned nothing')
return v
