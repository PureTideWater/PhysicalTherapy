export const meta = {
  name: 'lane-b-redact-ssn-phone-design',
  description: 'Probe #75 redactor on SSN/phone forms, draft the design, one adversarial design review, verify findings, completeness critic, apply',
  phases: [{ title: 'Probe' }, { title: 'Draft' }, { title: 'Design review' }, { title: 'Verify' }, { title: 'Apply' }],
}
// Session session_01FcouKP1U2GGDFhhZT9CaUV (Lane B item redact-ssn-phone), 2026-11-01. Adapted from the "Design review"
// phase of workflow-scripts/lane-b-redact-placeholders-design-build-wf_0f7e6d06-e5b.js; the Build phase is dropped until #75 merges.
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/b3c6553f-bf86-5901-9a05-bd89989a0ff9/scratchpad'
const WT = '/home/user/redact-ssn-phone-probe'
const DESIGN = '/home/user/ops/designs/lane-b-redact-ssn-phone.md'
const PROBE = `${SP}/probe/probe-report.md`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RULES = `Rules:
- Every heavy command (install, typecheck, lint, test) runs under \`flock /tmp/laneb-heavy.lock <command>\`, with \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\` first. At most two heavy workflows run in this container.
- ${WT} is a detached, READ-ONLY probe worktree at #75's head 871faff9 (co-001/contract-phi-check, which contains #80). Never edit, commit or push there. Scratch tests go under ${SP}/probe/ (run them with vitest from the package dir via a config/root pointing at the scratch file, or copy a scratch file into the worktree only temporarily and delete it before you finish; prefer the former).
- Synthetic data only (names like VANTREE, ZEPHYRA; SYN-prefixed or obviously fake numbers such as 900-00-0001, 555-01xx phone numbers). No real PHI, no model name or identifier in any file you write. Do not commit or push; the session does.
- Long commands: run_in_background and wait for the notification; the Bash tool refuses a long foreground sleep.
- Improve as you go: improvements inside the design, make them and say so; outside it, list them as proposals.`
const CONTEXT = `Context (the item): On 2026-11-01 the founder (Tyler Williams) ruled that a payer letter has its Social Security numbers and phone numbers redacted BY PATTERN before the model reads it. The reader is readDenialLetter (packages/model-gateway/src/functions/denial-letter.ts); the requirement belongs in PRD §14 "PHI minimization" (docs/product/PRD.md ~line 575). The co-founder relayed it to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, commit 18bbe0e9, 14:04 UTC) and confirmed it in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC. Addresses stay a residual (the ruling does not cover them). Today the gateway redacts only the patient's own identifiers (names, DOB, member IDs, the call's claim numbers); ADR 0054 (docs/adr/0054-*.md, #80 amendment, residuals ~lines 372-373 on 871faff9) lists "addresses, phone numbers and Social Security numbers, which PRD 14 does not list for redaction" as residuals.
The change goes into the one-pass folded matcher in packages/model-gateway/src/redact.ts as #75 left it (#80 built it; #75 adds SCREEN_FLOORS, screenIdentifier, runIndex, someIdentifierRun, identifierRuns; redact.test.ts is #75's; redact.property.test.ts holds MOD-13/MOD-14). It must not over-redact amounts, dates (every datesIn form), claim numbers, NPIs or codes (CPT/HCPCS), ZIP+4. The self-check must refuse a letter in which an SSN or phone form survives, with a refusal that names no number (CLAUDE.md: no PHI in an error message or log). The call's own member ID and claim numbers keep their MOD-13 placeholders even when SSN- or phone-shaped. Another patient's member ID or claim number (9- and 10-digit ones included) must still reach identifierCandidates and the one-patient screen (MOD-14 must hold; candidates are read from the redacted text, denial-letter.ts:233). Time stays linear: the crafted 100 kB letters stay within the 3 s budget. The readDenialLetter verifier still finds dates and references. No change to the versioned prompt if avoidable (a changed prompt is a new version under packages/model-gateway/prompts/read-denial-letter/ with a changelog entry, prompts.ts).
Reserved numbers: ADR 0088 only if the design needs more than an ADR 0054 amendment (otherwise 0088 is released); test-matrix MOD-15 and MOD-16 (suggested: MOD-15 every SSN and phone form is redacted and a letter where one survives is refused; MOD-16 amounts, dates, NPIs, codes and ZIPs are sent unchanged, the call's identifiers keep their placeholders, another patient's identifiers are still offered to the screen); packages/synth: matrix.ts entries plus registry.ts entries none(10, '<why no file>', [test paths]) in the existing module 9 MOD (the 10 is completesIn, the milestone), no fixture file. No migration (gateway-only; if anything needs one, say so: it would be handed to Lane A).
Prior art to read (on claude/build-ops, checked out at /home/user/ops): designs/lane-b-redact-placeholders.md (#80's design); designs/lane-b-model-eval-gate.md §5 (PR C, co-001/contract-phi-check) and Appendix A.3 (identifierRuns, SCREEN_FLOORS); approval-summaries/lane-b-redact-placeholders-status.md "Proposals" (the origin of this question); approval-summaries/lane-b-redact-ssn-phone-status.md (this item's status). In the worktree: CLAUDE.md, .claude/rules/*.md that apply (security, model gateway), docs/adr/0054-*, docs/product/PRD.md §14, docs/product/test-matrix.md (MOD rows), docs/product/reconciliation-001.md, packages/synth/src/cases/{matrix.ts,registry.ts,common.ts}.
The founder's standing rule: recommend and build only the best option, never weighted by build effort, judged on accuracy, security and privacy, compliance, reliability, maintainability, AI safety. For a security trade-off take the safer option and record why; a genuinely new trade-off (e.g. an unlabeled bare 9-digit number that may be a claim number or member ID; the payer's own letterhead phone being redacted) is decided by the design (safer option) AND listed for the co-founder in a "For the co-founder" section, blocking nothing.`

