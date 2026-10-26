# Scout "phi": contract PHI check before the model (#120)

Read-only scout of `/home/user/PhysicalTherapy` at `claude/build-platform` 6ddd587, 2026-10-26. No repository file was edited. The only command run was a small crypto timing test in the scratchpad.

## 0. Headline (read first)

1. **Everything #120 needs has a model to copy: the denial-letter screen.** `PurposeSpec.screen` (packages/model-gateway/src/spec.ts:37-43) runs before the idempotency key, the budget and the call (gateway.ts:165-166). The letter reader already asks an injected `OtherPatientCheck` (functions/denial-letter.ts:53-55, 232-237). The worker builds that check as `otherPatientRecords` (apps/worker/src/packets/letter-records.ts:38-90). It decrypts every member ID, PCN and payer claim control number the practice holds, compacts each one, and keeps them in a Set. ADR 0054:60-71 records the design. `contractTermsSpec` (functions/contract-terms.ts:381-405) has no `screen` today.
2. **LOUD: the best option needs a migration. Lane B cannot open it.** The check can be built without one (section 3). But member ID and PCN have no lookup hash, so the only exact check is to decrypt every value the practice holds, on every proposal. `readWithAudit` writes one audit_event per row (packages/db/src/authz/audit.ts:6-7, 59-86). For a large practice that is about 1M audit rows and about 11 s of decryption per click. The best design adds compact-form HMAC lookup columns: `patient_ref.member_id_hash` and `claim.patient_control_number_hash`, and a compact-form hash for the payer CCN, because the existing hash is over the raw value. Each becomes an indexed `= ANY($hashes)` query that audits only the rows that match. That is "Database: yes", which contradicts the audit's "Database: no". The founder must rule. If the migration is approved, Lane A (or a Lane B PR the founder rules on) carries it under the schema gate.
3. **LOUD: there is no way back for a misfiled document today.** `source_document.kind` cannot change after insert: the only grants are `UPDATE (sha256, scan_status, scan_at, status)` (migrations/20261016090000_documents_payers_plans.sql:211) and `(page_text_status, page_count)` (20261017120000_document_page_text.sql:26). Re-uploading the same bytes as `payer_letter` makes the new copy a **duplicate** of the misfiled contract, and it is held. The reasons are `claimBytes` (apps/worker/src/intake/intake.ts:124-139, keyed on practice, sha256 and format_id, not kind) and the unique index `source_document_first_of_its_bytes (practice_id, sha256, coalesce(format_id,''))` (20261102090000_era_export_intake.sql:114). Fixing this needs a migration: kind in the index, or a kind-correction grant. Until then the refusal text must not say "upload it again as a payer letter".

## 1. The contract proposal path (who sends pages, and from where)

- **Web, the specialist's click.** The version page form (`app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx:118`) calls `proposeTermsFormAction` (`abstraction/actions.ts:73`), then `proposeTermsAction` (`lib/routes/models.ts:42-62`). That action is Zod `{versionId, documentId, ambiguous, requestKey}`, needs permission `rate_record.edit` and records audit `model_proposal_requested`. It calls `proposeTerms` (`lib/models/contract-proposals.ts:108-181`), whose steps are:
  - version is draft, and the document is in `source_document_ids`;
  - `readWithAudit` of `source_document` (purpose `contract_proposal`) for kind and sha256;
  - kind must be one of `CONTRACT_KINDS`, otherwise `ProposalRefusedError('document_kind')`;
  - `loadPracticeCipher`;
  - `evidenceFor(...).pages()` (`lib/contracts/evidence.ts:34-63`), which is audited `contract_evidence`, accepts kind IN contract, exhibit or payer_letter with scan clean, and opens the sealed page text;
  - `gatewayFor`, then `gateway.proposeContractTerms`.

  **The check belongs between `pages` and the gateway call: lines 133-143.**
