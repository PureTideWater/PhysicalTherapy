export const meta = {
  name: 'lane-b-unmapped-plan-design-reread',
  description: 'Design re-read of #32 (unmapped plan) against base 83d71fd6: re-read and update, adversarial review, verify findings, revise to revision 3, completeness critic',
  phases: [{ title: 'Reread' }, { title: 'Review' }, { title: 'Verify' }, { title: 'Revise' }, { title: 'Critic' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/aa4b05fd-cf7b-57fe-8086-b5b14b24e00e/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/unmapped-plan'
const DESIGN = '/home/user/ops/designs/lane-b-unmapped-plan.md'
const REVIEW = '/home/user/ops/designs/lane-b-unmapped-plan/review-r3.md'
const COMMON = `Context: PaidWhole monorepo. You work for a Lane B item session designing ONE pull request: combined audit item #32, "One unmapped plan no longer freezes a whole month" (audit: /home/user/ops/audits/combined/combined-report.md section "### 32."; LANES.md queue item 10 at /home/user/ops/LANES.md:120). The design ${DESIGN} is revision 2 (commit ca0f6438), written and reviewed against ed85bcf3 (2026-10-26). The base is now claude/build-platform 83d71fd6 (#78), 307 commits later; the worktree ${WT} (branch co-001/unmapped-plan) is exactly 83d71fd6. Its first review is /home/user/ops/designs/lane-b-unmapped-plan/review.md, dispositioned in the design's §14. Read only in ${WT}; edit no code; commit and push nothing (the orchestrating session commits /home/user/ops files). Only edit the files your task names.
What merged since the design was read (re-read each where the design touches it):
- #50 final (9d3ab335): createRerun (apps/worker/src/price/rerun.ts:220) and RERUN_ACCEPTANCE (price/in-effect.ts:135), unchanged since ed85bcf3.
- #52 (ADR 0072): lib/pricing/queries.ts (runNames now ~:344), pricing-routes.db.test.ts, pricing.spec.ts.
- #56: 2-line change to the home page.tsx. #51: report/content.ts, html.ts, home page.
- #49 (ADR 0071): months waiting on Medicare content: contentFailure, coversMore, waitingOnContent beside waitingOnMapping in monitor/plan.ts:291-306; releaseContentSpans/releaseContentWindows in execute.ts; WAITING_ON_CONTENT log code in monitor/job.ts:72. Keep the location waits and #49's content waits when the mapping guard goes.
- #74 (ADR 0077): ActionForm, Field, form-issues — use them for both new forms and the Pricing runs field error.
- #79 (ADR 0078): ScrollTable and StackedRows (app/tables.test.ts) — use them for the new components/mapping/months.tsx.
- #78 (ADR 0079): download refusals on Coverage and reports — respect the refusal routes.
- #81 (ADR 0083): batched audit-report reads — respect them.
- #48, #53, #76, #77, #80 touched only rows files and PRD.
Known stale references: HANDOFF.md:336-339 is now :471-473 (on /home/user/ops); LANES.md:118 is now :120; "export uncoveredMonths as it is" needs no change (exported at :117); packages/db/src/schema/pricing.ts:61 has a comment naming tp-pricing-coverage/1 that §13 does not list (comment only; but schema/* is a #42 file: leave it alone and record that). /tmp/claude-0/pr42-files.txt is gone; #42's file list at be63bdc2 is ${SP}/pr42-files.txt. "Not while #42 is open" (LANES.md:84-92): leave every #42 file alone except shared documents (test-matrix.md, reconciliation-001.md, ADR amendments, synth matrix.ts and registry.ts). Overlaps to recheck: #42 (origin/co-001/pr-06b-mail-streams, be63bdc2), SS-01 (origin/co-001/ss-01-suspension-refusal, f897a282: home page.tsx suspension->hold, lib/billing/runs.ts practice_run_refusal_for and CONTINUES_STARTED_WORK, route-tests/define.ts expectQueuedWorkGated: a route that queues a person-started job (price, triage, intake) must be in RUN_STARTING_ROUTES or CONTINUES_STARTED_WORK; monitor and reconcile are PRACTICE_OWN_JOBS), and UX PR 9 (designs/lane-b-ux-home-figures.md on /home/user/ops: D10 changes lib/dashboard/queries.ts and the home page). Use git -C ${WT} diff/show against those origin refs; read-only.
Hard constraints: no migration (Lane B never opens a schema PR; if any part needs one, design the rest and record that part "for Lane A"); engine freeze (no non-test change under packages/pricing); docs/product/unpriced-reasons.md is a closed list, unchanged; reserved IDs ADR 0075, MAP-06 to MAP-09 and PRC-29 to PRC-31 (MAP-10 stays reserved for the notice follow-up, Lane A's migration); synth: no new module (MAP=2) and no new fixture release (900001); CLAUDE.md's four rules (code computes every number, integer cents, traces, RLS; counts and cents only in notices; no PHI or identifier in URL, log, job payload or email); founder-kept matters (domain model, release tags, owner-admin settings, legal text) stay out. Every choice takes the recommended option (the safer one for security), recorded with its reasons; no open questions (the co-founder's ruling 2026-10-26 ~00:20 UTC). Founder's standing rule: only the best option, never weighted by build effort. Brand and copy: .claude/rules/brand.md and CO-11. Improve as you go: an improvement inside the PR's files goes in the design; one outside goes in "Proposals outside this PR". No model name or identifier in any file you write.`

const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' },
  evidence: { type: 'string', description: 'file:line citations against 83d71fd6 and the design section' }, fix: { type: 'string' } },
  required: ['id', 'severity', 'title', 'evidence', 'fix'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, reason: { type: 'string' } }, required: ['id', 'real', 'severity', 'reason'] }

phase('Reread')
const reread = await agent(`${COMMON}

Your task: re-read the design ${DESIGN} against 83d71fd6 in ${WT}, section by section and file by file, and update it in place. ${SAVE('up-reread.md', 'each design section and §13 file checked, each reference updated, each change of substance with its reason')}
- Update every file:line reference (and say in a header note "Revision 3: re-read against 83d71fd6 on 2026-11-01").
- For each of the 25 §13 files that changed since ed85bcf3 (git -C ${WT} diff --stat ed85bcf3 83d71fd6 -- <file>; ed85bcf3 may need git fetch origin ed85bcf3 or use git log), read the change and adjust the design's mechanism where the code moved: the guard sites today are apps/worker/src/price/create.ts:105-106 (assertPracticePricingAllowed), price/execute.ts:377 (assertPricingAllowed failing with unmapped_plan at :383) and monitor/plan.ts:312 (catches PricingRefusedError into waitingOnMapping). Verify each.
- Fold in #49's content waits (keep them), #50's createRerun and RERUN_ACCEPTANCE, #74's ActionForm/Field (both new forms, the Pricing runs field error), #79's ScrollTable/StackedRows (components/mapping/months.tsx), #78's refusal routes, #81's batched audit-report read, #52's runNames.
- Recheck overlaps with #42, SS-01 and UX PR 9 and update the design's overlap/merge notes, including SS-01's expectQueuedWorkGated rule for the two new routes (practice.mapping.price_again, practice.mapping.price_waiting: in RUN_STARTING_ROUTES; nothing in CONTINUES_STARTED_WORK; the mapping route's conditional monitor enqueue in neither list).
- Keep §14's earlier dispositions; add a "Revision 3 (re-read against 83d71fd6)" subsection listing what changed and why. Keep §13 (files to change) exact and complete, including tools/screening-capacity watched paths and stryker/shards.json if a new pricing source file (price/mapped-plan.ts) is added, and noting schema/pricing.ts:61's comment is left for after #42.
Return a summary of what changed in substance, the final §13 file list, and anything you could not resolve.`, { label: 'up-reread', phase: 'Reread' })

phase('Review')
const review = await agent(`${COMMON}

You are the ONE adversarial design reviewer of revision 3. Read ${DESIGN} (just re-read against 83d71fd6) and attack it against the code in ${WT}. ${SAVE('up-review-r3.md', 'each finding as you confirm it, with its evidence')}
Try to break it: a sequence of loads (835s and ERA exports, ADR 0060's PLAN: keys), mappings, corrections, runs, re-runs, releases, content waits and acceptances under which a line is priced under no mapping or the wrong one, a mapped line stays unpriced, a month is priced twice or never re-priced after mapping, a period with no mapped plan gets a run, a content or location wait is lost, a re-run collides with #50's rules (not_in_effect, newer_run_pending, acceptance), Coverage, Pricing runs, Home or a report misstates counts or cents, a stale file:line reference remains, the engine freeze is broken, a #42 file is touched, a migration is hidden, a route lacks a Zod schema/role check/practice-scoped transaction/audit event, or an identifier leaks into a URL, log, job payload or error. Check that it is the best option, not the cheapest. Also check every §13 file exists at the cited lines.
Write the review to ${REVIEW}: numbered findings R3-1.., each with severity (blocking / should-fix / nit), evidence (file:line), and the fix. Return the findings.`, { label: 'up-review-r3', phase: 'Review', schema: FINDINGS })

if (!review || !review.findings) throw new Error('review returned nothing: stop')
log(`review: ${review.findings.length} findings`)

phase('Verify')
const verdicts = await parallel(review.findings.map(f => () => agent(`${COMMON}

Adversarially verify ONE design review finding against the code in ${WT} and the design ${DESIGN}. Try to REFUTE it: is the evidence accurate, does the failure really occur, is the proposed fix right and the best option? Default to real=true only if the evidence holds. Also re-grade its severity. Read only; write nothing except ${SP}/progress/up-verify-${f.id}.md (your notes, continued if it exists).
Finding ${f.id} (${f.severity}): ${f.title}
Evidence: ${f.evidence}
Fix proposed: ${f.fix}`, { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT })))

const judged = review.findings.map((f, i) => ({ ...f, verdict: verdicts[i] }))

phase('Revise')
const revised = await agent(`${COMMON}

The design ${DESIGN} (revision 3) has been reviewed (${REVIEW}) and each finding independently verified. Findings with verdicts (JSON):
${JSON.stringify(judged, null, 1)}
${SAVE('up-revise-r3.md', 'each finding and its disposition as you apply it')}
Apply every finding the verifier judged real (at the verifier's severity): change the design. For a finding judged not real, keep the design and record why with evidence. Add to §14 a subsection "Revision 3 review and dispositions" (one line per finding: id, severity, verdict, disposition). Append the verdicts to ${REVIEW} under "Verification". Keep the design self-consistent and §13 exact. Return: the design in one paragraph, the exact files the builders change (§13), the test rows as written, the visible changes and wording, the ADR decision, the migration status, any request to the orchestrator, the proposals, and the dispositions.`, { label: 'up-revise-r3', phase: 'Revise' })

phase('Critic')
const critic = await agent(`${COMMON}

You are the completeness critic for revision 3 of ${DESIGN}. Ask what is missing: a file the change must touch that §13 omits (grep callers of assertPricingAllowed, assertPracticePricingAllowed, PricingRefusedError, waitingOnMapping, unmapped_plan, tp-pricing-coverage across apps/ and packages/ and tests in ${WT}), a test row or assertedBy without a test, a screen whose wording is not given, a stale file:line reference, a review finding not dispositioned, an overlap note missing, a route missing a guard. ${SAVE('up-critic-r3.md', 'each gap found and whether you fixed it')}
Fix each gap you verify directly in ${DESIGN} (minimal, exact edits) and record each in §14 "Revision 3 review and dispositions" as a critic item. Return the list of gaps and what you changed.`, { label: 'up-critic-r3', phase: 'Critic' })

return { reread, review, judged, revised, critic }