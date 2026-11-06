export const meta = {
  name: 'lane-b-packets-verifier-identifier-fold',
  description: 'packets verifier identifierSpans: scouts, design with an adversarial review, build reusing the gateway fold, security then correctness reviews with a skeptic each, fixes, full suite once, critic (no push)',
  phases: [
    { title: 'Scout', detail: 'the verifier, the gateway fold and matcher, the package boundary' },
    { title: 'Design', detail: 'author, adversarial reviewer, revise' },
    { title: 'Build', detail: 'shared fold, verifier change, differential property test, docs; narrow checks; commits' },
    { title: 'Review', detail: 'security (PHI), then correctness with the redaction oracle; one skeptic per finding' },
    { title: 'Check', detail: 'fix confirmed findings; full local suite once' },
    { title: 'Critic', detail: 'completeness critic; one repair round' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pvf'
const WT = '/home/user/packets-verifier-identifier-fold'
const OPS = '/home/user/ops'
const DESIGN = `${OPS}/designs/lane-b-packets-verifier-identifier-fold.md`
const PATHS = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const TRAILER = 'ending after a blank line with exactly these two lines:\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J'
const SAVE = (f, w) => `Save as you go: keep ${SP}/progress/${f} up to date (${w}). If it exists when you start, continue from it.`
const RULES = `You work on Lane B's item packets-verifier-identifier-fold (branch co-001/packets-verifier-identifier-fold, worktree ${WT}, cut from claude/build-platform 23b25ad0). The defect: packages/packets/src/verifier/mismatches.ts's identifierSpans (line ~270), which checks a model-written dispute narrative for the patient's identifiers before a packet is assembled, compares character for character, so an identifier written with diacritics, typographic apostrophes or dashes, split hyphenated halves, invisible format characters, the label-boundary forms #115 fixed, or (where it applies) the SSN and phone forms #127 now redacts, passes the verifier. The gateway's folded one-pass matcher in packages/model-gateway/src/redact.ts (#80 placeholders and fold, #75 hardening, #115 labelsBefore / LINE_OR_SENTENCE_START, #127 SSN and phone patterns and the survivor scan) already handles these. The fix: reuse that fold and matcher in the verifier rather than a second implementation, if the package boundary allows (packages/packets depends today only on @tp/money, @tp/pricing, @tp/triage; check the repo's dependency rules: tools/ and any lint or codeowners or boundary tests, CLAUDE.md "Call a model outside packages/model-gateway" (a fold is not a model call, but importing the gateway into a money package may be refused by a rule); otherwise extract the pure fold into a small shared package (e.g. packages/text-fold) both import; a differential property test against the gateway's matcher so the two never drift; no over-redaction or false flags on amounts, dates, claim numbers kept as the call's own, NPIs, codes. Reserved: test-matrix MOD-19 and MOD-20; synth registry none(10, …) entries with no fixture if needed (module 9); no ADR number: amend the existing ADRs (find the verifier's ADR and ADR 0054) or write "COUNTER REQUEST: ADR" in ${SP}/fix/counter.md if a new one is needed and use a placeholder. Status: ${OPS}/approval-summaries/lane-b-packets-verifier-identifier-fold-status.md; prior notes: ${OPS}/approval-summaries/lane-b-redact-placeholders-status.md (Proposals) and ${OPS}/designs/lane-b-redact-placeholders.md. This is a money package (packages/packets): engine and ledger arithmetic frozen; the change must not alter any amount, stage, window or packet content other than which narratives the verifier flags.
Rules: ${PATHS} in every command; every heavy command under flock /tmp/laneb-heavy.lock, one at a time; db tests on fresh databases of your own at localhost:5433 (postgres:test), dropped after; e2e with a separate E2E_DATABASE and E2E_PORT; long commands with run_in_background and wait. Never rebase, amend, force or push. Synthetic data only (SSNs in 9xx/000/666, phones 555-01xx); no model name or identifier in any file or commit; no migration. Commits end with the trailer given. mkdir -p ${SP}/progress ${SP}/fix ${SP}/scratch.`

phase('Scout')
const SCOUTS = [
  { key: 'verifier', ask: `the verifier: read packages/packets/src/verifier/*.ts and verifier.test.ts whole; how identifierSpans is called (from where, with which identifiers: names, DOB, member IDs, claim numbers, others), what a span does (flag, block, which mismatch kind), what skip spans are, how the narrative and identifiers are built (packets assemble/readable), the existing tests and properties; probe identifierSpans today with scratch tsx strings for each gap class (diacritic, ’ and – forms, split halves, ZWSP/soft hyphen, label-boundary, SSN/phone forms) and record which pass.` },
  { key: 'gateway', ask: `the gateway fold and matcher: read packages/model-gateway/src/redact.ts (fold, view/viewOf, matchesIn, holdsIdentifier, identifierCandidates, labelsBefore, the SSN/phone patterns and survivor scan) and its exports from packages/model-gateway/src/index.ts; which pure functions could serve "find each span of these identifiers in this text, folded" for the verifier; their inputs (a patient record shape? claim numbers?) and their dependencies (does redact.ts import anything heavy: the SDK, db, observability?); cost; how the gateway tests compare (oracles in redact.property.test.ts).` },
  { key: 'boundary', ask: `the package boundary: every rule that governs which package may import which (tools/*, package.json deps, eslint configs and import rules, codeowners and lint.test.ts in model-gateway that restricts importers, CLAUDE.md, docs/adr on package structure, the stryker affected/watched paths, tools/screening-capacity watched paths), whether packages/packets may depend on @tp/model-gateway or a new pure package, what a new package needs (tsconfig, project refs, typecheck projects count, vitest projects, stryker, CODEOWNERS, watched paths), and the mutation shards packets-* that would run.` },
]
const scouts = await parallel(SCOUTS.map(s => () => agent(`${RULES}

You are a design scout. Do not change tracked files (scratch only under ${SP}/scratch). Scout ${s.ask} Write ${SP}/fix/scout-${s.key}.md with file:line references and probe results, and return its full text. ${SAVE('scout-' + s.key + '.md', 'findings so far')}`, { label: `scout:${s.key}`, phase: 'Scout' })))

phase('Design')
const draft = await agent(`${RULES}

You are the designer. Read ${SP}/fix/scout-verifier.md, scout-gateway.md, scout-boundary.md. Write the design to ${DESIGN} (on claude/build-ops; write the file only, never commit): the defect with each gap class and a synthetic example; the choice of reuse (import from the gateway, or extract a shared pure package) with the reasons, judged by the founder's standing rule (best option, not build effort: accuracy, security and privacy, maintainability, resilience to change); exactly which function the verifier calls and how its spans map to the verifier's mismatch output and skip spans; what stays the verifier's own (e.g. names, dates of birth) and what the SSN/phone patterns mean there (should a narrative holding any SSN or phone form be flagged, with which kind?); the differential property test (MOD-19) and the must-stay property (MOD-20) and named tests; synth entries; docs (the verifier's ADR, ADR 0054, the test matrix, PRD if it states the verifier's check); CI and watched paths and mutation shards; risks; a build plan; open questions with the recommended answer taken. ${SAVE('design.md', 'sections written')} Return the design's path and a one-paragraph summary.`, { label: 'designer', phase: 'Design' })
const REVIEW = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, section: { type: 'string' }, claim: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'claim', 'fix'] } } }, required: ['findings'] }
const review = await agent(`${RULES}

You are the adversarial design reviewer. Read ${DESIGN} and the scout reports in ${SP}/fix/. Check it against the code (verify each claim), the package rules, and the item's aims: every gap class closed, no false flags, no drift (the differential test truly ties them), no PHI leak or new dependency risk in a money package, nothing frozen changed. Report each finding with a concrete fix. Do not change tracked files.`, { label: 'design-review', phase: 'Design', schema: REVIEW })
const revised = await agent(`${RULES}

Apply every blocking and should-fix finding of the design review to ${DESIGN} (and the nits you agree with), each listed with its disposition in a final section "Design review": ${JSON.stringify(review ? review.findings : [])}. Write the file only, never commit. Return the list of dispositions.`, { label: 'revise', phase: 'Design' })