phase('Probe')
const probe = await agent(`You probe what the current redactor does, for the design of a Lane B item of the PaidWhole build.
${CONTEXT}
Task: in a scratch vitest test under ${SP}/probe/ (synthetic twins only), import from ${WT}/packages/model-gateway/src/redact.ts (and denial-letter.ts if useful) and record, for each input below, what redactLetter returns (the redacted text), whether holdsIdentifier refuses it, and what identifierCandidates yields, with a fixed synthetic patient and claims. First ensure the worktree has node_modules: if ${WT}/node_modules is missing, run \`cd ${WT} && flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile\` (PATH as below).
SSN forms: 123-45-6789 style (use 900-xx-xxxx synthetic area numbers); spaced (900 12 3456); typographic dashes (U+2010, U+2011, U+2012, U+2013, U+2014, U+2212); invisible characters inside (U+200B, U+00AD, U+2060, U+FEFF); full-width digits; a labeled bare 9-digit number ("SSN: 900123456", "Social Security No. 900123456", "SS#900123456"); an HICN-shaped value (9 digits plus a letter, e.g. 900123456A, also dashed).
Phone forms: (555) 012-3456; 555-012-3456; 555.012.3456; +1 555 012 3456; 1-800-555-0100; with an extension (x123, ext. 45, extension 6789, #12); a labeled bare 10 digits ("Phone: 5550123456", "Fax 5550123457"); a TTY/711 note.
Must-not-redact: amounts ($1,234.56, 1,234,567.00, $123-45 odd forms); every datesIn form (read DATE_PATTERNS in redact.ts and produce one of each; include 2026-11-01, 11/01/2026, 11-01-2026, 01.11.2026, November 1, 2026, Nov 1st '26); the call's own member ID and claim numbers made SSN-shaped (e.g. member 900-12-3456) and phone-shaped (claim 555-012-3456), which must keep their MOD-13 placeholders; another patient's member ID or claim number, 9- and 10-digit ones included, which must still reach identifierCandidates; 10-digit NPIs (1xxxxxxxxx with valid Luhn check per the NPI rule; also one starting with 2); CPT (97110, 97140), HCPCS (G0283, A4556), CARC/RARC codes (CO-45, N130), ICD-10 (M54.50); ZIP and ZIP+4 (90001-1234); TIN/EIN (90-0123456); ICN/claim control numbers of 11-14 digits; check/EFT trace numbers; page numbers and reference numbers like 2026-1101-0001.
Also measure: how long redactLetter + holdsIdentifier take on the crafted 100 kB letters the existing tests use (find them: grep for 100 kB / budget / 3 s in the package tests), as a baseline.
Write the full results as a readable table to ${PROBE} (create the directory), including the exact code path (function and line in redact.ts) that explains each surprising result, and keep the scratch test file there too.
${SAVE('probe.md', 'which cases are done and their results')}
${RULES}
Return a concise summary: the table's key rows (what survives today, what is wrongly altered today), the code facts the design must know (where the folded view is built, how placeholders are protected, how identifierCandidates tokenizes, where the screen reads candidates, the timing baseline), and the path of the report.`, {
  label: 'probe', phase: 'Probe',
  schema: { type: 'object', required: ['summary', 'reportPath'], properties: { summary: { type: 'string' }, reportPath: { type: 'string' } } },
})

