export const meta = {
  name: 'lane-b-packet-figure-placeholders-slice-1',
  description: 'Placeholder item slice 1: build the fact catalog and renderer (no behaviour change), two money reviews and a correctness review with two skeptics each, one fixer, one recheck',
  phases: [{ title: 'Build' }, { title: 'Review' }, { title: 'Fix' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/70ab2f76-1059-5c68-8649-2c2eeea1fb4d/scratchpad'
const WT = '/home/user/packet-figure-placeholders'
const DESIGN = '/home/user/ops/designs/lane-b-packet-figure-placeholders.md'
const SESSION = 'https://claude.ai/code/session_019i9ifAd3jhRt1Vkzz2vUSQ'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const WIP = 'co-001/wip-packet-figure-placeholders'
const SAVE = (f, what) => `Keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, an earlier run was interrupted: read it and continue.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; every heavy command (install, typecheck, lint, the package's tests, Stryker) under \`flock /tmp/laneb-heavy.lock\`; long commands in the background, logs in ${SP}/pfp1/, read only tails. Synthetic data only; no model name or identifier in any file, commit or comment. Money is integer cents (bigint); never a float on an amount. No migration; no edit of docs/product/domain-model.md. packages/pricing and packages/ledger are frozen (CO-001 rule 4). Never push the branch co-001/packet-figure-placeholders and never force or --no-verify: commits go to the WIP ref only (\`${GL} git -C ${WT} push origin HEAD:refs/heads/${WIP}\`, fast-forward). Do not run the full suite. You MUST finish by returning the structured result.`
const CONTEXT = `PaidWhole; worktree ${WT} on branch co-001/packet-figure-placeholders, cut from claude/build-platform 7fb3e102 (#84 merged: ADR 0086's role reader). The item: the narrative's figures become placeholders bound to fact ids, rendered by code (design ${DESIGN}, reviewed; read sections 0, 1, 5, 6, 8, 9, 10 and 11 whole). This run builds ONLY rollout slice 1 (section 9): "Catalog and renderer (packages/packets: fact-catalog.ts with canonical ids, render.ts, word table, narrativeFacts from the catalog, WORDS_VERSION inputs; @tp/money formatUsdPlain with its golden test). No behavior change: nothing emits tokens yet. CAS-55's render half." Reserved: test-matrix CAS-52..CAS-55 (this slice: CAS-55's render half only); ADR 0089 belongs to slice 2's PR, not this one.`
const FINDING = { type: 'object', required: ['id', 'severity', 'file', 'title', 'detail', 'reproduction', 'fix'], properties: { id: { type: 'string' }, severity: { type: 'string', description: 'blocking | should fix | nit' }, file: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' } } }
const REVIEW = { type: 'object', required: ['verdict', 'findings'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: FINDING } } }
const VERDICTS = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'real', 'severity', 'reason'], properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string' }, reason: { type: 'string' } } } } } }
const BUILT = { type: 'object', required: ['commit', 'summary', 'checks'], properties: { commit: { type: 'string' }, summary: { type: 'string' }, checks: { type: 'string' } } }
const CLONE = (dir) => `Work read-only in your own clone ${dir}: if absent, \`git clone -q ${WT} ${dir}\`; then \`git -C ${dir} fetch -q ${WT} HEAD && git -C ${dir} checkout -q -f FETCH_HEAD\` and \`pnpm install --frozen-lockfile\` under the lock. Probes only as temporary test files you delete after. Keep probe output in files and read only counts and short excerpts.`

phase('Build')
const build = await agent(`${CONTEXT}
You are the builder, in ${WT}. Build slice 1 exactly as the design specifies (the catalog's ids and their grammar, canonical row sets, kinds, roles, scopes and phrases; renderFacts with Segment output and the span map; the word table; narrativeFacts rebuilt from the catalog so the two cannot drift, its output unchanged for every existing input (prove it: the existing packets tests, the gateway's narrative-roles tests and ADR 0086's REVIEWED examples pass unchanged); WORDS_VERSION inputs; @tp/money formatUsdPlain with a golden test; and the design's answers to the reviews in section 11 that concern slice 1, e.g. HCPCS and modifier ids, unit sums, derived sums tied to stored totals, one value one id). Nothing emits tokens yet; no prompt, verifier format, worker or web change. Tests: unit and property tests for the catalog and renderer (seeded per the repo convention; each property over 40 seeds once), golden renders, CAS-55's render half as named examples; add the CAS-55 row to docs/product/test-matrix.md and the synth matrix word for word (registry entry as the CAS module does) and run \`pnpm synth --case CAS-55\` (check the CLI). If new source files join packages/packets, add them to a mutation shard in stryker/shards.json (and its tests, docs/runbooks/ci.md's shard table, \`watched.ts --write\`), run that shard timed under the lock and the gate for it (each under ~12 min; every survivor killed or a reviewed equivalent). Fast checks: typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all with no diff; the packets, money and model-gateway unit tests.
Commit (a message describing the change, a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}") and push only to the WIP ref as the rules say.
${SAVE('pfp1-build.md', 'files, decisions, checks')}
${RULES}`, { label: 'builder', phase: 'Build', schema: BUILT })

phase('Review')
const LENSES = [
  { key: 'money-a', text: 'payment-engine checklist (.claude/agents/payment-engine-reviewer.md), money A: every rendered figure computed by code from integer cents and traceable to the content; sums over row sets in bigint and tied to the stored totals; rounding and formatting (formatUsdPlain, negatives, zero, large values, cents); units and their formatting; no float anywhere.' },
  { key: 'money-b', text: 'payment-engine checklist, money B, adversarial on ids: can two ids name one value or one id two values; canonical row sets; HCPCS/CPT/modifier ids; a claim, a code or a row set that does not exist; ids an attacker or a model could craft (length, characters); narrativeFacts from the catalog: is it exactly the old output for every content (differential test over synth contents and random ones).' },
  { key: 'correctness', text: 'correctness and maintainability: the design followed (sections 1, 5, 11), no behaviour change anywhere (nothing emits tokens; every existing test unchanged), the span map, the word table and WORDS_VERSION, tests that would catch a regression, mutation shard coverage, file layout.' },
]
const SKEPTICS = [
  { key: 'reproduce', text: 'does-it-reproduce: run the reproduction exactly, then one variant; real only if you see it' },
  { key: 'intent', text: 'intent and scope: intended by the design or deferred to a later slice there (then real=false, say where), or a real defect of this slice' },
]
const verify = async (findings, tag) => {
  if (!findings.length) return []
  const sets = await parallel(SKEPTICS.map((l) => () => agent(`You are a skeptical verifier. Try to REFUTE each finding about ${CONTEXT}
${CLONE(SP + '/pfp1-verify-' + l.key)}
Lens: ${l.text}. Default real=false when unsure. Findings: ${JSON.stringify(findings)}
${SAVE(`pfp1-verify-${tag}-${l.key}.md`, 'each finding: verdict and what you ran')}
${RULES}`, { label: `verify-${tag}-${l.key}`, phase: 'Review', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  return findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length === 2 || ((votes[f.id] ?? []).length === 1 && votes[f.id][0].real) }))
}
const judged = (await pipeline(LENSES,
  (l) => agent(`${CONTEXT}
Adversarially review the builder's slice 1 (\`git log 7fb3e102..HEAD\` in your clone; builder report: ${JSON.stringify(build)}) under this lens: ${l.text}
${CLONE(SP + '/pfp1-review-' + l.key)}
Report every real defect with an exact reproduction; ids ${l.key.toUpperCase()}-1, ... No findings is valid. Return the structured result even if your time runs short.
${SAVE(`pfp1-review-${l.key}.md`, 'checks and candidates')}
${RULES}`, { label: `review-${l.key}`, phase: 'Review', schema: REVIEW }),
  (rev, l) => verify(rev?.findings ?? [], l.key).then((v) => ({ lens: l.key, verdict: rev?.verdict, judged: v })),
)).filter(Boolean)
const confirmed = judged.flatMap((j) => j.judged.filter((f) => f.confirmed))
log(`reviews: confirmed ${confirmed.map((f) => f.id + ' ' + f.severity).join(', ') || 'none'}`)

phase('Fix')
let fix = null, recheck = null
if (confirmed.length) {
  fix = await agent(`${CONTEXT}
You are the fixer, in ${WT}. Apply every confirmed finding (verdicts included): ${JSON.stringify(confirmed)}
Same duties as the builder: tests for each, the fast checks, the touched tests, the affected mutation shard timed with its gate. Commit (same trailer lines) and push only to the WIP ref.
${SAVE('pfp1-fix.md', 'each finding: done or not, checks')}
${RULES}`, { label: 'fixer', phase: 'Fix', schema: { type: 'object', required: ['applied', 'notApplied', 'checks', 'commit'], properties: { applied: { type: 'array', items: { type: 'string' } }, notApplied: { type: 'array', items: { type: 'string' } }, checks: { type: 'string' }, commit: { type: 'string' } } } })
  recheck = await agent(`${CONTEXT}
Recheck, read-only, at the worktree HEAD. ${CLONE(SP + '/pfp1-recheck')} For each finding run its reproduction: fixed or not. Then review the fix's diff adversarially (money lens) for anything it broke. Findings: ${JSON.stringify(confirmed.map((f) => ({ id: f.id, title: f.title, reproduction: f.reproduction })))}; fixer: ${JSON.stringify(fix)}
${SAVE('pfp1-recheck.md', 'each finding: fixed or not; new defects')}
${RULES}`, { label: 'recheck', phase: 'Fix', schema: { type: 'object', required: ['perFinding', 'newFindings'], properties: { perFinding: { type: 'array', items: { type: 'object', required: ['id', 'fixed', 'evidence'], properties: { id: { type: 'string' }, fixed: { type: 'boolean' }, evidence: { type: 'string' } } } }, newFindings: { type: 'array', items: FINDING } } } })
}
return { build, judged, confirmed: confirmed.map((f) => f.id), fix, recheck }
