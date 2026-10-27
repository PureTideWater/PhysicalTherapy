# PHI-screen review of #75 (wf_85f2ff34-1ed): findings and skeptic verdicts

Summary: PR #75 (head 9b7eadfe), PHI-screen correctness and AI-safety review. The design holds: the issued-check registry, the practice match, the screen order, screening prepared.user, fail-closed on every load error, and the false-refusal measurement (it runs the shipped screenSet/pagesName/SHIPPED_SCREEN_RULES over pdf.js-read pages, and the ADR's numbers equal the test's pins) are sound. Mutation testing killed 12 unit, 3 DB and 2 app mutations. One unlisted false negative is major: a stored value written on the page exactly as stored is missed when it contains '.', '/', '_' or '*', which also makes N5's reason false. Seven minor findings, all proven in my clone:
- invisible characters and U+2212 inside an identifier (a prototype fix costs zero measured false refusals);
- a decrypt failure rolls back the audit rows of plaintexts already decrypted (Postgres: 3 decrypted, 0 audit rows kept);
- the count and the read are in different snapshots (Postgres: counted 50,000, read 52,000, answered clear);
- the tokenizer builds every run of the whole request (16 MB of page text: 17 s, 1.7 GB);
- PURPOSE_SPECS is not frozen, so one assignment skips the screen;
- posting_row claim references are not read, and the ADR says they are;
- "What it gives up" is incomplete (OCR misreads on Textract scans, glued prefixes and suffixes, spreadsheet artefacts), and its sentences on scanned pages and on PDF table columns are wrong.

Review: /home/user/ops/approval-summaries/lane-b-model-eval-gate-phi-review-phi-screen.md. Clone: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/review-phi-screen (review tests untracked under packages/model-gateway). Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/review-phi-screen.md.

## F1 (major) packages/model-gateway/src/redact.ts:325
**Finding:** A stored identifier written on the page exactly as stored is missed when it contains a separator other than a space, NBSP or dash ('.', '/', '_', '*'). The stored side compacts it (SYNPCN.12001 becomes SYNPCN12001); the page side treats the separator as a boundary JOIN does not bridge, so no run equals the compact value. Not listed in ADR 0070 Part 3, and it makes N5's reason false ('decryption catches every writing', ADR:834): the raw-value hash would catch the verbatim writing.

**Scenario:** A practice whose PCN is SYNPCN.12001 or 20261234/01, or whose payer's CCN is E7712000.345. A misfiled EOB, or a rate-correction exhibit citing the claim by number (MOD-12's second scenario), writes the value verbatim and the shipped check answers clear, so the page goes to the model. Proven: review-phi.test.ts passes at head with all four writings clear through syntheticRecordsCheck.

**Fix:** In screenSet, collect every character that sits between two letters or digits inside a kept stored value and is not already a joiner (for example /(?<=[\p{L}\p{N}])([^\p{L}\p{N}\s\-‐-―])(?=[\p{L}\p{N}])/gu on the NFKC form), carry them on ScreenSet, and let identifierRuns' JOIN also accept exactly one of them between tokens. Add redact tests for the four writings and a pinned dotted/slashed-PCN twin class in eval/gate.golden.test.ts. Cost: zero for practices with no such characters (the shipped twin and classes are unchanged); otherwise measure with the new class. Zero-cost alternative: compare such runs in literal form (NFKC, upper case, separators kept) against the literal stored values.

**Verdict:** refuted=False, severity=major

CONFIRMED against the code at 9b7eadfe, with tests run in my clone at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F1.

How it happens. compactIdentifier (redact.ts:73-75) removes every character that is not a letter or digit from the stored value, so "SYNPCN.12001" is kept as "SYNPCN12001" (screenSet, patient-records.ts:102-115). On the page, TOKEN (redact.ts:327) breaks at the "." and JOIN (redact.ts:325) only bridges nothing, one space or NBSP, or one dash with optional spaces. "." ends the run (redact.ts:359), so no run equals "SYNPCN12001". The same is true of "/", "_", "#", ":", "+" and any other punctuation.

The values reach the check as written. The parser takes CLP01 raw (edi835 transaction.ts:794, clp.raw(1)) and the loader encrypts it unchanged (apps/worker/src/parse/loader.ts:385). X12 AN elements allow "." and "/".

No other check stops the page. The kind check is exactly what a misfiled document gets past, and contract-terms.ts:503-518 sends prepared.user once the check answers clear.

Proof at head (verify-f1.test.ts, 4 of 4 pass), all synthetic, through syntheticRecordsCheck:
- Written as stored, these all answer 'clear': member IDs 'SYNMBR.120099' and 'ZZ#7120077'; PCNs 'SYNPCN.12001', '20261234/01' and 'SYN_PCN_44551'; CCN 'E7712000.345'.
- Compact, spaced or hyphenated, the same values answer 'names_patient'.

A fast-check property ("a kept stored value written on a page exactly as stored is found") fails at head on its first run. The counterexample is memberId 'A0AA.0A'.

The ADR is wrong as well as incomplete:
- "What it gives up" (ADR 0070 Part 3) lists only line wraps, tabs, two spaces and two dashes.
- Its Alternatives row for the stored hash, notice N5 and design §2 row 6 all say "decryption catches every writing". For the verbatim writing that is false.
- The doc comment on identifierRuns (redact.ts:342-348) under-states the gap in the same way.

Why the severity stays major:
- The writing it misses is the verbatim one, the form a payer document most likely uses. For a practice whose system issues such PCNs, every PCN is invisible to the check, not only an occasional layout.
- MOD-12's own documents each carry a single identifier: the EOB shows only the member ID, the exhibit only the CCN. One dotted identifier is enough to send the page to the model.
- F3 does not fix it. F3 only changes the stored side to compact hashes, and the page tokenizer stays the same.
- It is not blocking. It needs a practice whose identifiers contain such characters, and an EOB that prints several identifiers is usually still caught through another one.

The proposed fix works, with two corrections:
- (a) Collecting one character at a time misses "A..B" and "A. B".
- (b) F3 never decrypts, so it cannot rebuild the separator set at screen time.

Measured in my clone with the fix (diff at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/verify-F1-fix.diff):
- All 130 unit tests in redact, patient-records, contract-terms and gateway pass.
- gate.golden.test.ts passes 57 of 57, and the existing false-refusal and collision figures are unchanged.
- A new twin class writes the 80k/201k/200k twin with '.', '/' and '_'. It refuses none of set v2's 63 documents, its joins are exactly ['.', '/', '_'], and its verbatim writings are refused.
- The property passes 2000 runs.

