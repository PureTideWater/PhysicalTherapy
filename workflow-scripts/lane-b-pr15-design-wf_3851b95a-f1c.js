export const meta = {
  name: 'lane-b-pr15-design',
  description: 'Lane B PR 15 design (ledger tests LED-12 and LED-13, tests only): author with a failing-or-passing probe, one adversarial reviewer, one revision',
  phases: [
    { title: 'Design', detail: 'the contract and a probe of LED-12 as written' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Revise', detail: 'apply findings, record dispositions' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/pr15-design'
const DESIGN = '/home/user/ops/designs/lane-b-pr15-ledger-tests.md'

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo /home/user/PhysicalTherapy (main checkout of claude/build-platform at 49514e8; CLAUDE.md is in your context). Lane B designs PR 15: ledger tests LED-12 and LED-13 (reconciliation-001 item 15, docs/product/reconciliation-001.md lines 223-227: "LED-12 gets a new synthetic fixture and test. LED-13's registry entry names the existing LED-06 tests. If LED-12 fails as written, work stops and the owner is asked, because the ledger's semantics are frozen. Acceptance: both rows are in test-matrix.md and matrix.ts with assertedBy, and their tests pass."). CO-09's wording, docs/product/change-order-001.md:83: "LED-12 reversal with a provider-level adjustment nets to no cash change. LED-13 a later recoupment is a negative event against net recovery." The ledger rows today: docs/product/test-matrix.md lines 124-134 (LED-01 to LED-11).
- Ledger semantics are frozen (reconciliation-001 lines 434-440: no migration alters ledger_entry, ledger_match, posting_row, eft_row or roi_statement; ledger_entry.stage keeps its seven values; recovered counts only posted or deposited; LED-01 to LED-11 and the ledger oracle pass unchanged; changes under packages/ledger/src are additions only). Combined audit #12 ("the ledger compares payer approvals in allowed amounts and proof in cash", /home/user/ops/audits/combined/combined-report.md lines 299-307) is PR 15b, Lane A's, and may need a migration; keep PR 15 to tests only and say exactly where its boundary with 15b lies.
- Lane rules (/home/user/ops/LANES.md): Lane B never opens a PR with a migration; any design that needs one stops and is handed to Lane A. Lane B's other open work: the CI series (/home/user/ops/designs/lane-b-ci.md); its ci-mutation PR adds survivor-killing tests under packages/ledger/src/**/*.test.ts by new it blocks only, and both PRs add rows to test-matrix.md and packages/synth's registry: plan for rule 6 (the PR merged second resolves, keeping both).
- The founder's standing rule: only the best option, never weighted by build effort, never sacrificing quality.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 at localhost:5433 (postgres:test), DATABASE_URL=postgres://postgres:test@localhost:5433/postgres. Another heavy workflow is running: wrap every heavy command (vitest db runs, pnpm typecheck, pnpm lint, pnpm synth --all) in flock /tmp/laneb-heavy.lock <command>. Never change /home/user/PhysicalTherapy's or /home/user/ops's working trees except the one design file you are told to write; experiments go in your own worktree (git -C /home/user/PhysicalTherapy worktree add --detach ${OUT}/<you>-wt origin/claude/build-platform; pnpm install --frozen-lockfile --prefer-offline; remove it after). No commit, no push, no GitHub post. Synthetic data only (packages/synth; the synth-fixture skill describes how a case's fixture is generated).`

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    design_path: { type: 'string' },
    summary: { type: 'string' },
    led12_probe: { type: 'string', description: 'what the probe of LED-12 as written showed: passes on the frozen ledger, or fails (and how)' },
    stop_and_ask_owner: { type: 'boolean' },
    migration_needed: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    founder_questions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, question: { type: 'string' }, recommended: { type: 'string' }, alternatives: { type: 'string' }, gives_up: { type: 'string' } }, required: ['id', 'question', 'recommended', 'alternatives', 'gives_up'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['design_path', 'summary', 'led12_probe', 'stop_and_ask_owner', 'migration_needed', 'files', 'founder_questions', 'open_items'],
}

phase('Design')
const design = await agent(`${CTX}

You are PR 15's design author. Read: packages/ledger/src (stages, entry types, matching rules, the recovered total, reversals, recoupments), how a provider-level adjustment (835 PLB) reaches the ledger (packages/edi835, apps/worker intake, posting/EFT matching), the existing LED-06 tests and every LED-01 to LED-11 test (find them through packages/synth/src/cases/registry.ts and matrix.ts assertedBy), the ledger oracle (tools/test-oracle), packages/synth's case and fixture machinery, test-matrix.md's ledger rows, and reconciliation-001's ledger checks.

Then probe: in your own worktree, write LED-12 as written (a reversal with a provider-level adjustment nets to no cash change) as a test against the frozen ledger, on a synthetic fixture, and run it. Report exactly what happened. If it fails as written, say why and stop: stop_and_ask_owner = true, with the owner's question in founder_questions (recommended option first, what each gives up); do not design a ledger change.

Write the design contract to ${DESIGN}: scope (tests only), each file with its change, LED-12's fixture (packages/synth case LED-12; how pnpm synth --all generates it; expected.json) and test (where it lives, what it asserts, why it pins the cash invariant without depending on implementation details), LED-13's registry entry naming the LED-06 tests (and whether LED-06's tests really assert "a later recoupment is a negative event against net recovery": verify, and if they do not fully, say what new assertion closes the gap without changing semantics), test-matrix.md and matrix.ts rows with assertedBy, the oracle (does LED-12 need an oracle case?), the checks the builder and a fresh-clone verifier run, the boundary with 15b, the conflict plan with ci-mutation (rule 6), no ADR unless one is needed (say why not), and risks. Branch co-001/pr-15-ledger-tests from the latest claude/build-platform. Write your probe and notes to ${OUT}/author.md. Return the structured summary.`, { label: 'design:author', phase: 'Design', schema: DESIGN_SCHEMA })
if (!design) throw new Error('The PR 15 design author returned nothing.')
if (design.stop_and_ask_owner) {
  log('LED-12 fails as written: stopping for the owner, as reconciliation-001 item 15 requires.')
  return { stopped: true, design }
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, section: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'section', 'issue', 'evidence', 'fix'] } },
    checks_done: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'checks_done'],
}