- **Worker, the permitted evaluation inside the PHI boundary.** `apps/worker/src/models/permitted.ts:144-154`. It re-sends each permitted example's document to the gateway, in its own job scope. The page text is read in one transaction that ends before the call (`:174-175`). This path also sends practice contracts, so it needs the same check. A refusal here should score as a problem (`refused:<code>`, via `problemOf` at :130-141). It already does that for any `InputRefusedError`.
- **Eval harness:** `packages/model-gateway/eval/harness.ts:149`, with `practiceId: null` (synthetic, no practice records).
- **Gateway:** `ModelGateway.proposeContractTerms` (gateway.ts:113). Inside `limited()` (147-193) the order is: kill switch, flag, PHI boundary, then `spec.prepare`, `spec.screen`, idempotency, budget hold, call. **A screen refusal writes no model_call row and logs nothing** (gateway.ts:165-166; there is no logger call on that path). `contractTermsSpec.prepare` (contract-terms.ts:385-404) checks the kind against the caller-supplied `input.kind`. That is the drop-down's value, so today the gateway trusts whatever the uploader picked.
- `path.ts` `modelProblem` (path.ts:146-164) maps both `InputRefusedError` and `PhiBoundaryError` to the one generic problem `refused`.

## 2. How kind is set, and the upload panel

- Server Zod: `fileSchema` at `apps/web/src/lib/routes/uploads.ts:174-185` has `kind: z.enum(DOCUMENT_KINDS)`, so kind is **required** server-side. `DOCUMENT_KINDS` is defined at `packages/db/src/schema/documents.ts:18`. The row is inserted at uploads.ts:243. The preselect is client-side only.
- The preselect: `components/uploads/uploader.tsx:141`, `useState<UploadKind>(kinds?.[0] ?? {x12_835 ...})`. The `<select id="upload-kind">` (318-338) has no empty option. The contracts page passes `upload.kinds` built from `CONTRACT_DOCUMENT_KINDS = ['contract','exhibit','payer_letter']` (`lib/routes/contracts.ts:47,123`), so **'contract' is preselected** (`app/p/[practiceId]/contracts/page.tsx:207`). The same page also takes the drop zone's `contentTypes` from `upload.kinds[0]` (contracts/page.tsx:206). The same pattern appears in reconciliation (`reconciliation/page.tsx:271-272`, posting_export first) and on the uploads page (`uploads/page.tsx:40-48`, x12_835 first).
- `components/contracts/forms.tsx` has no kind. `TagForm` tags a document to a payer or contract and shows its kind through `KIND_NAMES` (`lib/uploads/receipt-labels`).
- **A zip's entries inherit the zip's kind** (`apps/worker/src/intake/intake.ts:326-328`, `zip.kind`). A zip of mixed papers filed as a contract makes every entry a contract.
- Lane A's PR #42 touches `components/screening/upload-form.tsx`, not `components/uploads/uploader.tsx`, so there is no conflict.
- e2e: `contracts.spec.ts:42` already selects 'contract' explicitly, as does `packets.spec.ts:423` for payer_letter. Many e2e specs upload an 835 on /uploads without selecting a kind, relying on x12_835 being first. If every multi-kind panel goes unset, those helpers must select the kind.

## 3. Where the practice's identifiers live

| Value | Column | Stored | Lookup |
|---|---|---|---|
| Member ID | `patient_ref.member_id` (migrations/20261016120000_remittances.sql:44) | enc, nullable | **none** |
| Patient control number (CLP01) | `claim.patient_control_number` (:106) | enc, NOT NULL | **none** |
| Payer claim control number (CLP07) | `claim.payer_claim_control_number` (:107) | enc | `payer_claim_control_number_hash` (:108), index `claim_by_payer_claim_control_number (practice_id, hash)` (:134) |
| PCN as the posting export writes it | `posting_row.claim_reference` (20261023120000_recovery_ledger.sql:87) | enc | none. Its `fingerprint` is a row hash, not usable. |