phase('Build')
const build = await agent(`${RULES}

PART build (commit; never push). Read ${DESIGN} whole (its "Design review" section supersedes earlier passages). Build it in order, each test written to fail first and shown failing on the base: the shared fold or the import as designed (with the package wiring: package.json, tsconfig references, pnpm install updating the lockfile only as the tool writes it, vitest project, stryker and watched paths regenerated by their tools), the verifier change, MOD-19 (the differential property against the gateway's matcher) and MOD-20 (what must stay unflagged) and the named tests, the test-matrix rows and synth entries, the docs. Narrow checks: pnpm typecheck; pnpm lint; lint:copy; lint:logs; vitest --project unit packages/packets packages/model-gateway (and the new package); pnpm --filter @tp/model-gateway eval; tools/stryker/affected.ts and the affected packets shards; tools/engine-freeze/check.ts; pnpm check:fixtures; watched.ts --write; if a manifest or the lockfile changed, pnpm actions:check and pnpm toolchain:check with BASE=origin/claude/build-platform (networked). Commit in a few logical commits, ${TRAILER}
${SAVE('build.md', 'each step, each test and whether it failed first, checks, commits')}
Write ${SP}/fix/build.md and return its full text.`, { label: 'build', phase: 'Build' })

phase('Review')
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'major', 'minor', 'nit'] }, file: { type: 'string' }, line: { type: 'integer' }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'claim', 'evidence', 'fix'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const sec = await agent(`${RULES}

You are an adversarial reviewer (read .claude/agents/security-reviewer.md and .claude/agents/payment-engine-reviewer.md for the lenses). Do not change tracked files (scratch only under ${SP}/scratch). Read ${DESIGN} and ${SP}/fix/build.md and the diff. Lens SECURITY (PHI) and the money package: can a narrative still carry a patient's identifier past the verifier in any form the gateway now folds or matches (probe concrete synthetic strings with scratch tsx against both the verifier and the gateway's matcher); does the new import or package open a dependency path a rule forbids or widen what packets can reach; does any error, log or mismatch record carry an identifier's text; is any amount, stage or packet content changed? Report only reproduced defects.`, { label: 'review:security', phase: 'Review', schema: FINDINGS })
const cor = await agent(`${RULES}

You are an adversarial reviewer. Do not change tracked files (scratch only under ${SP}/scratch). Read ${DESIGN} and ${SP}/fix/build.md and the diff. Lens CORRECTNESS WITH THE REDACTION ORACLE: run MOD-19 and MOD-20 over many seeds (at least 100 x the default runs) and the gateway's MOD-13 to MOD-16 properties; does the verifier now flag what must stay (amounts, dates of service, deadlines, NPIs, CPT codes, the call's own claim numbers written in the narrative where the design allows them, names that are common words), mis-place a span (offsets after folding must map back to the original text exactly, including astral characters and combining marks), break skip spans, or slow verification on a long narrative? Are the new tests real (each fails without its code: revert in a scratch copy)? Does the differential test truly fail when the two drift (mutate one side in a scratch copy)? Report only reproduced defects.`, { label: 'review:correctness', phase: 'Review', schema: FINDINGS })
const raw = [[sec, 'security'], [cor, 'correctness']].flatMap(([r, k]) => (r ? r.findings : []).map(f => ({ ...f, id: `${k}-${f.id}` })))
const judged = await parallel(raw.map(f => () => agent(`${RULES}

Try to REFUTE this finding about ${WT} (do not change tracked files; scratch under ${SP}/scratch). Reproduce it yourself; refuted=true if the evidence does not hold up or you are unsure. Finding: ${JSON.stringify(f)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ f, v }))))
const confirmed = judged.filter(Boolean).filter(j => j.v && !j.v.refuted).map(j => j.f)
const dropped = judged.filter(Boolean).filter(j => !j.v || j.v.refuted).map(j => ({ id: j.f.id, claim: j.f.claim, reason: j.v ? j.v.reason : 'no verdict' }))
log(`${raw.length} findings: ${confirmed.length} confirmed, ${dropped.length} refuted`)

phase('Check')
const checkPrompt = (round, extra) => `${RULES}

PART check, round ${round} (commit; never push). Read ${SP}/fix/build.md and ${SP}/fix/check.md if it exists. ${extra}
Then the FULL local suite ONCE on the final HEAD, each step under the lock, with totals: pnpm typecheck; pnpm lint; lint:logs; lint:copy; pnpm test (unit); pnpm test:golden; pnpm test:oracle; pnpm --filter @tp/model-gateway eval; pnpm synth --all writes nothing; watched.ts --write leaves the tree unchanged; pnpm test:db in 4 shards on fresh migrated databases; tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform with every affected shard and the gate as mutation.yml runs them; tools/engine-freeze/check.ts $(git merge-base HEAD origin/claude/build-platform); pnpm check:fixtures; pnpm verify-content; pnpm build with BUILD_COMMIT stamped and E2E_PREBUILT=1 pnpm test:e2e --workers=2; if a manifest or the lockfile changed, pnpm actions:check and pnpm toolchain:check; gitleaks git --log-opts="origin/claude/build-platform..HEAD"; the pre-push hook standalone. A failure is root-caused and fixed (never skipped); a known base flake is rerun once and both results recorded. Tree clean at the end.
${SAVE('check.md', 'each step and totals, commits, findings')}
Write ${SP}/fix/check.md and return its full text.`
let check = await agent(checkPrompt(1, `Fix each confirmed review finding with a test that fails without the fix (commit each, ${TRAILER}), updating the design's ADR amendment where a rule changes: ${JSON.stringify(confirmed)}. Refuted (record only): ${JSON.stringify(dropped)}.`), { label: 'check', phase: 'Check' })

phase('Critic')
const criticPrompt = (n) => `${RULES}

You are the completeness critic (round ${n}) before this branch's first push. Read ${DESIGN}, ${SP}/fix/build.md and check.md. Inspect ${WT}: tree clean; HEAD descends from origin/claude/build-platform (if the base moved, say so; not a gap unless merge-tree conflicts); every design rule built or its departure recorded with why; every suite step run on exactly the current HEAD with totals; every confirmed finding fixed failing-first; MOD-19 and MOD-20 rows and tests present and the differential test proven to fail on drift; docs present; no dependency rule broken; trailers exact (session_019i9ifCJSbPYXpafL86Rm6J); no model identifier; only synthetic data. Probe the verifier yourself with ten new synthetic narratives (identifier forms that must be flagged, and must-stay numbers). Do not change tracked files. Return a first line exactly READY-TO-PUSH or NOT-READY, then each gap.`
let critic = await agent(criticPrompt(1), { label: 'critic-1', phase: 'Critic' })
if (!String(critic).trim().startsWith('READY-TO-PUSH')) {
  check = await agent(checkPrompt(2, `The critic said NOT-READY. Close every gap, rerunning only the suite steps the change can affect (record why the others stand): ${critic}`), { label: 'check-r2', phase: 'Check' })
  critic = await agent(criticPrompt(2), { label: 'critic-2', phase: 'Critic' })
}
return { scouts, draft, review, revised, build, confirmed, dropped, check, critic }