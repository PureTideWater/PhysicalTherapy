export const meta = {
  name: 'lane-b-packet-day-counts-delta-rereview-2',
  description: 'PR #84 round 2: the payment-engine review of the delta at d7d587a2 (skeptic-checked), then fix and recheck NEW-N1..N3 and any confirmed finding until a dry recheck (cap 3)',
  phases: [{ title: 'Round 2' }, { title: 'Converge' }],
}
const recheck = { newFindings: args.open }
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/70ab2f76-1059-5c68-8649-2c2eeea1fb4d/scratchpad'
const WT = '/home/user/packet-day-counts'
const FROM = '1c423691'
const HEAD = 'ac727b15'
const BASEPREV = '88708069'
const FINDINGS = '/home/user/ops/approval-summaries/lane-b-packet-day-counts-reviews.md'
const SESSION = 'https://claude.ai/code/session_019i9ifAd3jhRt1Vkzz2vUSQ'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const SAVE = (f, what) => `Keep ${SP}/progress/${f} up to date as you go (${what}). If it already exists when you start, an earlier run was interrupted: read it and continue from where it stopped.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; every heavy command (install, typecheck, lint, test, Stryker) under \`flock /tmp/laneb-heavy.lock\`. test:db needs DATABASE_URL=postgres://postgres:test@localhost:5433/postgres. eslint may need NODE_OPTIONS=--max-old-space-size=6144. Synthetic data only. No model name or identifier in any file, commit or comment. No migration and no edit of docs/product/domain-model.md (Postgres-side work is "for Lane A"). Stay off every file in /home/user/ops/LANES.md's "Not while #42 is open" list if it still applies. Never push co-001/packet-day-counts; never force; never --no-verify. Long commands: run_in_background and wait. Do NOT run the full suite (CI is the suite of record; the full local suite runs once later on the final tree). You MUST finish by returning the structured result.`
const CONTEXT = `PR #84 (PureTideWater/PhysicalTherapy, co-001/packet-day-counts): the packet narrative verifier reads every figure in the role its words give it (ADR 0086; packages/packets roles-reader/, roles-words/, facts.ts, verifier/, check.ts; the gateway pre-call role check in packages/model-gateway; the browser editor in apps/web/src/components/packets; verifierNow() in apps/worker/src/packets/verifier-now.ts used at request, approval, export and display). The review round of 2026-11-01 (findings in ${FINDINGS}, 28 distinct defects, 9 blocking) was answered by the fix round: part 1 8b6041b8, part 2 bf849464, part 3 5a9db3b3 (the Stryker split by word family, 13 packets shards; respectively()), then the base ${BASEPREV} merged as ${HEAD} (conflict in apps/web/src/components/test-support/browser.ts resolved). Review ONLY the delta ${FROM}..${HEAD} (\`git diff ${FROM} ${HEAD}\`, excluding what came from the base: compare with \`git diff ${BASEPREV} ${HEAD}\` for the merge's own resolution). Earlier review rounds stand; do not re-raise findings already recorded in ${FINDINGS} unless the fix for them is wrong or incomplete (say which id).`
const CLONE = (dir) => `Work in your own clone ${dir}: if absent, \`git clone -q ${WT} ${dir}\`; then \`git -C ${dir} fetch -q ${WT} HEAD && git -C ${dir} checkout -q -f ${HEAD}\` and \`pnpm install --frozen-lockfile\` under the lock (skip if already installed at this lockfile). Read-only: probes only as temporary test files you delete after.`
const FINDING = { type: 'object', required: ['id', 'severity', 'file', 'title', 'detail', 'reproduction', 'fix'], properties: { id: { type: 'string' }, severity: { type: 'string', description: 'blocking | should fix | nit' }, file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string', description: 'exact input; observed vs expected; what you ran' }, fix: { type: 'string' } } }
const REVIEW = { type: 'object', required: ['verdict', 'findings', 'checked'], properties: { verdict: { type: 'string' }, checked: { type: 'string', description: 'what you checked and ran, briefly' }, findings: { type: 'array', items: FINDING } } }
const VERDICTS = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'real', 'severity', 'reason'], properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string' }, reason: { type: 'string' } } } } } }
const FIX = { type: 'object', required: ['applied', 'notApplied', 'checks', 'commit'], properties: { applied: { type: 'array', items: { type: 'object', required: ['id', 'how'], properties: { id: { type: 'string' }, how: { type: 'string' } } } }, notApplied: { type: 'array', items: { type: 'object', required: ['id', 'why'], properties: { id: { type: 'string' }, why: { type: 'string' } } } }, checks: { type: 'string' }, commit: { type: 'string' } } }

const REVIEWERS = [
  { key: 'pe', agentType: 'payment-engine-reviewer', text: 'Adversarial payment-engine review against .claude/agents/payment-engine-reviewer.md\'s checklist: can a wrong figure, role, date, day count or amount pass to a payer; can a correct narrative fail in normal use; is the gateway check at least as strict as the base on every swap the base caught (check the committed base-strictness test really runs the base check); does verifierNow() really gate request, approval, export and every "Verifier passed"; the mutation gate and the equivalents recorded in tools/stryker/equivalent/packets.json honest (no real survivor recorded as equivalent).' },
  { key: 'corr', agentType: undefined, text: 'Adversarial correctness review: the reader split (roles-reader/, roles-words/) keeps behaviour; respectively(); cue choice per figure; quoted texts; year lead vs count nouns; the editor\'s per-keystroke reading; the shards.json / base.mjs / vitest.mutation.config.ts / seed-setup.ts changes (does stopping properties at the first counterexample unshrunk or reordering tests change any verdict; does every packets source file still sit in exactly one shard; is watched-paths complete); the base merge\'s browser.ts resolution keeps both sides. Write probes and run them.' },
  { key: 'ux', agentType: 'ux-brand-reviewer', text: 'UX and brand review of what a person sees in the delta, by reading code and rendering components in tests (no screen tour capture in this round; say so): the editor\'s mismatch words and live check, the "Verifier passed"/failed states on a stored version the current reading fails, the refused request and approval messages, focus and announcements (WCAG 2.1 AA with 2.2), the brand voice and plain words. Also the 2026-10-28 UX should-fix items the reviews file mentions, if the delta was meant to answer them.' },
]
const SKEPTICS = [
  { key: 'reproduce', text: 'does-it-reproduce: run each reproduction exactly as written, then one variant; real only if you see the defect at ' + HEAD },
  { key: 'intent', text: 'intent and scope: is it intended by ADR 0086, the design (/home/user/ops/designs/lane-b-packet-day-counts.md) or the item scope, already recorded in the reviews file, or in base code this PR did not change; real only if it is a defect in this delta this PR should fix' },
]

const verify = async (findings, tag) => {
  if (!findings.length) return []
  const sets = await parallel(SKEPTICS.map((l) => () => agent(`You are a skeptical verifier. Try to REFUTE each finding below about ${CONTEXT}
${CLONE(SP + '/verify-' + l.key)}
Your lens: ${l.text}. Default real=false when you cannot confirm it. Severity: blocking = a wrong figure can pass to a payer, a right narrative fails in normal use, the gateway is less strict than the base, an approvable or "Verifier passed" stored version the current reading fails, a mutation shard over 30 minutes, or an accessibility failure; else should fix or nit. Findings: ${JSON.stringify(findings)}
${SAVE(`pdc4-verify-${tag}-${l.key}.md`, 'each finding: verdict and what you ran')}
${RULES}`, { label: `verify-${tag}-${l.key}`, phase: tag === 'recheck' ? 'Recheck' : 'Verify', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  return findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length === 2 || ((votes[f.id] ?? []).length === 1 && votes[f.id][0].real) }))
}

phase('Round 2')
const HEAD2 = 'the worktree HEAD (d7d587a2 or later; read `git -C ' + WT + ' rev-parse HEAD`)'
const CLONE2 = (dir) => `Work in your own clone ${dir}: if absent, \`git clone -q ${WT} ${dir}\`; then \`git -C ${dir} fetch -q ${WT} HEAD && git -C ${dir} checkout -q -f FETCH_HEAD\` and \`pnpm install --frozen-lockfile\` under the lock (skip if installed at this lockfile). Read-only: probes only as temporary test files you delete after. Keep any fuzz or probe output in a file and read only counts and at most 20 example lines from it: never print or read a large dump.`
const pe2 = await agent(`${CONTEXT}
Round 2: the delta is now ${FROM}..${HEAD2}; it adds d7d587a2 (fixes for CORR-D1, CORR-D2, UX-D1, UX-D3 of round 1). Known open from round 1's recheck, do NOT re-raise them: ${JSON.stringify((recheck?.newFindings ?? []).map((f) => ({ id: f.id, title: f.title })))}.
${CLONE2(SP + '/review-pe2')}
${REVIEWERS[0].text}
An earlier attempt of this review stopped at its turn limit; its candidates are in the progress file below (PE-D1..PE-D3): confirm or drop each with a fresh reproduction, then finish the checklist.
Report every real defect with an exact reproduction; ids PE-D1, PE-D2, ... No findings is a valid result. Return the structured result even if your time runs short: report what you have.
${SAVE('pdc4-review-pe2.md', 'what you checked, each candidate finding with its reproduction')}
${RULES}`, { label: 'review-pe2', phase: 'Round 2', schema: REVIEW })
const pe2judged = await verify(pe2?.findings ?? [], 'pe2')
let open = [...(recheck?.newFindings ?? []), ...pe2judged.filter((f) => f.confirmed)]
log(`round 2: payment-engine ${pe2 ? (pe2.findings.length + ' findings, confirmed ' + (pe2judged.filter((f) => f.confirmed).map((f) => f.id).join(', ') || 'none')) : 'returned nothing'}; open ${open.map((f) => f.id).join(', ') || 'none'}`)
const rounds = []
let n = 0
while (open.length && n < 3) {
  n++
  const fx = await agent(`${CONTEXT}
You are the fixer, round 2 pass ${n}, in the worktree ${WT} (HEAD as it is now). Apply every finding below (the recheck's own findings, or confirmed by two skeptics). Recommended fix; the safer option for a false pass; keep legitimate narratives passing; every reproduction a named CAS-43 or CAS-44 example (failing ones CAS-43, passing controls CAS-44); keep ADR 0086, the CAS-43/CAS-44 test-matrix rows and the synth matrix word for word with the behaviour (then \`pnpm synth --case\` each, commit regenerated files); \`watched.ts --write\` if files were added. Fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all with no diff) and the tests you touched; for changed packets source, re-run the affected Stryker shards timed under the lock, each 100% or a reviewed equivalent, each under ~12 min. Findings: ${JSON.stringify(open)}
Commit (message describing the change, a blank line, then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"), then \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip-packet-day-counts-2\` (fast-forward; nothing else; never bypass the hook).
${SAVE(`pdc4-fix2-${n}.md`, 'each finding: done or not, checks run')}
${RULES}`, { label: `fixer2-${n}`, phase: 'Round 2', schema: FIX })
  const rc = await agent(`${CONTEXT}
Recheck round 2 pass ${n}, read-only, in your own clone of the worktree HEAD (the fixer's commit ${fx?.commit ?? ''}). ${CLONE2(SP + '/recheck2')} For each finding below run its reproduction and one variant and say whether it is fixed; then review the fixer's diff adversarially (payment-engine checklist and correctness) for anything it broke, especially scope and cue reach past a clause edge, and list only real new defects with exact reproductions. Findings: ${JSON.stringify(open.map((f) => ({ id: f.id, title: f.title, reproduction: f.reproduction })))}; fixer report: ${JSON.stringify(fx)}.
${SAVE(`pdc4-recheck2-${n}.md`, 'each finding: fixed or not; new defects')}
${RULES}`, { label: `recheck2-${n}`, phase: 'Round 2', schema: { type: 'object', required: ['perFinding', 'newFindings'], properties: { perFinding: { type: 'array', items: { type: 'object', required: ['id', 'fixed', 'evidence'], properties: { id: { type: 'string' }, fixed: { type: 'boolean' }, evidence: { type: 'string' } } } }, newFindings: { type: 'array', items: FINDING } } } })
  rounds.push({ n, fix: fx, recheck: rc })
  const notFixed = open.filter((f) => !(rc?.perFinding ?? []).find((p) => p.id === f.id && p.fixed))
  open = [...notFixed, ...((rc?.newFindings ?? []).map((f) => ({ ...f, id: `R${n}-${f.id}` })))]
  log(`round 2 pass ${n}: open ${open.map((f) => f.id).join(', ') || 'none (dry)'}`)
}
if (open.length) log(`round 2 stopped at the cap with open: ${open.map((f) => f.id).join(', ')}`)
const r2result = { pe2: pe2 ? { verdict: pe2.verdict, checked: pe2.checked, judged: pe2judged } : null, rounds, open }

// Converge (added 2026-11-04 06:25 UTC by the session): the loop above chased phrasings pass after pass. Decision: a closed,
// fail-closed rule set for scope and "respectively", so every unrecognised form fails with a plain instruction instead of a guess.
phase('Converge')
const reopened = pe2judged.filter((f) => !f.confirmed && (f.verdicts ?? []).some((v) => v.real))
const allRepros = [...(args.open ?? []), ...pe2judged, ...rounds.flatMap((r) => r.recheck?.newFindings ?? [])].map((f) => ({ id: f.id, severity: f.severity, title: f.title, reproduction: f.reproduction }))
const DECISION = `The decision (the session's, by the founder's standing rule: accuracy and AI safety first, then maintainability; a false pass sends a wrong figure to a payer, a false failure only makes a person reword):
1. A figure's scope (per line / total) is read only from (a) words inside its own clause, bounded by edges (comma, semicolon, colon, dash, parenthesis) and by a coordinating conjunction or subordinator that opens a new clause, with the existing 7-token cap; or (b) one sentence-opening scope phrase ("For each line,", "On each of the N lines,", "In total,", "For the claim,") that covers the whole sentence unless a clause states its own. No other reach: nothing from a trailing clause, nothing across a figure.
2. When the sentence's words give a figure no scope by 1, and the per-line and total values of its role differ, the figure FAILS with a new mismatch kind (or the existing closest one) whose editor words say plainly: state whether this figure is per line or in total. Never hold an unscoped figure to both values. (Where per-line and total are equal, or the role has one value, it passes as now.)
3. "respectively" is read only in two plain forms: cues directly before the list ("The contract expected and the payer allowed $A and $B, respectively") or cues directly after it ("$A and $B were (the) expected and allowed (amounts), respectively" / "$A and $B, respectively, were the expected and allowed amounts"), where between the list and its cues there are only cue words, determiners, "were/are", "amounts", scope words given per cue, and "and"/commas; the cue count must equal the figure count. A per-cue scope maps in order. Any other "respectively" sentence: every figure of the list FAILS with editor words saying: give each figure its own words instead of "respectively". Never fall back to per-figure guessing or to 'any'.
4. Keep everything else the reader does (cue choice per figure, quotes in their own role, year lead vs count nouns) unchanged.`
const conv = await agent(`${CONTEXT}
You are the converging fixer, in the worktree ${WT} (HEAD now 9aa178c0 or later; read it). Rounds of fix-and-recheck on scope and "respectively" (commits d7d587a2, 063274c8, 6b49d9ac, 9aa178c0) kept adding heuristics and regressions. Replace that heuristic reach with this closed rule set:
${DECISION}
Simplify the code to match (remove reach heuristics such as openingEach's clause-walking and opensClause's special cases that the rules no longer need); keep the module layout and shard files (roles-reader/, roles-words/).
Every reproduction below becomes a named example: a false pass must FAIL; a false failure must PASS when its sentence is in a recognised form, else FAIL with the plain instruction (list which ones and why). Put failing ones in CAS-43 and passing ones in CAS-44 tests (roles.test.ts, verifier.test.ts, the gateway's narrative-roles tests). Prove the gateway stays at least as strict as the base (the committed base-strictness test). Property tests: an unscoped figure where per-line != total fails; a canonical respectively list in both forms maps in order and a swap fails; a non-canonical respectively fails; run each property over 40 seeds and report zero failures. Update ADR 0086 to state the closed rules word for word (and its amendment paragraphs if affected), the editor words (apps/web/src/lib/packets and components/packets: plain, brand voice, the figure marked), the CAS-43/CAS-44 test-matrix rows and the synth matrix, then \`pnpm synth --case CAS-43\` and \`--case CAS-44\`. Fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all no diff) and the touched tests; then re-run every packets Stryker shard the change touches, timed under the lock, each 100% or reviewed equivalent and under ~12 min, and the gate per shard.
Reproductions (all rounds so far, including PE-D1 and PE-D3 which a verifier wrongly checked at the old head): ${JSON.stringify(allRepros)}
Commit (message describing the change, blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}"), then \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip-packet-day-counts-2\` (fast-forward, nothing else; never bypass the hook). In your result's checks, list each reproduction id with its verdict now.
${SAVE('pdc5-converge.md', 'rules implemented, each reproduction id and its verdict, checks run')}
${RULES}`, { label: 'fixer-converge', phase: 'Converge', schema: FIX })

const VLENS = [
  { key: 'reproduce', text: 'does-it-reproduce at the worktree HEAD: run each reproduction exactly as written, then one variant; real only if you see it' },
  { key: 'intent', text: 'intent: is it what the closed rule set decides (a non-canonical form failing WITH the plain instruction is by design, real=false), already recorded, or base code this PR did not change; real only if it is a defect against the rules or a false pass' },
]
const verify2 = async (findings, tag) => {
  if (!findings.length) return []
  const sets = await parallel(VLENS.map((l) => () => agent(`You are a skeptical verifier. Try to REFUTE each finding below about ${CONTEXT}
The closed rule set now in force: ${DECISION}
${CLONE2(SP + '/verify2-' + l.key)} Check out exactly the worktree HEAD (git -C ${WT} rev-parse HEAD), never an older commit.
Your lens: ${l.text}. Default real=false when you cannot confirm it. Severity: blocking = a false pass of any figure (wrong role or scope reaches a payer), the gateway less strict than the base, a canonical form refused, an unscoped/non-canonical refusal without the plain instruction, an approvable stored version the reading fails, a mutation shard over 30 minutes; else should fix or nit. Findings: ${JSON.stringify(findings)}
${SAVE(`pdc5-verify-${tag}-${l.key}.md`, 'each finding: verdict and what you ran')}
${RULES}`, { label: `verify2-${tag}-${l.key}`, phase: 'Converge', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  return findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length >= 2 || ((votes[f.id] ?? []).length === 1 && votes[f.id][0].real) }))
}
const REV2 = [
  { key: 'pe3', text: 'Adversarial payment-engine review (the checklist in .claude/agents/payment-engine-reviewer.md): hunt for any false pass (a figure in the wrong role or scope that passes, in the verifier or the gateway), the gateway against the base, verifierNow at request/approval/export/display, the mutation gate honest. Fuzz if useful.' },
  { key: 'corr3', text: 'Adversarial correctness review: does the code implement the closed rules exactly (no remaining reach heuristics; canonical respectively forms pass and map in order; non-canonical and unscoped-ambiguous figures fail with the plain instruction); do the editor words read plainly and mark the figure; ADR 0086, matrix and synth match; property tests sound and seeded; no regressions elsewhere in the reader.' },
]
const conv2 = (await pipeline(REV2,
  (r) => agent(`${CONTEXT}
Review the converging commit(s) on top of 9aa178c0 (\`git log 9aa178c0..HEAD\` in your clone) and the reader as it now stands, against this decision: ${DECISION}
${CLONE2(SP + '/review-' + r.key)} Check out exactly the worktree HEAD.
${r.text}
Report every real defect with an exact reproduction; ids ${r.key.toUpperCase()}-1, -2, ... No findings is a valid result. Return the structured result even if your time runs short.
${SAVE(`pdc5-review-${r.key}.md`, 'what you checked, each candidate finding')}
${RULES}`, { label: `review-${r.key}`, phase: 'Converge', schema: REVIEW }),
  (rev, r) => verify2(rev?.findings ?? [], r.key).then((v) => ({ reviewer: r.key, verdict: rev?.verdict, checked: rev?.checked, judged: v })),
)).filter(Boolean)
const conf2 = conv2.flatMap((j) => j.judged.filter((f) => f.confirmed))
log(`converge review: confirmed ${conf2.map((f) => f.id + ' ' + f.severity).join(', ') || 'none'}`)
let fixC = null, recC = null
if (conf2.length) {
  fixC = await agent(`${CONTEXT}
You are the fixer after the converging review, in ${WT}. The rules in force: ${DECISION}
Apply each confirmed finding within those rules (never by adding reach heuristics: where a sentence is outside the recognised forms, it fails with the plain instruction). Same duties as before: named CAS-43/CAS-44 examples, ADR/matrix/synth word for word, fast checks, touched tests, affected Stryker shards timed and gated. Findings: ${JSON.stringify(conf2)}
Commit (same trailer lines, Claude-Session: ${SESSION}) and push only \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip-packet-day-counts-2\`.
${SAVE('pdc5-fix-after.md', 'each finding: done or not, checks run')}
${RULES}`, { label: 'fixer-after-converge', phase: 'Converge', schema: FIX })
  recC = await agent(`${CONTEXT}
Recheck, read-only, at the worktree HEAD in your own clone. ${CLONE2(SP + '/recheck3')} The rules in force: ${DECISION}
For each finding run its reproduction and one variant: fixed or not. Then review the fixer's diff for any false pass it opened. Findings: ${JSON.stringify(conf2.map((f) => ({ id: f.id, title: f.title, reproduction: f.reproduction })))}; fixer report: ${JSON.stringify(fixC)}.
${SAVE('pdc5-recheck.md', 'each finding: fixed or not; new defects')}
${RULES}`, { label: 'recheck-converge', phase: 'Converge', schema: { type: 'object', required: ['perFinding', 'newFindings'], properties: { perFinding: { type: 'array', items: { type: 'object', required: ['id', 'fixed', 'evidence'], properties: { id: { type: 'string' }, fixed: { type: 'boolean' }, evidence: { type: 'string' } } } }, newFindings: { type: 'array', items: FINDING } } } })
}
return { r2: { pe2Confirmed: pe2judged.filter((f) => f.confirmed).map((f) => f.id), reopened: reopened.map((f) => f.id), passes: rounds.map((r) => ({ n: r.n, commit: r.fix?.commit, open: (r.recheck?.newFindings ?? []).map((f) => f.id) })) }, conv, conv2, fixC, recC }