- `cipher.ts`: `ENCRYPTED_COLUMNS` at :39-59. `LOOKUP_COLUMNS` at :69 holds only `claim.payer_claim_control_number`, `patient_ref.pseudonym`, `posting_row.fingerprint` and `eft_row.fingerprint`. `lookupHash` (:366-368) is `HMAC-SHA-256(lookupKey, column \0 value)` over the **raw value, with no normalization**. The loader hashes CLP07 as parsed with `clp.raw(7)` (packages/edi835/src/transaction.ts:793; apps/worker/src/parse/loader.ts:387). A hash match therefore requires the page to write the value exactly as the 835 did, raw or compact (see 4b).
- Decrypt cost, measured in the scratchpad on this machine with Node AES-256-GCM over values like the stored ones: **about 5.2 µs per value**. HMAC-SHA-256 is **about 2.0 µs**.
- ERA-export claims go into `claim` too (20261102090000_era_export_intake.sql:195-215), so they are covered.
- Other tables:
  - Packets, packet versions and submissions hold **placeholders only** (`{{member_id:n}}` and the rest; 20261023090000_packets_submissions_and_responses.sql:94, re-checked in 20261103090000:457).
  - `submission.reference` and `payer_response.notes` are encrypted free text, not patient identifiers of record.
  - Screening refuses PHI columns outright (`screening_rejection_valid` lists the PHI kinds; 20261104090000_free_screening.sql:110-127) and stores no identifiers.
  - `patient_ref.group_number` is an employer group number. Leave it out: contracts may legitimately carry group numbers.

## 4. What an exact check can be built without a migration

### 4a. Recommended no-migration design: hash path plus decrypt path, one screen

- **Payer CCN, through the existing hash (cheap, indexed).** Build the page's candidate spans (4c). For each span, compute `lookupHash('claim.payer_claim_control_number', form)` for the span **as written** and for its **compact form**. Then run one query: `SELECT id, practice_id FROM claim WHERE practice_id = $1 AND payer_claim_control_number_hash = ANY($2::text[])` through `readWithAudit` (objectType `claim`, purpose for example `contract_screen`), which audits only the matching rows. That is normally zero rows, and a match is a real PHI read, so auditing it is right.
  - Cost for an 80-page document (about 32k tokens): about 60-100k spans with joins capped by length, times two forms, at 2 µs, is about 0.2-0.4 s of HMAC, plus one indexed query with a large array parameter (about 6-13 MB). Splitting the array into batches of about 10k is fine.
  - The miss: a stored CLP07 that contains a separator the page writes differently. The decrypt path catches that, and so does the compact-hash migration.
- **Member ID and PCN, only by decrypting every value the practice holds.** Use the same shape as `otherPatientRecords`, but with no exclusion list: `SELECT id, practice_id, member_id FROM patient_ref WHERE practice_id=$1 AND member_id IS NOT NULL` and `SELECT id, practice_id, patient_control_number FROM claim WHERE practice_id=$1` (optionally adding the payer CCN to the same read for completeness). Decrypt, apply `compactIdentifier`, filter by length (section 5), and keep a Set that never leaves the check. **`readWithAudit` applies** under the rule "PHI reads go through readWithAudit()" (.claude/rules/privacy-and-tenant.md), and it writes one audit_event per row returned. The letter screen does exactly this (letter-records.ts:42-66; letter-records.db.test.ts:83 asserts the audit rows).
- Cost estimates. These are my assumptions; the repository has no sizing figures.

| Practice | Claims held | patient_ref | Decrypts | CPU | Audit rows per proposal |
|---|---|---|---|---|---|
| Small | about 5k | about 1.5k | about 7k | about 0.04 s | about 7k |
| Medium | about 40k (20k/yr × 2 yr) | about 6k | about 50k (PCN) to 90k (with CCN) | 0.25-0.45 s | about 46k |
| Large billing entity | about 1M (300k/yr × 3+ yr) | about 80k | about 1.1M (PCN only) to 2.1M (with CCN) | about 6-11 s | **about 1.08M**, plus about 150-250 MB of ciphertext over the wire |

  The audit cost lands on every click of "Propose the terms", and again on every retry, because the card reappears while `proposals.length === 0`. It also lands in the 7-year audit retention. **This is why the best option is the hash-column migration (headline 2).** Without it, the decrypt path is correct but scales badly.