Improvement, outside this PR (the denial-letter screen is untouched under N6). The letter path has the same gap:
- identifierPattern and holdsIdentifier miss 'SYNPCN.12001' (proven);
- identifierCandidates drops any word with inner punctuation (redact.ts:257).
P9 should carry the same fix.

**Verifier's fix:** 1. redact.ts: add storedSeparators(value). Over the value in NFKC form, it returns each maximal run of characters that are not letters or digits and that sits between two letters or digits: /(?<=[\p{L}\p{N}])[^\p{L}\p{N}]+(?=[\p{L}\p{N}])/gu. Drop any run that JOIN already accepts or that contains a tab or line break. These are whole strings, not single characters, so "A..B" and "A. B" are covered.

2. Give identifierRuns an option extraJoins?: ReadonlySet<string>. At redact.ts:359, test the gap once: `const gap = normal.slice(before.end, token.start)`, and continue the run while `JOIN.test(gap) || extraJoins?.has(gap)`.

3. patient-records.ts: add `joins: ReadonlySet<string>` to ScreenSet. In screenSet, fill it from storedSeparators of each kept value. In pagesName, pass `extraJoins: set.joins`. A practice with no such characters gets an empty set and identical behaviour.

4. Tests:
- redact.test.ts and patient-records.test.ts: the verbatim writings of 'SYNPCN.12001', '20261234/01', 'SYN_PCN_44551' and 'E7712000.345' are refused. A practice without separators still answers clear for 'SYNPCN.12001' when it holds 'SYNPCN12001'. A separator followed by a newline, or by two spaces, never joins.
- A fast-check property: a kept value written on the page as stored is always found.
- eval/gate.golden.test.ts: pin a dotted/slashed/underscored twin class (expected result: zero refusals over set v2, joins ['.', '/', '_']).

5. Documents:
- ADR 0070 Part 3: correct the Alternatives row and N5 ("decryption catches every writing" is false for the verbatim writing as built). Record the new rule in "The tokenizer".
- "What it gives up": add "a stored identifier written with a separator other than one the practice's stored values hold (stored 'SYNPCN.12001', written 'SYNPCN/12001')".
- Update the identifierRuns doc comment (redact.ts:342-348) to match.
- F3's proposal: F3 looks up hashes and never decrypts, so the practice's separator set (punctuation only, not PHI) must be stored and returned by the screen function, or F3 brings this gap back.

## F2 (minor) packages/model-gateway/src/redact.ts:351
**Finding:** Format characters NFKC keeps (soft hyphen U+00AD, U+200B, U+200C, U+2060, U+FEFF), and a minus sign U+2212 between groups, end a run on the page side, while compactIdentifier strips them on the stored side. Not listed.

**Scenario:** An HTML-to-PDF portal print, or a text/CSV export, writes ZZ​7120034 or 77−1200−0000345. The shipped check answers clear and the page is sent. Proven in review-phi.test.ts (passes at head).

**Fix:** const normal = text.normalize('NFKC').replace(/\p{Cf}/gu, ''); and JOIN's dash class becomes [\p{Pd}−]. Prototyped in the clone: the MOD-12 unit files pass (126), the seven review cases become names_patient, and gate.golden.test.ts -t 'contract PHI check' passes with every pin unchanged, so the measured false-refusal cost is zero. The letter redaction's identifierPattern (redact.ts:83) has the same gap (pre-existing, P9).

**Verdict:** refuted=False, severity=minor

The finding holds, though its scenario needs narrowing and its fix needs correcting. Checked in my clone at 9b7eadfe (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F2).

How the code behaves: identifierRuns (packages/model-gateway/src/redact.ts:350-372) only applies NFKC, and NFKC keeps U+00AD, U+200B, U+200C, U+2060, U+FEFF and U+2212. TOKEN treats each of these as a boundary between tokens. JOIN (redact.ts:325) accepts only a space, a no-break space, or one dash from U+2010-2015. So a run cannot cross any of these characters. On the stored side, compactIdentifier (redact.ts:74) deletes them. screenContractPages screens prepared.user, and framePages strips nothing, so the page text reaches the screen exactly as the page reader returned it.

Proven in packages/model-gateway/src/verify-f2.test.ts (6/6 pass at head):
- 'Member ID: ZZ<ch>7120034', for each of the five format characters, and 'Claim number: 77−1200−0000345' (U+2212) give syntheticRecordsCheck 'clear'.
- The same pages written with a hyphen, or with nothing between the groups, give 'names_patient'.

End to end, packages/model-gateway/src/verify-f2-csv.test.ts puts a text/csv exhibit through readDocumentPages and then the check: 'clear' at head.

