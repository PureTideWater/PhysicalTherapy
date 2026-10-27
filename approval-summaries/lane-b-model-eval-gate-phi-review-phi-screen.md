# PR #75 (co-001/contract-phi-check, head 9b7eadfe): PHI-screen correctness and AI-safety review

Reviewer: the PHI-screen correctness and AI-safety lane. Scope: the matching itself (`identifierRuns`, the stored-side
rules, `screenSet`/`pagesName`), the bound, fail-closed paths, the issued-check registry and the practice match, the
permitted run's scoring, the synthetic twins and the MOD-12 tests. Base e908c214. Synthetic data only.

Every proof below ran in my own clone
(`/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/review-phi-screen`),
under the shared lock, against the shipped code. The review's test files are untracked there:
`packages/model-gateway/src/review-phi.test.ts`, `packages/model-gateway/src/review-phi.db.test.ts` and
`packages/model-gateway/eval/review-collisions.golden.test.ts`. Logs are in `.../scratchpad/phi/logs/rps-*.log`.

**Verdict:** the design holds. The registry, the practice match, the order of checks, screening `prepared.user`,
fail-closed on every load error, and the measurement are sound, and nearly every MOD-12 test fails when the code it
covers is mutated. One unlisted false negative is major: a stored identifier written on the page exactly as stored is
missed when it contains a `.`, `/`, `_` or `*`. Six minor findings follow, and "What it gives up" is incomplete in
places, with two of its sentences wrong. Each one has a cheap fix.

## Findings

### 1. MAJOR: a stored value written verbatim is sent when it holds a separator other than a space or a dash

- **Where:** `packages/model-gateway/src/redact.ts:325` (`JOIN`), `:350-372` (`identifierRuns`), with
  `screenIdentifier` (`:311-318`), which compacts the stored value. The ADR's justification for N5 is
  `docs/adr/0070-…md:834`: "decryption catches every writing".
- **Scenario:** the stored side compacts `SYNPCN.12001` to `SYNPCN12001`. The page side treats `.` as a boundary that
  JOIN does not bridge, so the page's runs are `SYNPCN` and `12001` and never `SYNPCN12001`. Proven through the
  shipped `syntheticRecordsCheck` (`review-phi.test.ts`, which passes at head). Each of these pages answers `clear`:
  - PCN `SYNPCN.12001` on the page "Patient Acct: SYNPCN.12001";
  - PCN `20261234/01` on "Patient Acct: 20261234/01";
  - CCN `E7712000.345` on "Claim E7712000.345";
  - PCN `ACCT_000123456` on "Account ACCT_000123456".

  The same happens for `*` and for a member ID like `ZZ712.0034`. CLP01 and CLP07 are X12 AN, and PM systems and
  payers do issue values like `123456.01` or `A12345/1`. MOD-12's second scenario is a rate-correction exhibit that
  cites a claim by its payer claim number alone ("from claim … onward"). If that payer's number carries such a
  character, the exhibit goes to the model with the claim number in it. The ADR does not list this gap. It also makes
  N5's reason false for exactly these values: the raw-value hash would have caught the verbatim writing, and
  decrypting plus compacting misses it.
- **Fix:** while it builds the set, `screenSet` should collect every character that sits between two letters or
  digits inside a kept stored value and is not already a joiner, for example
  `/(?<=[\p{L}\p{N}])([^\p{L}\p{N}\s\-‐-―])(?=[\p{L}\p{N}])/gu` on the NFKC form. Pass those characters to
  `identifierRuns`, whose JOIN then also accepts exactly one of them between two tokens. Add `{ joiners }` to
  `ScreenSet`. Add a redact test for each of the four writings above, and a pinned twin class of dotted and slashed
  PCNs to `eval/gate.golden.test.ts`.
- **False-refusal cost:** none for a practice whose identifiers hold no such character. That covers the shipped twin
  and the collision classes, so the pinned numbers cannot move. A practice whose identifiers do hold one gets page
  figures joined over that character (for example `1234.56` becomes `123456` when `.` is a joiner). Such a join
  refuses only when the result equals one of that practice's kept values, and the new twin class measures it. A
  zero-cost alternative: compare such runs in literal form (NFKC, upper case, separators kept) against the literal
  stored values.