- Interim options, if the founder rules no migration for now, ranked:
  - (i) Decrypt path plus hash path exactly as above, accepting the cost. It is correct at every size and slow and audit-heavy only for large practices.
  - (ii) The same, computed once per request and shared across both callers. There is no cross-request cache: an in-process cache of PHI-derived values, even HMACs, in a multi-instance web tier is a new attack surface and an invalidation problem. Not recommended.
  - Never cap the read at "recent claims". That is a silent gap.

### 4b. Hash-form caveat

`lookupHash` is over the raw CLP07, and ERA-export CCNs are hashed as the export wrote them. Hash both the span **as written** (its original characters between its first and last token) and its **compact** form. A loader that ever trims or upper-cases differently breaks this silently, so add a db test that seeds a twin claim whose CCN contains a hyphen and a page that writes it spaced. In the migration design, the new lookup columns should hash the **compact** form (`compactIdentifier`), so writing variants stop mattering.

### 4c. Tokenizing the page text (exact, with no shape heuristics)

- **Do not reuse `identifierForms`** (packages/packets/src/verifier/mismatches.ts:114-127). It adds each **word** of an identifier as its own form, with at least 2 letters or digits. That suits names in a narrative, but a stored member ID written "ZZ 1234567" would contribute "ZZ" and "1234567" as forms and refuse ordinary contracts. That is exactly the false refusal the audit forbids.
- **Do reuse `compactIdentifier`** (model-gateway/src/redact.ts:73-75: NFKC, upper case, letters and digits only) as the one comparison form. It is what `identifierPattern` (redact.ts:78-84) means by "matches with or without the spaces and hyphens".
- **Do not reuse `identifierCandidates` unchanged** (redact.ts:251-269). Its tokens split only on whitespace and hyphens, and it then **drops any word with internal punctuation** (the `^[\p{L}\p{N}]+$` filter). So "Member ID:ZZ1234567", "Claim#9876543210" or "ZZ1234567." inside a parenthesis would never be candidates. It also joins at most 3 words, which misses an ID printed in 4 or more groups.
- Recommended tokenizer, a new shared function in redact.ts used by both screens:
  1. NFKC-normalize the page text.
  2. Tokens are the maximal runs of `[\p{L}\p{N}]`. Every other character is a boundary, so ':', '#', '/', '(' separate cleanly.
  3. From each token start, extend over following tokens **only while the separator between them is whitespace or a hyphen or dash (`[\s\-‐-―]+`)**, the same separator class as `identifierPattern`. Stop when the compact length passes the longest stored identifier (at most 50 for CLP07 and 80 for NM109, as the print-layout test notes at apps/worker/src/report/print-layout.test.ts:123). Do not stop at a fixed 3.
  4. A candidate is the compact concatenation. Test membership in the Set (decrypt path), or hash it as written and compact (hash path).
  5. The page-side filter is length only: compact length of at least the shortest stored value's minimum (section 5). No requirement for a digit on the page side.

  Boundaries are whole tokens, so "ZZ1234567" never matches inside "AZZ12345678", and an NPI, a date or a ZIP matches only if it **is** one of the practice's identifiers.
- A property test should show that this tokenizer finds every identifier wherever `identifierPattern` finds it, so the two paths cannot drift.

## 5. What "long" patient control number should mean

- **No length rule exists** anywhere in the code or docs. I searched docs/, packages/ and apps/ for length, digit or character rules on PCN, member ID and CLP01. The minimums that do exist:
  - `identifierPattern` and `otherPatientRecords` use a compact length of at least 2 (redact.ts:80; letter-records.ts:70-73);
  - `identifierCandidates` uses at least 5 with a digit (redact.ts:265);
  - X12 allows CLP01 up to 38 characters.
