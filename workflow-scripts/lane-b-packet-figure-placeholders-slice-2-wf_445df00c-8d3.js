export const meta = {
  name: 'lane-b-packet-figure-placeholders-slice-2',
  description: 'Placeholder item slice 2: build verifier /3 behind the format constant in two parts, four adversarial reviews (money A, money B, security fail-closed, test quality) with two skeptics each, one fixer, one recheck',
  phases: [{ title: 'Build' }, { title: 'Review' }, { title: 'Fix' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/c2e93384-1207-544a-bf87-57602f4a49c5/scratchpad'
const WT = '/home/user/pfp2'
const DESIGN = '/home/user/ops/designs/lane-b-packet-figure-placeholders.md'
const SESSION = 'https://claude.ai/code/session_01FcouKPkXdRW5ntz6ye92pL'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const WIP = 'co-001/wip-packet-figure-placeholders-2'
const BASE = 'cc3dd7f6'
const SAVE = (f, what) => `Keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, an earlier run was interrupted: read it and continue from it.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; every heavy command (install, typecheck, lint, a package's tests, Stryker) under \`flock /tmp/laneb-heavy.lock\`; long commands in the background with logs in ${SP}/pfp2/, read only tails and counts. Synthetic data only; no model name or identifier in any file, commit or comment. Money is integer cents (bigint); never a float on an amount. No migration; no edit of docs/product/domain-model.md or packages/db/functions. packages/pricing and packages/ledger are frozen. Never push the branch co-001/packet-figure-placeholders-2 and never force or --no-verify: commits go to the WIP ref only (\`${GL} git -C ${WT} push origin HEAD:refs/heads/${WIP}\`, fast-forward). A gitleaks refusal is fixed by rewriting the flagged text, never by .gitleaksignore. Do not run the full suite. You MUST finish by returning the structured result.`
const CONTEXT = `PaidWhole; worktree ${WT} on branch co-001/packet-figure-placeholders-2, cut from claude/build-platform ${BASE} (#128 merged: slice 1, the fact catalog packages/packets/src/fact-catalog.ts, render.ts, fact-words.ts, factPlaceholderPattern/isFactId/factPlaceholder in placeholders.ts, formatUsdPlain in @tp/money). The item: a packet narrative's figures become placeholders bound to fact ids, rendered by code (design ${DESIGN}, reviewed; read sections 0 to 6, 8, 9, 10 and 11 whole). This run builds ONLY rollout slice 2 (section 9): "Verifier /3 behind the format constant. Masking, strict scanning with the scanner's tables extended and exported, the new codes, pass 2 contradiction in both directions, the span map, rendered_sha256 and serializeDraft. The draft emits tokens. VERIFIER_FORMAT stays /2 until slice 3. CAS-52, 53 and 54." Plus ADR 0089 (section 9's last paragraph; ADR 0086's "Revisit when" item marked done). Reserved: ADR 0089, test-matrix CAS-52, CAS-53, CAS-54 (CAS-55 is used by slice 1). Out of scope (later slices): the migration (3), worker export/approval/verifierNow/schedule_changed (4), the web picker/preview (5; but keep the web typecheck green: an exhaustive switch such as apps/web/src/lib/packets/view.ts mismatchShown gets plain cases for the new codes in the voice of .claude/rules/brand.md), the gateway prompt v2/schema (6), the eval set (7).
DECISIONS ALREADY TAKEN (follow them; record them in ADR 0089):
(a) Nothing served changes. VERIFIER_FORMAT stays 'tp-packet-verifier/2'. /3 is reachable only by an explicit format argument (e.g. a verifyTemplate/verify-at-format entry that takes the template, the PacketContent (for the catalog) and the identifiers); every existing caller (web, worker, gateway, eval) keeps its current /2 behaviour byte for byte. The code draft (packages/packets/src/draft.ts draftNarrative) emits {{fact:<id>}} tokens only when asked for /3 (an explicit option); its default /2 output is byte-identical to today's (prove it with a differential test over synth contents and the property generator), so the gateway's local provider (packages/model-gateway/src/testing.ts) and every test still see today's text.
(b) Fail closed on tokens. Under /2, any {{fact:...}} token or any stray {{ / }} fails (as an unknown placeholder or the existing code) and never passes; under /3, any {{ or }} that neither the fact pattern nor the identifier pattern reads is unknown_fact; a well-formed id the catalog does not hold is unknown_fact; a non-canonical id is fact_not_canonical with the canonical id carried in the mismatch; malformed tokens are never echoed raw.
(c) /3 report = the /2 report keys plus rendered_sha256 (SHA-256 hex of the rendered text with identifier placeholders left unfilled), format 'tp-packet-verifier/3'; narrative_sha256 stays the hash of the stored template; passed = no mismatches. The report type allows both formats.
(d) Mismatch spans are in template offsets (via the renderer's span map) for pass-2 findings too.
(e) serializeDraft lives in packages/packets/src/serialize.ts, pure, per section 2.3 (segments, sources markers before final punctuation, '.' appended after a trailing fact, sentences joined by one space, paragraphs by blank line), with a zod-free plain type for the segment shape; the gateway does not use it yet.
(f) Strict mode: scan.ts's tables (UNITS, TEENS, TENS, MULTIPLIERS, SCALES, ORDINALS, MULTIPLES, NUMBER_WORDS) exported; the added words (zero, nil, nought, billion, quarter, double, triple, once, plurals, currency unit words, zero-amount phrases after a payment/allowance verb) are strict-only where non-strict reading must not change; non-strict scanning (used by ADR 0086's reader, redaction checks and anything else that imports scan.ts; find every importer) is unchanged: every existing scan/roles/gateway test passes unchanged.`
const FINDING = { type: 'object', required: ['id', 'severity', 'file', 'title', 'detail', 'reproduction', 'fix'], properties: { id: { type: 'string' }, severity: { type: 'string', description: 'blocking | should fix | nit' }, file: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' } } }
const REVIEW = { type: 'object', required: ['verdict', 'findings'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: FINDING } } }
const VERDICTS = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'real', 'severity', 'reason'], properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string' }, reason: { type: 'string' } } } } } }
const BUILT = { type: 'object', required: ['commit', 'summary', 'checks', 'openQuestions'], properties: { commit: { type: 'string' }, summary: { type: 'string' }, checks: { type: 'string' }, openQuestions: { type: 'string' } } }
const CLONE = (dir) => `Work read-only in your own clone ${dir}: if absent, \`git clone -q ${WT} ${dir}\`; then \`git -C ${dir} fetch -q ${WT} HEAD && git -C ${dir} checkout -q -f FETCH_HEAD\` and \`pnpm install --frozen-lockfile\` under the lock. Probes only as temporary test files you delete after. Keep probe output in files and read only counts and short excerpts.`
const COMMIT = `Commit (a message describing the change, a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}") and push only to the WIP ref as the rules say.`

phase('Build')
const build1 = await agent(`${CONTEXT}
You are builder part 1, in ${WT} (run \`pnpm install --frozen-lockfile\` there first, under the lock). Build PASS 1 of /3 and its plumbing:
- scan.ts: tables exported, strict mode (section 2.4's table, every row), masking of fact tokens first, then identifier placeholders and markers, so digits inside ids are never read.
- The new closed codes free_figure, number_word, unknown_fact, fact_not_canonical, fact_contradicted (the last used by part 2) added to MISMATCH_CODES and every exhaustive consumer (find them all: packets, web view.ts, worker, gateway eval score; keep each consumer's behaviour for /2 unchanged; a new code with no /3 caller yet only needs a plain case).
- The /3 entry point per decision (a) and the report per (c) (rendered_sha256 from slice 1's renderFacts output with identifiers unfilled), the fail-closed rules per (b) including /2's handling of fact tokens (add a /2 regression test that a fact token fails there), lookups through slice 1's lookupFact/canonicalFactId (one canonical rule shared with the catalog).
- Unit tests for each code at its span; CAS-52 and CAS-53 named examples (section 8's rows, every case listed there that this slice can reach; schedule_changed and the picker are later slices: say so in the row text).
Leave pass 2 (contradiction), serializeDraft, the draft tokens, ADR 0089, synth and the test-matrix rows to part 2, but leave clean seams for them. Fast checks: typecheck, lint, the packets, money, model-gateway, web and worker unit tests touched (\`pnpm --filter\` each), lint:logs.
${COMMIT}
${SAVE('pfp2-build1.md', 'files, decisions, checks')}
${RULES}`, { label: 'builder-1', phase: 'Build', schema: BUILT })

const build2 = await agent(`${CONTEXT}
You are builder part 2, in ${WT}. Part 1 is done: ${JSON.stringify(build1)} (read \`git log ${BASE}..HEAD\` and its progress file ${SP}/progress/pfp2-build1.md). Build the rest of slice 2:
- PASS 2 (section 4): the rendered text read by ADR 0086's reader for contradiction only, each token's role and scope authoritative from the catalog: the role cue; a part named beside an all-lines fact (closed trigger list and every part-naming token incl. identifier placeholders, with the covers-every-line exemption computed by code over row sets); a total/all-lines word beside a part fact (cue tables exported from roles-reader/cues.ts as the one list). fact_contradicted at template offsets via the span map.
- serializeDraft per decision (e) with unit tests and a property test (sentence count preserved; every verifier sentence carries its markers).
- draftNarrative emits tokens for /3 per decision (a), with the differential test that its /2 output is byte-identical; the property that the code draft of every generated pattern passes /3 (40 seeds, the repo's seeding convention).
- Property tests from section 8 that this slice owns (digit/word inserted from the exported tables fails at its span; a part-naming token beside an all-lines fact fails unless covering; a total cue beside a part fact fails).
- CAS-54 named examples incl. ADR 0086's known-limit sentences.
- ADR 0089 (docs/adr/0089-*.md, house format of docs/adr; decisions (a) to (f), the accepted false refusals of section 2.4, the residual English part names, real providers no_entry until a recorded v2 run, and that slice 3's VERIFIER_FORMAT flip must ship with or after slice 4's export render because the export prints only rendered text); ADR 0086's "Revisit when" item marked done (an amendment line, the house way); docs/adr index if there is one.
- Test-matrix rows CAS-52, CAS-53, CAS-54 in docs/product/test-matrix.md and the synth matrix word for word, synth registry entries as CAS-55's were done, synthetic cases in packages/synth, \`pnpm synth --case CAS-5x\` and \`pnpm synth --all\` with no unexpected diff.
- Mutation: add new source files to a packets mutation shard in stryker/shards.json (plus its tests, docs/runbooks/ci.md's shard table, \`watched.ts --write\` as slice 1 did); run each affected shard timed under the lock with its gate (each under about 12 min; every survivor killed by a test or recorded as a reviewed equivalent).
- Fast checks: typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all with no diff; the packets, money, model-gateway, web and worker unit tests.
${COMMIT}
${SAVE('pfp2-build2.md', 'files, decisions, checks, mutation scores and timings')}
${RULES}`, { label: 'builder-2', phase: 'Build', schema: BUILT })

phase('Review')
const LENSES = [
  { key: 'money-a', text: 'payment-engine checklist (.claude/agents/payment-engine-reviewer.md), money A: can any figure in a /3 narrative reach the payer that code did not compute from the content (a free-text figure the strict scanner misses: digits in any script, fullwidth, superscripts, Roman numerals, words, fractions, currency words, "paid nothing"); can a fact token be bound to the wrong value, role or set; rendered_sha256 computed over exactly what will print; masking that hides a real figure.' },
  { key: 'money-b', text: 'payment-engine checklist, money B, adversarial on contradiction and ids: pass 2 in both directions (a part named beside an all-lines total; a total word beside a part figure), the covering exemption (can a sentence cheat it), canonical ids and non-canonical spellings, ids for rows, claims and codes that do not exist, spans in template offsets; and that /2 behaviour is byte-identical for every existing caller (draft output, reports).' },
  { key: 'security', text: 'security, fail-closed tokens: every malformed, nested, partial, oversized, unicode-confusable or case-variant token ({{FACT:..}}, {{ fact:..}}, {{fact:..}}} , {{{fact}}, zero-width chars, fullwidth braces, an identifier placeholder inside a fact id, a fact token in /2) fails and is never printed raw or passed; no PHI in a hash (identifiers unfilled), a mismatch, a log or an error; regex denial-of-service on long inputs (time the scanner and the token patterns on 100k-character adversarial inputs); no new export of something PHI-bearing to the browser bundle.' },
  { key: 'test-quality', text: 'test quality: do the tests for CAS-52, CAS-53, CAS-54, serializeDraft, the /2 byte-identity differential and the properties actually fail when the code is wrong (try mutating the code: drop a strict word, skip the masking, flip a contradiction direction, break the exemption, change a span offset; each must turn a test red), seeds and determinism per the repo convention, the test-matrix rows match what is tested, mutation shard scores and equivalents justified, no skipped or weakened existing test.' },
]
const SKEPTICS = [
  { key: 'reproduce', text: 'does-it-reproduce: run the reproduction exactly, then one variant; real only if you see it' },
  { key: 'intent', text: 'intent and scope: intended by the design or the decisions above, or deferred to a later slice (then real=false, say which slice), or a real defect of this slice' },
]
const verify = async (findings, tag) => {
  if (!findings.length) return []
  const sets = await parallel(SKEPTICS.map((l) => () => agent(`You are a skeptical verifier. Try to REFUTE each finding about ${CONTEXT}
${CLONE(SP + '/pfp2-verify-' + tag + '-' + l.key)}
Lens: ${l.text}. Default real=false when unsure. Findings: ${JSON.stringify(findings)}
${SAVE(`pfp2-verify-${tag}-${l.key}.md`, 'each finding: verdict and what you ran')}
${RULES}`, { label: `verify-${tag}-${l.key}`, phase: 'Review', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  return findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length === 2 || ((votes[f.id] ?? []).length === 1 && votes[f.id][0].real) }))
}
const judged = (await pipeline(LENSES,
  (l) => agent(`${CONTEXT}
Adversarially review slice 2 as built (\`git log ${BASE}..HEAD\` in your clone; builder reports: ${JSON.stringify([build1, build2])}) under this lens: ${l.text}
${CLONE(SP + '/pfp2-review-' + l.key)}
Report every real defect with an exact reproduction; ids ${l.key.toUpperCase()}-1, ... No findings is valid. Return the structured result even if your time runs short.
${SAVE(`pfp2-review-${l.key}.md`, 'checks and candidates')}
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
Same duties as the builders: a test for each that fails before the fix, the fast checks, the touched tests, the affected mutation shard timed with its gate. ${COMMIT}
${SAVE('pfp2-fix.md', 'each finding: done or not, checks')}
${RULES}`, { label: 'fixer', phase: 'Fix', schema: { type: 'object', required: ['applied', 'notApplied', 'checks', 'commit'], properties: { applied: { type: 'array', items: { type: 'string' } }, notApplied: { type: 'array', items: { type: 'string' } }, checks: { type: 'string' }, commit: { type: 'string' } } } })
  recheck = await agent(`${CONTEXT}
Recheck, read-only, at the worktree HEAD. ${CLONE(SP + '/pfp2-recheck')} For each finding run its reproduction: fixed or not. Then review the fix's diff adversarially (money and fail-closed lenses) for anything it broke. Findings: ${JSON.stringify(confirmed.map((f) => ({ id: f.id, title: f.title, reproduction: f.reproduction })))}; fixer: ${JSON.stringify(fix)}
${SAVE('pfp2-recheck.md', 'each finding: fixed or not; new defects')}
${RULES}`, { label: 'recheck', phase: 'Fix', schema: { type: 'object', required: ['perFinding', 'newFindings'], properties: { perFinding: { type: 'array', items: { type: 'object', required: ['id', 'fixed', 'evidence'], properties: { id: { type: 'string' }, fixed: { type: 'boolean' }, evidence: { type: 'string' } } } }, newFindings: { type: 'array', items: FINDING } } } })
}
return { build1, build2, judged, confirmed: confirmed.map((f) => f.id), fix, recheck }
