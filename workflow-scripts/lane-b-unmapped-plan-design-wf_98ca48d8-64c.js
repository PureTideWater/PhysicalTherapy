export const meta = {
  name: 'lane-b-unmapped-plan-design',
  description: 'Design (author, adversarial review, revision) for audit #32: one unmapped plan no longer freezes a whole month',
  phases: [{ title: 'Author' }, { title: 'Review' }, { title: 'Revise' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/superseded-rerun'
const DESIGN = '/home/user/ops/designs/lane-b-unmapped-plan.md'
const REVIEW = '/home/user/ops/designs/lane-b-unmapped-plan/review.md'
const COMMON = `Context: PaidWhole monorepo. You work for a Lane B session (the co-founder's lane) designing ONE pull request: combined audit item #32, "One unmapped plan freezes a whole month" (read it: /home/user/ops/audits/combined/combined-report.md, section "### 32."; also LANES.md queue item 10 in /home/user/ops/LANES.md). Its branch co-001/unmapped-plan will be cut from claude/build-platform AFTER PR #50 (audit #10, "a superseded re-run cannot be accepted") merges, so design against the code in ${WT} (branch co-001/superseded-rerun at HEAD, which is claude/build-platform 6ddd587 plus #50; #50's design is /home/user/ops/designs/lane-b-superseded-rerun.md — read its rule, since #32 creates re-runs from the mapping screen and must respect #50's not_in_effect / newer_run_pending / acceptance rules). Read only; edit no code; commit and push nothing (the orchestrating session commits /home/user/ops files).
Hard constraints:
- No migration and no change under packages/db/migrations or docs/product/domain-model.md (Lane B never opens a schema PR). If any part truly needs a migration, design the rest without it and record that part for Lane A, with why.
- Engine freeze: no non-test change under packages/pricing. (Check whether the existing 'no mapping' unpriced reason is produced by the engine from its inputs or outside it; docs/product/unpriced-reasons.md is a closed list and must not change.)
- Open PR #42 (mail streams) changes many files; list: /tmp/claude-0/pr42-files.txt. Leave every one alone EXCEPT the shared documents (docs/product/test-matrix.md, docs/product/reconciliation-001.md, packages/synth/src/cases/matrix.ts, registry.ts, and amendments to older ADRs), which this PR may add to. Notably #42 owns apps/worker/src/mail*, platform/mail-events, digest/job, monitoring/queries, help.ts, observability fields.ts, routes/practice.ts and settings.ts. The audit's "notice in the app and by email" must therefore be designed around what can be done now without touching #42's files (find the existing notification path: grep notification, notice, digest, monitor in apps/worker and apps/web; decide what goes in this PR and what follows after #42 merges, as a recorded follow-up or a split).
- Reserved IDs: ADR 0075 (only if needed), test-matrix MAP-06 to MAP-10 and PRC-29 to PRC-31 (IDs pad to two digits), packages/synth cases the same IDs (every new test-matrix row needs matching entries in packages/synth/src/cases/matrix.ts and registry.ts; packages/synth/src/fixtures.test.ts checks them and the committed fixtures/synthetic/<ID>/expected.json). Fixture release numbers and synth MODULE_NUMBERs are allocated only by the orchestrator: if the design needs a new release or module, say so explicitly as a request (next free: release 900008, module 16).
- The milestone 3 check's exception ("an unmapped plan blocks pricing") was granted in the founder's adoption of the combined audit (HANDOFF.md on claude/build-ops, "Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)"): record it in the ADR (if any) and reconciliation-001, and reword MAP-01 and milestone 3's check as the audit says (PRD 17 milestone checks; docs/product/PRD.md and test-matrix MAP-01).
- Founder's standing rule: only the best option, never weighted by build effort; never sacrifice quality. Every choice, cost and security trade-offs included, takes the recommended option (the safer for security) and is recorded with its reasons (the co-founder's ruling of 2026-10-26 ~00:20 UTC); no open questions. Founder-kept matters (domain model, release tags, owner-admin settings, legal text) stay out.
- CLAUDE.md's four rules: code computes every number (cents in notices come from code), money in integer cents, every expected amount traces, PHI tables with RLS; no PHI in notices beyond counts and cents (the audit says counts and cents only), never a name, member ID or claim number in a notice, email, URL or log.
Key code to read: apps/worker/src/price/create.ts, lines.ts (runPlans), execute.ts, coverage.ts, rerun.ts, in-effect.ts, ../monitor/plan.ts (waitingOnMapping), job.ts and chain.ts; packages/contracts (assertPracticePricingAllowed, PricingRefusedError, the mapping guard); the mapping screens and routes (grep payer_plan_mapping and mapping in apps/web/src); Coverage (apps/web coverage page and query); the printed audit report (apps/worker/src/report); the unpriced reasons (docs/product/unpriced-reasons.md and where 'no mapping'/NO_MAPPING-like reasons are set); the database's pricing_run trigger and any MAP-01 enforcement in SQL (grep packages/db/migrations for mapping checks on pricing_run or priced_line: if Postgres itself refuses a run with an unmapped plan, removing that needs a migration — find out precisely); test-matrix MAP-01..MAP-05 and the tests asserting them.`

phase('Author')
const author = await agent(`${COMMON}

Your task: write the design document ${DESIGN} (create its directory if needed). ${SAVE('up-design-author.md', 'what you have read, each decision with its reason, which sections are written')}
Verify every claim against the code with file:line citations. Include:
1. The defect today, precisely: where the refusal happens (service, guard, database), what the monitor does, who is told, which lines go unpriced; a concrete timeline.
2. The design: pricing the month anyway with per-line 'no mapping' (no new unpriced reason; exact mechanism, and whether it touches the engine — it must not); what the run's coverage records; how MAP-01 ("pricing never runs on an unmapped combination") is re-read (each line of an unmapped combination is never priced; the run still prices the rest). Whether Postgres enforces the old rule (if so: can it be lifted without a migration? if not, that part goes to Lane A and the design says what Lane B builds meanwhile).
3. The notice when a load brings lines of an unmapped plan: in the app and by email, counts and cents only, to billing managers; what exists today and what can be built without #42's files; what follows after #42 merges.
4. After mapping: the mapping screen lists the months holding the plan's lines and offers 'price these months again' in that person's name, accepted by hand — consistent with #50's rule (only the run in effect is re-run; not while a newer first run is pending). Exactly which runs are re-run and what the person sees.
5. Coverage and the printed report: 'N plans have no mapping; their lines are not priced' (exact wording; brand and copy rules).
6. Milestone 3 and MAP-01 rewording; the exception recorded (ADR and reconciliation-001).
7. No migration confirmed (or the exact part that needs one, handed to Lane A).
8. Tests: test-matrix rows MAP-06..MAP-10 and PRC-29..PRC-31 as needed (exact wording, in the style of existing rows), the db, route, unit and e2e tests; fixtures if any (and any release or module request to the orchestrator).
9. Visible changes for the before/after screenshots at 1280 and 390 px (mapping, coverage, the notice, the report), and exact wording.
10. Reviews: payment-engine-reviewer, plus the UX and brand review (screens change), plus security-reviewer if a route or notice path changes.
11. Decisions taken with reasons (no open questions), and proposals outside the PR.
12. Check against reconciliation-001's "What must not change, as checks" (docs/product/reconciliation-001.md).
Return a summary: the design in brief, files to change, migration status, visible changes, decisions, proposals.`, { label: 'up-design-author', phase: 'Author' })

phase('Review')
const review = await agent(`${COMMON}

You are the ONE adversarial design reviewer. Read the design ${DESIGN} and attack it against the code in ${WT}. ${SAVE('up-design-review.md', 'each finding as you confirm it, with its evidence')}
Try to break it: a sequence of loads, mappings, corrections, runs, re-runs, releases and acceptances under which a line is priced under no mapping or the wrong one, a mapped line stays unpriced, a month is priced twice or never re-priced after mapping, a notice repeats or never comes, a notice or email leaks PHI or an identifier, a re-run offered on the mapping screen collides with #50's rules, Coverage or the report misstates counts, the engine freeze is broken, a #42 file is touched, or a migration is hidden. Check that the design is the best option, not the cheapest, and that every number comes from code in integer cents.
Write the review to ${REVIEW} (create the directory): numbered findings, each with severity (blocking / should-fix / nit), evidence (file:line), and the fix. Return the findings.`, { label: 'up-design-review', phase: 'Review' })

phase('Revise')
const revised = await agent(`${COMMON}

The design ${DESIGN} has been reviewed; the review is ${REVIEW}. ${SAVE('up-design-revise.md', 'each finding and its disposition as you apply it')}
Apply every finding: change the design for each one you verify, or keep it and record why with evidence. Add a final section "Review and dispositions". Keep it self-consistent. Return: the design in one paragraph, the exact files the builders change, the test rows as written, the visible changes and wording, the ADR decision, the migration status, any request to the orchestrator (release or module numbers), the proposals, and the dispositions.`, { label: 'up-design-revise', phase: 'Revise' })

return { author, review, revised }