- Why the PCN alone gets a floor: it is **practice-assigned**, often a short sequential account number. A value like "1042" or "97110" would collide with page numbers, CPT/HCPCS codes (5 characters), ZIPs, years and amounts on an ordinary fee schedule. Member IDs and payer CCNs are payer-assigned and long in practice.
- Recommendation (needs a founder and specialist ruling, because there is no precedent in the repository):
  - **PCN: compact length of at least 8.** That excludes CPT/HCPCS codes, modifiers, 5-digit ZIPs, 4-digit years and ordinary amount digits. A 9-digit ZIP+4 or a 10-digit NPI can then collide only if it literally is one of the practice's PCNs.
  - **Member ID and payer CCN: compact length of at least 6, with at least one digit in the stored value.** This filters the stored values, not the page.
  - Record the numbers as named constants in redact.ts beside `compactIdentifier`, with a test showing that a synthetic fee-schedule twin set (all CPTs, ZIP+4s, NPIs, TINs, dates in every form) produces zero refusals against a practice twin whose PCNs are short.
  - A PCN below the floor is not checked. Say so in the ADR (0070) as a known, deliberate gap.

## 6. Where the refusal must be enforced so it cannot be skipped

**At both places, with the gateway as the authority.**

- **Gateway (cannot be skipped):**
  - Add a required field to `ContractPagesInput` (contract-terms.ts:82-92), for example `readonly patientRecords: PracticeIdentifierCheck`, which is `holdsPracticeIdentifier(pages) => Promise<boolean>` or, better, takes the spans. The type then forces every caller (web, the worker's permitted run, the harness) to supply one, exactly as `DenialLetterInput.otherPatients` does.
  - Add `screen` to `contractTermsSpec`. It refuses with `InputRefusedError('names_patient', 'this document names a patient of the practice and was not sent')`, a fixed sentence (errors.ts:1-4 rule: no text, no identifier).
  - Runtime guard against a no-op check: the check object carries the `practiceId` it was built for, and the gateway asserts it equals `context.practiceId`. `screen` does not receive `context` today (spec.ts:43; gateway.ts:166), so extend the signature to `screen(input, prepared, context)`.
  - For `practiceId === null` (synthetic evaluation), accept only a synthetic check built from packages/synth twins. Running the harness with twin identifiers lets MOD tests exercise the screen.
  - A gateway lint or unit test asserting that the only implementations are the record-backed one and the synthetic one, in the spirit of lint.test.ts and permitted.test.ts, guards against a future `{ holds: async () => false }`.
- **Why not the web path alone:** the worker's permitted evaluation (`models/permitted.ts:150`) re-sends practice contracts with no web code involved, and any future job would too. The web is where the check is **built**: the request's scope and cipher, with readWithAudit. The gateway is where it is **enforced**.
- **Shared implementation:** generalize `otherPatientRecords` (worker `packets/letter-records.ts`, exported via `@tp/worker/packets`, which the web already imports 30 times) into one `practiceIdentifierRecords(scope, cipher, {practiceId, excludePatientRefIds, requestId, purpose})`. The letter screen excludes its own patient; the contract screen excludes none. Add the hash pre-check for the CCN. The worker's permitted run needs a check that opens its **own** `inScope` transaction when asked, because the call is made outside any transaction (permitted.ts:174-175).
- Also tighten the kind check: the gateway still sees only the caller-supplied kind. Keep the web's `CONTRACT_KINDS` check, which reads the DB row, and add nothing more. The screen is the real defence against a mislabelled kind.

## 7. Logging rules

- `packages/observability/src/fields.ts`: `ALLOWED_LOG_FIELDS` (:9-41) includes `practice_id`, `document_id`, `contract_version_id`, `request_id` and `error_code`. `NUMERIC_LOG_FIELDS` (:49) is `elapsed_ms` and `record_count`. `FORBIDDEN_FIELD_PATTERNS` (:72-78) forbids name, dob or birth, member, subscriber or insured, claim number, control number, pcn, icn, clp01/clp07, text, content, page, quote and raw. `pnpm lint:logs` (tools/lint-logs/index.ts, scan.ts) statically checks every log call's keys, and the runtime logger drops anything else (phi-guard.ts).
- On a refusal, add one line, because today nothing logs a screen refusal: `logger.warn('a contract was not sent to a model: it names a patient of the practice', { practice_id, document_id, error_code: 'MODEL_INPUT_NAMES_PATIENT' })`. Log **only the code**. Do not log which kind of identifier matched, how many matched, or `record_count`: the kind and count say something about the document's content, and "logs the code only" is the audit's wording. Do not log the claim row IDs either. The audit rows of a hash hit already record the read.
- No model_call row is written, because the screen runs before the call (gateway.ts:165-166). The route's own audit event `model_proposal_requested` (routes/models.ts:50) is still recorded, since `not_proposed` returns normally.

## 8. Where the UI shows the not_proposed problem today

- `proposeTermsAction` redirects to `/p/<practice>/abstraction/versions/<version>?model=<problem>` (routes/models.ts:29, 60). That is a code in the URL, never PHI.
- `abstractionVersionPage` parses `model: z.enum(MODEL_NOTICES).optional().catch(undefined)` (lib/routes/abstraction.ts:136, 153).
- `<ModelNoticeAlert notice={modelNotice}/>` renders at page.tsx:105 (components/models/display.tsx:17-28): a destructive Alert titled "Nothing was proposed", with text from `MODEL_PROBLEM_TEXT` (lib/models/notices.ts:8-20).
- Today a refusal shows `refused`: "The input cannot be sent to a model as it is; enter it by hand."
- Add a problem `names_patient` to `MODEL_PROBLEMS`. In `modelProblem`, map `InputRefusedError` whose code is `names_patient` to it before the generic `refused`. Text: "This document names a patient of the practice and was not sent to the model. If it is a payer letter or an EOB, it was filed as the wrong kind; enter the terms by hand." Mention re-filing only once headline 3 is fixed.
- The "Propose the terms" card stays visible after a refusal, because it depends on `proposals.length === 0` (page.tsx:107). A second click repeats the whole check. This is acceptable once the hash columns exist; until then it is a cost (section 4a).

## 9. Upload panel: kind left unset

- In `Uploader`, when `kinds` has more than one entry, start with no kind (`useState<UploadKind | null>(null)`), add a disabled placeholder `<option value="">Choose the kind of document</option>`, and refuse a drop or file choice with "Choose the kind of document first" (the same pattern as the ERA format check at uploader.tsx:182-184).
- The contracts and reconciliation pages pass `limits.contentTypes` from `kinds[0]` (contracts/page.tsx:206; reconciliation/page.tsx:271). Derive it from the chosen kind instead, or from the union of all kinds.
- The server is already strict, because kind is required in `fileSchema`. Add a route test that a request without a kind is refused.
- This is a shared component, so all three panels change. The model risk is only on the contracts page, but leaving every panel unset is the more consistent choice. It costs an e2e helper change for 835 uploads on /uploads.

## 10. Suggested test rows (MOD-07..MOD-12 are reserved; #84 shares them, so split with scout-eval)

- A contract twin with a practice member ID printed spaced and after a colon ("Member ID:ZZ 123 4567"): refused with `names_patient`, no model_call row, log code only. Also the same through the worker's permitted run, which scores `refused:names_patient`.
- A fee-schedule twin with every CPT, ZIP+4, NPI, TIN and date form, against a practice with short PCNs: not refused.
- A payer CCN written as the 835 wrote it and compact: refused through the hash path, with only the matching claim audited.
- A zip of mixed documents filed as a contract: the EOB entry is refused.
- Upload panel: no kind preselected; a drop before choosing is refused.

## Risks

- A decrypt-every-identifier check at a large practice costs about 1M audit rows and seconds of CPU per proposal click. It is correct, but it does not scale without the hash-column migration.
- The existing payer-CCN hash is over the raw CLP07, so a hash-only check misses a CCN the page writes with different separators.
- A misfiled document cannot be re-filed: kind is immutable and re-uploading the same bytes becomes a held duplicate. Fixing this needs a migration.
- Single-case agreements, which name one patient, will be refused. This is correct behaviour, but specialists will meet it and need the hand-entry text.
- The PCN minimum length is a new rule with no precedent in the repository. Too low means false refusals; too high means short PCNs pass.
- A screen that is not mandatory in the type or not tied to the practice could be bypassed by a future caller passing a no-op check.
- Leaving the kind unset in the shared Uploader changes e2e helpers across many specs.
