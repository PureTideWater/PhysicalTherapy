export const meta = {
  name: 'lane-b-suite-cap-3-review-delta',
  description: 'SUITE-CAP-3 design: delta review of round 4 and completeness check 2 (two lenses, three skeptics per finding, survivors applied), until a round is dry',
  phases: [
    { title: 'Delta review', detail: 'two lenses on the unreviewed delta; three skeptics per fresh finding; survivors applied; until dry (max 3 rounds)' },
    { title: 'Check', detail: 'a final consistency critic' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad'
const DESIGN = '/home/user/ops/designs/lane-b-suite-cap-3-reconcile.md'
const ASK = '/home/user/ops/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md'
const CL = `${SP}/cap3-rev`
const PRIOR = args
const RULES = `Context: SUITE-CAP-3, "reconcile at real size", a no-migration Lane B item of the PaidWhole build. Stage: DESIGN REVIEW ONLY (no build, no PR). The design ${DESIGN} and the founder freeze-exception ask ${ASK} (committed at build-ops ae22c8cc) went through four adversarial review rounds (36 findings, 24 survived three skeptics each and were applied; the dispositions are in the design's section 18) and two completeness checks (sections 17 and 19). Speed rule 3 (lanes/acting-lane-b-2026-11-04.md): a review round already done stands; ONLY THE DELTA SINCE IT IS REVIEWED. The unreviewed delta is: (1) the changes round 4 applied, listed in section 18's round-4 table (and the ask's changes it names), and (2) completeness check 2's changes, listed in section 19 (diff the design against ${SP}/bak-critic2-design.md and the ask against ${SP}/bak-critic2-ask.md to see them exactly). Review those changes and how they fit the rest of the design; do not re-review settled parts unless the delta breaks them. Candidate code: ${CL} (WIP co-001/wip-suite-cap-3 = 0b6e90eb, diff against cc3dd7f6 in apps/worker/src/reconcile/{remittances,stages,postings}.ts). Rulings already made: D14 (step 7b stays on practice F at 10,000 lines until Lane A's trigger fixes merge, then moves back to practice A's month; the orchestrator, 2026-11-06 22:31 UTC); the founder granted the freeze exception for the corrected ledger_line_net and ledger_entry_rules primary-key lookup (Lane A builds it after #126; 2026-11-06 22:40 UTC); the build is worker-side only (the co-founder).
Binding limits: matching rules, every amount and the recovered total EXACTLY unchanged (ledger oracle and LED-01 to LED-18 byte for byte; nothing under packages/ledger/src changes; integer cents). No migration, index or table in this item. PHI: synthetic only; no identifier in logs, errors or payloads; queries practice-scoped under forced RLS; PHI reads through readWithAudit; decrypts never widened.
Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command; heavy commands only under flock /tmp/laneb-heavy.lock; prefer reading code and recorded results to running probes (any probe under 15 minutes). Never change a tracked file in /home/user/PhysicalTherapy or /home/user/suite-cap-3-reconcile; never touch GitHub. No model name or identifier in any file. Finish by calling StructuredOutput with what you have, even if partial.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FIND = { type: 'object', properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { rating: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } }, required: ['rating', 'title', 'detail', 'fix'] } } }, required: ['verdict', 'findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const RESULT = { type: 'object', properties: { done: { type: 'boolean' }, summary: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['done', 'summary', 'notes'] }
const LENSES = [
  { key: 'payment-engine', text: `the PAYMENT-ENGINE lens: read .claude/agents/payment-engine-reviewer.md whole and apply every item to the delta: could it alter a match, an amount, a stage, the recovered total, an order observed by the oracle or a person, or the trace; is each new or changed test (CAS-49 to CAS-51) able to fail on the defect it targets; does each number in the ask still equal the design's.` },
  { key: 'security', text: `the SECURITY lens with concurrency and capacity: read .claude/agents/security-reviewer.md and .claude/rules/privacy-and-tenant.md and apply them to the delta: practice scoping under forced RLS, PHI reads audited, decrypts never widened, no identifier in logs/errors/payloads, no new grant, lock order and the web reopen recommendation, memory at 560 MiB.` },
]
const key = f => f.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

phase('Delta review')
const seen = PRIOR.map(p => ({ key: key(p), lens: p.lens, title: p.title }))
const log_ = []
let dry = 0, round = 4
while (dry < 1 && round < 7) {
  round++
  const prior = `Findings already raised in rounds 1-4 and since (do not repeat them; a fix applied for one is part of the delta): ${JSON.stringify(seen.map(s => s.title))}`
  let found = await parallel(LENSES.map(l => () => agent(`${RULES}
Round ${round}. Your task: an ADVERSARIAL REVIEW of the unreviewed delta through ${l.text} ${prior} ${SAVE(`delta-r${round}-${l.key}.md`, 'findings so far')}
Return a verdict (build / build with changes / redesign) and findings rated blocking, should-fix or nit, each with evidence and the fix. An empty findings list is a valid answer when the delta is sound.`, { label: `review:r${round}:${l.key}`, phase: 'Delta review', schema: FIND }).then(r => r ? r.findings.map(f => ({ ...f, lens: l.key, verdict: r.verdict })) : null)))
  if (found.some(x => x === null)) { log(`round ${round}: a reviewer returned nothing; not dry`); log_.push({ round, failed: true }); continue }
  found = found.flat()
  const fresh = found.filter(f => !seen.some(s => s.key === key(f)))
  fresh.forEach(f => seen.push({ key: key(f), lens: f.lens, title: f.title }))
  if (!fresh.length) { dry++; log(`round ${round}: dry`); log_.push({ round, fresh: 0, survived: 0 }); break }
  const judged = await parallel(fresh.map((f, i) => () => parallel(['against the code and the design', 'by reproducing it (recorded results or a short probe)', 'whether the proposed fix is right and needed'].map((how, j) => () => agent(`${RULES}
SKEPTIC ${j + 1}: try to REFUTE this ${f.lens} review finding ${how}. Default to refuted=true when the evidence does not hold, the finding is already handled in the design, or it concerns a settled part the delta did not touch. Finding: ${JSON.stringify(f)}`, { label: `skeptic:r${round}:${i}:${j}`, phase: 'Delta review', schema: VERDICT }))).then(vs => { const ok = vs.filter(Boolean); return { ...f, skeptics: ok, survives: ok.filter(v => !v.refuted).length >= 2 } })))
  const survivors = judged.filter(f => f.survives)
  log(`round ${round}: ${fresh.length} fresh, ${survivors.length} survive`)
  if (!survivors.length) { dry++; log_.push({ round, fresh: fresh.length, survived: 0, judged }); break }
  const applied = await agent(`${RULES}
Your task: APPLY round ${round}'s surviving findings to ${DESIGN} (and ${ASK} where one concerns it), each checked against the code first; keep decisions, tests, files, budgets and slices consistent; append to section 18 a round-${round} table (finding, lens, rating, skeptics upheld, what was checked, disposition) and one line per refuted finding. Before editing, copy both files to ${SP}/bak-r${round}-design.md and ${SP}/bak-r${round}-ask.md so the next round can diff exactly. Surviving: ${JSON.stringify(survivors)}. Refuted: ${JSON.stringify(judged.filter(f => !f.survives).map(f => ({ lens: f.lens, title: f.title, reasons: f.skeptics.map(s => s.reason) })))} ${SAVE(`delta-r${round}-apply.md`, 'findings applied')}
In your notes, say exactly which sections you changed, so the next round's reviewers can review only that delta.`, { label: `apply:r${round}`, phase: 'Delta review', schema: RESULT })
  log_.push({ round, fresh: fresh.length, survived: survivors.length, judged, applied })
}

phase('Check')
const critic = await agent(`${RULES}
Your task: a final CONSISTENCY CHECK of ${DESIGN} and ${ASK} after the delta rounds: ${JSON.stringify(log_.map(r => ({ round: r.round, fresh: r.fresh, survived: r.survived, failed: r.failed, applied: r.applied && r.applied.summary })))}. Check: each surviving finding has a disposition row; no section contradicts another (0, 3, 4, 5, 7, 8, 9, 11, 14, 18, 19); every number in the ask equals the design's; the builder slices can be built from the text alone. Fix small gaps directly (append to section 19 "Completeness check 2" a short "after the delta rounds" list); list larger ones in notes. ${SAVE('delta-critic.md', 'gaps found and fixed')}
In notes, give a 6-line summary of the final design state for the status file, and list any statement in the ask the founder read (build-ops 38123394 text) that has since changed in substance, for the orchestrator to relay.`, { label: 'check', phase: 'Check', schema: RESULT })
return { rounds: log_.map(r => ({ round: r.round, fresh: r.fresh, survived: r.survived, failed: r.failed, findings: (r.judged || []).map(f => ({ lens: f.lens, rating: f.rating, title: f.title, survives: f.survives })), applied: r.applied })), critic }