export const meta = {
  name: 'pr5-freeze-ask-rewrite',
  description: 'Acting Lane A, read-only: rewrite the PR 5 ledger freeze ask short and exact (grant = the frozen bodies only; unfrozen code as context), verified against the current base by accuracy and scope skeptics and a founder-reader critic, loop until dry',
  phases: [
    { title: 'Rewrite', detail: 'one concise ask from the draft, its rejections and the last round of issues' },
    { title: 'Check', detail: 'accuracy, scope, founder-reader; revise; loop until a round finds nothing' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const A = `${SP}/pr5-ask`
const OUT = `${A}/ask-v2.md`
const OPS = '/home/user/ops'
const SAVE = (f, what) => `Save as you go in ${SP}/progress/${f} (${what}); continue from it if it exists. When done you MUST call StructuredOutput: it is your only way to return.`
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). READ-ONLY on every worktree and on GitHub; write only under ${A}/. Base: origin/claude/build-platform as it is NOW (git -C /home/user/PhysicalTherapy fetch origin claude/build-platform; read with git show / git grep; state its sha). Docs: ${OPS}. This is the founder's combined ledger freeze ask for schema PR 5 (plan ${OPS}/approval-summaries/lane-a-schema-queue-plan-2026-11-07.md section 5; the orchestrator asked for it to be relayed early). The ledger freeze: changing a ledger-frozen object (a ledger table, a ledger function such as roi_links_valid or roi_statement_rules, an amount, a stage, the definition of recovered) needs the founder's exception, which covers exactly its own text and is never widened. Code that is NOT frozen (the statement writer in apps/worker, the readers, tests, docs) needs no grant and must not be put under one. The model ask the founder already granted: ${OPS}/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md (read it for tone, length and structure). Plain words for a busy founder; synthetic data only; no model identifier.`

phase('Rewrite')
const w = await agent(`${COMMON}

Rewrite the ask as ${OUT}. Inputs: the current long draft ${A}/lane-a-ledger-freeze-ask-pr5.md (52 KB, three check rounds), the rejected-issue notes ${A}/rejected.md, and the tested SQL files in ${A}/ (roi_links_valid.base/proposed/proposed-no-empty-fix.sql, roi_statement_rules.base/proposed.sql, t*.sql, t7_*). Requirements:
- At most about 12,000 characters, in the model ask's structure: What changes; Why; Measurements (only real, with base sha, shape and run; recompute anything stale against the current base or say it was measured on <sha>); What proves amounts and refusals unchanged; Risk and rollback; Not asked now (one line each, with why and when); The questions.
- The GRANT covers only frozen objects, with their exact new text in an appendix (the full CREATE OR REPLACE bodies). The writer/readers/tests are described as "built alongside, not part of the grant".
- Separate, independent yes/no questions, so any combination can be granted; say plainly what is built for each combination (e.g. Q1 yes / Q2 no) and give the exact body text for each variant in the appendix.
- Fix every real issue the last check round raised (in the long draft's progress notes ${SP}/progress/pr5-*.md and the journal summaries below), and drop claims that cannot be verified now.
Last round's issue titles (accuracy r3 and scope r3): see ${SP}/progress/ (pr5-*) and the long draft; if unsure, re-verify against the code. ${SAVE('pr5v2-rewrite.md', 'sections, length')}`, { label: 'rewrite ask', phase: 'Rewrite', schema: { type: 'object', properties: { path: { type: 'string' }, chars: { type: 'number' }, base_sha: { type: 'string' }, questions: { type: 'array', items: { type: 'string' } } }, required: ['path', 'chars', 'questions'] } })
if (!w) return { error: 'rewrite failed' }

phase('Check')
const seen = new Set()
let round = 0, last = []
const ISS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['wrong', 'missing', 'unclear'] } }, required: ['what', 'evidence', 'fix', 'severity'] } } }, required: ['issues'] }
while (round < 4) {
  round++
  const cs = await parallel([
    () => agent(`${COMMON}\n\nAccuracy skeptic (round ${round}): verify every factual claim in ${OUT} against the current base, #93 and the tested SQL (re-run a SQL test on a fresh database tp_pr5v_${round} on PostgreSQL 18 at 5433 if a claim depends on it; drop it after). Report only claims that are WRONG or unverifiable, with evidence. Do not suggest additions. Already raised: ${JSON.stringify([...seen]).slice(0, 3000)}`, { label: `accuracy r${round}`, phase: 'Check', schema: ISS }),
    () => agent(`${COMMON}\n\nScope skeptic (round ${round}): does any question grant more than the frozen change it needs, put unfrozen code under the grant, tie one question's answer to another, or leave a combination of answers without a stated outcome? Report only real defects with evidence; do not ask for more content. Already raised: ${JSON.stringify([...seen]).slice(0, 3000)}`, { label: `scope r${round}`, phase: 'Check', schema: ISS }),
    () => agent(`${COMMON}\n\nFounder-reader critic (round ${round}): read ${OUT} as the founder would, once, in five minutes. Report only what would stop a confident yes/no: a term not explained, a question that cannot be answered from the text, a risk not stated, a missing measurement the decision needs. No style nits. Already raised: ${JSON.stringify([...seen]).slice(0, 3000)}`, { label: `reader r${round}`, phase: 'Check', schema: ISS }),
  ])
  const fresh = cs.filter(Boolean).flatMap(c => c.issues || []).filter(x => !seen.has(x.what))
  log(`round ${round}: ${fresh.length} issues`)
  if (!fresh.length) break
  fresh.forEach(x => seen.add(x.what))
  last = fresh
  await agent(`${COMMON}\n\nRevise ${OUT} for these issues (verify each first; reject a wrong one with a one-line reason appended to ${A}/rejected-v2.md). Keep the ask at most about 12,000 characters plus the SQL appendix; never widen the grant. Issues: ${JSON.stringify(fresh).slice(0, 14000)}`, { label: `revise r${round}`, phase: 'Check', schema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } }, chars: { type: 'number' } }, required: ['changed'] } })
}
return { rewrite: w, rounds: round, dry: last.length === 0 || round < 4, issues: [...seen] }
