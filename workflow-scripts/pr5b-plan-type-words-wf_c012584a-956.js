export const meta = {
  name: 'pr5b-plan-type-words',
  description: 'Payer copy prints a CLP06-only plan as its plan type in words (founder ruling 2026-10-21): build, two specialist reviews, fix round',
  phases: [
    { title: 'Build', detail: 'new branch from claude/build-platform, words table, payer copy, verifier facts, tests, draft PR' },
    { title: 'Review', detail: 'payment-engine and EDI reviewers in parallel' },
    { title: 'Fix', detail: 'verify findings, fix, full local suite once, push' },
  ],
}

const CTX = `Repository puretidewater/physicaltherapy. Base claude/build-platform at 5df4108 (PR 5 merged as d152976). Work in a new worktree /home/user/pr5b on a new branch co-001/pr-05b-plan-type-words cut from origin/claude/build-platform. The builder creates it with 'git -C /home/user/PhysicalTherapy worktree add -b co-001/pr-05b-plan-type-words /home/user/pr5b origin/claude/build-platform', then runs pnpm install there.
Environment: Node 24 at /opt/node24/bin (put it first on PATH). PostgreSQL 18 on port 5433 (CI parity), superuser postgres password test, socket /tmp. Name scratch databases tp_pr5b_<role>_<n> and drop them when you finish. Playwright e2e ports for this run: 4901 to 4909 only (another run uses 48xx).
Rules that bind this run:
- No migration and no schema change; never edit content/releases/**, fixtures/golden/**, approvers.json or docs/product/domain-model.md.
- Commit in the repo's message style; end every commit message with the two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
- Push with 'git push -u origin co-001/pr-05b-plan-type-words' (the pre-push hook runs the fixture check and gitleaks; never --no-verify; fix a refused commit instead).
- Never skip, disable or loosen a test.
- Report briefly.`

const RULING = `The founder's ruling of 2026-10-21, audit item #37 part 1 (open in ADR 0061, section "Verification fix (2026-10-21)", and in reconciliation-001):
- A plan the remittance names only by its claim filing indicator (plan key CLP06:<code>, no REF CE; apps/worker/src/parse/plan.ts) currently prints on the payer's copy as "plan identifier 12". The 12 is a code from a closed X12 list, not a plan identifier.
- The founder ruled option (a): print the plan type in words, for example "plan type Preferred Provider Organization (PPO)".
- ZZ (Mutually Defined) names no type, so the plan is left off the "To:" line, as in option (b).
- A code with no words refuses the copy. This is fail-closed, as the copy's own rule for closed-list codes (D3/D14; PayerCopyWordsError in apps/worker/src/packets/words.ts) already requires.
The words are the descriptions in the X12 005010X221A1 code list for CLP06, element 1032 (claim filing indicator code). packages/edi835/src/code-lists.ts claim_filing_indicator has codes only:
12 Preferred Provider Organization (PPO); 13 Point of Service (POS); 14 Exclusive Provider Organization (EPO); 15 Indemnity Insurance; 16 Health Maintenance Organization (HMO) Medicare Risk; 17 Dental Maintenance Organization; AM Automobile Medical; CH Champus; DS Disability; HM Health Maintenance Organization; LM Liability Medical; MA Medicare Part A; MB Medicare Part B; MC Medicaid; OF Other Federal Program; TV Title V; VA Veterans Affairs Plan; WC Workers' Compensation Health Claim; ZZ Mutually Defined.
If web search is available to you, cross-check these descriptions against a public payer companion guide or CMS document. Cite the source in ADR 0061, and report any word that differs; do not change a word on your own.`

const BUILD = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' }, pr_number: { type: 'number' },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'checks', 'open_items'] }
const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', properties: {
    title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
    file_line: { type: 'string' }, failure_path: { type: 'string' }, fix: { type: 'string' } },
    required: ['title', 'severity', 'file_line', 'failure_path', 'fix'] } },
}, required: ['verdict', 'findings'] }