### 2. minor: invisible characters and U+2212 inside an identifier hide it (not listed)

- **Where:** `redact.ts:325` (JOIN's dash class `[-‐-―]`) and `:351` (NFKC keeps format characters).
- **Scenario:** each of these writings answers `clear` through the shipped check (`review-phi.test.ts`, passing at
  head), while the stored side strips the same characters (`compactIdentifier`):
  - a soft hyphen (U+00AD) in `ZZ712­0034`;
  - U+200B, U+200C, U+2060 or U+FEFF inside a member ID, a claim number or a PCN;
  - a minus sign U+2212 in `77−1200−0000345`.

  These characters come from HTML-to-PDF payer-portal prints and from text and CSV exports, which the page reader
  passes through as they are.
- **Fix (prototyped and measured):** `const normal = text.normalize('NFKC').replace(/\p{Cf}/gu, '')`, and the JOIN dash
  class becomes `[\p{Pd}−]`. With that change the four MOD-12 unit files pass (126 tests), the seven review cases
  turn to `names_patient`, and `eval/gate.golden.test.ts -t 'contract PHI check'` passes with every pin unchanged.
  **Measured false-refusal cost: zero** on set v2 and on every collision class. The letter redaction's
  `identifierPattern` (`redact.ts:83`) has the same gap; that one is pre-existing, for P9.

### 3. minor: a load that fails at a decrypt keeps the plaintexts it made and rolls back their audit rows

- **Where:** `patient-records.ts:156-165` and `:283-293`. `screenSet` decrypts inside the `withJobScope` callback, and
  `readWithAudit` writes its audit rows in the same transaction (`packages/db/src/authz/audit.ts:59-88`).
- **Scenario:** one row of the practice does not decrypt. `models-routes.db.test.ts` builds exactly this state ("One
  claim's patient control number no longer decrypts"). The member IDs and earlier claims decrypt first, then the
  callback throws, the job transaction rolls back, and the screen's `read` audit rows go with it. The outcome is still
  `screen_failed`. Proven on Postgres (`review-phi.db.test.ts`): `{"decryptedPlaintexts":3,"auditedReadsKept":0}`.
  ADR:703-705 says every row returned is audited. That is false on this path, and the gap list (ADR:745-748) names
  only the person's event.
- **Fix:** return the ciphertext rows from the job scope, so the audit rows commit, and decrypt and build the set after
  `withJobScope` resolves. A decrypt failure then answers `screen_failed` with every read audited. Keep my DB test as a
  regression, and have the web's `screen_failed` test assert that the screen's reads exist.

### 4. minor: the bound counts in one snapshot and reads in another

- **Where:** `patient-records.ts:161-164`. `withJobScope` runs at READ COMMITTED (`packages/db/src/authz/scope.ts:260`,
  plain `BEGIN`).
- **Scenario:** a practice at exactly 50,000 identifiers. An 835 load commits between the count and the read, and the
  screen reads all of it. Proven on Postgres: the count said 50,000, then 1,000 claims committed, and the check read
  26,000 claims (52,000 identifiers), audited 26,000 rows and answered `clear`. "At most the bound's number"
  (ADR:704-705) is false under concurrency. The overshoot is one concurrent load's size.
- **Fix:** after reading and before decrypting, refuse with `too_many` when
  `patients.length + 2 * claims.length > SCREEN_MAX_IDENTIFIERS` (the reads are already audited). Better still, give
  `JobScopeRequest` the `oneSnapshot` option that `withPracticeScope` already has and open the screen's scope at
  REPEATABLE READ, so the count and the reads agree.

### 5. minor: the tokenizer builds every run of the whole request before it compares

- **Where:** `redact.ts:350-372` builds a `Set` and then an array. `pagesName` (`patient-records.ts:118-125`) calls it
  on the whole `prepared.user` (`contract-terms.ts:508`), which is one string holding every page.
- **Scenario:** a workbook is one page per sheet (`page-thread.ts:17`), so one sheet can carry close to the 16 MiB
  page-text cap and still pass `MAX_PAGES`. Measured on synthetic dense text with the shipped `identifierRuns`:

  | Text | maxLength | Time | Heap |
  | --- | --- | --- | --- |
  | 2 MB | 38 | 1.4 s | 191 MB |
  | 8 MB | 38 | 7 s | 621 MB |
  | 16 MB | 50 | 17 s | 1.7 GB |

  This runs on the web request's event loop, once per click. A long PCN or member ID in the practice raises
  `maxLength`.
- **Fix:** make `identifierRuns` a generator, or have it take a `has(run)` predicate, and return on the first hit.
  There is then no Set and no array, memory stays O(maxLength), and a document that names a patient stops early. No
  false-refusal cost. Optionally screen page by page: the frame's newlines already separate the pages.

### 6. minor: one assignment removes the screen for every caller in the process

- **Where:** `packages/model-gateway/src/specs.ts:11-16` (`as const` is type-only), `contract-terms.ts:522-549`, and
  `spec.ts:47` (`screen?` is not readonly).
- **Scenario:** `PURPOSE_SPECS.proposeContractTerms.screen = …` (or `delete`) type-checks and makes the gateway skip
  the screen (`gateway.ts:275`, `spec.screen?.(…)`). It also leaks across tests that share the module. The ADR's "why
  no caller can skip it" defends the check object with a WeakSet and `Object.freeze`, but not the spec that decides
  whether the check runs. `review-phi.test.ts` asserts both objects are not frozen, and it passes at head.
- **Fix:** freeze `PURPOSE_SPECS` and each spec, and declare `readonly screen?`. Better: have the gateway call
  `screenContractPages` for `proposeContractTerms` whatever the spec says. Add a unit test that the spec is frozen and
  that its screen is `screenContractPages`.

### 7. minor: a patient control number held only in a posting export is not read, and the ADR says it is

- **Where:** `patient-records.ts:266-267` and ADR:616-617 ("The posting export's claim reference is a patient control
  number already in claim"). `posting_row.claim_reference` has no foreign key to `claim`
  (`20261023120000_recovery_ledger.sql:75-100`).
- **Scenario:** a payer that pays by paper check has its claims posted from the PM's export but never sent as an 835,
  so there is no `claim` row and often no `patient_ref` row. That payer's paper EOB, scanned and filed as a contract,
  names the patient's account number, which the practice holds only in `posting_row`, and the EOB is sent. The gap
  list's "a patient the practice has never been paid for" is wrong for this case: the patient was paid.
- **Fix:** read `posting_row.claim_reference` the same way (audited, decrypted, kind `patientControlNumber`, floor 8),
  and include its rows in the bound's count. If that is not done, correct both sentences and list the gap as "a
  patient control number held only in a posting export (a claim never on a loaded 835 or ERA export)".

### 8. minor: "What it gives up" is incomplete, and two of its sentences are wrong

Each item below is a page that names a patient and is sent. The list at ADR:732-738 does not name any of them.

| Writing (all proven `clear` or MISS with the shipped code) | Listed? | Realistic source | Fix and false-refusal cost |
| --- | --- | --- | --- |
| Verbatim value with `.` `/` `_` `*` inside (finding 1) | no | PM PCNs, some payer CCNs | finding 1; zero |
| Soft hyphen, zero-width characters, U+FEFF, U+2212 inside (finding 2) | no | portal prints, text exports | finding 2; zero, measured |
| OCR misreads (`ZZ7l20034`, `ZZ712OO34`) | no. ADR:737-738 says an image page "has no text", but deployed intake reads it with Textract (`apps/worker/src/intake/wiring.ts:33`), so the OCR text is screened and sent | faxed or scanned EOBs, the common misfile | list it. Optional: fold O→0 and I/L→1 on both sides, only for runs that are mostly digits (raises collisions; measure first) |
| A prefix or suffix glued on (`ZZ712003401` against stored `ZZ7120034`; a payer's letters before the ID; a check digit after it) | no (only "whole tokens" in the algorithm) | person codes on dependents' IDs | list it. Optional: match a page token that is a stored value of 9 or more characters plus or minus a 2-digit suffix or a 3-letter prefix; measure first |
| Leading zeros dropped, or a long number mangled by a spreadsheet (`7.712E+12`, digits past 15) | no | EOB exports re-saved in Excel | list it |
| Groups split by `.`, `/` or `,` when the stored form has none (`ZZ.712.0034`) | no (the algorithm mentions "any other character", but the list does not) | rare | list it; joining these would refuse decimals and dates |
| A PCN held only in a posting export (finding 7) | no | paper-check payers | finding 7 |

The two wrong sentences:

- ADR:632 and `redact.ts:342-343`: "a table's columns … never join". pdf.js writes a column gap as one `" "` item
  (`pdf.worker.mjs` `addFakeSpaces` and `pushWhitespace`), so a PDF's columns do join over one space. Set v2's runs
  include `9711059`, a CPT code and modifier from adjacent cells. The measurement reads pages through pdf.js, so its
  numbers already include these joins; only the sentence is wrong. Say "a CSV's or workbook's fields (tabs) never
  join; a PDF's columns on one line do, and are measured".
- ADR:737-738: the scanned-page sentence, as in the table.

## Nits and improvements

- `patient-records.ts:142`: `!authorizedBy.practiceIds.includes(practiceId)` (departure 6) has no test. Removing it
  passes every unit test. Add a scope whose `access()` answers but whose `practiceIds` lacks the practice. Also
  untested: the opened-scope assertion (`:158`) and the `default:` branch of `screenContractPages`
  (`contract-terms.ts:517-518`). Both are defensive and unreachable today; say so in a comment.
- ADR:601-602 overclaims. It says "a stub that returns nothing cannot be supplied", but `pool` and `authorizedBy` are
  duck-typed: `testing.ts` builds an issued, practice-bound check that reads an in-memory practice of nothing, and the
  lint test guards only imports of `testing.ts`. Say "no production caller supplies one", and add a lint case that
  outside tests `practiceRecordsCheck` is called only from `contract-proposals.ts` (`services.modelPool`) and
  `permitted.ts` (`services.pool`).
- `syntheticRecordsCheck` is exported from the package's main entry (`index.ts:185`). Production code can therefore
  build one and use it with an evaluation-actor gateway (`OperatorEvaluationStore` is production code). That trust in
  evaluation calls is pre-existing, but the export makes skipping trivial. Move it to an eval-only entry, and extend
  the lint test to restrict its importers to `eval/` and tests.
- The twins' 9-digit member IDs (`patient-twins.ts:48`, "9 + 8 digits") are justified as "an area no Social Security
  number has", but 9xx is the ITIN range: 11,840 of the 26,667 are ITIN-shaped. Two of the 11-character alphanumeric
  ones are MBI-shaped. They are in memory only and never written, so this is a nit; use a never-issued shape such as
  `9xx93xxxx` (group 93 is never an ITIN) and keep a letter MBIs never use in the 11-character ones.
- Observation, not this PR: MOD-12's NPIs are 99-prefixed and check-digit-valid, by the repository's `syntheticNpi`
  rule. The 835's `REF*TJ*99…` comes from SynthWorld's existing TJ form (52 fixtures), and 99 is an IRS-assigned EIN
  prefix, so for a TIN that form is not out of real range. This is for the synth owner.

## What I checked and found sound

- **Registry and practice match (area 5).** No production path reaches the provider with a check that did not read
  this practice's records. Both callers build `practiceRecordsCheck` on their real pool for the call's practice, and
  forged, copied, other-practice and synthetic-on-practice checks are refused as `screen_invalid`. Mutations killed:
  the practice match, WeakSet membership, freeze, the cipher check, and screening `input.pages` instead of
  `prepared.user`. The frame adds no digit-bearing run ("PAGENUMBER" and "DOCUMENTKIND" hold no digit; page numbers
  and the count stand alone). The m14 membership oracle does not arise: a contract specialist holds `rate_record.edit`
  but not `file.upload`, so it cannot plant probe documents.
- **Order.** The screen runs after `prepare` and the variant check, and before the idempotency key, the budget hold
  and the call. Tested with spies and by counting connections.
- **Fail-closed (area 4).**
  - Any load error answers `screen_failed`, and the next question reads again (mutation killed): connect, query,
    decrypt, a person as the screen, an unreachable database, and the bound.
  - Concurrent questions share one load promise.
  - An empty practice answers `clear`, which is correct.
  - A thrown non-refusal is logged as `MODEL_INPUT_SCREEN_FAILED` and rethrown (the web returns 500 and nothing is
    sent).
  - An aborted request cannot turn a refusal into a send.
  - The only fail-open-adjacent gaps are findings 3 and 4, which are audit and bound accuracy, not sends.
- **Bound counting (area 3).**
  - What is counted matches what is read: member IDs that are not NULL, and two per claim. Both claim columns are NOT
    NULL; ERA-export claims and insured `patient_ref` rows are included; duplicate values are counted, which is
    conservative.
  - Off-by-one: 50,000 is read and 50,001 is refused (the `>=` mutation was killed). Dropping the `2 *` was killed by
    the DB test (25,001 claims).
  - A practice crossing the bound between count and read is finding 4.
- **Tokenizer (area 1), what works.** Case; full-width digits and letters; NBSP, thin, narrow and ideographic spaces;
  U+2010-2015, U+FE63 and U+FF0D dashes; one space between every character; 2-4 groups; after `:`, `#`, `(`. Wrapping
  and tabs are listed gaps. The property test against `identifierPattern` and the whole-token property are real.
- **False positives (area 2).** `eval/gate.golden.test.ts` runs the shipped `screenSet`, `pagesName` and
  `SHIPPED_SCREEN_RULES` over pages read through pdf.js and the scan reader's recordings, and the ADR's table equals
  its `MEASURED` pins. My extra classes, on the same pages:
  - NPIs (10-digit) stored as PCNs or CCNs: 10 documents, the same magnitude as the TIN and ZIP+4 classes;
  - phones joined to 10 digits: 0;
  - 20,000 sequential 7-digit CCNs: 1 document;
  - 6-digit CCNs, 9-digit member IDs, and 10- and 8-digit PCNs, sequential: 0;
  - set v2 writes no `M-D-YY` dates.

  Real collisions need exact equality with a specific contract figure, so the design's no-page-side-rule stance
  stands.
- **Permitted run (area 6).** `refused:names_patient` is `outside_model`, still counted under `refused`, so a newly
  refused example trips `refused_rose`. The other screen codes are unmeasured, and the run is refused whole. The
  `nothing_measured` guard (`eval/baseline.ts:599`) stops an all-refused run from serving. Hoisting the worker's check
  across practices was killed by `permitted.db.test.ts`.
- **Twins (area 7).** Seeded (`tp-screen-twin-practice/1`), deterministic, in memory only. The MOD-12 fixtures use the
  repository's synthetic shapes (00- TIN, 000xx ZIPs, 555-01xx phone).
- **Tests (area 8).** Unit mutations killed: `practice-match`, `issued-any`, `bound-ge`, `join-two-spaces`,
  `no-drop-dates`, `screen-input-pages`, `no-cipher-check`, `no-retry-reset`, `no-freeze`, `no-nfkc`, `no-year-range`
  and `no-mmddyyyy`. DB mutations killed: `count-no-2x`, `no-ccn` and `no-audit-reads`. App mutations killed: dropping
  the web's `recordContractScreenRequested` (`models-routes.db.test.ts`, 2 failures) and sharing the worker's check
  across practices (`permitted.db.test.ts`, 4 failures). Survivors are listed under nits. Baselines at head: the MOD-12
  unit files 138/138, `patient-records.db` 7/7, `models-routes.db` 12/12, `permitted.db` 8/8.
