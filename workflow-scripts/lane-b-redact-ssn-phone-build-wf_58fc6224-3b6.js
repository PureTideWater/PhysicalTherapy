export const meta = {
  name: 'lane-b-redact-ssn-phone-build',
  description: 'redact-ssn-phone: step 0 re-read and probe; build per design 13 and 17; security then correctness reviews with a skeptic each; fixes; full suite once; critic (no push)',
  phases: [
    { title: 'Step0', detail: 're-read the merged redact.ts against design 17; re-run the probe and prototype' },
    { title: 'Build', detail: 'patterns, self-check, tests, synth, docs; narrow checks; commits' },
    { title: 'Review', detail: 'security (PHI), then correctness with the redaction oracle; one skeptic per finding' },
    { title: 'Check', detail: 'fix confirmed findings; full local suite once' },
    { title: 'Critic', detail: 'completeness critic; one repair round' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn'
const WT = '/home/user/redact-ssn-phone'
const OPS = '/home/user/ops'
const DESIGN = `${OPS}/designs/lane-b-redact-ssn-phone.md`
const PATHS = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const TRAILER = 'ending after a blank line with exactly these two lines:\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J'
const SAVE = (f, w) => `Save as you go: keep ${SP}/progress/${f} up to date (${w}). If it exists when you start, continue from it.`
const RULES = `You work on Lane B's item redact-ssn-phone: the founder's ruling (Tyler Williams, 2026-11-01; relayed by the co-founder to Lane A, session_01TrKDxeLbxVo7t7zwRXFzrg, 18bbe0e9, 14:04 UTC, and confirmed in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC) that a payer letter has its Social Security numbers and phone numbers redacted by pattern before the model reads it (readDenialLetter; PRD 14 "PHI minimization"). Branch co-001/redact-ssn-phone in ${WT}, cut from claude/build-platform 00fd2906, which holds #75 (72096e94, the contract PHI check and much redact.ts hardening) and #115 (00fd2906, the label-boundary fix: labelsBefore and LINE_OR_SENTENCE_START, a sentence end adds the label it begins). The design is ${DESIGN} (1,058 lines, reviewed; section 17's rule set R1-R14 supersedes the passages it names; section 13 is the build plan; section 10 the tests; section 11 the docs; Appendix A the patterns as code, amended by section 17). Status: ${OPS}/approval-summaries/lane-b-redact-ssn-phone-status.md. Reserved: test-matrix MOD-15 and MOD-16; synth entries as MOD-13 (matrix.ts entries plus registry.ts none(10, …) entries, no fixture file, module 9); ADR 0088 was released (amend ADR 0054 only, plus a dated sentence in ADR 0070 N6 as the design says). Must hold: no over-redaction of amounts, dates (service, remittance, birth, deadlines), claim numbers (the call's own keep their placeholder), NPIs, TINs, CPT/HCPCS and other codes; the self-check refuses a letter in which an SSN or phone form survives, with a refusal that names no number; MOD-13 and MOD-14 still hold; linear time. Addresses stay a residual.
Rules: ${PATHS} in every command; every heavy command under flock /tmp/laneb-heavy.lock, one at a time; db tests on fresh databases of your own at localhost:5433 (postgres:test), dropped after; e2e with a separate E2E_DATABASE and E2E_PORT; long commands with run_in_background and wait. Never rebase, amend, force or push. Synthetic data only (every number a twin; SSNs in reserved/invalid ranges such as 9xx or 000 area where the design says, phones in 555-01xx); no model name or identifier in any file or commit; no migration; engine and ledger frozen; no new ADR. Commits end with the trailer given. mkdir -p ${SP}/progress ${SP}/fix ${SP}/scratch.`

phase('Step0')
const step0 = await agent(`${RULES}

PART step 0 (no tracked change). Design section 13 step 0: diff the merged gateway files (packages/model-gateway/src/redact.ts, redact.test.ts, redact.property.test.ts, functions/denial-letter.ts, PRD section 14's paragraph, ADR 0054) at 00fd2906 against #75's 871faff9 the design was written on, and read every change (fixes 4/4b, 1677792a, 49156dd8, d2a609fd G1-G4, 49c7a781, 7639392f, a8149341, #115's labelsBefore/LINE_OR_SENTENCE_START/ANY_IDENTIFIER_LABEL). For each rule in section 17 and Appendix A, say whether it still fits the merged code or how it must adapt (names, functions, joiner sets, letterJoins, writtenAsDate, the label rules, the survivor scan). Re-run the design's probe of the 36 SSN and phone forms and the must-not-redact list against the merged redactor with scratch tsx scripts outside the repo (synthetic only), and the prototype's 66 named rows if the design gives them, recording any change. Write ${SP}/fix/step0.md: the adaptation list the builder must follow, the probe results, and anything in the design that the merged code makes wrong or unnecessary.
${SAVE('step0.md', 'each file diffed, each rule checked, probe results')}
Return the full text.`, { label: 'step0', phase: 'Step0' })

phase('Build')
const build = await agent(`${RULES}

PART build (commit; never push). Read ${DESIGN} whole (section 17 first, then 13, 3-6, 8, 10, 11, Appendix A) and ${SP}/fix/step0.md (its adaptation list overrides the design where the merged code differs). Build in this order, each test written to fail first and shown failing: the SSN and phone patterns in the one-pass folded matcher in redact.ts (kinds ssn and phone, placeholders [SSN] and [PHONE], ranked below the call's own identifiers, labels and keep-nouns and guards as section 17 says), the independent survivor scan for the self-check with its refusal naming no number, the screen (MOD-14) unchanged in effect, linear time; MOD-15 and MOD-16 tests in redact.property.test.ts (and named tests per 10.3), every earlier test still passing; the test-matrix rows MOD-15 and MOD-16, synth matrix.ts entries and registry.ts none(10, …) entries (no fixture), synth --all writing only what the generator writes; docs per section 11 (PRD 14 records the ruling with who and when; ADR 0054 amendment, residuals line updated, addresses stay; ADR 0070 N6 dated sentence; reconciliation-001 per rule 8 if the design says; the model-evaluation runbook if named). Narrow checks: pnpm typecheck; pnpm lint; lint:copy; lint:logs; vitest --project unit packages/model-gateway apps/worker/src/models; pnpm --filter @tp/model-gateway eval (the gate passes; if the eval baseline must move, follow the design and say why); pnpm check:fixtures; watched.ts --write (regenerate if it moves). Commit in a few logical commits, ${TRAILER}
${SAVE('build.md', 'each rule built, each test and whether it failed first, checks, commits')}
Write ${SP}/fix/build.md and return its full text.`, { label: 'build', phase: 'Build' })

phase('Review')
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'major', 'minor', 'nit'] }, file: { type: 'string' }, line: { type: 'integer' }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'claim', 'evidence', 'fix'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const sec = await agent(`${RULES}

You are an adversarial reviewer. Do not change tracked files (scratch only under ${SP}/scratch). Read ${SP}/fix/build.md and the diff (git diff origin/claude/build-platform...HEAD). Lens SECURITY (PHI): can any Social Security number or phone number reach the model unredacted after this change, in any form a letter can hold (dashes of every Unicode kind, spaces, dots, slashes, parentheses, +1 and country codes, extensions, vanity letters, full-width digits, NFKC forms, invisible format characters, line breaks inside a number, labeled bare 9 and 10 digit runs, "SSN", "Soc. Sec.", "Tel", "Ph", "Fax", in any case, glued to words, after #115's sentence-start labels), and does the self-check refuse every letter in which one survives, naming no number? Does any refusal, log line or error carry a number? Probe concrete synthetic strings with scratch tsx scripts. Report only reproduced defects.`, { label: 'review:security', phase: 'Review', schema: FINDINGS })
const cor = await agent(`${RULES}

You are an adversarial reviewer. Do not change tracked files (scratch only under ${SP}/scratch). Read ${SP}/fix/build.md and the diff. Lens CORRECTNESS WITH THE REDACTION ORACLE: run MOD-13, MOD-14, MOD-15 and MOD-16's properties over many seeds (at least 100 seeds x 400 runs) and the oracle the tests use; does the change over-redact anything that must stay (amounts with and without cents and commas, dates of every writing including MMDDYYYY and YYYYMMDD runs, deadlines, the call's own claim numbers keeping [CLAIM_n], NPIs, TINs and EINs (NN-NNNNNNN), CPT and HCPCS, ICD-10, ZIP+4, check and EFT trace numbers, policy and group numbers, page numbers, times), break any earlier pinned case (G2, #115's labels, MOD-13 seeds 1162287068 and 460548619), slow the matcher beyond linear time on a crafted 1 MB letter, or move the eval gate? Are the new tests real (each fails without its code: revert in a scratch copy)? Report only reproduced defects.`, { label: 'review:correctness', phase: 'Review', schema: FINDINGS })
const raw = [[sec, 'security'], [cor, 'correctness']].flatMap(([r, k]) => (r ? r.findings : []).map(f => ({ ...f, id: `${k}-${f.id}` })))
const judged = await parallel(raw.map(f => () => agent(`${RULES}

Try to REFUTE this finding about ${WT} (do not change tracked files; scratch under ${SP}/scratch). Reproduce it yourself; refuted=true if the evidence does not hold up or you are unsure. Finding: ${JSON.stringify(f)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ f, v }))))
const confirmed = judged.filter(Boolean).filter(j => j.v && !j.v.refuted).map(j => j.f)
const dropped = judged.filter(Boolean).filter(j => !j.v || j.v.refuted).map(j => ({ id: j.f.id, claim: j.f.claim, reason: j.v ? j.v.reason : 'no verdict' }))
log(`${raw.length} findings: ${confirmed.length} confirmed, ${dropped.length} refuted`)

phase('Check')
const checkPrompt = (round, extra) => `${RULES}

PART check, round ${round} (commit; never push). Read ${SP}/fix/build.md and ${SP}/fix/check.md if it exists. ${extra}
Then the FULL local suite ONCE on the final HEAD, each step under the lock, with totals: pnpm typecheck; pnpm lint; lint:logs; lint:copy; pnpm test (unit); pnpm test:golden; pnpm test:oracle; pnpm --filter @tp/model-gateway eval; pnpm synth --all writes nothing; watched.ts --write leaves the tree unchanged; pnpm test:db in 4 shards on fresh migrated databases; tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform with every affected shard and the gate; tools/engine-freeze/check.ts $(git merge-base HEAD origin/claude/build-platform); pnpm check:fixtures; pnpm verify-content; pnpm build with BUILD_COMMIT stamped and E2E_PREBUILT=1 pnpm test:e2e --workers=2; gitleaks git --log-opts="origin/claude/build-platform..HEAD"; the pre-push hook standalone. A failure is root-caused and fixed (never skipped); a known base flake is rerun once and both results recorded. Tree clean at the end.
${SAVE('check.md', 'each step and totals, commits, findings')}
Write ${SP}/fix/check.md and return its full text.`
let check = await agent(checkPrompt(1, `Fix each confirmed review finding with a test that fails without the fix (commit each, ${TRAILER}), updating ADR 0054 where a rule changes: ${JSON.stringify(confirmed)}. Refuted (record only): ${JSON.stringify(dropped)}.`), { label: 'check', phase: 'Check' })

phase('Critic')
const criticPrompt = (n) => `${RULES}

You are the completeness critic (round ${n}) before this branch's first push. Read ${SP}/fix/step0.md, build.md, check.md and ${DESIGN} section 17. Inspect ${WT}: tree clean; HEAD descends from origin/claude/build-platform (if the base moved, say so; not a gap unless merge-tree conflicts); every section 17 rule built or its departure recorded in ADR 0054 with why; every suite step run on exactly the current HEAD with totals; every confirmed finding fixed failing-first; MOD-15 and MOD-16 rows, synth entries and docs present; the ruling recorded in PRD 14 with who and when; trailers exact (session_019i9ifCJSbPYXpafL86Rm6J); no model identifier; no real-looking SSN or phone (only reserved ranges) in any file. Probe the head yourself with ten new synthetic strings (SSN and phone forms that must be redacted, and must-stay numbers). Do not change tracked files. Return a first line exactly READY-TO-PUSH or NOT-READY, then each gap.`
let critic = await agent(criticPrompt(1), { label: 'critic-1', phase: 'Critic' })
if (!String(critic).trim().startsWith('READY-TO-PUSH')) {
  check = await agent(checkPrompt(2, `The critic said NOT-READY. Close every gap, rerunning only the suite steps the change can affect (record why the others stand): ${critic}`), { label: 'check-r2', phase: 'Check' })
  critic = await agent(criticPrompt(2), { label: 'critic-2', phase: 'Critic' })
}
return { step0, build, confirmed, dropped, check, critic }