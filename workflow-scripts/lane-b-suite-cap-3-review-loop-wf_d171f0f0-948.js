export const meta = {
  name: 'lane-b-suite-cap-3-review-loop',
  description: 'SUITE-CAP-3 design: two adversarial reviews (payment-engine, security) with three skeptics per finding, surviving findings applied, loop until a round is dry, then a completeness critic',
  phases: [
    { title: 'Review', detail: 'two lenses per round; three skeptics per fresh finding; survivors applied; until dry (max 3 rounds)' },
    { title: 'Critic', detail: 'completeness critic of the reviewed design and the ask' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad'
const DESIGN = '/home/user/ops/designs/lane-b-suite-cap-3-reconcile.md'
const ASK = '/home/user/ops/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md'
const CL = `${SP}/cap3-rev`
const RULES = `Context: SUITE-CAP-3, "reconcile at real size", a no-migration Lane B item of the PaidWhole build. Stage: DESIGN REVIEW ONLY (no build, no PR). The design ${DESIGN} (about 1,500 lines; base cc3dd7f6 where SUITE-CAP-1b merged; committed pre-review at build-ops 38123394) and the founder freeze-exception ask ${ASK} were updated today after a re-measure; the earlier review attempt produced no rated or skeptic-checked findings (its draft findings PE-1, PE-2, SEC-1 to SEC-3 were applied by the revise step, see the design's section 16, and the completeness check's changes are its section 17). The candidate code is ${CL} (WIP ref co-001/wip-suite-cap-3 at 0b6e90eb = 956b32ef merged with cc3dd7f6; diff against cc3dd7f6 touches apps/worker/src/reconcile/{remittances,stages,postings}.ts). Other inputs: the status file /home/user/ops/approval-summaries/lane-b-suite-cap-3-status.md, the item prompt /home/user/ops/lanes/lane-b-item-prompts-2026-11-01/suite-cap-3.md, 1b's hand-off /home/user/ops/approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md, and draft PR #126 (co-001/ledger-interest-once, head c49367c5; the interest fix, Lane A's schema work, also touching remittances.ts and the ledger). Probe scripts: ${SP}/cap3-probe and /home/user/ops/approval-summaries/lane-b-suite-cap-3-wip/probe-*; results: ${SP}/cap3-results-rev*, /home/user/ops/approval-summaries/lane-b-suite-cap-3-wip/results-*.
Scope set by the co-founder (2026-11-06): the build covers WORKER-SIDE FIXES ONLY; the ledger function rewrites (ledger_line_net, ledger_entry_rules) are Lane A's, behind #126, only with a founder freeze exception; their text is the ask.
Binding limits: matching rules, every amount and the recovered total EXACTLY unchanged (ledger oracle and LED-01 to LED-18 byte for byte; nothing under packages/ledger/src changes; integer cents). No migration, index or table in this item. PHI: synthetic only; no identifier in logs, errors or payloads; queries practice-scoped under forced RLS; PHI reads through readWithAudit as today; decrypts never widened. Reserved: ADR 0087; CAS-49 to CAS-51; synth module 5.
Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. Any heavy command (vitest, typecheck, probes) only under flock /tmp/laneb-heavy.lock; never start a database server inside the lock. A private cluster, if you need one, lives outside /tmp/claude-0 on port 5494 and is removed after. Keep any probe you run under about 20 minutes; prefer reading the recorded results. Never change a tracked file in /home/user/PhysicalTherapy or /home/user/suite-cap-3-reconcile; never touch GitHub. No model name or identifier in any file. IMPORTANT: finish by calling StructuredOutput with what you have, even if partial; a review that returns nothing is lost.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FIND = { type: 'object', properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { rating: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } }, required: ['rating', 'title', 'detail', 'fix'] } } }, required: ['verdict', 'findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const RESULT = { type: 'object', properties: { done: { type: 'boolean' }, summary: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['done', 'summary', 'notes'] }
const LENSES = [
  { key: 'payment-engine', text: `the PAYMENT-ENGINE lens: read .claude/agents/payment-engine-reviewer.md whole and apply every item to the design and to the candidate's diff against cc3dd7f6: could anything alter a match, an amount, a stage, the recovered total, an order the oracle or a person observes, or the trace; is the equality proof (CAS-49 and the dump comparisons) strong enough, including corrections, reversals, recoupments, partial postings and their split (PE-1), EFT deposits, interest, patient share, reopen, payer responses, WOs, one-case shape F; does it fight or lose #126; are D14's budgets and the step 7b decision right; is every number in the ask the design's.` },
  { key: 'security', text: `the SECURITY lens with concurrency and capacity folded in: read .claude/agents/security-reviewer.md and .claude/rules/privacy-and-tenant.md and apply them to the design and the candidate's diff against cc3dd7f6: every new or changed query practice-scoped (D11, SEC-2) under forced RLS; PHI reads audited as today; decrypts never widened (D16's array form vs the TypeScript form); no identifier in logs, errors or job payloads; no new grant; locks and statement order under the practice ledger lock; memory at 560 MiB (D15, SEC-3) at 10,000 lines and practice A's month; the statistics-proof exclusion.` },
]
const key = f => f.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

phase('Review')
const seen = []
const log_ = []
let dry = 0, round = 0
while (dry < 1 && round < 3) {
  round++
  const prior = seen.length ? `Findings already raised in earlier rounds (do not repeat them; look for what they missed and check that the fixes applied for them are right): ${JSON.stringify(seen)}` : ''
  const found = (await parallel(LENSES.map(l => () => agent(`${RULES}
Round ${round}. Your task: an ADVERSARIAL REVIEW of ${DESIGN}, ${ASK} and the candidate in ${CL} through ${l.text} ${prior} ${SAVE(`loop-r${round}-${l.key}.md`, 'findings so far')}
Return a verdict (build / build with changes / redesign) and findings rated blocking, should-fix or nit, each with evidence (file:line, a recorded result or a probe) and the fix.`, { label: `review:r${round}:${l.key}`, phase: 'Review', schema: FIND }).then(r => r ? r.findings.map(f => ({ ...f, lens: l.key, verdict: r.verdict })) : [])))).filter(Boolean).flat()
  const fresh = found.filter(f => !seen.some(s => s.key === key(f)))
  fresh.forEach(f => seen.push({ key: key(f), lens: f.lens, title: f.title }))
  if (!fresh.length) { dry++; log(`round ${round}: no fresh findings`); log_.push({ round, fresh: 0, survived: 0 }); break }
  const judged = await parallel(fresh.map((f, i) => () => parallel(['against the code and the design', 'by reproducing it (recorded results or a short probe)', 'whether the proposed fix is right and needed'].map((how, j) => () => agent(`${RULES}
SKEPTIC ${j + 1}: try to REFUTE this ${f.lens} review finding ${how}. Default to refuted=true when the evidence does not hold or the finding is already handled in the design. Finding: ${JSON.stringify(f)}`, { label: `skeptic:r${round}:${i}:${j}`, phase: 'Review', schema: VERDICT }))).then(vs => { const ok = vs.filter(Boolean); return { ...f, skeptics: ok, survives: ok.filter(v => !v.refuted).length >= 2 } })))
  const survivors = judged.filter(f => f.survives)
  log(`round ${round}: ${fresh.length} fresh, ${survivors.length} survive the skeptics`)
  if (!survivors.length) { dry++; log_.push({ round, fresh: fresh.length, survived: 0, judged }); break }
  const applied = await agent(`${RULES}
Your task: APPLY round ${round}'s surviving review findings to ${DESIGN} (and ${ASK} where a finding concerns it). Check each against the code first. Update the decisions, tests (CAS-49 to CAS-51), files, budgets and builder slices consistently; candidate code changes the build must make go into the slices (do not edit the candidate beyond a probe). Append rows to a section "After the design review (2026-11-06, rounds)" with a table: round, finding, lens, rating, skeptics (n of 3 upheld), what was checked, disposition (taken, taken corrected, not taken with the reason). Also list the refuted ones of this round with one line each. Surviving: ${JSON.stringify(survivors)}. Refuted: ${JSON.stringify(judged.filter(f => !f.survives).map(f => ({ lens: f.lens, title: f.title, reasons: f.skeptics.map(s => s.reason) })))} ${SAVE(`loop-r${round}-apply.md`, 'findings applied')}`, { label: `apply:r${round}`, phase: 'Review', schema: RESULT })
  log_.push({ round, fresh: fresh.length, survived: survivors.length, judged, applied })
}

phase('Critic')
const critic = await agent(`${RULES}
Your task: a COMPLETENESS CRITIC of the reviewed ${DESIGN} and ${ASK} after these review rounds: ${JSON.stringify(log_.map(r => ({ round: r.round, fresh: r.fresh, survived: r.survived, applied: r.applied && r.applied.summary })))}. Check: every surviving finding has a disposition row; the D14 decision (step 7b kept on F at 10,000 lines rather than moved back to practice A's month, against 1b's hand-off and ADR 0083) is stated with its numbers and marked as needing the orchestrator's ruling; the worker-only scope is clear and every Lane A part has DDL, measured gain and its place behind #126; every number in the ask matches the design; the builder slices can be built from the text alone; nothing contradicts across sections (0, 3, 7, 8, 9, 11, 14, 16, 17). Fix what you can directly (a short "Completeness check 2" section listing each change); list what you could not. ${SAVE('loop-critic.md', 'gaps found and fixed')}
Return also, in notes, a 10-line summary of the reviewed design for the status file (decisions, figures, what is for Lane A, what needs a ruling).`, { label: 'critic', phase: 'Critic', schema: RESULT })
return { rounds: log_.map(r => ({ round: r.round, fresh: r.fresh, survived: r.survived, findings: (r.judged || []).map(f => ({ lens: f.lens, rating: f.rating, title: f.title, survives: f.survives })), applied: r.applied })), critic }