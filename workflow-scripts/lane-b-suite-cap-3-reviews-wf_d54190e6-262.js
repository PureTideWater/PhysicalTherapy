export const meta = {
  name: 'lane-b-suite-cap-3-reviews',
  description: 'SUITE-CAP-3 PR #134: two adversarial reviews (payment-engine and security checklists, default agents, fresh clones), three skeptics per finding, a second round for what the first missed, until dry',
  phases: [
    { title: 'Review', detail: 'two lenses in fresh clones; three skeptics per fresh finding; up to 2 rounds, until dry' },
    { title: 'Record', detail: 'write the surviving findings for the fix round' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad'
const OUT = `${SP}/pr134-review-findings.md`
const CTX = `Context: SUITE-CAP-3, "reconcile at real size", draft PR #134 (PureTideWater/PhysicalTherapy, co-001/suite-cap-3-reconcile -> claude/build-platform), head ee1dbb7d = base 31a7345f + 6 slice commits. Worker-side only: apps/worker/src/reconcile/{remittances,stages,postings}.ts plus tests (CAS-49 equality harness against test-support/per-line.ts, CAS-49.3-49.6, CAS-50, CAS-51), ADR 0087, ADR 0083's note, release-capacity sizing (D14), docs. Design: /home/user/ops/designs/lane-b-suite-cap-3-reconcile.md (reviewed in 7 rounds; read its sections 3, 4, 5, 7, 18 for what the code must do). The PR body: gh api repos/PureTideWater/PhysicalTherapy/pulls/134 --jq .body. Known and already scheduled for the fix round (do not report as new): CAS-49.2 (old against new on LED-01 to LED-18's worlds) is not built yet.
Binding: matching rules, every amount, every write and its observable order and the recovered total EXACTLY unchanged; nothing under packages/ledger/src, packages/db or packages/pricing changes; integer cents; queries practice-scoped (D11) under forced RLS; PHI reads through readWithAudit as before; decrypts never widened; no identifier in logs, errors or payloads.
Work in a FRESH CLONE: git clone -q /home/user/PhysicalTherapy ${SP}/rev134-<your label> && cd there && git fetch -q origin co-001/suite-cap-3-reconcile && git checkout -q FETCH_HEAD (verify HEAD is ee1dbb7d); pnpm install --frozen-lockfile under flock /tmp/laneb-heavy.lock if you run tests. Every command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock; DATABASE_URL=postgres://postgres:test@localhost:5433/postgres; keep any run under 15 minutes. Read-only: never push, comment, review or approve on GitHub. No model identifier in any file. Finish by calling StructuredOutput with what you have, even if partial.`
const FIND = { type: 'object', properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { rating: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, title: { type: 'string' }, file: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } }, required: ['rating', 'title', 'file', 'detail', 'fix'] } } }, required: ['verdict', 'findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const LENSES = [
  { key: 'payment-engine', text: `the PAYMENT-ENGINE checklist: read .claude/agents/payment-engine-reviewer.md whole and apply every item to the diff 31a7345f..HEAD: arithmetic, rounding, flags, windows, trace; could the new pass write a different match, amount, stage, note, order or recovered total than per-line.ts's reference in any world (corrections, reversals, recoupments, partial and claim-level postings, EFT deposits, interest, patient share, reopen, payer responses, WOs, one-case shapes); can each test (CAS-49.1, 49.3-49.6, CAS-50, CAS-51, settle-order, stages.test) fail on the defect it targets; release-capacity's D14 numbers.` },
  { key: 'security', text: `the SECURITY checklist with concurrency and capacity: read .claude/agents/security-reviewer.md and .claude/rules/privacy-and-tenant.md and apply them to the diff 31a7345f..HEAD: every new or changed query practice-scoped on every table it reads; PHI reads audited as before; decrypt counts not widened; no identifier in logs, errors, payloads or test output; no new grant; lock order and the 40P01 savepoint retry; memory at 560 MiB; the per-line import guard; secrets or PHI in fixtures (fixtures/synthetic/CAS-49..51).` },
]
const key = f => f.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
phase('Review')
const seen = [], rounds = []
for (let round = 1; round <= 2; round++) {
  const prior = seen.length ? `Findings already raised (do not repeat; look for what they missed): ${JSON.stringify(seen.map(s => s.title))}` : ''
  let found = await parallel(LENSES.map(l => () => agent(`${CTX}
Round ${round}. Your task: an ADVERSARIAL REVIEW of PR #134 through ${l.text} ${prior}
Return a verdict (merge / fix first) and findings rated blocking, should-fix or nit, each with file:line evidence and the fix. An empty list is valid.`, { label: `review:r${round}:${l.key}`, phase: 'Review', schema: FIND }).then(r => r ? r.findings.map(f => ({ ...f, lens: l.key })) : null)))
  if (found.some(x => x === null)) { log(`round ${round}: a reviewer returned nothing; stopping (not dry)`); rounds.push({ round, failed: true }); break }
  found = found.flat()
  const fresh = found.filter(f => !seen.some(s => s.key === key(f)))
  fresh.forEach(f => seen.push({ key: key(f), title: f.title }))
  if (!fresh.length) { log(`round ${round}: dry`); rounds.push({ round, fresh: 0 }); break }
  const judged = await parallel(fresh.map((f, i) => () => parallel(['against the code at ee1dbb7d', 'by reproducing it (a test or a short run)', 'whether the fix is right and needed'].map((how, j) => () => agent(`${CTX}
SKEPTIC ${j + 1}: try to REFUTE this ${f.lens} finding on PR #134 ${how}. Default to refuted=true when the evidence does not hold, or it is the already-scheduled CAS-49.2. Finding: ${JSON.stringify(f)}`, { label: `skeptic:r${round}:${i}:${j}`, phase: 'Review', schema: VERDICT }))).then(vs => { const ok = vs.filter(Boolean); return { ...f, skeptics: ok.map(v => v.reason), upheld: ok.filter(v => !v.refuted).length, survives: ok.filter(v => !v.refuted).length >= 2 } })))
  rounds.push({ round, fresh: fresh.length, judged })
  log(`round ${round}: ${fresh.length} fresh, ${judged.filter(f => f.survives).length} survive`)
  if (!judged.some(f => f.survives)) break
}
phase('Record')
const rec = await agent(`${CTX}
Write ${OUT}: the review record of PR #134 for the fix round and the PR description's "Reviewer agents' findings" table. For each round and lens: every finding with rating, file, title, skeptics upheld (n of 3), survives or refuted (one line why), and the fix. Then a short list "For the fix round, in order": the surviving findings plus CAS-49.2. Data: ${JSON.stringify(rounds)}`, { label: 'record', phase: 'Record', schema: { type: 'object', properties: { path: { type: 'string' }, surviving: { type: 'number' }, summary: { type: 'string' } }, required: ['path', 'surviving', 'summary'] } })
return { rounds: rounds.map(r => ({ round: r.round, fresh: r.fresh, failed: r.failed, findings: (r.judged || []).map(f => ({ lens: f.lens, rating: f.rating, title: f.title, upheld: f.upheld, survives: f.survives })) })), rec }