phase('Draft')
const draft = await agent(`You are the designer for a Lane B item of the PaidWhole build. Write the design at ${DESIGN} (create it; it does not exist yet).
${CONTEXT}
The probe of today's behaviour is at ${PROBE}; its summary:
${probe ? probe.summary : '(probe failed: read the report file if it exists, otherwise probe what you need yourself)'}
Read the code yourself in ${WT}/packages/model-gateway/src (redact.ts whole, redact.test.ts, redact.property.test.ts, functions/denial-letter.ts and its test, functions/narrative.ts for mentionsIdentifier, and any other gateway function that sends document text to a model, so the design states the scope: which callers get SSN/phone redaction and why), apps/worker/src/packets/letter-records.ts (the stored side of compactIdentifier) and the prior-art designs.
The design must decide, with reasons, and in the style of designs/lane-b-redact-placeholders.md (numbered sections, a table of cases, a completeness argument, a test plan, docs, risks):
1. The exact SSN and phone patterns, written over the folded view (the same one pass: how they join the existing matcher without a second scan, how they interact with the existing BEFORE/AFTER word boundaries, NUMBER_JOINERS, invisible-character handling, NFKC/full-width digits). Include: dashed/spaced/dotted 3-2-4 SSNs; the labeled bare 9-digit SSN (which labels; how far a label reaches); HICN/MBI-shaped values (decide and justify); NANP phones in every listed form with country code and extensions (decide whether the extension is inside the redacted span); labeled bare 10-digit phones; how a 10-digit NPI, an 11+-digit ICN, ZIP+4, a TIN, a date and an amount are kept from matching (concrete guards, e.g. area-code/exchange rules N[2-9]XX, the NPI label, separator rules).
2. Precedence and overlaps with the existing spans: the call's own identifiers keep their MOD-13 placeholders (rank), merge() behaviour, and the placeholder words chosen (e.g. [SSN] and [PHONE]); the PLACEHOLDER regex and every place that protects or counts placeholders must accept them and they must be uncorruptable by the existing passes.
3. The one-patient screen (MOD-14): candidates are read from the redacted text (denial-letter.ts:233). An SSN- or phone-shaped value that is in fact another patient's member ID or claim number would vanish from the screen if simply redacted. Design the best answer (e.g. the redactor returns the redacted pattern spans' raw values in memory, never sent, never logged, and identifierCandidates/the screen also reads them; or redaction and screening share the span list), so both properties hold: nothing SSN/phone-shaped reaches the model, and another patient's identifier still refuses the letter. Show how no PHI leaks into an error, a log or a job payload on that path.
4. The self-check: holdsIdentifier (or a sibling) refuses a letter where an SSN or phone form survives; the refusal code and message (no number in it; whether to reuse 'identifier_left' or add a code, and what the caller and any UI/report string then show).
5. Linear time (no backtracking blow-up; the 100 kB crafted letters within 3 s), and the verifier (dates and references still found).
6. The prompt: whether the versioned read-denial-letter prompt needs a new version (it says "Identifiers in it are placeholders in square brackets"); avoid a change unless needed, and say so.
7. Tests: MOD-15 and MOD-16 property tests in src/redact.property.test.ts with the generator as the oracle (follow the file's conventions: seeds, numRuns, no chance-dependent coverage checks, no exhausting fc.pre), each probed case by name in redact.test.ts or functions/denial-letter.test.ts, the synth matrix.ts/registry.ts entries (none(10, ...) in module 9), the test-matrix rows (format of MOD-13/MOD-14 rows), and whether the mutation shard covering model-gateway (stryker/shards.json) needs anything.
8. Docs: the PRD §14 text (with who and when: the founder (Tyler Williams), 2026-11-01; relayed by the co-founder to Lane A in session_01TrKDxeLbxVo7t7zwRXFzrg, 18bbe0e9, 14:04 UTC; confirmed in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC), the ADR 0054 amendment vs a new ADR 0088 (decide; if 0054 is amended, say 0088 is released), the reconciliation-001 entry, and the residuals sentence updated (addresses remain).
9. Watched paths: redact.ts and functions/denial-letter.ts are screening-capacity watched paths (tools/screening-capacity/watched-paths.txt); say whether imports change (then \`pnpm exec tsx tools/screening-capacity/watched.ts --write\`).
10. The build plan, file by file, for after #75 merges (the branch is cut from a claude/build-platform head containing #75's merge), and the risks.
Add a "For the co-founder" section with each new trade-off decided (safer option) and a "Proposals (outside this PR)" section.
${SAVE('designer.md', 'sections written so far and decisions taken')}
${RULES}
Return: the path, a one-paragraph summary of the decisions, and the list of trade-offs for the co-founder.`, {
  label: 'designer', phase: 'Draft',
  schema: { type: 'object', required: ['path', 'summary', 'tradeoffs'], properties: { path: { type: 'string' }, summary: { type: 'string' }, tradeoffs: { type: 'array', items: { type: 'string' } } } },
})