Where the scenario is wrong: the HTML-to-PDF print path does not hold for the five format characters. I built a synthetic PDF whose ToUnicode CMap maps a byte to each code point (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/f2-scripts/pdf-cf.mjs). pdf.js 6.4.299, the version the page reader uses, drops U+00AD, U+200B, U+200C and U+2060 from the text content, and turns U+FEFF into a single space, which JOIN accepts. So 'ZZ7120034' arrives whole and is caught. Only U+2212 survives a PDF. All six characters do reach the screen through a CSV or text exhibit (csvText drops only a leading byte-order mark) and through an xlsx exhibit (decodeXml decodes &#8203;). A fee-schedule exhibit is often a CSV or xlsx file, so a claims export misfiled as one is the realistic path.

Severity stays minor. A miss needs a misfiled document in which every occurrence of every kept identifier is split this way. The fix costs nothing.

The ADR's "What it gives up" list (docs/adr/0070, Part 3, about line 732) is incomplete. The Decision text and design 5.3 both say "any other character ends the run", so the build follows the design. But the list names only line wraps, tabs, two or more spaces and two dashes. It omits invisible format characters, the minus sign, and visible separators such as a dot, a slash or an underscore.

The reviewer's fix is a regression. Deleting \p{Cf} from the text before tokenizing stops a format character from acting as a token boundary. 'Member ID<U+200B>ZZ7120034' then becomes the single token 'IDZZ7120034', and 'ZZ7120034<U+200B>JANE' becomes 'ZZ7120034JANE'. Head refuses both of these today; with the reviewer's fix both answer clear. This is proven in verify-f2.test.ts. Its measurement shows no new false refusals, but it does not measure this loss of matches.

**Verifier's fix:** Keep a format character as a token boundary, but ignore it in the gap between two tokens.

At redact.ts:325, widen the dash class:
const JOIN = /^(?:[  ]|[  ]?[\p{Pd}−][  ]?)?$/u;
const FORMAT = /\p{Cf}/gu;

At redact.ts:359, test the gap with its format characters removed:
!JOIN.test(normal.slice(before.end, token.start).replace(FORMAT, ''))

Leave the text that is tokenized at line 351 as it is. This change produces every run head produces, and adds the split ones.

Prototyped in my clone:
- redact.test.ts, patient-records.test.ts, contract-terms.test.ts and gateway.test.ts pass (131 tests); the only assertion that flips is my own 'at head' assertion.
- verify-f2-fixed.test.ts: every split writing and the U+2212 grouping give names_patient. 'ZZ  7120034', 'ZZ <U+200B> 7120034' and 'ZZ<TAB>7120034' stay clear. 'Member ID<U+200B>ZZ7120034' stays names_patient.
- The CSV end-to-end case gives names_patient.
- gate.golden.test.ts -t 'contract PHI check' passes 4/4 with the pins unchanged.
- eslint is clean.

Also:
(1) Add these cases to redact.test.ts and patient-records.test.ts.
(2) Add to the ADR's "Not caught" list: an identifier split by any character other than one space or one dash, such as a dot, a slash or an underscore.
(3) Improvement, outside this PR: the letter path has the same gap.
- identifierPattern (redact.ts:83) and holdsIdentifier: change the separator class to [\s\p{Pd}−\p{Cf}]*.
- identifierCandidates (redact.ts:255-257) throws away any word that contains a format character, because of its /^[\p{L}\p{N}]+$/ filter. Strip \p{Cf} from each word before that filter.

Do not apply the reviewer's whole-text \p{Cf} deletion.

## F3 (minor) packages/model-gateway/src/patient-records.ts:283
**Finding:** screenSet decrypts inside the withJobScope callback, and readWithAudit writes the audit rows in the same transaction. A decrypt failure after some rows have decrypted rolls the transaction back, so the screen's read audit rows are gone while plaintext member IDs and numbers were produced. ADR:703-705 says every row returned is audited; the gap list does not name this.

**Scenario:** One stored value no longer decrypts (the state models-routes.db.test.ts builds for its screen_failed case). Proven on Postgres (review-phi.db.test.ts): decryptedPlaintexts 3, auditedReadsKept 0, outcome screen_failed.

**Fix:** Return the ciphertext rows from the job scope so the audit rows commit, and decrypt and build the set after withJobScope resolves. A decrypt failure still answers screen_failed, with every read audited. Keep the review DB test as a regression, and have the web's screen_failed test assert that the screen's reads exist.

**Verdict:** refuted=False, severity=minor

Confirmed. I could not refute it, and I reproduced it on Postgres in my clone at 9b7eadfe.

How it happens. The check's load() (packages/model-gateway/src/patient-records.ts:156-165) runs loadContractScreenIdentifiers inside the withJobScope callback. That function's two readWithAudit calls (271-282) insert the audit rows on the scope's own client (packages/db/src/authz/audit.ts:86). The decrypt runs lazily, as the screenSet generator at 283-292 pulls each value, which is still inside that callback. transaction() (packages/db/src/authz/scope.ts:108-118) issues ROLLBACK on any throw. So a cipher.decrypt that throws after earlier values have decrypted removes every one of the screen's read rows. namesPatient's catch (175-180) then turns the error into 'screen_failed'.

What I measured.
1. New model-gateway DB test (packages/model-gateway/src/verify-f3.db.test.ts in my clone). The practice has 3 member IDs and 2 claims sealed with its key, plus 1 claim sealed with another key. Worker login. Result: outcome screen_failed, decryptedPlaintexts 3, auditedReadsKept 0, rowsRead 6.
2. The web's own screen_failed case (apps/web/src/lib/routes/models-routes.db.test.ts:609-638). I added a check that the screen's reads per type equal the rows the practice holds. At head it fails: expected {claim:'3', patient_ref:'3'}, received {}.

Why it is a defect and not just the house rule (ADR 0014:29, "an aborted request delivers nothing unaudited"). The only reading in its favour: nothing of the PHI leaves the check, and other code in the codebase also decrypts inside its scope. But here the request does not abort. The person's contract_screen_requested event commits (the test asserts it has length 1) and the redirect is served. So the trail reads "screen requested, nothing read", while the service actor decrypted up to the bound's worth of identifiers, and does so again on every retry click. That trail looks exactly like the gap list's "refused before the screen runs ... with no reads after it" case.

Text this makes false:
- ADR 0070 Part 3, "Every returned row is audited" (Read as the screen) and "What is recorded" (~703-705).
- apps/web/src/lib/models/contract-proposals.ts:53-54, "joins it to every read the screen made".
- The "What it gives up -> The audit trail" bullet does not list this case, so that list is not complete.

The finding understates one point: plaintext is produced before COMMIT. A COMMIT that fails after decrypting also leaves decrypted values with no read audited.

Severity stays minor:
- It happens only when something breaks: a stored value that no longer decrypts (a wrong key or the wrong column context), not something a user can cause.
- No value, kind or count leaves the check.
- The person's event and the MODEL_INPUT_SCREEN_FAILED log line with practice_id are kept.

The worker's permitted run goes through the same load() and has the same gap (it answers refused:screen_failed).

**Verifier's fix:** The finding's fix is correct. I applied it in my clone (the diff is saved at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/F3-fix.diff) and tested it.

In packages/model-gateway/src/patient-records.ts:
- Split loadContractScreenIdentifiers (269-294) into two functions. readContractScreenRecords(scope, read) returns { patients, claims }: the two readWithAudit reads, ciphertext only. decryptContractScreenRecords(records, cipher) returns the ScreenSet: today's generator plus screenSet.
- Have load() (156-165) decrypt only after the job scope has committed:

```ts
const load = async (): Promise<ScreenSet | 'too_many'> => {
  const read = await withJobScope(pool, { jobId: screenId, practiceId }, async (scope) => {
    /* same scope assertion and bound count */
    return readContractScreenRecords(scope, { practiceId, requestId: auditRequestId });
  });
  return read === 'too_many' ? read : decryptContractScreenRecords(read, cipher);
};
```

A decrypt failure still answers screen_failed, but every read is audited. The rule becomes: no value is decrypted before its read's audit row has committed, which also covers a COMMIT that fails. A query or scope failure still rolls back with nothing decrypted. A side benefit: the pooled connection is no longer held open inside the transaction while up to 50,000 values are decrypted.

Verified on the fix:
- tsc clean.
- verify-f3, patient-records.db, gateway.db: 29/29 pass. Audited reads now equal the 6 rows read.
- patient-records and contract-terms unit tests: 63/63 pass.
- The web screen_failed case with the new reads check passes ({claim:'3', patient_ref:'3'}). It fails at head.

Tests to keep:
- A model-gateway DB regression: the practice holds rows under its key plus one claim under another key. Assert screen_failed, more than 0 decrypts, and audited reads equal to the patient_ref and claim rows.
- In the web's screen_failed case (models-routes.db.test.ts:637), assert that screenTrail(practiceId).reads per object_type equal the practice's held claim and patient_ref counts, not just events length 1.

Docs, ADR 0070 Part 3:
- "Any error fails closed": a decrypt error answers screen_failed after the reads' audit rows have committed; a scope, count or query error rolls back with nothing decrypted.
- "What is recorded": also true on screen_failed after a read.
- "Records" bullet: name the two functions.

If the code is not fixed, the "What it gives up -> The audit trail" bullet must instead list that a screen whose decrypt fails keeps none of its reads. With the fix, contract-proposals.ts:53-54 is true as written.

## F4 (minor) packages/model-gateway/src/patient-records.ts:161
**Finding:** The bound's count and the reads run at READ COMMITTED in one transaction (withJobScope uses plain BEGIN), so rows committed between the count and the read are read and audited past the bound. 'At most the bound's number' (ADR:704-705) is false under concurrency.

**Scenario:** A practice at exactly 50,000 identifiers while an 835 load commits. Proven on Postgres: the count said 50,000, then 1,000 claims committed, and the screen read and audited 26,000 claims (52,000 identifiers) and answered clear.

**Fix:** After reading and before decrypting, return too_many when patients.length + 2 * claims.length > SCREEN_MAX_IDENTIFIERS. Better still, add the oneSnapshot option withPracticeScope already has to JobScopeRequest and open the screen's scope at REPEATABLE READ, so the count and the reads agree.

**Verdict:** refuted=False, severity=minor

Confirmed in code and on Postgres; not refuted. withJobScope (packages/db/src/authz/scope.ts:260) calls transaction() with its default begin, a plain 'BEGIN', so it runs at READ COMMITTED. The JobScopeRequest it takes has no oneSnapshot, and its JOB_KEYS only allows jobId and practiceId. In packages/model-gateway/src/patient-records.ts:161 the count is its own statement. After it, loadContractScreenIdentifiers runs three more: the patient_ref SELECT, readWithAudit's single batched audit INSERT (up to about 50k rows), and the claim SELECT. Each statement takes a new snapshot. So anything committed between the count and the claim SELECT gets read, audited and decrypted.

Proof: I added a test in my clone (packages/model-gateway/src/f4-bound-race.db.test.ts) on the worker login. The practice holds exactly 25,000 claims (50,000 identifiers). A pool wrapper commits 999 claims plus one claim with PCN LATE00000001 from a separate owner connection right after the COUNT returns. At 9b7eadfe the result was outcome=names_patient (the late claim's PCN matched) with 26,000 audit rows, which is 52,000 identifiers against a bound of 50,000. So ADR 0070's "at most the bound's number" (lines 704-705), and the patient-records.ts:32-35 comment that the audit rows, decrypts and plaintext are bounded by the bound, are false under concurrency. The ADR's "What it gives up" list does not mention this either.

Why minor and not higher: nothing fails open. The overshoot only makes the screen read more of the practice's real records, and the next click on that practice is refused. The extra amount is limited to what commits in the window from the count to the claim SELECT, which is about one batched audit insert long (one or a few 835 loads). It goes over a soft resource cap set by ruling 3; it is not a PHI or privacy gap.

The reviewer's first fix is incomplete. A check of patients.length + 2*claims.length after the read runs after readWithAudit has already written every audit row, so it bounds the decrypts and plaintext but not the audit rows. Only the snapshot fix makes the count and the reads agree.

I tested the snapshot fix in the clone. With it, the same race test gives outcome=clear and exactly 25,000 audit rows. patient-records.db.test.ts, gateway.db.test.ts and the race test pass (3 files, 29 tests). The model-gateway unit tests and packages/db/src/authz/scope.test.ts pass (26 files, 451 tests) after one change: the memory pool in packages/model-gateway/src/testing.ts:170 accepts only 'BEGIN', so it must accept the REPEATABLE READ BEGIN (7 unit tests fail until it does).

REPEATABLE READ is safe here. The screen's only writes are audit_event inserts with action 'read', and none of the BEFORE INSERT triggers on audit_event (packet download/export and unattested submission) fire for that action. With no row locks or updates, there is no serialization-failure risk. This matches the oneSnapshot doc in PracticeScopeRequest: "whose only writes are its audit events".

**Verifier's fix:** Run the screen's job scope in one snapshot, so the count and the reads see the same rows:

(1) packages/db/src/authz/scope.ts: add `readonly oneSnapshot?: boolean` to JobScopeRequest, documented as PracticeScopeRequest's (REPEATABLE READ, for a job whose only writes are its audit events). Add 'oneSnapshot' to JOB_KEYS. Pass `request.oneSnapshot === true ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN'` as transaction()'s begin argument in withJobScope.

(2) packages/model-gateway/src/patient-records.ts:157: `withJobScope(pool, { jobId: screenId, practiceId, oneSnapshot: true }, ...)`.

(3) packages/model-gateway/src/testing.ts:170: the memory pool accepts only 'BEGIN ISOLATION LEVEL REPEATABLE READ' (not 'BEGIN'), which also makes it a regression guard.

(4) packages/db/src/authz/scope.test.ts: add a withJobScope case asserting the REPEATABLE READ BEGIN when oneSnapshot is true (authz is branch-gated at 100%).

(5) Add a patient-records.db.test.ts case: a practice at exactly 50,000 identifiers, with claims committed from another connection after the count; expect no more than 25,000 claim audit rows and no match on a late claim.

(6) ADR 0070 Part 3, "The bound" and "What is recorded": say that the count and the reads share one snapshot.

Do not use the post-read length check alone: readWithAudit has already written the audit rows by then. It could only be kept as an extra guard on the decrypts.

## F5 (minor) packages/model-gateway/src/redact.ts:350
**Finding:** identifierRuns builds every run of the whole prepared.user text into a Set and an array before pagesName compares any of them, on the web request's event loop, once per click.

**Scenario:** A workbook is one page per sheet, so one sheet can approach the 16 MiB page-text cap and still pass MAX_PAGES. Measured on synthetic dense text with the shipped function: 2 MB took 1.4 s and 191 MB; 8 MB took 7 s and 621 MB; 16 MB (maxLength 50) took 17 s and 1.7 GB of heap.

**Fix:** Make identifierRuns a generator, or have it take a has(run) predicate, and return on the first hit: no Set and no array, memory O(maxLength), early exit on a document that names a patient. No false-refusal cost. Optionally screen page by page.

**Verdict:** refuted=False, severity=major

I could not refute F5. It is real, and it is worse than minor: on a legitimate document that intake accepts, the screen can exhaust the web task's heap.

The path. proposeTermsAction (apps/web/src/lib/routes/models.ts:53, permission rate_record.edit) calls proposeTerms, then gateway.limited, then screenContractPages (contract-terms.ts:508), which passes [prepared.user]: all pages framed into one string. That goes to pagesName (patient-records.ts:124), then to identifierRuns (redact.ts:350). identifierRuns builds three things for the whole text: the spread `[...normal.matchAll(TOKEN)].map(...)` (an array of every token), a Set of every run, and an array copy of that Set. Only after that does `.some(has)` look at anything.

Nothing earlier bounds the size:
- prepare caps pages only (MAX_PAGES 100), not characters.
- The screen runs before the idempotency check, the budget hold and the provider call.
- Intake allows 16 MiB of page text (packages/contracts/src/evidence/pages.ts:50), and a workbook is one page per sheet.

The web task runs a 560 MiB heap (infra/lib/heap.ts; infra/test/heap.test.ts: web 560 at 1,024 MiB task memory). I ran on Node 24 with --max-old-space-size=560 in a bare process, so the measurements below include none of Next.js's own heap. Synthetic data only; the scripts are in scratchpad/phi/bench-F5.

End to end: I built a one-sheet fee-schedule workbook with the repo's own syntheticXlsx and read it with intake's readDocumentPages under the shipped limits. At 4, 8, 12 and 15.5 MiB of text it was accepted as one page. The shipped screen at 12 MiB took 2.6 s with 824 MiB peak RSS. At 15.5 MiB it died: "FATAL ERROR: JavaScript heap out of memory".

The dense case is ordinary prose, not a crafted file. Single-space words in PDF-like 90-character lines join into runs. Shipped results at 560 MiB:

| Input | Time | Heap |
|---|---|---|
| Prose, 4 MiB | 0.95 s | 177 MiB |
| Prose, 8 MiB | 2.0 s | 326 MiB |
| Prose, 16 MiB | crashes (out of memory) | |
| Tab-separated sheet, 8 MiB | 1.6 s | 375 MiB |
| Tab-separated sheet, 16 MiB | crashes (out of memory) | |
| Prose, 16 MiB, identifier on page 1 | still crashes (no early exit) | |

With Next.js's own heap on top, the crash threshold in production is lower than these figures. A V8 out-of-memory abort kills the Node process, so every in-flight request on that task fails. A crashed click writes no model_call row and leaves the version in draft, so a retry crashes the other production task too. The worker's evaluate-permitted run uses the same pagesName, but it is a one-off CLI task, so a crash there costs less.

The design (A.3) specified the array API. ADR 0070 Part 3's "What it gives up" and Consequences cover the decrypt cost per click (Q1). Neither mentions the page-run cost, so that list is incomplete on this point.

The finding's fix is right in direction but incomplete as worded. I tested a variant that yields runs and exits early but keeps the token-array spread. It still crashes on 16 MiB of prose at 128, 256 and 560 MiB. The tokens have to be streamed too; then memory really is O(maxLength).

The fix I tested, in my clone:
- 16 MiB prose: 2.0 s, fits a 128 MiB heap.
- maxLength 50: 4.3 s.
- 15.5 MiB intake workbook: 1.9 s.
- Identifier on page 1: 73 ms.
- 4 MiB: 615 ms against 950 ms shipped.

Checks on it:
- A fast-check property test (5,000 runs) compares the run sets against the shipped code verbatim and passes. A deliberate off-by-one mutation makes it fail.
- redact.test and patient-records.test pass.
- eval/gate.golden.test.ts passes 56 of 56.
- tsc for the package exits 0.

What the fix leaves: CPU per click stays O(characters × window). Adversarial dense 16 MiB text at maxLength 50 still takes 8.6 to 10.5 s on this machine, and longer on the web's 0.5 vCPU, with the event loop blocked throughout.

Improvement: no current model can read a 16 MiB request (about 4M tokens), yet today it is screened, budget-held and sent. contractTermsSpec.prepare should refuse a framed text over a stated character cap, sized to what the model can read and above the 80-page documents the design sizes at about 100k tokens. That refusal belongs before the screen, as InputRefusedError('too_long', fixed sentence). It bounds the screen's CPU too.

Nit: the finding's 2/8/16 MB figures match my dense-text runs (8 MiB at maxLength 50: 8.3 s), but it understates the reach. Legitimate prose and sheets crash too, not only synthetic dense text.

Files: the fix diff is /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/bench-F5/streaming-fix.diff, the measurements are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/bench-F5/results.txt, and the property test is /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F5/packages/model-gateway/src/redact.stream.test.ts.

**Verifier's fix:** Fix in redact.ts:350 and patient-records.ts:124.

1. Add a generator `export function* eachIdentifierRun(text, { minLength, maxLength }): Generator<string>` to redact.ts.
   - It iterates `normal.matchAll(TOKEN)` lazily. There is no spread and no tokens array.
   - It keeps `open: string[]`, the compact tokens since the last break, and their total length.
   - On each match:
     - If the gap `normal.slice(previousEnd, match.index)` fails JOIN, clear `open`.
     - Push the token. While the open length is over maxLength, shift from the front.
     - Then, from the last open token back to the first, prepend each token to `joined` and yield `joined` whenever `joined.length >= minLength`.
   - Repeats are allowed, and memory is O(maxLength).

2. Keep `identifierRuns(text, o)` as `[...new Set(eachIdentifierRun(text, o))]` for the tests and the index export.

3. Rewrite pagesName as loops that return on the first hit:
   `for (const text of texts) for (const run of eachIdentifierRun(text, { minLength, maxLength })) if (set.values.has(run)) return true; return false;`

4. Add a property test. It compares the run set against the shipped implementation, copied in verbatim, over random text: letters, digits, space, NBSP, tab, CR/LF, hyphen and dashes, full-width forms, ligatures, combining marks and punctuation, with random minLength and maxLength. Also add a regression test: about 16 MiB of synthetic single-space prose screened in a child process run with --max-old-space-size=560.

5. Improvement in the same PR: in contractTermsSpec.prepare, refuse a framed `user` longer than a stated character cap with InputRefusedError('too_long', fixed sentence), before the screen. Size the cap to what the model can read, above the 80-page documents the design sizes at about 100k tokens. This also bounds the screen's event-loop CPU.

6. Record the remaining CPU cost per click in ADR 0070 Part 3 "What it gives up" / Consequences, beside the decrypt cost.

## F6 (minor) packages/model-gateway/src/specs.ts:11
**Finding:** PURPOSE_SPECS and contractTermsSpec are plain mutable objects ('as const' is type-only) and PurposeSpec.screen is not readonly, so one assignment removes the contract screen for every caller in the process. The registry and freeze defend the check object, but not the spec that decides whether the check runs.

**Scenario:** PURPOSE_SPECS.proposeContractTerms.screen = async () => {} (or delete), in app code or in a test sharing the module, makes gateway.ts:275 skip the screen and send any contract unchecked. review-phi.test.ts asserts both objects are not frozen, and it passes at head.

**Fix:** Object.freeze PURPOSE_SPECS and each spec, and declare readonly screen? in spec.ts. Better: have the gateway call screenContractPages for proposeContractTerms whatever the spec says. Add a test that the spec is frozen and its screen is screenContractPages.

**Verdict:** refuted=True, severity=nit

The mechanics are real, but no input or stored state can reach them, so this is hardening and not a defect. I proved it with /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F6/packages/model-gateway/src/verify-f6.test.ts at 9b7eadfe. All 5 cases pass, and package tsc --noEmit passes.

Confirmed:
- (a) Deleting PURPOSE_SPECS.proposeContractTerms.screen through the public index (index.ts:156) makes the local gateway send a contract that names a held synthetic member ID.
- `spec.screen = ...` compiles, because screen is a method signature in spec.ts:47 and is not readonly.
- An app-side `PURPOSE_SPECS.proposeContractTerms.screen = () => Promise.resolve()` passes eslint (exit 0).

Why it is still not a defect:
1. Nothing in the repo writes to PURPOSE_SPECS or to a spec. Grep finds only reads: gateway.ts:161-173, specs.ts:50, prompts.test.ts. No request input can do it. Vitest runs each file isolated (no isolate override in vitest.config.ts), so a stub in one test file cannot leak into another. A source change that drops `screen: screenContractPages` is already caught, because gateway.test.ts:688-757 runs names_patient end to end.
2. The line the finding draws does not hold. It says the registry and freeze defend the check object but not the spec. They defend the input only. With the spec untouched:
   - (b) setting ModelGateway.prototype.screen = async () => undefined (private only in TS) sends the same contract;
   - (c) setting WeakSet.prototype.has to return true makes the gateway accept a forged {practiceId, namesPatient: () => 'clear'} and send.
   The guards in ADR 0070 Part 3 stop a caller's input (a hand-built check, a getter or proxy on pages, another practice's check). No JS module can stop code in the same process that rewrites shared objects or built-ins. The finding's fix, freezing the specs, does not close that class. Its "better" fix, calling screenContractPages from the gateway, is undone by (b).
3. The pattern is older than the PR. At base e908c214, PURPOSE_SPECS is already exported (index.ts:156), and denialLetterSpec already has an assignable `async screen` (denial-letter.ts:232). This PR adds a second screen of the same shape.

Severity: nit, with a doc correction. ADR 0070 Part 3 says of the registry that "code elsewhere can neither add to nor forge" it, under the heading "why no caller can skip it". Taken literally, (c) shows that is false. It is true only against callers' inputs. "What it gives up" lists only document gaps and should say that its guards do not cover code in the process.

**Verifier's fix:** Optional hardening (nit):
1. Remove PURPOSE_SPECS from packages/model-gateway/src/index.ts:156. Nothing outside the package imports it; requestFor and the types can stay.
2. In specs.ts:11, wrap the map in Object.freeze. Wrap each spec in Object.freeze where it is defined: contract-terms.ts:522, and the denial-letter, narrative and evidence-requests specs.
3. In spec.ts, declare `readonly screen?: (input: I, prepared: PreparedCall<C>, context: CallContext) => Promise<void>` (and the same for prepare and verify), so an assignment fails to compile.
4. Add a test: Object.isFrozen(PURPOSE_SPECS) and Object.isFrozen(PURPOSE_SPECS.proposeContractTerms) are true, and PURPOSE_SPECS.proposeContractTerms.screen is screenContractPages.

Doc correction: in ADR 0070 Part 3, limit "why no caller can skip it" and the registry's "code elsewhere can neither add to nor forge" to what a caller passes in. Add one line to "What it gives up": code in the gateway's process that rewrites its objects (the spec map, ModelGateway.prototype) or a built-in (WeakSet.prototype) can skip the screen. No guard inside a JS module can stop that; code review and the lint rules that keep model calls in the gateway are what cover it.

## F7 (minor) packages/model-gateway/src/patient-records.ts:266
**Finding:** posting_row.claim_reference (the practice's PCN from its PM posting export, encrypted, with no foreign key to claim) is not read. The code comment and ADR:616-617 say it is 'already in claim', which is false for claims paid by paper check that never arrived as an 835. The gap list's 'a patient the practice has never been paid for' misdescribes this case.

**Scenario:** A paper-check payer's EOB, scanned and filed as a contract, names an account number the practice holds only in posting_row (no claim row, often no patient_ref row). It is sent.

**Fix:** Read posting_row.claim_reference the same way (audited, decrypted, kind patientControlNumber, floor 8) and include its rows in the bound's count. If not, correct both sentences and list the gap as 'a patient control number held only in a posting export'.

**Verdict:** refuted=False, severity=minor

Confirmed, and proven with a database test. In packages/model-gateway/src/patient-records.ts, loadContractScreenIdentifiers (lines 270-295) and COUNT (lines 235-236) read only patient_ref.member_id and claim's patient control number and payer claim number. They never read posting_row.claim_reference. The comment at lines 265-267 and ADR 0070 at lines 616-617 say that reference "is a patient control number already in claim". The code does not make that true:
(a) apps/worker/src/reconcile/exports.ts:69-98 (insertPostingRows) stores every row of a posting export. It needs no remittance and no claim, and posting_row has no foreign key to claim.
(b) apps/worker/src/reconcile/postings.ts:111-131 (postingDecision) answers 'unmatched' when no remittance carries the row's check number. unmatched.ts lists such rows for a person to match (PRD 13, step 4), so this is a normal, expected state.
(c) patient_ref is written only by apps/worker/src/parse/loader.ts:325, from 835s. A patient seen only by a paper-check payer therefore has no patient_ref row.

The same thing happens when a practice uploads a posting export covering periods whose 835s were never uploaded, for example a year of history at onboarding. In each case the practice holds the patient control number (PCN) only in posting_row.

The design carries the same false premise (lane-b-model-eval-gate.md:960, "every posted claim's PCN is already in claim"). It is an assumption, not a session ruling, so ADR 0070 does not list it as a departure.

The finding has two consequences beyond the code. First, the gap list in "What it gives up" (ADR 0070:736) is not true or complete: "a patient the practice has never been paid for (no patient_ref or claim row yet)" does not describe a patient who was paid by paper check and posted. Second, the test matrix's MOD-12 row promises to refuse "a patient control number the practice holds", and this case breaks that promise.

This hole is a whole class of documents, and it is the class the screen exists for. A paper payer's EOB (common for a PT practice: workers' comp, auto, small commercial payers) carries the practice's account number. The practice holds neither that payer's member ID nor its claim number, so the PCN in posting_row is the only identifier the screen could match, and the screen never reads it.

Proof: a test in my clone, packages/model-gateway/src/f7-posting.db.test.ts, runs on a migrated database of its own, which it drops afterwards. It seeds one claim with PCN SYNCLAIM5550011 and one posting row of a paper check (posting_export document, clean and stored) with claim_reference SYNPOST4007100. A page naming SYNCLAIM5550011 answers names_patient (the control). A page naming SYNPOST4007100 answers clear, so the document would be sent. All 3 tests pass.

Severity: I keep it at minor. It is the same kind of gap as the accepted "never been paid" gap, and the screen is a backstop. But it is the top of minor, because the founder accepted the gap list as written and this item is missing from it.

**Verifier's fix:** Read the posting rows. Correcting the text alone is not the best option.

1. In packages/model-gateway/src/patient-records.ts, add this predicate:
   const POSTED_ONLY = `FROM posting_row p WHERE p.practice_id = $1 AND p.claim_reference IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id AND m.level = 'claim')`
   Rows with a claim-level match are left out because postings.ts claimsWithReference (also used by manual.ts:80) matched them by comparing the decrypted reference to claim.patient_control_number, so their PCN is already in the set. Leaving them out keeps line-level exports, which have one row per service line, from inflating the 50,000 bound.
2. Add `+ (SELECT count(*) ${POSTED_ONLY})` to COUNT.
3. In loadContractScreenIdentifiers, add a third readWithAudit (objectType 'posting_row', purpose contract_screen, the same request ID) of `SELECT p.id, p.practice_id, p.claim_reference ${POSTED_ONLY}`. Decrypt each value with cipher.decrypt('posting_row.claim_reference', …) and yield it as 'patientControlNumber' (floor 8).
4. No migration is needed: tp_app holds SELECT on posting_row, and its row-level security policy scopes by app.practice_ids.

I made this change in my clone. With F7_FIXED=1, the new test answers names_patient, and the existing patient-records.db.test.ts still passes (10 of 10 tests).

5. Update the text to match:
   - patient-records.ts:265-267 and ADR 0070:616-617: drop "already in claim" and say which posting rows are read and why.
   - The doc comment on SCREEN_MAX_IDENTIFIERS and the bound's description in the module header and the ADR, which say "member IDs, and two numbers per claim".
   - "Where the build departs from the design": add an entry saying the design (5.3) said the posting reference is not read, and that the build reads the unmatched references.
   - If the founder declines the read, change the gap item at ADR 0070:736 to "a patient control number held only in a posting export (a paper-check payer's claim, or a posting period whose 835s were never loaded)", and correct both sentences.
6. Add a MOD-12 database test with two cases: a paper-check posting row named on an EOB answers names_patient, and a posting row with a claim-level match is not read, as checked by its audit rows.

## F8 (minor) docs/adr/0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md:732
**Finding:** 'What it gives up' is incomplete and partly wrong. Not listed: OCR misreads (ADR:737-738 says an image page has no text, but deployed intake reads it with Textract, apps/worker/src/intake/wiring.ts:33, so the OCR text is screened and sent); a prefix or suffix glued on (a person-code suffix like ZZ712003401 against stored ZZ7120034, payer letters, check digits); leading zeros dropped and spreadsheet number artefacts; groups split by '.', '/' or ','; plus findings F1, F2 and F7. ADR:632 (and redact.ts:342-343) say a table's columns never join, but pdf.js writes a column gap as one space item, so PDF columns do join (set v2 runs include 9711059); the measurement includes these joins, so only the sentence is wrong.

**Scenario:** A faxed EOB OCR'd as ZZ7l20034, or an EOB printing the dependent's suffixed ID, is sent while the ADR presents the remaining gaps as complete.

**Fix:** Add each item to the list with its realistic source. Correct ADR:737-738 to say scanned pages are read by Textract and screened, with OCR misreads as the gap. Correct ADR:632 to say tab-separated fields never join while a PDF's columns on one line do and are measured. Optional, and measured first: a confusable fold (O to 0, I/L to 1) on mostly-digit runs, and a 2-digit-suffix or 3-letter-prefix match for stored values of 9 or more characters.

**Verdict:** refuted=False, severity=minor

Confirmed against the code at 9b7eadfe, with proof in my clone (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F8).

(1) OCR. The deployed S3 intake passes `pages.scans` (Textract): apps/worker/src/intake/wiring.ts:33. packages/contracts/src/evidence/pages.ts:178-195 sends an image, or any PDF page with no text, to Textract. PAGE_TEXT_KINDS (apps/worker/src/intake/pages.ts:20) includes contract and exhibit. The web's proposeTerms sends the stored pages (contract-proposals.ts:142-162). The module's own comment says so too: "Textract for a scanned page" (contract-terms.ts:18). So ADR:736-738 ("an image with no text layer: such a page has no text ... refused as no_text") holds only for local dev. A faxed EOB filed as a contract is OCR'd, screened as read and sent. As listed, the entry is not even a gap: the call sends text only (contract-terms.ts:542), so text the reader never returns is never sent.

(2) PDF columns join. page-thread.ts:100 concatenates pdf.js items with ''. pdf.js turns a column gap of any width into one space. That holds for a gap written as spaces (C03's stream has "97110" + 17 spaces + "59 GP") and for a gap written as a positioning move. Golden experiment eval/verify-f8.golden.test.ts: set v2's C03 p1 reads "97110 59 GP - 115%" and yields the run 9711059. Unit test src/verify-f8.test.ts: cells 228pt apart, and a 17-space gap, both read as "ZZ712 0034" through readDocumentPages and are refused as stored ZZ7120034. A tab is clear. The measurement reads set v2's pages as read, so its numbers stand. Only the sentences at ADR:631-632 and redact.ts:342-343 are wrong. The design's rationale for narrowing the tokenizer (design:1379, "column gaps ... never join") holds only for the CSV and xlsx readers.

(3) Gaps missing from the list, all proven 'clear' in src/verify-f8.test.ts (2/2 pass) with syntheticRecordsCheck:
- OCR misreads: ZZ7l20034, ZZ712OO34
- a suffix glued on: ZZ712003401
- a prefix glued on: XYZZZ7120034
- leading zeros dropped: 12345678 against a stored 0012345678
- groups split by dots, a slash or commas: 7712.000.000345, 7712/000000345, 7,712,000,000,345

The ADR's algorithm section does state exact whole-token matching and "any other character ends the run" (ADR:631, 635-636). But "What it gives up" lists only lines, a tab, two spaces and two dashes. F1, F2 and F7 are confirmed gaps that are also absent from the list.

Severity: minor stands. This is a documentation defect: no measured number is wrong, and every gap is a consequence of the exact match. A whole-document miss also needs every identifier on the EOB to be misread or missing. The loader stores both the QC (patient) and IL (insured) member IDs (apps/worker/src/parse/loader.ts:304), so the suffix gap arises only when the EOB prints a form neither 835 segment carried. The reviewer's realistic sources are right.

**Verifier's fix:** In docs/adr/0070 Part 3, "What it gives up", Not caught:

(a) Replace the entry "text the page reader does not return (an image with no text layer ...)". New text: "a scanned page (a PDF page with no text, or an image) is read by Textract when deployed (apps/worker/src/intake/wiring.ts:33, packages/contracts/src/evidence/pages.ts:178-195), and the text as read is screened and sent. An identifier that OCR misreads (0/O, 1/l/I, 5/S: the errors set v2's V05 seeds) is not caught. Text no reader returns is not sent: the call is text only." Keep the local-only note that without a scan reader such a contract is refused as no_text.

(b) Add these gaps:
- a prefix or suffix glued onto the identifier, such as a person-code or dependent suffix, payer letters or a check digit (whole-token exact match). It arises only when the page prints a form neither the 835's patient (QC) nor its insured (IL) segment carried.
- leading zeros dropped, and spreadsheet artefacts such as thousands separators.
- groups split by '.', '/', ',' or any other character.
- the open items of F1 (a stored value written with dots, slashes or underscores), F2 (format characters and U+2212 between groups) and F7 (a patient control number held only in posting_row). Drop each item from the list once its fix lands.

(c) ADR:631-632 and redact.ts:342-343 should read: "a tab ends the run, so the fields of a CSV or xlsx (joined by tabs) never join. A PDF's columns on one line are read with one space between them (pdf.js turns a gap of any width into one space) and do join. The false-refusal measurement reads set v2's pages as read, so it includes these joins (C03's '97110 59' is one)."

(d) redact.ts:347-348 says the gaps are "an identifier wrapped across lines, or spaced with two or more spaces". Change it to point to the full list in ADR 0070 Part 3.

Optional, each measured with gate.golden's false-refusal and collision cases before shipping:
- a confusable fold (O to 0, I/L to 1, S to 5) on runs that are mostly digits, applied identically to the stored side.
- a 2-character-suffix or 3-letter-prefix match for stored values of 9 or more characters.

Not recommended in this PR: making the page reader emit a tab for a wide gap (page-thread.ts:100). That would change the pages as read, which changes set v2's hash and needs the two-step re-baseline.

## N1 (nit) packages/model-gateway/src/patient-records.ts:142
**Finding:** Mutation survivors: the authorizedBy.practiceIds.includes check (departure 6) has no test; the opened-scope assertion (:158) and the default branch of screenContractPages (contract-terms.ts:517-518) are untested and unreachable today.

**Scenario:** Removing the includes check passes every unit test.

**Fix:** Add a test with a scope whose access() answers but whose practiceIds lacks the practice. Comment the two unreachable guards as defensive.

## N2 (nit) packages/model-gateway/src/index.ts:185
**Finding:** ADR:601-602 says a stub that returns nothing cannot be supplied, but practiceRecordsCheck takes duck-typed pool and authorizedBy (testing.ts builds an issued, practice-bound check over nothing), and the lint test guards only imports of testing.ts. syntheticRecordsCheck is exported from the main entry, usable in production with an evaluation-actor gateway.

**Scenario:** Production code that imports syntheticRecordsCheck, or passes a stub pool, gets a check the screen accepts.

**Fix:** Say 'no production caller supplies one'. Move syntheticRecordsCheck to an eval-only entry. Add lint cases restricting syntheticRecordsCheck to eval/ and tests, and practiceRecordsCheck outside tests to the two callers' service pools.

## N3 (nit) packages/synth/src/screen/patient-twins.ts:48
**Finding:** The twins' 9-digit member IDs (9 + 8 digits) are justified as 'an area no Social Security number has', but 9xx is the ITIN range: 11,840 of 26,667 are ITIN-shaped. Two of the 11-character alphanumeric IDs are MBI-shaped. In memory only and never written.

**Scenario:** The comment's 'never real-shaped' claim is false.

**Fix:** Use a never-issued shape such as 9xx93xxxx (group 93 is never an ITIN), and keep a letter MBIs never use in the 11-character IDs. Re-run the pins.
