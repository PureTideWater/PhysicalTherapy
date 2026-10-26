export const meta = {
  name: 'lane-b-model-eval-gate-design',
  description: 'Design #84 (model evaluation gate) and #120 (contract PHI check) with scouts, an author, one adversarial reviewer and a revision',
  phases: [
    { title: 'Scout', detail: 'four readers map the code the items change' },
    { title: 'Draft', detail: 'one author writes the design' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Revise', detail: 'the author answers every finding' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/d485e7a2-2267-518e-ad2a-69386433675d/scratchpad/meg'
const OPS = '/home/user/ops'
const DOC = `${OPS}/designs/lane-b-model-eval-gate.md`
const DIR = `${OPS}/designs/lane-b-model-eval-gate`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const COMMON = `Context: PaidWhole monorepo at /home/user/PhysicalTherapy, checked out on claude/build-platform (6ddd587). You are part of Lane B's design stage for LANES.md queue item 12: the model evaluation gate (combined audit #84) and the contract PHI check before the model (#120). Both are "Database: no" — no migration may be proposed (if one seems needed, say so loudly; Lane B never opens a migration PR). Read-only in the repository: never edit, commit or push there. Run no heavy command (install, build, typecheck, lint, test); reading and grep only. Never put a model name or identifier in anything you write. Synthetic data only. The founder's standing rule: recommend only the best option, never weighted by build effort. Improve as you go: if you see an improvement, name it.
The audit text, verbatim:
#84 "An evaluation gate that sees the dangerous errors". What is there now: The scorer counts a field the verifier rejected and a wrong field it passed the same way, so a model change that trades visible rejections for silent wrong values scores better and passes. The first real-model run, a people step, will set the bar wherever it lands. The contract set holds 40 small documents (1-6 rows, 1-4 pages) with no long exhibits, no scans with their own OCR layer, no hidden or injected text. Only corrected proposals become evaluation examples, so a regression on documents the old model read correctly is never measured; the injection test runs on the local stand-in model; and the evidence-request and denial-letter features can be served with no evaluation. Best option: Report 'wrong but verified' per field apart from rejections and gate it: never rising, and zero on cases where the page text is faithful. You and the specialist set an absolute recall floor per field before production. Add swapped-row faults the gate must catch. Build set v2: size tiers to 60 codes and 80 pages, contract-plus-exhibit pairs, multi-row tables, scans with seeded OCR errors, struck-through rates, injected-instruction twins (zero difference from the clean twin allowed) and decoy amended-rate paragraphs (both must be flagged as conflicting). Keep accepted proposals as examples too, under the data-rights agreement. Serve each model feature in production only when its own prompt and model have a baseline, switching that feature off rather than the whole provider. Add these attacks to PR 16's red team. Lands in: a new evaluation PR before the people-only first real-model baseline run.
#120 "Check a contract for patient details before sending it to the model". What is there now: A document's kind is whatever the uploader picked, and the upload panel preselects 'contract', so a payer letter or EOB filed by default goes to the model unredacted as a contract; the denial-letter path, by contrast, redacts and stays off by default. Nothing checks contract pages for patient details. Best option: Before a contract or exhibit is sent, check it against the practice's own records for an exact member ID, payer claim number or long patient control number; a hit refuses the call ('this document names a patient of the practice and was not sent') and logs the code only. No shape heuristics, which would refuse ordinary contracts on their dates and NPIs. The upload panel leaves the kind unset until the person picks one. Lands in: a small PR before PR 16.
Reserved numbers: ADR 0070; test-matrix rows MOD-07 to MOD-12 (the claim wrote MOD-7 to MOD-12; the series is two-digit, MOD-01..MOD-06 exist); packages/synth cases MOD-07 to MOD-12 if fixtures are needed. Shared documents (test-matrix, synth registry, ADRs) are also changed by Lane A's open PR #42 (it changes docs/product/test-matrix.md, packages/synth/src/cases/{matrix,registry}.ts and apps/web/src/components/screening/upload-form.tsx); rule 6 lets us change shared docs, but nothing else of #42's — in particular not the screening upload-form.`

const SCOUTS = [
  { key: 'eval', what: `the evaluation harness and the synthetic sets: packages/model-gateway/eval/* (score.ts, harness.ts, baseline.ts, baseline.json, faults.ts, sets.ts, cli.ts, reference.ts, gate.golden.test.ts, score.test.ts), packages/synth/src/eval/* (cases, contract-set, formats, narrative-set, eval.test.ts), how contract PDFs/CSVs/scans are generated and read (pdf.js, the scan reader's recording), packages/model-gateway/src/providers/local.ts, src/functions/contract-terms.ts (the verifier: quote on page, value in quote, conflictsWith, the problems list), src/untrusted.ts (framing of untrusted document text), and the vitest golden project config and how long the golden gate test takes today (look at CI config .github/workflows/ci.yml and vitest configs). Answer precisely: how a wrong-but-verified field could arise (e.g. a value quoted from another row's line), what conflictsWith detects, how the set's SHA-256 is computed, how layouts and textless scans work, what the current injection test (MOD-04) does and where, and what the cost would be of documents of 80 pages / 60 codes in CI time.` },
  { key: 'serving', what: `how model features are served and switched: packages/model-gateway/src/{evaluated.ts,gateway.ts,flags.ts,config.ts,prompts.ts,purposes.ts,spec.ts,specs.ts,permitted.ts,redact.ts,errors.ts,index.ts}, the four prompts under packages/model-gateway/prompts/*, src/functions/{evidence-requests,denial-letter,narrative}.ts, and every caller in apps/web and apps/worker (grep for gatewayFor, assertEvaluated, unevaluatedModels, ModelFeatureOffError, model flags). Answer precisely: where assertEvaluated is enforced today (production only? which provider kinds?), what happens to evidence-requests and read-denial-letter in production, how a per-feature switch-off could be built without a migration (flags are where? env/config or DB?), what the kill switch is, and how permitted examples (eval_example, recordPermittedExampleIn, CORRECTION_FORMAT) are stored and evaluated inside the PHI boundary (permitted.ts) — and whether keeping ACCEPTED proposals as examples needs any schema change (check the eval_example table and its constraints in packages/db/migrations) and what the data-rights agreement's recorded terms permit (search docs/ for data-rights, PRD 14, legal text).` },
  { key: 'phi', what: `the contract proposal path and patient identifiers, for #120: apps/web/src/lib/models/contract-proposals.ts and its route/action callers, apps/web/src/lib/models/path.ts, apps/web/src/lib/contracts/evidence.ts, the document upload panel (apps/web/src/components/uploads/uploader.tsx, components/contracts/forms.tsx, and whatever preselects kind 'contract'; find the server-side Zod schema for the upload kind), how source_document.kind is set and can be changed, and how the practice's identifiers are stored: patient_ref.member_id (encrypted, no lookup hash), claim.patient_control_number (encrypted, no hash), claim.payer_claim_control_number with payer_claim_control_number_hash (HMAC lookup, indexed), packages/db/src/crypto/cipher.ts (lookupHash, LOOKUP_COLUMNS, decrypt cost), and any other table holding member IDs or claim numbers (packets, submissions, screening). Also packages/packets identifierForms/identifierSpans and model-gateway redact.ts (how the denial-letter path finds identifiers). Answer precisely: what an exact match check can be built WITHOUT a migration (payer claim number via hash of page tokens; member ID and patient control number only by decrypting the practice's own values — estimate the row counts and cost for a large practice, and whether readWithAudit applies), how page text should be tokenized so that identifierForms-style forms match without shape heuristics, what "long" patient control number should mean (look for any length rule in the codebase or docs), where the refusal must be enforced so it cannot be skipped (web path, gateway, or both), what the logging rules say (packages/observability, lint:logs), and where the UI shows the not_proposed problem today.` },
  { key: 'docs', what: `the documents and records the design must fit: docs/product/prd*.md or wherever PRD 14 (models) and PRD 16 (AI statement) and PRD 18 (test layers) live; docs/adr/0051 and 0054 in full; docs/adr/0066 (as a model of one ADR with a part per PR) and the ADR template/format the repo uses; docs/product/test-matrix.md (the MOD rows and the format of rows); docs/product/reconciliation-001.md's item list for PR 16 (the red team) and anything it says about the model gate or the first real-model baseline run; docs/runbooks for the model evaluation run; packages/synth/src/cases/{registry,matrix}.ts (how a case is registered, whether a no-file registry entry exists); stryker/shards.json (is model-gateway a mutation-gated package?); .claude/agents/security-reviewer.md; the CI jobs that run the golden project and their time; and the PR template .github/pull_request_template.md. Also /home/user/ops/designs/lane-b-ci.md and lane-b-pr15-ledger-tests.md as models of a Lane B design document's shape. Answer: the exact format to follow, every doc the PRs must update, and every check (CI job) they must pass.` },
]

const NOTES = {
  type: 'object',
  properties: {
    findings: { type: 'string', description: 'the answers, precise, with file:line citations; long is fine' },
    risks: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'risks', 'improvements'],
}

phase('Scout')
const scouted = await parallel(SCOUTS.map(s => () => agent(`${COMMON}

You are scout "${s.key}". Read and map ${s.what}
${SAVE('scout-' + s.key + '.md', 'your findings so far')}
Also write your final findings to ${DIR}/scout-${s.key}.md (create the directory). Return them.`, { label: `scout:${s.key}`, phase: 'Scout', schema: NOTES })))

const notes = scouted.map((s, i) => s ? `### Scout ${SCOUTS[i].key}\n${s.findings}\nRisks: ${s.risks.join(' | ')}\nImprovements: ${s.improvements.join(' | ')}` : `### Scout ${SCOUTS[i].key}: (lost; read ${DIR}/scout-${SCOUTS[i].key}.md or the code yourself)`).join('\n\n')

const POSITIONS = `The session's starting positions (keep, change or overturn each on evidence, and say which):
1. Two PRs, in this order: co-001/model-eval-gate (#84) then co-001/contract-phi-check (#120), each from the latest claude/build-platform, one ADR 0070 with a part per PR (like ADR 0066). Reasons: different review lenses (AI safety/evaluation correctness vs security/PHI), mostly disjoint files, #120 small. If both touch contract-proposals.ts, the second merges the first in.
2. #84's metric: per field, "wrong_verified" (the verifier passed the field and code reads a value other than the truth) counted apart from "rejected" (the verifier refused it) and "missed"; gated never rising against the baseline overall and per field, and zero on every case whose page text is faithful (all but seeded-OCR-error scans), whatever the baseline. Plus absolute per-field recall floors as a committed file whose values are set by people (the founder and the specialist) before production; a missing floor refuses a real provider in production (fail closed), never in CI's local run. The PR builds the mechanism, never chooses the numbers.
3. Set v2 as a new set beside v1 (v1 kept so the old baseline remains readable, or retired: decide), generated by packages/synth: size tiers up to 60 codes and 80 pages, contract-plus-exhibit pairs, multi-row tables, scans with seeded OCR errors (unfaithful cases, marked), struck-through rates, injected-instruction twins (the gate requires zero difference between twin and clean twin), decoy amended-rate paragraphs (both candidates must be flagged conflicting). Faults the gate must catch: swapped rows (a value and its quote taken from another row, which the verifier passes), plus the existing ones. CI time must stay bounded: say how.
4. Keep accepted proposals as permitted examples too, under the same data-rights agreement — only if its recorded terms permit it; if they cover corrections only, that is legal text and the founder's (stop and say so).
5. Per-feature serving: each purpose (proposeContractTerms, draftPacketNarrative, suggestEvidenceRequests, readDenialLetter) is served in production by a real provider only when its own prompt version and model have a baseline; an unevaluated purpose is switched off (its feature-off error, the product's hand path) instead of refusing the whole provider. Evidence-request and denial-letter features have no set today, so they stay off in production until sets exist (say whether sets for them belong in this PR).
6. #120: before proposeContractTerms is called, the page text is tokenized and checked against the practice's own records for an exact payer claim control number (by its keyed lookup hash, indexed), member ID and patient control number (no stored hash exists, so: decrypt the practice's values in batches inside the request and compare in memory, or another no-migration way you find better); a hit refuses with a code ('this document names a patient of the practice and was not sent'), logs the code only, and records nothing of the match; enforced so no caller can skip it (e.g. the gateway's contract input requires a screen result only the screen produces). The upload panel leaves the kind unset until the person picks it (server-side too). A lookup-hash column for member ID and patient control number would be a migration: a proposal for Lane A, not this PR. The decrypt-in-request cost is a cost/security trade-off for the co-founder: write it as a question with the recommended option.
7. "Add these attacks to PR 16's red team": a hand-off recorded in the ADR and reconciliation-001's PR 16 entry (or wherever PR 16's red team list lives), not built here.`

phase('Draft')
const draft = await agent(`${COMMON}

You are the design author. Write the design document ${DOC} for this item. The scouts' notes (also in ${DIR}/scout-*.md):
${notes}

${POSITIONS}

Read the code yourself wherever the notes are thin or a decision rests on it. The document follows the shape of ${OPS}/designs/lane-b-ci.md and lane-b-pr15-ledger-tests.md. It must contain: the decision on one PR or two, with evidence; for each PR: its scope (every file it changes or adds, by path), the design of each part with enough precision that builders can implement without re-deciding (types, function signatures, report and baseline format versions, gate problem codes, the exact metric definitions with a worked example, the set v2 case list and sizes, the synth generator's design, the fault list, how CI time stays bounded with numbers, the PHI-screen algorithm with its tokenization and its enforcement point, the refusal code and wording, logging), what it must not change (reconciliation-001's checks: the engine freeze, golden fixtures and synthetic releases unchanged, no migration, ledger untouched, no PHI anywhere), the test-matrix rows MOD-07..MOD-12 with their wording and which PR owns each, synth case IDs, ADR 0070's parts, every document to update, the tests each PR adds and the checks it must pass, the reviews each PR takes (security-reviewer for PHI/gateway boundary; an AI-safety and evaluation-correctness review), confirmation that neither needs a migration (with the evidence), open questions for the co-founder (cost/security trade-offs only, each with a recommended option) and for the founder (founder-kept matters only), and proposals outside the PRs' files. Be precise; no padding.
${SAVE('author.md', 'the outline and which sections are written')}
Write the document, then return a summary of its decisions and its open questions.`, { label: 'author', phase: 'Draft' })

phase('Review')
const review = await agent(`${COMMON}

You are the one adversarial design reviewer. Read the design ${DOC} and verify it against the code (read the code; do not trust the document). Attack it on: (1) evaluation correctness: does the metric really see a silent wrong value, can a model change game it (e.g. by stating fewer fields, by splitting or merging candidates, by the pairing rule in score.ts), is "never rising" well defined across set changes, does the gate fail closed on every path (missing baseline, missing floor, set changed, a twin pair incomplete, a crash mid-run), are the faults sufficient to prove the gate sees each danger; (2) AI safety: can any model output reach a money path, an approval or a stage; injection twins' comparison is exact; per-feature serving cannot be bypassed; (3) PHI and security for #120: can the screen be skipped by any caller, does it log or store anything identifying, are its false positives and negatives acceptable, does decrypt-in-request create exposure, is the upload-kind change enforced server-side, does it touch any #42 file; (4) feasibility: CI time, the size of set v2 in the repository (fixtures/synthetic size, gitleaks and the fixture guard's X12 check), mutation shards; (5) completeness against both audit items' "best option" text word by word: list every clause and whether the design covers it; (6) the no-migration claim. Severity each finding: blocking, major, minor.
${SAVE('reviewer.md', 'the findings so far')}
Write your review to ${DIR}/review.md and return it.`, { label: 'design-reviewer', phase: 'Review', schema: {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'major', 'minor'] }, finding: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'finding', 'fix'] } },
    coverage: { type: 'string' },
  },
  required: ['findings', 'coverage'],
} })

phase('Revise')
const revised = await agent(`${COMMON}

You are the design author again. The adversarial review of ${DOC} (also in ${DIR}/review.md):
${JSON.stringify(review)}

Answer every finding: fix the design for each one you accept (verify against the code first), or rebut it with evidence. Append a section "Design review and dispositions" to ${DOC} listing each finding ID, its severity, and its disposition (fixed: how; or rebutted: why). Keep the document coherent (edit the body, not just the appendix).
${SAVE('revise.md', 'the findings dispositioned so far')}
Return: the final list of decisions, the open questions (each: for whom, the question, the recommended option), and the dispositions.`, { label: 'revise', phase: 'Revise', schema: {
  type: 'object',
  properties: {
    decisions: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'object', properties: { for: { type: 'string' }, question: { type: 'string' }, recommended: { type: 'string' } }, required: ['for', 'question', 'recommended'] } },
    dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, disposition: { type: 'string' } }, required: ['id', 'severity', 'disposition'] } },
    needsMigration: { type: 'boolean' },
  },
  required: ['decisions', 'questions', 'dispositions', 'needsMigration'],
} })
return { draft, revised }
