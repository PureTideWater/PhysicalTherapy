export const meta = {
  name: 'pr5-freeze-ask-confirm',
  description: 'Acting Lane A, read-only: final confirmation of the PR 5 freeze ask (ask-v2.md): accuracy, scope and founder-reader critics limited to material errors; revise; confirm dry',
  phases: [ { title: 'Confirm', detail: 'material errors only; revise; re-check until a round finds none (max 2)' } ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const A = `${SP}/pr5-ask`, OUT = `${A}/ask-v2.md`, OPS = '/home/user/ops'
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). READ-ONLY on every worktree and on GitHub; write only under ${A}/. Base: origin/claude/build-platform now (git -C /home/user/PhysicalTherapy fetch origin claude/build-platform). The founder's ledger freeze ask for schema PR 5 is ${OUT} (four check rounds done; issues went 16, 12, 9, 7; rejected notes ${A}/rejected-v2.md). The grant covers only the frozen function bodies in its appendices; unfrozen code is context. Model ask: ${OPS}/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md. When done you MUST call StructuredOutput.`
const ISS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['what', 'evidence', 'fix'] } } }, required: ['issues'] }
const seen = new Set()
let round = 0, lastFresh = -1
phase('Confirm')
while (round < 2) {
  round++
  const cs = await parallel([
    () => agent(`${COMMON}\n\nAccuracy (final round ${round}): report ONLY statements that are factually WRONG against the code, the tests or the cited documents (with evidence), or appendix bodies that differ from the tested SQL files in ${A}/. Not wording, not additions. Already raised: ${JSON.stringify([...seen]).slice(0, 3000)}`, { label: `accuracy f${round}`, phase: 'Confirm', schema: ISS }),
    () => agent(`${COMMON}\n\nScope (final round ${round}): report ONLY a grant wider than its frozen change, unfrozen code placed under the grant, a combination of answers with no stated outcome, or a contradiction between two statements about what is built. Not wording. Already raised: ${JSON.stringify([...seen]).slice(0, 3000)}`, { label: `scope f${round}`, phase: 'Confirm', schema: ISS }),
    () => agent(`${COMMON}\n\nFounder-reader (final round ${round}): report ONLY something that would make the founder answer a question WRONGLY (a misleading claim of benefit, a hidden cost, a missing consequence of yes or no). Not style, not nice-to-haves. Already raised: ${JSON.stringify([...seen]).slice(0, 3000)}`, { label: `reader f${round}`, phase: 'Confirm', schema: ISS }),
  ])
  const fresh = cs.filter(Boolean).flatMap(c => c.issues || []).filter(x => !seen.has(x.what))
  lastFresh = fresh.length
  log(`final round ${round}: ${fresh.length} material issues`)
  if (!fresh.length) break
  fresh.forEach(x => seen.add(x.what))
  await agent(`${COMMON}\n\nRevise ${OUT} for these material issues (verify each; reject a wrong one with a one-line reason appended to ${A}/rejected-v2.md); keep it short; never widen the grant: ${JSON.stringify(fresh).slice(0, 14000)}`, { label: `revise f${round}`, phase: 'Confirm', schema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } }, required: ['changed'] } })
}
return { rounds: round, dry: lastFresh === 0, issues: [...seen] }
