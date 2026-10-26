export const meta = {
  name: 'lane-b-pr15b-design',
  description: 'Lane B PR 15b design (ledger amounts in payment terms, audit #12): four scouts, an author with probes, one adversarial reviewer, one revision',
  phases: [
    { title: 'Scout', detail: 'four parallel maps of the code the change touches' },
    { title: 'Design', detail: 'the contract, with probes in a scratch worktree' },
    { title: 'Review', detail: 'one adversarial reviewer (payment-engine checklist)' },
    { title: 'Revise', detail: 'apply findings, record dispositions' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad'
const OUT = SP + '/pr15b-design'
const DESIGN = '/home/user/ops/designs/lane-b-pr15b.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo /home/user/PhysicalTherapy (main checkout of claude/build-platform at 6ddd587; CLAUDE.md is in your context). Lane B designs PR 15b: "ledger amounts in payment terms", combined audit item #12. Read its entry: /home/user/ops/audits/combined/combined-report.md lines 299-307 (the "Best option" is the ruled design). Also read: docs/product/reconciliation-001.md "What must not change, as checks" (from line 440) and its item 15 (PR 15) text; docs/product/PRD.md section 13 (the ledger: Entries, Matching, Recoupments and reversals, ROI statement) and section 12 (headline); docs/product/test-matrix.md LED rows (LED-01..LED-13, around line 124-138); /home/user/ops/approval-summaries/lane-b-pr15-design-review.md "N-5" and /home/user/ops/approval-summaries/lane-b-pr15-build-summary.md lines 140-150.
- THE RULINGS ARE MADE. On 2026-10-20 ~15:10 UTC the founder (Tyler Williams) adopted the combined audit whole (HANDOFF.md on claude/build-ops, /home/user/ops/HANDOFF.md, "Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)"): the 19 freeze exceptions are granted, #12's ledger exception among them, and the ruling changes the report lists are accepted, PRD 13's two definitions of "approved" among them. #12's best option: keep deciding the outcome on the allowed amount (approved, confirmed, decreased, no change), but measure every ledger amount in what the payer actually pays: 'approved' is the payer's payment increase on the line; a posting share is net of the reversal it replaced; a reversal takes back what was paid. A correction a deductible absorbed is recorded with no entry and the case closes as 'payer corrected; balance is the patient's', never as recovered and never as no change. The allowed increase and the patient's share are shown beside it as 'billable to the patient', never counted. The definition of recovered, the proof cap and the seven entry types do not change. New ledger fixtures cover coinsurance, a deductible and a copay. Only a DEPARTURE from this best option goes to the co-founder; anything inside it that is engineering-only is pre-approved; wording a person sees takes the recommended option (report it).
- From PR 15's review, N-5: a line holding two approvals, of which a reversal takes back only its own claim's approval (mutant m7 survives today; remittances.ts recoupReversals). LED-12's last clause is pinned only on lines with one approval; 15b pins a line with two.
- UNCHANGED BY RULE: LED-06's "not resolved" check (apps/worker/src/reconcile/ledger.db.test.ts:221) stays; LED-01 to LED-11 must not change (their tests and expected amounts), and LED-12/LED-13's expected amounts too (a change to any goes to the co-founder) — verify they are share-free (paid == allowed) so payment terms equal allowed terms there; the ledger oracle (tools/test-oracle or wherever the ledger oracle lives) passes unchanged; the ledger takes additions only beyond the granted exception (the exception covers the amounts matching writes, what a reversal takes back, the posting share, and the deductible-absorbed outcome; LEDGER_STAGES, the seven entry types, the recovered definition and the proof cap stay); the engine freeze: no non-test change under packages/pricing; a new ledger or pricing source file needs its shard in stryker/shards.json; the mutation gate stays above 85% with no unexplained survivor (tools/stryker; equivalents recorded in tools/stryker/equivalent/*.json need a reviewer who is not the proposer).
- NO MIGRATION: Lane B never opens a migration PR. The audit says "Database: no new columns; the figures come from stored line data." Confirm it at design against every CHECK constraint, enum and trigger the change would write through (ledger_entry, ledger_match outcome values, case state / close reason, payer_response kinds, submission records, roi_statement). If the deductible-absorbed close or anything else needs a new stored value a CHECK does not allow, or a new column, that is a migration: say so exactly (migration_needed=true), with the narrowest no-migration alternative inside the ruling if one exists, and whether it departs from the best option.
- Shared documents: #42 (Lane A, open) also changes docs/product/reconciliation-001.md, docs/product/test-matrix.md and packages/synth/src/cases/registry.ts; LANES.md rule 6 lets both lanes change those (the PR merged second keeps both). Touch no other file #42 changes (list: /tmp/claude-0/pr42-files.txt).
- Reserved for 15b: ADR 0067 (records the ruling and the design); test-matrix rows LED-14 to LED-18; packages/synth cases LED-14 to LED-18. Fit the new tests into those five IDs (coinsurance, deductible, copay, two approvals with a reversal (N-5), and whatever else the design needs — choose the best split).
- Reviews later: payment-engine (.claude/agents/payment-engine-reviewer.md) and a UX and brand review of the changed screens (.claude/rules/brand.md, docs/brand/BRAND.md, CO-11 in docs/product/change-order-001.md, /home/user/ops/designs/lane-b-ux-review-brief.md) with before/after screenshots at 1280 and 390 px through /home/user/ops/tools/lane-b-screen-tour.
- Improve as you go (the co-founder's standing direction): an improvement inside the PR's files goes in the design; one outside goes in the design's "Proposals outside this PR".
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 at localhost:5433 (postgres:test). Wrap every heavy command (vitest runs with a database, pnpm typecheck, pnpm lint, pnpm synth, stryker) in flock /tmp/laneb-heavy.lock <command>. Never change /home/user/PhysicalTherapy's or /home/user/ops's working trees except the one file you are told to write; experiments go in your own worktree (git -C /home/user/PhysicalTherapy worktree add --detach ${OUT}/<you>-wt origin/claude/build-platform; then pnpm install --frozen-lockfile --prefer-offline there; remove the worktree with git worktree remove --force after). No commit, no push, no GitHub post. Synthetic data only. No model name or identifier in anything you write for the repository.`

const MAP = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    notes_path: { type: 'string' },
    summary: { type: 'string', description: 'the facts the author needs, with file:line for each' },
    change_points: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, today: { type: 'string' }, under_12: { type: 'string' } }, required: ['where', 'today', 'under_12'] } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'notes_path', 'summary', 'change_points', 'risks'],
}

const SCOUTS = [
  { key: 'remittances', brief: `The remittance side of the ledger: apps/worker/src/reconcile/{remittances,ledger,responses,manual,unmatched,stages,shortfalls}.ts and packages/ledger/src/{matching,totals,stages,allocation,pairing}.ts. For each place an amount is written (approved, confirmed, decreased, no_change, recouped from a reversal, recouped from PLB WO, interest weights), say what it measures today (allowed or paid) and what #12 makes it (the payer's payment). How are payer responses that accept an amount recorded (responses.ts, manual.ts, packets/submissions), in what terms, and what the 'confirmed' path and unpaidApproval/remittanceBaseline mean once approvals are in paid terms. What stored data exists per service_line (observed_allowed_cents, paid_cents, patient responsibility / CAS PR group amounts, deductible/coinsurance/copay CARC 1/2/3) — read the parser (packages/edi835) and the service_line/cas tables in packages/db migrations so the design knows what figures can come from stored line data. The deductible-absorbed case: what outcome and what case close exist today (case states, close reasons, CHECK constraints in migrations) — can 'payer corrected; balance is the patient's' be recorded with no migration? N-5: recoupReversals takes min(approvedByMatch(match) ?? confirmedBy, remaining) — check whether m7 (taking the line's whole remaining) is really distinguishable and how a two-approval fixture pins it.` },
  { key: 'cash', brief: `The cash side: apps/worker/src/reconcile/{postings,exports,pass,job}.ts, packages/ledger/src/{matching,allocation,templates}.ts. How posting rows (check-level and line-level) and EFT deposits become posted/deposited entries, what a 'share' of a line is (paid of the paired line? of the claim?), how the proof cap works (posted/deposited never above approved?), and where "a line-level posting proves the gross payment rather than the payment net of the reversal it replaced" happens exactly. What #12 changes: the share net of the reversal it replaced. Show a worked example with coinsurance (allowed 100 -> 130, coinsurance 20%: paid 80 -> 104; reversal of -80 and new claim 104: approved should be 24; posting of 104 line-level should prove 24 not 104). Also the ledger oracle (find it: tools/test-oracle or similar, the ledger-oracle.db.test.ts) and what it computes — will it still agree?` },
  { key: 'screens', brief: `Every screen, report, email, packet and digest that shows a ledger figure or an approved/recovered amount: apps/web/src/lib/{dashboard,reconciliation}/queries.ts, apps/web/src/lib/routes/{roi,reconciliation}.ts, apps/web/src/components/reconciliation/display.tsx, components/brand/Verified.tsx, apps/web/src/app/**/(cases|roi|reconciliation|dashboard)/** pages, apps/worker/src/report/*, apps/worker/src/digest/figures.ts, apps/worker/src/reconcile/{print,statements,statement-html}.ts, apps/worker/src/packets/html.ts. List the routes (URL patterns and page.tsx) whose figures change under #12 and where 'billable to the patient' (the allowed increase and the patient's share, never counted) and the close 'payer corrected; balance is the patient's' would show; what wording rules apply (.claude/rules/brand.md, docs/brand/BRAND.md, CO-11 in docs/product/change-order-001.md, docs/product/PRD.md section 12 headline rules, apps/web lint:copy rules). Check /home/user/ops/tools/lane-b-screen-tour (README, capture/tour.spec.ts, screens.config.ts) for which of those routes the tour already captures and what a before/after capture needs (populate specs). Note which of these files #42 changes (/tmp/claude-0/pr42-files.txt) — those are off limits.` },
  { key: 'tests', brief: `The test and fixture machinery: packages/synth (cases registry, matrix.ts with assertedBy, how a case's fixtures are generated by pnpm synth, the LED-12 case added by PR 15 and its expected.json, the synth-fixture skill .claude/skills/synth-fixture), fixtures/synthetic layout, apps/worker/src/reconcile/*.db.test.ts (ledger.db.test.ts LED-01..LED-13 tests, chain.db.test.ts, ledger-oracle.db.test.ts, lines.db.test.ts), packages/ledger/src/*.test.ts, property tests, stryker/shards.json and tools/stryker (the gate, equivalents files, which shard covers apps/worker reconcile vs packages/ledger), tools/engine-freeze, the cross-tenant and catalog tests. Verify which existing LED tests have share-free lines (paid == allowed, no patient responsibility) and which would change under #12 (any with a patient share?). Say how to add LED-14..LED-18 rows (test-matrix.md, matrix.ts, registry.ts) and their fixtures, and the commands a builder and verifier run (pnpm test, test:db shards, test:golden, oracle, mutation shards + gate) with flock.` },
]

phase('Scout')
const maps = await parallel(SCOUTS.map(s => () => agent(`${CTX}

You are a scout for PR 15b's design: area "${s.key}". ${SAVE('scout-' + s.key + '.md', 'your findings as you make them')}
${s.brief}
Read the code itself; cite file:line for every claim. Write your full notes to ${OUT}/scout-${s.key}.md (that is the only file you write). Return the structured summary.`, { label: 'scout:' + s.key, phase: 'Scout', schema: MAP })))
const got = maps.filter(Boolean)
log(`${got.length}/4 scouts returned`)

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    design_path: { type: 'string' },
    summary: { type: 'string' },
    migration_needed: { type: 'boolean' },
    migration_reason: { type: 'string' },
    departs_from_best_option: { type: 'boolean' },
    cofounder_questions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, question: { type: 'string' }, recommended: { type: 'string' }, alternatives: { type: 'string' }, gives_up: { type: 'string' }, kind: { type: 'string', description: 'departure | cost | security' } }, required: ['id', 'question', 'recommended', 'alternatives', 'gives_up', 'kind'] } },
    wording_choices: { type: 'array', items: { type: 'string' } },
    files: { type: 'array', items: { type: 'string' } },
    screens: { type: 'array', items: { type: 'string' }, description: 'routes whose figures or words change, for the before/after tour' },
    probes: { type: 'array', items: { type: 'string' } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['design_path', 'summary', 'migration_needed', 'migration_reason', 'departs_from_best_option', 'cofounder_questions', 'wording_choices', 'files', 'screens', 'probes', 'open_items'],
}

phase('Design')
const design = await agent(`${CTX}

You are PR 15b's design author. ${SAVE('design-author.md', 'what you have read, decided and probed, and which sections of the design are written')}
The scouts' notes are in ${OUT}/scout-{remittances,cash,screens,tests}.md; their summaries:
${JSON.stringify(got, null, 1)}

Verify what you rely on in the code yourself. Then probe in your own worktree (${OUT}/author-wt): at least (1) a coinsurance reprocessing through today's ledger, showing the defect (approved in allowed terms, recovered never reached, 'approved but not posted' stuck), and (2) the N-5 two-approval line with m7 applied, showing no test fails today. Record exact commands and outputs in ${OUT}/author.md.

Write the design contract to ${DESIGN}. Sections:
0. Summary and the ruling it records (who, when, the words), and that it needs no migration (with the CHECK/enum evidence) — or, if it does, stop: write why, the narrowest alternative, and return migration_needed=true.
1. Semantics: for each ledger amount (approved by reprocessing, confirmed, decreased/recouped by reprocessing, recouped by reversal, recouped by PLB WO, interest weights, posted share line-level and check-level, deposited share, payer-response acceptances), its definition today and under #12, as a formula over stored line data (paid, allowed, patient share by group/CARC), with integer-cent rounding stated (once per line, unrounded kept where any division happens). The outcome still decided on allowed. The deductible-absorbed correction (and a partly-absorbed one), copay, coinsurance, a denied-then-paid line, a reversal with no correction, a line with two approvals (N-5), interest, PLB WO capacity, the proof cap, payer responses that accepted an allowed amount before any remittance pays it (how the acceptance is converted — or kept as the payer's figure — and the 'confirmed' shortfall), ROI 'approved but not posted', payerApproved and lineLedgerStage. Show that every LED-01..LED-13 expected amount is unchanged (share-free lines) and that the oracle agrees (or what additions it needs, never changed expectations).
2. 'Billable to the patient': what figures (the allowed increase, the patient's share change), computed where, shown where, never counted in any total; the case close 'payer corrected; balance is the patient's' and how it is recorded with no migration.
3. PRD 13's two definitions of 'approved': the text that settles them (PRD 13 edit), ADR 0067 (title in the repo's ADR style: a sentence of what is decided, filename slug), reconciliation-001 record (where, exact words), test-matrix LED-14..LED-18 rows (exact words), synth cases LED-14..LED-18 (fixture design: synthetic 835s with CAS PR-1/PR-2/PR-3, which lines, amounts, expected.json), the tests (file, name, assertions, why each assertion pins the rule and which mutant it kills).
4. Files: every file and its change (source, tests, docs, fixtures, stryker/shards.json if a new source file), marked addition or exception-change; the additions-only check for packages/ledger/src stated as what changes and why the exception covers it. No file #42 changes beyond the three shared documents.
5. Screens: the routes whose figures or words change, for the before/after tour (URL patterns and the populate specs that reach them), the words chosen (recommended) and the brand/CO-11 rules they meet; an e2e or unit test for each visible change.
6. Checks: the builder's and the verifier's commands (unit, golden, oracle, test:db shards, build+e2e, mutation shards the change affects + the gate, engine-freeze, lint, lint:copy, lint:logs, typecheck), expected test-count changes, and the mutation plan (which new mutants, which tests kill them).
7. Risks, and "Proposals outside this PR".
8. Build plan: how to split the work among 2-4 builders in one worktree (/home/user/pr15b, branch co-001/pr-15b-ledger-payment-terms cut from the latest claude/build-platform) without conflicts, in order.
Return the structured summary.`, { label: 'design:author', phase: 'Design', schema: DESIGN_SCHEMA })
if (!design) throw new Error('The PR 15b design author returned nothing.')
// RESUMED 2026-10-26 ~01:05 UTC: the author found a migration needed only for the stored case close. Q1 and Q2 took
// their recommended answers under the co-founder's standing ruling of ~00:20 UTC (design section 0.5): 15b ships the
// no-migration part and the stored close is handed to Lane A. So the design goes on to review. Lock rule as before:
// every heavy command under flock /tmp/laneb-heavy.lock.
const RULED = `The design's section 0.5 records the rulings taken on Q1 and Q2 (2026-10-26 ~01:05 UTC, under the co-founder's standing ruling of ~00:20 UTC, "Don't ask for approvals anymore just build and optimize"): Q1 yes (the outcome is recorded with no entry and the words are shown from stored rows; the stored case close is handed to Lane A); Q2 the recommended rule. Review the design as ruled. A finding that a ruled answer is wrong is still welcome, with evidence. Make sure no section still reads as waiting on a question. The design must need NO migration for anything 15b builds.`

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

You are the one adversarial reviewer of PR 15b's design, ${DESIGN} (the author's notes and probes: ${OUT}/author.md; scouts: ${OUT}/scout-*.md). ${RULED} ${SAVE('design-review.md', 'each check done and each finding, as you go')}
Use .claude/agents/payment-engine-reviewer.md's checklist for the ledger (arithmetic, rounding, signs, caps, windows, trace). Assume the design is wrong somewhere. Verify yourself, in the code and by probe in your own worktree (${OUT}/review-wt): every formula on worked examples (coinsurance 20%, a deductible absorbing all and part, a copay, a denied-then-paid line, a reversal with no correction, two approvals with one reversed, PLB WO across lines, interest split, check-level partial postings, a later recoupment after the proof) — does recovered ever count the patient's share or money the payer never paid, can a line be stuck 'approved but not posted', can any total go negative or exceed the proof cap; does any LED-01..LED-13 or oracle expectation change; is the 'no migration' claim true against every CHECK constraint the writes pass through; is anything a departure from #12's best option (that would need the co-founder); are the ledger changes inside the granted exception and everything else additions only; the engine freeze; stryker shards; do the planned tests really kill the mutants named (try at least two mutations); the 'billable to the patient' figure never counted anywhere (grep every total); the words against brand.md/CO-11; the screens list complete; the files list avoids #42's files beyond the three shared documents. Write ${OUT}/review.md; return the structured result.`, { label: 'review:design', phase: 'Review', schema: REVIEW_SCHEMA })
if (!review) throw new Error('The PR 15b design reviewer returned nothing; refusing to go on unreviewed.')

phase('Revise')
const final = await agent(`${CTX}

You revise PR 15b's design, ${DESIGN}, after its review (${OUT}/review.md). ${RULED} Set migration_needed=false in your result if nothing 15b builds needs one (the handed-over close is Lane A's), and departs_from_best_option to whether 15b's ruled end state departs. ${SAVE('design-revise.md', 'each finding and its disposition as you apply it')}
Findings:
${JSON.stringify(review.findings, null, 1)}
Verify each against the code; fix the design, or reject a finding only with evidence. Add a section "Design review (2026-10-26)" listing every finding id, severity and disposition. Edit only ${DESIGN}. Return the structured summary.`, { label: 'design:revise', phase: 'Revise', schema: { ...DESIGN_SCHEMA, properties: { ...DESIGN_SCHEMA.properties, dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, disposition: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'disposition', 'note'] } } }, required: [...DESIGN_SCHEMA.required, 'dispositions'] } })
if (!final) throw new Error('The PR 15b reviser returned nothing.')
return { stopped: false, review: { verdict: review.verdict, findings: review.findings.length }, final }