const FINDINGS = { type: 'object', required: ['findings', 'verdict'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', required: ['id', 'severity', 'title', 'detail', 'fix'], properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should fix', 'nit'] }, title: { type: 'string' }, detail: { type: 'string' }, input: { type: 'string' }, fix: { type: 'string' } } } } } }

phase('Design review')
const [review, critic] = await parallel([
  () => agent(`You are the one design reviewer for a Lane B item of the PaidWhole build. Review, adversarially, the design at ${DESIGN} for adding Social Security and phone number redaction by pattern to the model gateway's letter redaction (packages/model-gateway/src/redact.ts as #75 left it, its caller functions/denial-letter.ts, tests redact.test.ts, redact.property.test.ts, functions/denial-letter.test.ts) in the read-only probe worktree ${WT}. This path is what keeps patient details from the model (CLAUDE.md: no PHI to a model).
${CONTEXT}
Check above all: (1) does the design leave ANY SSN or phone form unredacted? Try to break it with concrete synthetic inputs: separators and invisible characters, full-width and other Nd digits, line breaks and hyphenation inside the number, labels split across lines, letters glued to digits, parentheses variants, extensions, country codes, numbers adjacent to placeholders or to other numbers, the fold/position map. Run them against the existing code in a scratch test under ${SP}/review/ where it helps (the probe report ${PROBE} shows today's behaviour). (2) Over-redaction that would break the task or the verifier: amounts, every datesIn form, claim/ICN/reference numbers, NPIs, TINs, CPT/HCPCS/CARC/RARC/ICD codes, ZIP+4, page numbers. (3) The call's own identifiers keep MOD-13 placeholders; placeholders cannot be corrupted; merge/rank. (4) MOD-14: another patient's identifier still refuses the letter, and the design's mechanism leaks no PHI into an error, log, job payload or the model input. (5) The self-check refuses survivors and the refusal names no number. (6) Linear time and catastrophic backtracking. (7) Test plan sufficiency (property oracle independence, flake risks), docs (PRD §14, ADR 0054 vs 0088, reconciliation-001, test-matrix, synth registry), watched paths. (8) Anything missed: other gateway functions that send document text, narrative's mentionsIdentifier, apps/worker letter-records.
${SAVE('design-review.md', 'findings so far')}
${RULES}
Return findings (id F1, F2, ...), each with severity (blocking / should fix / nit), what is wrong, a concrete input if any, and the fix you recommend.`, { label: 'design-review', phase: 'Design review', schema: FINDINGS }),
  () => agent(`You are the completeness critic for the design at ${DESIGN} (a Lane B item of the PaidWhole build: Social Security and phone numbers redacted by pattern before readDenialLetter's model reads a payer letter). Do not re-review the regexes in depth; another reviewer does. Ask "what is missing?": a required section of the item not covered (the item's context is below), a claim stated without evidence from the code or the probe (${PROBE}), a file the build must change that the plan omits (callers of redactLetter/holdsIdentifier/identifierCandidates across the repository in ${WT}, apps/worker included; error-code lists and their UI or report strings; docs; test-matrix; synth registry; watched paths; mutation shards; the lint:logs rules), a record the item requires (the ruling with who and when in PRD §14, ADR, reconciliation-001; ADR 0088 released or used; the residuals sentence), an unverified assumption about #75's merged state, and anything in CLAUDE.md's rules the plan could break.
${CONTEXT}
${SAVE('completeness-critic.md', 'gaps found so far')}
${RULES}
Return findings (id C1, C2, ...) with severity, what is missing, and the fix.`, { label: 'completeness-critic', phase: 'Design review', schema: FINDINGS }),
])