phase('Build')
const build = await agent(`${CTX}

${RULING}

Build it:
1. One table of the words, in packages/packets (pure and browser-safe), used by both the payer's copy (packages/packets/src/payer.ts planText and payerAndPlanText, rendered by apps/worker/src/packets/html.ts) and the verifier's facts (packages/packets/src/facts.ts quotes the plan as the copy prints it). A narrative may then quote exactly what the copy prints and nothing else. The worker's words.ts refuses the copy with PayerCopyWordsError for a CLP06 code with no words. ZZ omits the plan from the "To:" line, and then facts holds no plan.
2. Tests:
- every code of code-lists' claim_filing_indicator maps to its words, and the table holds no code outside that list (both directions, so the two lists cannot drift);
- payer.test.ts for each key form, including CLP06:12, CLP06:ZZ and an unknown code;
- export.test.ts T10 (the printed "To:" line) and T1's key-form variants;
- the leak scan still finds no qualifier code;
- facts.test.ts: a narrative quoting "plan type Preferred Provider Organization (PPO)" passes and one quoting "plan identifier 12" fails.
Add any changed file to the mutate lists of stryker.verifier.config.mjs and stryker.config.mjs where packets files are listed. Keep the verifier's score at 85 or above.
3. Update ADR 0061: the ruling, its date, the source of the words and the ZZ rule, and close the open item in "Verification fix (2026-10-21)". Update reconciliation-001 the same way. Fix the comments in payer.ts that call the item open.
4. Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; unit tests of packages/packets and apps/worker/src/packets; the payer-copy db tests on a fresh PG 18 migration; e2e/packets.spec.ts on port 4901.
5. Commit, push, then open a DRAFT pull request into claude/build-platform with the GitHub MCP tool create_pull_request (load it with ToolSearch). Fill its body from .github/pull_request_template.md on origin/main (git show origin/main:.github/pull_request_template.md), every section answered. Under "Freeze exception", answer that it changes the payer's copy wording only, by the founder's ruling of 2026-10-21. End the body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
Return the PR number.`, { label: 'build: plan type words', phase: 'Build', schema: BUILD })
if (!build) return { error: 'build failed' }

phase('Review')
const lenses = [
  { type: 'payment-engine-reviewer', key: 'packets', text: 'Lens: packages/packets and the worker\'s payer copy. Check the words reach the PDF exactly, ZZ and unknown codes fail as ruled, the verifier facts match what prints (a narrative can quote the copy and nothing else), no qualifier code or key leaks, the leak scan still covers every route, the mutation score holds, and nothing else in the copy changed.' },
  { type: 'edi-reviewer', key: 'edi', text: 'Lens: X12 fidelity. Check the words table against the 005010X221A1 CLP06 code list (element 1032) and packages/edi835/src/code-lists.ts: every code the parser accepts has words; no word is wrong; the key form CLP06:<code> written by apps/worker/src/parse/plan.ts is read correctly, including codes that start with digits; a plan with REF CE still prints its identifier; and an ERA export\'s PLAN: still prints its name.' },
]
const reviews = await parallel(lenses.map(l => () => agent(`You are an independent adversarial reviewer. ${CTX}

${RULING}

Review origin/co-001/pr-05b-plan-type-words (head ${build.head}) against origin/claude/build-platform, in a fresh clone under /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr5b/review-${l.key}. Change nothing in /home/user/pr5b. Builder's report: ${JSON.stringify(build).slice(0, 4000)}

${l.text}

Follow the checklist in .claude/agents/${l.type}.md${l.key === 'edi' ? ' and .claude/rules/edi.md' : ' and .claude/rules/money-and-contracts.md'} as your review method. Open one lead the earlier attempt raised and did not finish: apps/worker/src/parse/plan.ts planKey() interpolates claim.filingIndicator, which is null for an ERA-export claim. Can any path produce a plan key 'CLP06:null' or 'CLP06:', and what would the payer's copy then print or refuse? Finish each lead you open, and call StructuredOutput with your findings (an empty list if there are none) before you stop.

Report only findings with a concrete failing path. Severity: blocking, should_fix or nit. Delete your clone at the end.`, { label: `review2: ${l.key}`, phase: 'Review', schema: REVIEW })))
if (reviews.filter(Boolean).length < 2) return { error: 'a review returned nothing', build, reviews }
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map(f => ({ ...f, lens: lenses[i].key })))
log(`${findings.length} findings`)

phase('Fix')
const fix = await agent(`${CTX}

${RULING}

Second fix round on co-001/pr-05b-plan-type-words in /home/user/pr5b (head efac005; an earlier fix round ran with no findings because both reviews failed to report, and it wrote in the PR body that the round had no findings: correct that row) (draft PR #${build.pr_number || '?'}). Verify each finding yourself and fix every real one at its root; say why for any that is not real.
Findings: ${JSON.stringify(findings, null, 1).slice(0, 20000)}
If a finding is that a word differs from the X12 list, report it as an open item for the founder with the source; do not change the word yourself.
Then run the full local suite once: pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs, pnpm test, pnpm test:golden, a fresh PG 18 migration with pnpm test:db, e2e/packets.spec.ts on port 4902, and npx stryker run stryker.verifier.config.mjs. Commit and push. If anything the PR body states changed, update the body with the GitHub MCP tool update_pull_request.`, { label: 'fix: plan type words', phase: 'Fix', schema: BUILD })

return { build, findings, fix }