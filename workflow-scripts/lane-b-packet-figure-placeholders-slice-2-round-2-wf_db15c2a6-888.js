export const meta = {
  name: 'lane-b-packet-figure-placeholders-slice-2-round-2',
  description: 'Placeholder item slice 2 round 2: verify and fix the recheck findings, review the mutation equivalent, loop-until-dry adversarial reviews with skeptics, a completeness critic',
  phases: [{ title: 'Carry-over' }, { title: 'Review' }, { title: 'Fix' }, { title: 'Critic' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/c2e93384-1207-544a-bf87-57602f4a49c5/scratchpad'
const WT = '/home/user/pfp2'
const DESIGN = '/home/user/ops/designs/lane-b-packet-figure-placeholders.md'
const SESSION = 'https://claude.ai/code/session_01FcouKPkXdRW5ntz6ye92pL'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const WIP = 'co-001/wip-packet-figure-placeholders-2'
const BASE = 'cc3dd7f6'
const R1 = SP + '/wf445-result.json'
const SAVE = (f, what) => `Keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, an earlier run was interrupted: read it and continue from it.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; every heavy command (install, typecheck, lint, a package's tests, Stryker) under \`flock /tmp/laneb-heavy.lock\`; long commands in the background with logs in ${SP}/pfp2/, read only tails and counts. Synthetic data only; no model name or identifier in any file, commit or comment. Money is integer cents (bigint); never a float on an amount. No migration; no edit of docs/product/domain-model.md or packages/db/functions. packages/pricing and packages/ledger are frozen. Never push the branch co-001/packet-figure-placeholders-2 and never force or --no-verify: commits go to the WIP ref only (\`${GL} git -C ${WT} push origin HEAD:refs/heads/${WIP}\`, fast-forward). A gitleaks refusal is fixed by rewriting the flagged text, never by .gitleaksignore. Do not run the full suite. You MUST finish by returning the structured result.`
const CONTEXT = `PaidWhole; worktree ${WT} on branch co-001/packet-figure-placeholders-2 (cut from claude/build-platform ${BASE}), slice 2 of the packet-figure-placeholders item (design ${DESIGN}, sections 0 to 6, 8, 9, 11; slice 2 per section 9: verifier /3 behind the format constant, VERIFIER_FORMAT stays /2, the code draft emits tokens only for /3 with its /2 output byte-identical, nothing served changes; fail closed on tokens; ADR 0089 docs/adr/0089-*.md records decisions; CAS-52, CAS-53, CAS-54). Built and reviewed once (round 1: ${R1} holds the builders' reports, every round-1 finding with the skeptics' verdicts, the fix and the recheck; commits ${BASE}..HEAD). Out of scope (later slices): the migration (3), worker export/approval (4), web picker/preview (5), gateway prompt v2 (6), eval set (7).`
const FINDING = { type: 'object', required: ['id', 'severity', 'file', 'title', 'detail', 'reproduction', 'fix'], properties: { id: { type: 'string' }, severity: { type: 'string', description: 'blocking | should fix | nit' }, file: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' } } }
const REVIEW = { type: 'object', required: ['verdict', 'findings'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: FINDING } } }
const VERDICTS = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'real', 'severity', 'reason'], properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string' }, reason: { type: 'string' } } } } } }
const FIXED = { type: 'object', required: ['applied', 'notApplied', 'checks', 'commit'], properties: { applied: { type: 'array', items: { type: 'string' } }, notApplied: { type: 'array', items: { type: 'string' } }, checks: { type: 'string' }, commit: { type: 'string' } } }
const RECHECK = { type: 'object', required: ['perFinding', 'newFindings'], properties: { perFinding: { type: 'array', items: { type: 'object', required: ['id', 'fixed', 'evidence'], properties: { id: { type: 'string' }, fixed: { type: 'boolean' }, evidence: { type: 'string' } } } }, newFindings: { type: 'array', items: FINDING } } }
const CLONE = (dir) => `Work read-only in your own clone ${dir}: if absent, \`git clone -q ${WT} ${dir}\`; then \`git -C ${dir} fetch -q ${WT} HEAD && git -C ${dir} checkout -q -f FETCH_HEAD\` and \`pnpm install --frozen-lockfile\` under the lock. Probes only as temporary test files you delete after. Keep probe output in files and read only counts and short excerpts.`
const COMMIT = `Commit (a message describing the change, a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}") and push only to the WIP ref as the rules say.`
const SKEPTICS = [
  { key: 'reproduce', text: 'does-it-reproduce: run the reproduction exactly at the current HEAD, then one variant; real only if you see it' },
  { key: 'intent', text: 'intent and scope: intended by the design or ADR 0089 as an accepted reading, deferred to a later slice (then real=false, say which), or a real defect of this slice that changes what a payer reads or lets a check pass that should fail' },
]
const verify = async (findings, tag) => {
  if (!findings.length) return []
  const sets = await parallel(SKEPTICS.map((l) => () => agent(`You are a skeptical verifier. Try to REFUTE each finding about ${CONTEXT}
${CLONE(SP + '/pfp2r2-verify-' + l.key)}
Lens: ${l.text}. Default real=false when unsure. Findings: ${JSON.stringify(findings)}
${SAVE(`pfp2r2-verify-${tag}-${l.key}.md`, 'each finding: verdict and what you ran')}
${RULES}`, { label: `verify-${tag}-${l.key}`, phase: 'Review', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  return findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length === 2 || ((votes[f.id] ?? []).length === 1 && votes[f.id][0].real) }))
}
const fixAndRecheck = async (confirmed, tag) => {
  const fix = await agent(`${CONTEXT}
You are the fixer, in ${WT}. Apply every confirmed finding (verdicts included; where a verdict scopes the fix, follow it; an accepted reading goes into ADR 0089 with its reason): ${JSON.stringify(confirmed)}
A test for each that fails before the fix; the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all with no diff); the touched packages' unit tests; each affected mutation shard timed under the lock with its gate (every survivor killed or a proposed equivalent with reviewedBy empty). Keep ADR 0089 and the CAS-52..54 rows (test-matrix and synth matrix, word for word) true to the code. ${COMMIT}
${SAVE(`pfp2r2-fix-${tag}.md`, 'each finding: done or not, checks')}
${RULES}`, { label: `fixer-${tag}`, phase: 'Fix', schema: FIXED })
  const recheck = await agent(`${CONTEXT}
Recheck, read-only, at the worktree HEAD. ${CLONE(SP + '/pfp2r2-recheck')} For each finding run its reproduction: fixed or not. Then review the fix's diff adversarially (money and fail-closed lenses) for anything it broke or left open nearby. Findings: ${JSON.stringify(confirmed.map((f) => ({ id: f.id, title: f.title, reproduction: f.reproduction })))}; fixer: ${JSON.stringify(fix)}
${SAVE(`pfp2r2-recheck-${tag}.md`, 'each finding: fixed or not; new defects')}
${RULES}`, { label: `recheck-${tag}`, phase: 'Fix', schema: RECHECK })
  return { fix, recheck }
}

phase('Carry-over')
const r1 = JSON.parse('null')
const carry = [
  { id: 'NEW-1', severity: 'should fix', file: 'packages/packets/src/verifier/template.ts', title: "A sign set off from a count token by a space, an opening bracket or a quotation mark, or the word 'negative', still passes and prints next to the figure", detail: "separated() looks only at the one character before the token; BEFORE_TOKEN accepts whitespace, '(' and quotes, so a minus typed before them goes unread; 'minus' is fact_contradicted but 'negative' is not.", reproduction: "verifyTemplate(t, FACT_CONTENTS.base(), []).passed === true for 'The payer allowed \u2212 {{fact:pattern.units}} [1].', 'The payer allowed - {{fact:pattern.units}} [1].', 'The payer allowed -({{fact:pattern.units}}) [1].', 'The payer allowed -\"{{fact:pattern.units}}\" [1].', 'The payer allowed negative {{fact:pattern.units}} [1].'", fix: "Skip back over whitespace, opening brackets and quotes before the token; if the character before is a sign or a currency sign fail fact_not_separated; treat 'negative' (and kin) as 'minus' is treated; tests for each form." },
  { id: 'NEW-2', severity: 'nit', file: 'packages/packets/src/verifier/template.ts', title: 'Two tokens one space apart print two numbers side by side', detail: "One space between two tokens satisfies separated(); a phrase ending in a digit followed by one starting with a digit prints e.g. 'line 1 2 units'.", reproduction: "verifyTemplate('The schedule shows {{fact:line.1.paid_on}} {{fact:line.1.units}} [1].', FACT_CONTENTS.base(), []).passed === true", fix: 'Fail fact_not_separated when only whitespace stands between two fact tokens (or record as an accepted reading in ADR 0089).' },
]
const [carryJudged, equiv] = await parallel([
  () => verify(carry, 'carry'),
  () => agent(`${CONTEXT}
You review one proposed Stryker equivalent, independently of its proposer, in your clone. ${CLONE(SP + '/pfp2r2-equiv')}
The entry: tools/stryker/equivalent/packets.json, the one with reviewedBy "" (verifier/template.ts, \`marker.start < span.end\` -> \`<=\`), and tools/stryker/unicode.json. Also check the scan.ts entries renumbered mechanically in the same commits (occurrence '0' moved from 3 to 6): the reviewed text, mutator and replacement unchanged and the occurrence now pointing at the same code. Try hard to KILL the mutant with a test (any input, Unicode included, where < and <= differ in outcome). Return equivalent=true only if you cannot and the argument holds. Do not edit files.
${SAVE('pfp2r2-equiv.md', 'what you tried')}
${RULES}`, { label: 'equivalent-review', phase: 'Carry-over', schema: { type: 'object', required: ['equivalent', 'renumberOk', 'reason', 'killingTest'], properties: { equivalent: { type: 'boolean' }, renumberOk: { type: 'boolean' }, reason: { type: 'string' }, killingTest: { type: 'string' } } } }),
])
const carryConfirmed = (carryJudged ?? []).filter((f) => f.confirmed)
const equivTask = equiv?.equivalent && equiv?.renumberOk
  ? [{ id: 'EQUIV', severity: 'should fix', file: 'tools/stryker/equivalent/packets.json', title: 'Record the independent review of the proposed equivalent', detail: `An independent reviewer found it equivalent: ${equiv.reason}`, reproduction: 'reviewedBy is empty', fix: 'Set reviewedBy to "review round 2 of 2026-11-06 (Lane B, packet-figure-placeholders slice 2)" and reviewedOn to "2026-11-06" on that entry only; run the gate for its shard.' }]
  : [{ id: 'EQUIV', severity: 'should fix', file: 'tools/stryker/equivalent/packets.json', title: 'The proposed equivalent is not equivalent (or the renumbering is wrong)', detail: JSON.stringify(equiv), reproduction: equiv?.killingTest ?? '', fix: 'Remove the entry and add the killing test; or correct the renumbered occurrences; run the shard and its gate.' }]
let state = await fixAndRecheck([...carryConfirmed, ...equivTask], 'carry')
const history = [{ round: 'carry', confirmed: [...carryConfirmed, ...equivTask].map((f) => f.id), ...state }]

phase('Review')
const LENSES = [
  { key: 'money', text: 'payment-engine checklist (.claude/agents/payment-engine-reviewer.md): can any figure reach the payer that code did not compute, or a computed figure read in the wrong role or set (free text around tokens, signs, words, separation, contradiction in both directions, the covering exemption, rendered_sha256 over exactly what prints)' },
  { key: 'fail-closed', text: 'security, fail-closed: every malformed or adversarial token, brace or Unicode form fails and is never printed raw or passed; nothing throws instead of returning a report; no PHI in a hash, mismatch, log or error; regex time on 100k-character adversarial inputs' },
  { key: 'conformance', text: 'design and decisions conformance and maintainability: the design section 9 slice-2 scope complete, decisions (a)-(f) held (in particular /2 byte-identical for every existing caller, VERIFIER_FORMAT /2), ADR 0089 and the CAS-52..54 rows true to the code, nothing of a later slice half-built, exports and file layout' },
  { key: 'tests', text: 'test quality: mutate the code by hand (each fix of round 1 and the carry-over undone, each strict table word removed, a contradiction direction flipped, the exemption broken, a span offset shifted) and see a test go red; seeds and determinism; the mutation shards and equivalents' },
]
const seen = []
const keyOf = (f) => (f.file + '|' + f.title).toLowerCase()
let dry = 0, round = 0
while (dry < 1 && round < 3) {
  round++
  const prior = JSON.stringify(seen.map((f) => ({ id: f.id, title: f.title, status: f.status })))
  const found = (await parallel(LENSES.map((l) => () => agent(`${CONTEXT}
Review round ${round} (loop until dry). Adversarially review slice 2 at the worktree HEAD (\`git log ${BASE}..HEAD\`, the whole diff) under this lens: ${l.text}
Already reported in this round's history (do not report again unless the fix is incomplete, and then say so): ${prior}; round 1's findings are in ${R1}.
${CLONE(SP + '/pfp2r2-review-' + l.key)}
Report only real defects with an exact reproduction you ran; ids R${round}-${l.key.toUpperCase()}-1, ... No findings is valid and expected once the code is right. Return the structured result even if your time runs short.
${SAVE(`pfp2r2-review-${round}-${l.key}.md`, 'checks and candidates')}
${RULES}`, { label: `review-${round}-${l.key}`, phase: 'Review', schema: REVIEW })))).filter(Boolean).flatMap((r) => r.findings)
  const fresh = found.filter((f) => !seen.some((s) => keyOf(s) === keyOf(f)))
  const recheckNew = (state?.recheck?.newFindings ?? []).map((f, i) => ({ ...f, id: `R${round}-RECHECK-${i + 1}` }))
  const candidates = [...fresh, ...recheckNew]
  const judged = await verify(candidates, 'r' + round)
  judged.forEach((f) => seen.push({ id: f.id, title: f.title, file: f.file, status: f.confirmed ? 'confirmed' : 'refuted' }))
  const confirmed = judged.filter((f) => f.confirmed)
  log(`round ${round}: ${candidates.length} candidates, confirmed ${confirmed.map((f) => f.id + ' ' + f.severity).join(', ') || 'none'}`)
  if (!confirmed.length) { dry++; history.push({ round, candidates: candidates.length, confirmed: [] }); continue }
  dry = 0
  state = await fixAndRecheck(confirmed, 'r' + round)
  history.push({ round, candidates: candidates.length, confirmed: confirmed.map((f) => ({ id: f.id, severity: f.severity, title: f.title })), fix: state.fix, recheckPer: state.recheck?.perFinding })
}
if (dry < 1) log('review loop stopped at 3 rounds without a dry round: the last recheck\'s new findings are returned unverified')

phase('Critic')
const critic = await agent(`${CONTEXT}
You are the completeness critic, read-only, at the worktree HEAD. ${CLONE(SP + '/pfp2r2-critic')}
Ask what is missing: every item of section 9's slice 2 and of sections 2.1, 2.3, 2.4, 4 that slice 2 owns, every CAS-52..54 case in section 8 this slice can reach, every section-8 property owned by slice 2, the ADR's required content (section 9's last paragraph and decisions), test-matrix and synth rows word for word, mutation coverage of every new source file (draft.ts included or argued), a lens no review ran, a claim no one verified. History of the reviews: ${JSON.stringify(history).slice(0, 20000)}. Report each gap as a finding with a reproduction (a command or a missing file/test); ids CRITIC-1, ...
${SAVE('pfp2r2-critic.md', 'items checked')}
${RULES}`, { label: 'critic', phase: 'Critic', schema: REVIEW })
const criticJudged = await verify(critic?.findings ?? [], 'critic')
const criticConfirmed = criticJudged.filter((f) => f.confirmed)
let criticFix = null
if (criticConfirmed.length) criticFix = await fixAndRecheck(criticConfirmed, 'critic')
return { carry: carryJudged, equiv, history, seen, critic: criticJudged.map((f) => ({ id: f.id, severity: f.severity, title: f.title, confirmed: f.confirmed })), criticFix, lastRecheckNew: (criticFix ?? state)?.recheck?.newFindings ?? [] }
