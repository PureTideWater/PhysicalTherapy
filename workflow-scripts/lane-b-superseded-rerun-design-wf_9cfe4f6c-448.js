export const meta = {
  name: 'lane-b-superseded-rerun-design',
  description: 'Design (author, adversarial review, revision) for audit #10: a superseded re-run cannot be accepted',
  phases: [{ title: 'Author' }, { title: 'Review' }, { title: 'Revise' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/superseded-rerun'
const DESIGN = '/home/user/ops/designs/lane-b-superseded-rerun.md'
const REVIEW = '/home/user/ops/designs/lane-b-superseded-rerun/review.md'
const COMMON = `Context: PaidWhole monorepo. You work for a Lane B session (the co-founder's lane) building ONE pull request: combined audit item #10, "Accepting an older re-run can drop newer lines from a month" (read it: /home/user/ops/audits/combined/combined-report.md, section "### 10."). Code checkout (branch co-001/superseded-rerun, cut from claude/build-platform at 6ddd587): ${WT}. Read only there for code; do not edit code in this stage. Do not commit or push anything (the orchestrating session commits /home/user/ops files).
Hard constraints:
- No migration and no change under packages/db/migrations (Lane B never opens a schema PR). The optional mirror of the check in the pricing_run trigger is a migration and is NOT taken; it is recorded as a proposal for Lane A if judged worth it.
- Engine freeze: no non-test change under packages/pricing.
- Do not touch any file of open PR #42 (list: /tmp/claude-0/pr42-files.txt). apps/worker/src/price/*, apps/web/src/lib/routes/pricing.ts, apps/web/src/lib/pricing/*, and apps/web/src/app/p/[practiceId]/pricing-runs/** are free.
- Reserved IDs: ADR 0069 (only if the design needs one), test-matrix rows PRC-25 to PRC-28 (docs/product/test-matrix.md), packages/synth cases PRC-25 to PRC-28 only if fixtures are needed.
- Founder's standing rule: only the best option, never weighted by build effort; never sacrifice quality. Improve as you go: an improvement inside the PR's files goes in; one outside is a proposal.
- Wording a person sees: take the recommended option (the co-founder's ruling), within .claude/rules/brand.md and docs/brand/BRAND.md; the PR description reports it.
- Cost or security trade-offs: flag them as questions for the co-founder, with a recommendation.
Key code: apps/worker/src/price/rerun.ts (createRerun, acceptRun), in-effect.ts (ELIGIBLE_RUN, RUN_IN_EFFECT, PRICED_IN_EFFECT), create.ts (recordRun; a re-run copies its original's cut-off lines_loaded_by), execute.ts (per-practice advisory lock pg_advisory_xact_lock(hashtextextended('pricing_run:'||practice)), completion sets completed_at = now()), diff.ts, impact.ts, ../monitor/plan.ts (the monitor covers a month if any queued/running/complete run's period holds the month with cut-off >= newest line load: it does NOT look at which run is in effect), apps/web/src/lib/routes/pricing.ts (acceptPricingRunAction, comparePricingRunsPage canAccept, refusal()), apps/web/src/lib/pricing/queries.ts, the pages apps/web/src/app/p/[practiceId]/pricing-runs/{[runId],compare}/page.tsx, tests apps/worker/src/price/rerun.db.test.ts and apps/web/src/lib/routes/reruns-routes.db.test.ts, docs/adr/0037*, the pricing_run trigger in packages/db/migrations (grep accepted_at; it requires accepted_at = now() and completed_at = now(), i.e. transaction start time, and pricing_run_in_effect() in SQL).`

const ANALYSIS = `The orchestrator's own first analysis, to test rather than trust:
1. The audit's rule "refuse when the re-run's original is no longer the run in effect" handles the two named sequences (a late line priced by a monitor run, then acceptance; two re-runs accepted out of order).
2. Gaps to settle:
 a. Overlapping periods. RUN_IN_EFFECT is per exact (period_from, period_to); PRICED_IN_EFFECT picks, per service line, the in-effect run that took effect last across ALL periods. A person may price a multi-month period while the monitor prices single months. If run X of an overlapping but different period took effect after the original, accepting the re-run makes the overlapping lines read the re-run's older-cut-off pricing over X's newer pricing (a regression, possibly to an older release), although X stays in effect for its own lines. Decide whether 'superseded' should be: some eligible run of the practice whose period overlaps the re-run's period, other than the original, took effect after the original ((IN_EFFECT_SINCE, id) ordering as in in-effect.ts). For the same exact period this is exactly "the original is not in effect".
 b. A re-run of an unaccepted re-run (createRerun allows re-running any complete run). Its original was never in effect, yet its cut-off is the chain's eligible ancestor's. Decide whether to walk rerun_of_id to the eligible ancestor (first run or accepted re-run) and test that, or refuse; and whether createRerun should refuse to price again a run that is already superseded (so nobody creates a re-run that can never be accepted), and what the run page then offers (re-run the run in effect instead).
 c. Concurrency. acceptRun locks only the re-run's row. Two re-runs of one original accepted concurrently both pass the check. A run completing concurrently: completed_at and accepted_at are both now() (transaction start) and the trigger enforces it, so ordering by timestamp can disagree with commit order. Consider acceptance taking the same per-practice advisory lock execute.ts takes (pricing_run:<practice>) before its check, then checking with a fresh READ COMMITTED snapshot; analyse what race remains (an execution transaction that began before the acceptance committed but completes after, so its completed_at is earlier than accepted_at) and whether it can be closed in the service without a migration (for example refusing acceptance while an overlapping run of the practice is queued or running with a later cut-off, or the price job re-checking), or must be recorded for Lane A's trigger mirror. Read execute.ts to see exactly when its transaction starts relative to the lock and the completion update, and whether status 'running' is committed separately.
 d. The refusal reason 'superseded' added to RerunRefusedError; the message on the compare page / run page; canAccept false with an explanation ("a newer run of this month is in effect; re-run that one", the audit's words, refined for periods that are not one month), and a link to the run in effect. Also the run list/run page showing a re-run that can no longer be accepted.
 e. Whether the monitor should also plan lines that have no pricing in effect (defence in depth for lines already lost in existing data?) — probably out of scope; say so with reasons.
 f. Existing data: re-runs accepted out of order before this fix already left lines without pricing in effect; whether a repair or a detection is needed (proposal only, no migration).`

phase('Author')
const author = await agent(`${COMMON}

${ANALYSIS}

Your task: write the design document ${DESIGN} (create the directory if needed). ${SAVE('design-author.md', 'what you have read, each decision reached with its reason, and which sections of the design are written')}

Read all the key code first, and verify every claim you make against it with file:line citations. The design must contain:
1. The defect, restated precisely with both sequences and any further sequence you find (overlapping periods, chained re-runs, races), each with a concrete timeline.
2. The rule: the exact definition of 'superseded', as SQL against the existing in-effect fragments, chosen as the best option, with the alternatives considered and why rejected.
3. Where it lives: the service (acceptRun, and createRerun if you decide so), the lock, the route mapping and the page changes (canAccept, the explanation and wording, a link to the run in effect). Exact files and functions.
4. Concurrency: the lock and what it closes; what remains and why it is acceptable or what proposal goes to Lane A.
5. "No migration" confirmed, with reasons; the optional trigger mirror evaluated and a recommendation to Lane A (take it or not, and why).
6. Tests: test-matrix rows PRC-25 to PRC-28 (exact wording of each row, in the style of existing PRC rows in docs/product/test-matrix.md), the DB tests in apps/worker/src/price/rerun.db.test.ts and the route tests in reruns-routes.db.test.ts, a property or concurrency test if worthwhile, and e2e if a screen changes. Whether synth fixtures are needed (likely not).
7. Docs to update: ADR 0037 amendment vs a new ADR 0069 (recommend one), docs/product text that describes acceptance (grep for it), reconciliation-001 if it lists the item, help text in apps/web/src/components/help.ts (a #42 file: DO NOT change it; if help text needs a change, record a proposal).
8. Visible changes: what a person sees before and after (for the screenshot step), and the wording.
9. Reviews needed: payment-engine-reviewer (.claude/agents/payment-engine-reviewer.md) and security-reviewer (.claude/agents/security-reviewer.md), plus the UX and brand review (/home/user/ops/designs/lane-b-ux-review-brief.md) if a screen changes.
10. Questions for the co-founder (cost or security trade-offs only), each with a recommendation; and proposals outside the PR (for Lane A or later Lane B items).
11. Check against reconciliation-001's "What must not change, as checks" (docs/product/reconciliation-001.md in ${WT}).
Write plainly and concretely. Return a summary: the rule chosen, files to change, whether a migration is needed (must be no, or say why yes), visible changes, questions.`, { label: 'design-author', phase: 'Author' })

phase('Review')
const review = await agent(`${COMMON}

You are the ONE adversarial design reviewer. Read the design ${DESIGN} and attack it against the code in ${WT}. ${SAVE('design-review.md', 'each finding as you confirm it, with its evidence')}
Try hard to break it: a sequence of runs, acceptances, monitor runs, releases, withdrawals, overlapping periods, chained re-runs, failed runs, or concurrent transactions under which a line still loses its pricing in effect, a month regresses to an older release, a valid acceptance is wrongly refused, or the refusal leaks a value or the wrong thing to a person. Check the SQL precisely against in-effect.ts and the database's pricing_run_in_effect() and trigger. Check the lock order cannot deadlock against execute.ts, the monitor chain and other users of pricing_run locks (grep FOR UPDATE and advisory locks touching pricing_run across apps/ and packages/db). Check it needs no migration, touches no #42 file and nothing under packages/pricing; check the test rows are precise and testable; check the wording against .claude/rules/brand.md and that no identifier or PHI appears in a message, URL or log; check the role and audit behaviour (acceptance stays mapping.edit, audited as pricing_run_accepted; is a refused acceptance audited or not, as other refusals are?). Check that the design is the best option, not the cheapest.
Write the review to ${REVIEW} (create the directory): numbered findings, each with severity (blocking / should-fix / nit), evidence (file:line), and the fix you recommend. Return the same findings as your result.`, { label: 'design-review', phase: 'Review' })

phase('Revise')
const revised = await agent(`${COMMON}

The design ${DESIGN} has been reviewed; the review is ${REVIEW}. ${SAVE('design-revise.md', 'each finding and its disposition as you apply it')}
Apply every finding: change the design for each one you verify against the code, or, where you disagree, keep the design and record why with evidence. Add a section "Review and dispositions" at the end listing each finding, its disposition and reason. Keep the design self-consistent after the changes (rule, tests, wording, docs). Return: the final rule in one paragraph, the files the builders change (exact), the test rows PRC-25 to PRC-28 as written, the visible changes and wording, the ADR decision, the questions for the co-founder (if any), the proposals for Lane A, and a list of the dispositions.`, { label: 'design-revise', phase: 'Revise' })

return { author, review, revised }