const all = [...(review ? review.findings : []), ...(critic ? critic.findings : [])]
const toVerify = all.filter((f) => f.severity !== 'nit')
log(`${all.length} findings (${toVerify.length} blocking or should fix); verifying those with two lenses; nits go straight to the applier`)

phase('Verify')
const VERDICTS = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'refuted', 'reason'], properties: { id: { type: 'string' }, refuted: { type: 'boolean' }, reason: { type: 'string' }, betterFix: { type: 'string' } } } } } }
const LENSES = [
  ['security and privacy', 'Does the finding describe a real leak, a real gap in what the model or a log could see, or a real refusal gap? Reproduce it against the design as written (and the code where it helps) with synthetic input.'],
  ['correctness and over-redaction', 'Is the finding real for the design as written: does the input really leak, corrupt, over-redact, or break MOD-13/MOD-14 or the verifier, and is the proposed fix right and the best one (no new over-redaction, linear time)?'],
]
const verdicts = toVerify.length ? await parallel(LENSES.map(([lens, ask]) => () => agent(`You adversarially verify design-review findings for ${DESIGN} (Lane B item redact-ssn-phone of the PaidWhole build), through the ${lens} lens. For EACH finding below, try to REFUTE it: ${ask} Default to refuted=true only if you can show it is wrong or already handled by the design; if uncertain, refuted=false. Where the fix is wrong or weaker than another, give betterFix.
Findings:
${JSON.stringify(toVerify, null, 2)}
You may run scratch tests under ${SP}/verify-${lens.split(' ')[0]}/ against the read-only worktree ${WT}.
${SAVE(`verify-${lens.split(' ')[0]}.md`, 'verdicts so far')}
${RULES}`, { label: `verify:${lens}`, phase: 'Verify', schema: VERDICTS }))) : []

const byId = {}
for (const v of verdicts.filter(Boolean)) for (const x of v.verdicts) (byId[x.id] = byId[x.id] || []).push(x)
const kept = toVerify.filter((f) => (byId[f.id] || []).filter((x) => x.refuted).length < 2).map((f) => ({ ...f, verification: byId[f.id] || [] }))
const dropped = toVerify.filter((f) => (byId[f.id] || []).filter((x) => x.refuted).length >= 2).map((f) => ({ id: f.id, title: f.title, verification: byId[f.id] }))
const nits = all.filter((f) => f.severity === 'nit')
log(`kept ${kept.length}, refuted by both lenses ${dropped.length}, nits ${nits.length}`)

phase('Apply')
const applied = await agent(`You are the designer for Lane B item redact-ssn-phone of the PaidWhole build. Apply the verified design-review findings below to the design at ${DESIGN}, taking each recommended fix (or the verifiers' betterFix where they give one; for security the safer option). Re-check each change against the code in the read-only worktree ${WT}. Apply nits where they improve the design. Add a section "Design review (${'one reviewer'}, a completeness critic, two-lens verification)" listing every finding with its id, severity, and how it was applied, and the findings both verifiers refuted with why. Keep the "For the co-founder" and "Proposals (outside this PR)" sections current.
${CONTEXT}
Kept findings (verified):
${JSON.stringify(kept, null, 2)}
Refuted by both verification lenses (record, do not apply unless you find them right after all, then say why):
${JSON.stringify(dropped, null, 2)}
Nits:
${JSON.stringify(nits, null, 2)}
Reviewer verdict: ${review ? review.verdict : '(reviewer failed)'}; critic verdict: ${critic ? critic.verdict : '(critic failed)'}.
${SAVE('apply.md', 'which findings are applied')}
${RULES}
Return: a summary of what changed, the final list of decisions, the trade-offs for the co-founder, whether ADR 0088 is used or released, and anything left open.`, {
  label: 'apply', phase: 'Apply',
  schema: { type: 'object', required: ['summary', 'decisions', 'tradeoffs', 'adr0088', 'open'], properties: { summary: { type: 'string' }, decisions: { type: 'array', items: { type: 'string' } }, tradeoffs: { type: 'array', items: { type: 'string' } }, adr0088: { type: 'string' }, open: { type: 'string' } } },
})
return { probe, draft, reviewVerdict: review && review.verdict, criticVerdict: critic && critic.verdict, kept: kept.map((f) => `${f.id} ${f.severity}: ${f.title}`), dropped, nits: nits.map((f) => `${f.id}: ${f.title}`), applied }