phase('Review')
const review = await agent(`${CTX}

You are the one adversarial reviewer of PR 15's design, ${DESIGN} (the author's notes: ${OUT}/author.md). Use .claude/agents/payment-engine-reviewer.md's checklist for the ledger. Assume the design is wrong somewhere. Verify yourself: does LED-12's test really pin "nets to no cash change" for a reversal with a provider-level adjustment (would a ledger bug that moved cash make it fail? try one mutation in your own worktree and show the test fails); is the fixture synthetic and generated by pnpm synth; do LED-06's tests really assert LED-13; is anything a change to ledger semantics, a migration, or a change to LED-01..11 or the oracle's expectations; is the 15b boundary right; are the assertedBy entries and matrix rows exact; the rule-6 plan with ci-mutation. Write ${OUT}/review.md; return the structured result.`, { label: 'review:design', phase: 'Review', schema: REVIEW_SCHEMA })
if (!review) throw new Error('The PR 15 design reviewer returned nothing; refusing to go on unreviewed.')

phase('Revise')
const final = await agent(`${CTX}

You revise PR 15's design, ${DESIGN}, after its review (${OUT}/review.md). Findings:
${JSON.stringify(review.findings, null, 1)}
Verify each; fix the design, or reject a finding only with evidence. Add a section "Review (2026-10-25)" listing every finding id, severity and disposition. Edit only ${DESIGN}. Return the structured summary.`, { label: 'design:revise', phase: 'Revise', schema: { ...DESIGN_SCHEMA, properties: { ...DESIGN_SCHEMA.properties, dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, disposition: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'disposition', 'note'] } } }, required: [...DESIGN_SCHEMA.required, 'dispositions'] } })
if (!final) throw new Error('The PR 15 reviser returned nothing.')
return { stopped: false, review: { verdict: review.verdict, findings: review.findings.length }, final }
