export const meta = {
  name: 'best-option-audit-merge',
  description: 'Merge the second best-option audit (its saved proposals and checks) with the first audit into one ranked list for the founder, with one agent, because the original merge step was cut off by a usage limit',
  phases: [{ title: 'Synthesize', detail: 'merge both audits and rank' }],
}
const OUT = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/best-option-audit'
const J = '/root/.claude/projects/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/subagents/workflows/wf_8e577203-afb/journal.jsonl'
phase('Synthesize')
const report = await agent(`You are merging two read-only audits of the PaidWhole platform for its founder, Tyler Williams (use they/them), who is not an engineer. Usage is costly now: work efficiently; do not re-audit the code, only open a cited file when two proposals conflict and you must decide which is right.
Inputs:
- The first audit's result: ${OUT}/report.json (64 upgrades, already merged, checked and ranked; items with rank, title, severity, area, current, best, why, changes, needs_freeze_exception, lands_in, hours; plus owner_decisions and already_best).
- The second audit's raw results in ${J}: one JSON line per event; lines with "type":"result" carry each agent's return value. The "find: <angle>" agents (ten angles: security-privacy, compliance-legal, reliability-operations, cost-efficiency, dispute-success, time-to-value, resilience-to-change, ai-safety, maintainability, business-readiness) returned proposals; each "check: ..." agent returned a verdict (keep, revise or drop, with revised_best and revised_severity) for one proposal, in the order the proposals were listed. Match each verdict to its proposal (the check label is "check: " + the proposal's area, cut to 60 characters). Drop proposals whose verdict is drop; use revised_best and revised_severity when revised. Twenty proposals have no verdict because their check was cut off by a usage limit: keep them only if they are concrete, mark them "not yet checked" in the report, and never rank one above high.
- Owner rulings already made on 2026-10-18 (do not re-propose them): PR 5 download before attest, D16 (a) left to D27, appeal-level evidence in PR 8; PR 6 price twice and flag below the reduced figure, compare before sequestration, conversion allowed with notice, the 11-claim-line floor, denied lines left out of screening totals; PR 6b ZIP+4; PR 5 audit fixes #4, #5, #26 and #61 being built; governance (#12) being built (hooks on, CODEOWNERS, approval of record by the founder's GitHub review, the repository going private on GitHub Pro); main repaired (#18).
Merge duplicates across both audits (keep the stronger evidence and the higher severity when both are well supported), and rank by severity then by impact on a customer or the business. Write ${OUT}/combined-report.md (outside the repository) in plain language:
1. A one-paragraph summary with the counts by severity and the angles covered, and the honest added hours.
2. "Already decided", one line each: the items above that are settled or being built.
3. The upgrades still to decide, grouped by severity (critical, then high, then medium, then low), each with: a short title; the angle; what is there or planned now; the best option; why it matters to a customer or the business in one or two concrete sentences; what it changes (say plainly if it touches the pricing engine, the ledger or the database, and if it needs an exception to the change order's freeze); where it lands (which pull request); added hours; and "not yet checked" where that applies.
4. People-only items the product must be ready for (lawyer, specialist, SOC 2 auditor, AWS, Stripe).
5. What was reviewed and found already best, briefly.
Also write ${OUT}/combined-report.json with the same items as structured data (id, title, severity, angle, current, best, why, changes, needs_freeze_exception, lands_in, hours, checked). Return a short summary: the counts by severity, the critical titles, and the high titles.`, { label: 'merge both audits and rank', phase: 'Synthesize' })
return { report }
