export const meta = {
  name: 'lane-b-redact-label-boundary',
  description: 'Fix the base redact.ts label-boundary PHI leak (MOD-13 seed 460548619): failing-first tests, the root-cause fix, a sweep of the other label heads; security then correctness reviews with a skeptic each; full suite once; critic (no push)',
  phases: [
    { title: 'Build', detail: 'reproduce, fix, sweep, tests, ADR 0054 line, commit' },
    { title: 'Review', detail: 'security (PHI), then correctness with the redaction oracle; one skeptic per finding' },
    { title: 'Check', detail: 'fix confirmed findings; full local suite once' },
    { title: 'Critic', detail: 'completeness critic; one repair round' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb'
const WT = '/home/user/redact-label-boundary'
const PATHS = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const TRAILER = 'ending after a blank line with exactly these two lines:\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J'
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}). If it exists when you start, continue from it.`
const RULES = `You work on a new narrow branch co-001/redact-label-boundary (worktree ${WT}, cut from claude/build-platform 24531dc2) that fixes a PHI-redaction defect in packages/model-gateway/src/redact.ts (built by #80 and #75). The defect: MOD-13's unseeded property (packages/model-gateway/src/redact.property.test.ts:384, "sends no letter or digit the generator wrote an identifier with…") failed in CI on seed 460548619 with the synthetic counterexample: patient names ["AA CLAIM"], memberIds ["19900101"], claimNumbers ["SYN00000"], text "Patient: AA CLAIM.\\nID:1990-01-01 on file. Dear AA CLAIM, ": the member ID written as a date after a bare "ID:" stayed unredacted. Diagnosis (verify it yourself): LABEL_HEAD (~line 569) with LABEL_QUALIFIER (~567) matches a head word ("claim") that ENDS THE SENTENCE BEFORE (here the end of the patient's name, then ".\\n" or ". ") together with the following "ID:" as one claim label; labelBefore (~604, IDENTIFIER_LABEL.exec) takes that leftmost match, labelFor (~622) refuses a claim's label for a member ID written as a date (G2), so matchesIn skips it. "Hi AA CLAIM. ID:1990-01-01" leaks too; "Hi BB SMITH.\\nID:1990-01-01" and "ID:1990-01-01" are redacted. The ruling (Lane A's orchestrator): the root-cause fix is that a sentence end breaks a label's head, so "CLAIM.\\nID:" is two tokens, not one claim label; plus a sweep for the same boundary class in every other label head and joiner (account, acct, control, member, subscriber, policy, patient, ref, reference, ICN, etc.), while keeping abbreviations that ARE one label ("Acct. No.", "Claim No.", "Ref. #", "Member ID No.") reading as one label. Must hold: no over-redaction of amounts, dates of service and remittance, deadlines ("Appeal by 2027-03-15"), claim numbers kept as the call's own, CPT codes or NPIs; no new leak. Reports of the earlier rounds of this code: /home/user/ops/approval-summaries/lane-b-model-eval-gate-wip/fix/ (check7.md, fix4.md, merge5.md) and ADR 0054 / ADR 0070 Part 3 on the branch.
Rules: ${PATHS} in every command; every heavy command under flock /tmp/laneb-heavy.lock, one at a time (another session's workflow shares the lock); db tests on fresh databases of your own at localhost:5433 (postgres:test), dropped after; e2e with a separate E2E_DATABASE and E2E_PORT; long commands with run_in_background and wait. Never rebase, amend, force or push. Synthetic data only (every example a twin); no model name or identifier in any file or commit; no migration; engine and ledger frozen; no new test-matrix id (this is MOD-13's own regression; extend MOD-13's tests) and no new ADR (amend ADR 0054's numbers section with a dated line, and ADR 0070 Part 3 if it states the rule). Commits end with the trailer given. mkdir -p ${SP}/progress ${SP}/fix ${SP}/scratch.`

phase('Build')
const build = await agent(`${RULES}

PART build (commit; never push).
1. Reproduce first: a fixed-seed run of the MOD-13 property with seed 460548619 (beside YEAR_BELOW_1900_SEED, ~line 375) and example tests for the counterexample and "Hi AA CLAIM. ID:1990-01-01 on file." asserting redactLetter replaces the member ID, holdsIdentifier is false on the output, and identifierCandidates offers 19900101. Show they FAIL on the base. Then also probe the same class for every label head and qualifier redact.ts knows (a head word ending a sentence, then a bare ID:/No./#/Number/Ref: of another kind; across ". ", ".\\n", "!\\n", "?\\n", ";\\n", ":\\n"; for member IDs, claim numbers and patient control numbers, digits-only and date-shaped and dotted/slashed), and the identifierCandidates path and the contract screen's identifierRuns if they share the label rule. Record every leak reproduced.
2. Fix at the root: a sentence end (a full stop, "!" or "?" followed by a line break, or by whitespace and a capital letter or a label word, and any line break that ends a line) breaks a label's head from a following qualifier, so the head and the qualifier read as two labels; keep the abbreviations that are one label (a head word's own abbreviation dot followed by its qualifier on the same line: "Acct. No.", "Claim No.", "Ref. #", "Member ID No.", "Pt. Acct. #"). Where the leftmost label's kind does not fit, try the shorter label ending at the same position as well, so a defect of this class elsewhere cannot hide a bare label (belt and braces); justify both or explain why one suffices. Keep G2 (a claim's label does not count for a member ID written as a date) and every earlier fix's tests passing.
3. Tests: each leak from step 1 pinned with a test that fails without the fix; the abbreviations still one label (pinned); over-redaction guards (deadlines, dates of service, amounts, CPT, NPI after sentence ends) pinned; MOD-13's property also run over many seeds locally (e.g. 50 seeds x 400 runs) with none failing; the comment on the seed test says what it pins.
4. ADR 0054 (numbers section): one dated line (2026-11-04) stating the rule; ADR 0070 Part 3 only if it states the label rule.
5. Narrow checks: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; vitest --project unit packages/model-gateway apps/worker/src/models (letter-records); pnpm --filter @tp/model-gateway eval (the gate passes); pnpm check:fixtures.
6. Commits: the tests and fix (one or two commits), subject like "model-gateway: a sentence end breaks a label's head, so a member ID after a bare ID: is redacted (MOD-13 seed 460548619)", ${TRAILER}
${SAVE('build.md', 'each reproduced leak, the fix, each test and whether it failed first, checks, commits')}
Write ${SP}/fix/build.md and return its full text.`, { label: 'build', phase: 'Build' })

phase('Review')
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'major', 'minor', 'nit'] }, file: { type: 'string' }, line: { type: 'integer' }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'claim', 'evidence', 'fix'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const LENSES = [
  { key: 'security', ask: `SECURITY (PHI): after the fix (git log origin/claude/build-platform..HEAD -p; ${SP}/fix/build.md), can any member ID, patient control number or claim number of the patient (or another patient's number after a label) still reach the model unredacted through a label boundary: any sentence-end form (".", "!", "?", "…", ";" then line breaks, tabs, NBSP, multiple spaces, Unicode line/paragraph separators U+2028/U+2029, CRLF), any head word or abbreviation, uppercase/lowercase/NFKC forms, a name ending in a label word, a label word split across lines, the identifierCandidates path, the contract screen? Probe concrete synthetic strings with scratch tsx scripts under ${SP}/scratch. Report only reproduced leaks.` },
  { key: 'correctness', ask: `CORRECTNESS WITH THE REDACTION ORACLE: run MOD-13's and MOD-14's properties over many seeds (at least 100 seeds x 400 runs) and the oracle the tests use; does the fix over-redact (a real deadline, date of service, remittance date, amount, CPT, NPI, or a claim number the call keeps as its own placeholder) or break an abbreviation that is one label ("Acct. No.", "Claim No.", "Ref. #", "Pt. Acct. #"), any earlier pinned case (G1-G4, R5-1..3, F4-1/2, phi-G2-regress-1, phi-numero-glued, phi-label-end-dash), the eval gate or letter-records? Are the new tests real (each fails without the fix: revert in a scratch copy)? Report only reproduced defects.` },
]
const sec = await agent(`${RULES}

You are an adversarial reviewer. Do not change tracked files (scratch only under ${SP}/scratch). Lens: ${LENSES[0].ask} An empty list is valid.`, { label: 'review:security', phase: 'Review', schema: FINDINGS })
const cor = await agent(`${RULES}

You are an adversarial reviewer. Do not change tracked files (scratch only under ${SP}/scratch). Lens: ${LENSES[1].ask} An empty list is valid.`, { label: 'review:correctness', phase: 'Review', schema: FINDINGS })
const raw = [[sec, 'security'], [cor, 'correctness']].flatMap(([r, k]) => (r ? r.findings : []).map(f => ({ ...f, id: `${k}-${f.id}` })))
const judged = await parallel(raw.map(f => () => agent(`${RULES}

Try to REFUTE this finding about ${WT} (do not change tracked files; scratch under ${SP}/scratch). Reproduce it yourself; refuted=true if the evidence does not hold up or you are unsure. Finding: ${JSON.stringify(f)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ f, v }))))
const confirmed = judged.filter(Boolean).filter(j => j.v && !j.v.refuted).map(j => j.f)
const dropped = judged.filter(Boolean).filter(j => !j.v || j.v.refuted).map(j => ({ id: j.f.id, claim: j.f.claim, reason: j.v ? j.v.reason : 'no verdict' }))
log(`${raw.length} findings: ${confirmed.length} confirmed, ${dropped.length} refuted`)

phase('Check')
const checkPrompt = (round, extra) => `${RULES}

PART check, round ${round} (commit; never push). Read ${SP}/fix/build.md and ${SP}/fix/check.md if it exists. ${extra}
Then the FULL local suite ONCE on the final HEAD, each step under the lock, with totals: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm lint:copy; pnpm test (unit); pnpm test:golden; pnpm test:oracle; pnpm --filter @tp/model-gateway eval; pnpm synth --all writes nothing; watched.ts --write leaves the tree unchanged; pnpm test:db in 4 shards as ci.yml shards them, each on its own fresh migrated database; tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform and every affected shard plus the gate; tools/engine-freeze/check.ts $(git merge-base HEAD origin/claude/build-platform); pnpm check:fixtures; pnpm verify-content; pnpm build with BUILD_COMMIT stamped and E2E_PREBUILT=1 pnpm test:e2e --workers=2; gitleaks git --log-opts="origin/claude/build-platform..HEAD"; the pre-push hook standalone. A failure is root-caused and fixed (never skipped). Tree clean at the end.
${SAVE('check.md', 'each step and its totals, each commit, each finding handled')}
Write ${SP}/fix/check.md and return its full text.`
let check = await agent(checkPrompt(1, `Fix each confirmed review finding with a test that fails without the fix (commit each, ${TRAILER}), updating ADR 0054 where the rule changes: ${JSON.stringify(confirmed)}. Refuted (record only): ${JSON.stringify(dropped)}.`), { label: 'check', phase: 'Check' })

phase('Critic')
const criticPrompt = (n) => `${RULES}

You are the completeness critic (round ${n}) before this branch's first push. Read ${SP}/fix/build.md and check.md. Inspect ${WT}: tree clean; HEAD descends from origin/claude/build-platform (if the base moved, say so; not a gap unless merge-tree conflicts); every suite step run on exactly the current HEAD with totals; every reproduced leak and confirmed finding pinned by a failing-first test; the counterexample and seed 460548619 pinned; the abbreviations and over-redaction guards pinned; the diff limited to redact.ts, its tests, ADR 0054 (and ADR 0070 Part 3 if needed); trailers exact (session_019i9ifCJSbPYXpafL86Rm6J); no model identifier. Also probe the fix yourself with five new synthetic strings of the class. Do not change tracked files. Return a first line exactly READY-TO-PUSH or NOT-READY, then each gap.`
let critic = await agent(criticPrompt(1), { label: 'critic-1', phase: 'Critic' })
if (!String(critic).trim().startsWith('READY-TO-PUSH')) {
  check = await agent(checkPrompt(2, `The critic said NOT-READY. Close every gap, rerunning only the suite steps the change can affect (record why the others stand): ${critic}`), { label: 'check-r2', phase: 'Check' })
  critic = await agent(criticPrompt(2), { label: 'critic-2', phase: 'Critic' })
}
return { build, confirmed, dropped, check, critic }