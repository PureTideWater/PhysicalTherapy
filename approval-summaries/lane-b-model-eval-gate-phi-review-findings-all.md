# PR #75 fix round: every verified finding (reviews wf_85f2ff34-1ed and wf_fe838a07-52a)


# phi-screen review

Summary: PR #75 (head 9b7eadfe), PHI-screen correctness and AI-safety review. The design holds: the issued-check registry, the practice match, the screen order, screening prepared.user, fail-closed on every load error, and the false-refusal measurement (it runs the shipped screenSet/pagesName/SHIPPED_SCREEN_RULES over pdf.js-read pages, and the ADR's numbers equal the test's pins) are sound. Mutation testing killed 12 unit, 3 DB and 2 app mutations. One unlisted false negative is major: a stored value written on the page exactly as stored is missed when it contains '.', '/', '_' or '*', which also makes N5's reason false. Seven minor findings, all proven in my clone:
- invisible characters and U+2212 inside an identifier (a prototype fix costs zero measured false refusals);
- a decrypt failure rolls back the audit rows of plaintexts already decrypted (Postgres: 3 decrypted, 0 audit rows kept);
- the count and the read are in different snapshots (Postgres: counted 50,000, read 52,000, answered clear);
- the tokenizer builds every run of the whole request (16 MB of page text: 17 s, 1.7 GB);
- PURPOSE_SPECS is not frozen, so one assignment skips the screen;
- posting_row claim references are not read, and the ADR says they are;
- "What it gives up" is incomplete (OCR misreads on Textract scans, glued prefixes and suffixes, spreadsheet artefacts), and its sentences on scanned pages and on PDF table columns are wrong.

Review: /home/user/ops/approval-summaries/lane-b-model-eval-gate-phi-review-phi-screen.md. Clone: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/review-phi-screen (review tests untracked under packages/model-gateway). Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/review-phi-screen.md.


## phi-screen:F1 (reviewer major; verdict major) packages/model-gateway/src/redact.ts:325

**Finding:** A stored identifier written on the page exactly as stored is missed when it contains a separator other than a space, NBSP or dash ('.', '/', '_', '*'). The stored side compacts it (SYNPCN.12001 becomes SYNPCN12001); the page side treats the separator as a boundary JOIN does not bridge, so no run equals the compact value. Not listed in ADR 0070 Part 3, and it makes N5's reason false ('decryption catches every writing', ADR:834): the raw-value hash would catch the verbatim writing.

**Scenario:** A practice whose PCN is SYNPCN.12001 or 20261234/01, or whose payer's CCN is E7712000.345. A misfiled EOB, or a rate-correction exhibit citing the claim by number (MOD-12's second scenario), writes the value verbatim and the shipped check answers clear, so the page goes to the model. Proven: review-phi.test.ts passes at head with all four writings clear through syntheticRecordsCheck.

**Reviewer's fix:** In screenSet, collect every character that sits between two letters or digits inside a kept stored value and is not already a joiner (for example /(?<=[\p{L}\p{N}])([^\p{L}\p{N}\s\-‐-―])(?=[\p{L}\p{N}])/gu on the NFKC form), carry them on ScreenSet, and let identifierRuns' JOIN also accept exactly one of them between tokens. Add redact tests for the four writings and a pinned dotted/slashed-PCN twin class in eval/gate.golden.test.ts. Cost: zero for practices with no such characters (the shipped twin and classes are unchanged); otherwise measure with the new class. Zero-cost alternative: compare such runs in literal form (NFKC, upper case, separators kept) against the literal stored values.


**Skeptic:** CONFIRMED against the code at 9b7eadfe, with tests run in my clone at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F1.

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

**Skeptic's fix:** 1. redact.ts: add storedSeparators(value). Over the value in NFKC form, it returns each maximal run of characters that are not letters or digits and that sits between two letters or digits: /(?<=[\p{L}\p{N}])[^\p{L}\p{N}]+(?=[\p{L}\p{N}])/gu. Drop any run that JOIN already accepts or that contains a tab or line break. These are whole strings, not single characters, so "A..B" and "A. B" are covered.

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


## phi-screen:F2 (reviewer minor; verdict minor) packages/model-gateway/src/redact.ts:351

**Finding:** Format characters NFKC keeps (soft hyphen U+00AD, U+200B, U+200C, U+2060, U+FEFF), and a minus sign U+2212 between groups, end a run on the page side, while compactIdentifier strips them on the stored side. Not listed.

**Scenario:** An HTML-to-PDF portal print, or a text/CSV export, writes ZZ​7120034 or 77−1200−0000345. The shipped check answers clear and the page is sent. Proven in review-phi.test.ts (passes at head).

**Reviewer's fix:** const normal = text.normalize('NFKC').replace(/\p{Cf}/gu, ''); and JOIN's dash class becomes [\p{Pd}−]. Prototyped in the clone: the MOD-12 unit files pass (126), the seven review cases become names_patient, and gate.golden.test.ts -t 'contract PHI check' passes with every pin unchanged, so the measured false-refusal cost is zero. The letter redaction's identifierPattern (redact.ts:83) has the same gap (pre-existing, P9).


**Skeptic:** The finding holds, though its scenario needs narrowing and its fix needs correcting. Checked in my clone at 9b7eadfe (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F2).

How the code behaves: identifierRuns (packages/model-gateway/src/redact.ts:350-372) only applies NFKC, and NFKC keeps U+00AD, U+200B, U+200C, U+2060, U+FEFF and U+2212. TOKEN treats each of these as a boundary between tokens. JOIN (redact.ts:325) accepts only a space, a no-break space, or one dash from U+2010-2015. So a run cannot cross any of these characters. On the stored side, compactIdentifier (redact.ts:74) deletes them. screenContractPages screens prepared.user, and framePages strips nothing, so the page text reaches the screen exactly as the page reader returned it.

Proven in packages/model-gateway/src/verify-f2.test.ts (6/6 pass at head):
- 'Member ID: ZZ<ch>7120034', for each of the five format characters, and 'Claim number: 77−1200−0000345' (U+2212) give syntheticRecordsCheck 'clear'.
- The same pages written with a hyphen, or with nothing between the groups, give 'names_patient'.

End to end, packages/model-gateway/src/verify-f2-csv.test.ts puts a text/csv exhibit through readDocumentPages and then the check: 'clear' at head.

Where the scenario is wrong: the HTML-to-PDF print path does not hold for the five format characters. I built a synthetic PDF whose ToUnicode CMap maps a byte to each code point (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/f2-scripts/pdf-cf.mjs). pdf.js 6.4.299, the version the page reader uses, drops U+00AD, U+200B, U+200C and U+2060 from the text content, and turns U+FEFF into a single space, which JOIN accepts. So 'ZZ7120034' arrives whole and is caught. Only U+2212 survives a PDF. All six characters do reach the screen through a CSV or text exhibit (csvText drops only a leading byte-order mark) and through an xlsx exhibit (decodeXml decodes &#8203;). A fee-schedule exhibit is often a CSV or xlsx file, so a claims export misfiled as one is the realistic path.

Severity stays minor. A miss needs a misfiled document in which every occurrence of every kept identifier is split this way. The fix costs nothing.

The ADR's "What it gives up" list (docs/adr/0070, Part 3, about line 732) is incomplete. The Decision text and design 5.3 both say "any other character ends the run", so the build follows the design. But the list names only line wraps, tabs, two or more spaces and two dashes. It omits invisible format characters, the minus sign, and visible separators such as a dot, a slash or an underscore.

The reviewer's fix is a regression. Deleting \p{Cf} from the text before tokenizing stops a format character from acting as a token boundary. 'Member ID<U+200B>ZZ7120034' then becomes the single token 'IDZZ7120034', and 'ZZ7120034<U+200B>JANE' becomes 'ZZ7120034JANE'. Head refuses both of these today; with the reviewer's fix both answer clear. This is proven in verify-f2.test.ts. Its measurement shows no new false refusals, but it does not measure this loss of matches.

**Skeptic's fix:** Keep a format character as a token boundary, but ignore it in the gap between two tokens.

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


## phi-screen:F3 (reviewer minor; verdict minor) packages/model-gateway/src/patient-records.ts:283

**Finding:** screenSet decrypts inside the withJobScope callback, and readWithAudit writes the audit rows in the same transaction. A decrypt failure after some rows have decrypted rolls the transaction back, so the screen's read audit rows are gone while plaintext member IDs and numbers were produced. ADR:703-705 says every row returned is audited; the gap list does not name this.

**Scenario:** One stored value no longer decrypts (the state models-routes.db.test.ts builds for its screen_failed case). Proven on Postgres (review-phi.db.test.ts): decryptedPlaintexts 3, auditedReadsKept 0, outcome screen_failed.

**Reviewer's fix:** Return the ciphertext rows from the job scope so the audit rows commit, and decrypt and build the set after withJobScope resolves. A decrypt failure still answers screen_failed, with every read audited. Keep the review DB test as a regression, and have the web's screen_failed test assert that the screen's reads exist.


**Skeptic:** Confirmed. I could not refute it, and I reproduced it on Postgres in my clone at 9b7eadfe.

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

**Skeptic's fix:** The finding's fix is correct. I applied it in my clone (the diff is saved at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/F3-fix.diff) and tested it.

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


## phi-screen:F4 (reviewer minor; verdict minor) packages/model-gateway/src/patient-records.ts:161

**Finding:** The bound's count and the reads run at READ COMMITTED in one transaction (withJobScope uses plain BEGIN), so rows committed between the count and the read are read and audited past the bound. 'At most the bound's number' (ADR:704-705) is false under concurrency.

**Scenario:** A practice at exactly 50,000 identifiers while an 835 load commits. Proven on Postgres: the count said 50,000, then 1,000 claims committed, and the screen read and audited 26,000 claims (52,000 identifiers) and answered clear.

**Reviewer's fix:** After reading and before decrypting, return too_many when patients.length + 2 * claims.length > SCREEN_MAX_IDENTIFIERS. Better still, add the oneSnapshot option withPracticeScope already has to JobScopeRequest and open the screen's scope at REPEATABLE READ, so the count and the reads agree.


**Skeptic:** Confirmed in code and on Postgres; not refuted. withJobScope (packages/db/src/authz/scope.ts:260) calls transaction() with its default begin, a plain 'BEGIN', so it runs at READ COMMITTED. The JobScopeRequest it takes has no oneSnapshot, and its JOB_KEYS only allows jobId and practiceId. In packages/model-gateway/src/patient-records.ts:161 the count is its own statement. After it, loadContractScreenIdentifiers runs three more: the patient_ref SELECT, readWithAudit's single batched audit INSERT (up to about 50k rows), and the claim SELECT. Each statement takes a new snapshot. So anything committed between the count and the claim SELECT gets read, audited and decrypted.

Proof: I added a test in my clone (packages/model-gateway/src/f4-bound-race.db.test.ts) on the worker login. The practice holds exactly 25,000 claims (50,000 identifiers). A pool wrapper commits 999 claims plus one claim with PCN LATE00000001 from a separate owner connection right after the COUNT returns. At 9b7eadfe the result was outcome=names_patient (the late claim's PCN matched) with 26,000 audit rows, which is 52,000 identifiers against a bound of 50,000. So ADR 0070's "at most the bound's number" (lines 704-705), and the patient-records.ts:32-35 comment that the audit rows, decrypts and plaintext are bounded by the bound, are false under concurrency. The ADR's "What it gives up" list does not mention this either.

Why minor and not higher: nothing fails open. The overshoot only makes the screen read more of the practice's real records, and the next click on that practice is refused. The extra amount is limited to what commits in the window from the count to the claim SELECT, which is about one batched audit insert long (one or a few 835 loads). It goes over a soft resource cap set by ruling 3; it is not a PHI or privacy gap.

The reviewer's first fix is incomplete. A check of patients.length + 2*claims.length after the read runs after readWithAudit has already written every audit row, so it bounds the decrypts and plaintext but not the audit rows. Only the snapshot fix makes the count and the reads agree.

I tested the snapshot fix in the clone. With it, the same race test gives outcome=clear and exactly 25,000 audit rows. patient-records.db.test.ts, gateway.db.test.ts and the race test pass (3 files, 29 tests). The model-gateway unit tests and packages/db/src/authz/scope.test.ts pass (26 files, 451 tests) after one change: the memory pool in packages/model-gateway/src/testing.ts:170 accepts only 'BEGIN', so it must accept the REPEATABLE READ BEGIN (7 unit tests fail until it does).

REPEATABLE READ is safe here. The screen's only writes are audit_event inserts with action 'read', and none of the BEFORE INSERT triggers on audit_event (packet download/export and unattested submission) fire for that action. With no row locks or updates, there is no serialization-failure risk. This matches the oneSnapshot doc in PracticeScopeRequest: "whose only writes are its audit events".

**Skeptic's fix:** Run the screen's job scope in one snapshot, so the count and the reads see the same rows:

(1) packages/db/src/authz/scope.ts: add `readonly oneSnapshot?: boolean` to JobScopeRequest, documented as PracticeScopeRequest's (REPEATABLE READ, for a job whose only writes are its audit events). Add 'oneSnapshot' to JOB_KEYS. Pass `request.oneSnapshot === true ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN'` as transaction()'s begin argument in withJobScope.

(2) packages/model-gateway/src/patient-records.ts:157: `withJobScope(pool, { jobId: screenId, practiceId, oneSnapshot: true }, ...)`.

(3) packages/model-gateway/src/testing.ts:170: the memory pool accepts only 'BEGIN ISOLATION LEVEL REPEATABLE READ' (not 'BEGIN'), which also makes it a regression guard.

(4) packages/db/src/authz/scope.test.ts: add a withJobScope case asserting the REPEATABLE READ BEGIN when oneSnapshot is true (authz is branch-gated at 100%).

(5) Add a patient-records.db.test.ts case: a practice at exactly 50,000 identifiers, with claims committed from another connection after the count; expect no more than 25,000 claim audit rows and no match on a late claim.

(6) ADR 0070 Part 3, "The bound" and "What is recorded": say that the count and the reads share one snapshot.

Do not use the post-read length check alone: readWithAudit has already written the audit rows by then. It could only be kept as an extra guard on the decrypts.


## phi-screen:F5 (reviewer minor; verdict major) packages/model-gateway/src/redact.ts:350

**Finding:** identifierRuns builds every run of the whole prepared.user text into a Set and an array before pagesName compares any of them, on the web request's event loop, once per click.

**Scenario:** A workbook is one page per sheet, so one sheet can approach the 16 MiB page-text cap and still pass MAX_PAGES. Measured on synthetic dense text with the shipped function: 2 MB took 1.4 s and 191 MB; 8 MB took 7 s and 621 MB; 16 MB (maxLength 50) took 17 s and 1.7 GB of heap.

**Reviewer's fix:** Make identifierRuns a generator, or have it take a has(run) predicate, and return on the first hit: no Set and no array, memory O(maxLength), early exit on a document that names a patient. No false-refusal cost. Optionally screen page by page.


**Skeptic:** I could not refute F5. It is real, and it is worse than minor: on a legitimate document that intake accepts, the screen can exhaust the web task's heap.

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

**Skeptic's fix:** Fix in redact.ts:350 and patient-records.ts:124.

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


## phi-screen:F6 (reviewer minor; verdict REFUTED nit) packages/model-gateway/src/specs.ts:11

**Finding:** PURPOSE_SPECS and contractTermsSpec are plain mutable objects ('as const' is type-only) and PurposeSpec.screen is not readonly, so one assignment removes the contract screen for every caller in the process. The registry and freeze defend the check object, but not the spec that decides whether the check runs.

**Scenario:** PURPOSE_SPECS.proposeContractTerms.screen = async () => {} (or delete), in app code or in a test sharing the module, makes gateway.ts:275 skip the screen and send any contract unchecked. review-phi.test.ts asserts both objects are not frozen, and it passes at head.

**Reviewer's fix:** Object.freeze PURPOSE_SPECS and each spec, and declare readonly screen? in spec.ts. Better: have the gateway call screenContractPages for proposeContractTerms whatever the spec says. Add a test that the spec is frozen and its screen is screenContractPages.


**Skeptic:** The mechanics are real, but no input or stored state can reach them, so this is hardening and not a defect. I proved it with /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F6/packages/model-gateway/src/verify-f6.test.ts at 9b7eadfe. All 5 cases pass, and package tsc --noEmit passes.

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

**Skeptic's fix:** Optional hardening (nit):
1. Remove PURPOSE_SPECS from packages/model-gateway/src/index.ts:156. Nothing outside the package imports it; requestFor and the types can stay.
2. In specs.ts:11, wrap the map in Object.freeze. Wrap each spec in Object.freeze where it is defined: contract-terms.ts:522, and the denial-letter, narrative and evidence-requests specs.
3. In spec.ts, declare `readonly screen?: (input: I, prepared: PreparedCall<C>, context: CallContext) => Promise<void>` (and the same for prepare and verify), so an assignment fails to compile.
4. Add a test: Object.isFrozen(PURPOSE_SPECS) and Object.isFrozen(PURPOSE_SPECS.proposeContractTerms) are true, and PURPOSE_SPECS.proposeContractTerms.screen is screenContractPages.

Doc correction: in ADR 0070 Part 3, limit "why no caller can skip it" and the registry's "code elsewhere can neither add to nor forge" to what a caller passes in. Add one line to "What it gives up": code in the gateway's process that rewrites its objects (the spec map, ModelGateway.prototype) or a built-in (WeakSet.prototype) can skip the screen. No guard inside a JS module can stop that; code review and the lint rules that keep model calls in the gateway are what cover it.


## phi-screen:F7 (reviewer minor; verdict minor) packages/model-gateway/src/patient-records.ts:266

**Finding:** posting_row.claim_reference (the practice's PCN from its PM posting export, encrypted, with no foreign key to claim) is not read. The code comment and ADR:616-617 say it is 'already in claim', which is false for claims paid by paper check that never arrived as an 835. The gap list's 'a patient the practice has never been paid for' misdescribes this case.

**Scenario:** A paper-check payer's EOB, scanned and filed as a contract, names an account number the practice holds only in posting_row (no claim row, often no patient_ref row). It is sent.

**Reviewer's fix:** Read posting_row.claim_reference the same way (audited, decrypted, kind patientControlNumber, floor 8) and include its rows in the bound's count. If not, correct both sentences and list the gap as 'a patient control number held only in a posting export'.


**Skeptic:** Confirmed, and proven with a database test. In packages/model-gateway/src/patient-records.ts, loadContractScreenIdentifiers (lines 270-295) and COUNT (lines 235-236) read only patient_ref.member_id and claim's patient control number and payer claim number. They never read posting_row.claim_reference. The comment at lines 265-267 and ADR 0070 at lines 616-617 say that reference "is a patient control number already in claim". The code does not make that true:
(a) apps/worker/src/reconcile/exports.ts:69-98 (insertPostingRows) stores every row of a posting export. It needs no remittance and no claim, and posting_row has no foreign key to claim.
(b) apps/worker/src/reconcile/postings.ts:111-131 (postingDecision) answers 'unmatched' when no remittance carries the row's check number. unmatched.ts lists such rows for a person to match (PRD 13, step 4), so this is a normal, expected state.
(c) patient_ref is written only by apps/worker/src/parse/loader.ts:325, from 835s. A patient seen only by a paper-check payer therefore has no patient_ref row.

The same thing happens when a practice uploads a posting export covering periods whose 835s were never uploaded, for example a year of history at onboarding. In each case the practice holds the patient control number (PCN) only in posting_row.

The design carries the same false premise (lane-b-model-eval-gate.md:960, "every posted claim's PCN is already in claim"). It is an assumption, not a session ruling, so ADR 0070 does not list it as a departure.

The finding has two consequences beyond the code. First, the gap list in "What it gives up" (ADR 0070:736) is not true or complete: "a patient the practice has never been paid for (no patient_ref or claim row yet)" does not describe a patient who was paid by paper check and posted. Second, the test matrix's MOD-12 row promises to refuse "a patient control number the practice holds", and this case breaks that promise.

This hole is a whole class of documents, and it is the class the screen exists for. A paper payer's EOB (common for a PT practice: workers' comp, auto, small commercial payers) carries the practice's account number. The practice holds neither that payer's member ID nor its claim number, so the PCN in posting_row is the only identifier the screen could match, and the screen never reads it.

Proof: a test in my clone, packages/model-gateway/src/f7-posting.db.test.ts, runs on a migrated database of its own, which it drops afterwards. It seeds one claim with PCN SYNCLAIM5550011 and one posting row of a paper check (posting_export document, clean and stored) with claim_reference SYNPOST4007100. A page naming SYNCLAIM5550011 answers names_patient (the control). A page naming SYNPOST4007100 answers clear, so the document would be sent. All 3 tests pass.

Severity: I keep it at minor. It is the same kind of gap as the accepted "never been paid" gap, and the screen is a backstop. But it is the top of minor, because the founder accepted the gap list as written and this item is missing from it.

**Skeptic's fix:** Read the posting rows. Correcting the text alone is not the best option.

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


## phi-screen:F8 (reviewer minor; verdict minor) docs/adr/0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md:732

**Finding:** 'What it gives up' is incomplete and partly wrong. Not listed: OCR misreads (ADR:737-738 says an image page has no text, but deployed intake reads it with Textract, apps/worker/src/intake/wiring.ts:33, so the OCR text is screened and sent); a prefix or suffix glued on (a person-code suffix like ZZ712003401 against stored ZZ7120034, payer letters, check digits); leading zeros dropped and spreadsheet number artefacts; groups split by '.', '/' or ','; plus findings F1, F2 and F7. ADR:632 (and redact.ts:342-343) say a table's columns never join, but pdf.js writes a column gap as one space item, so PDF columns do join (set v2 runs include 9711059); the measurement includes these joins, so only the sentence is wrong.

**Scenario:** A faxed EOB OCR'd as ZZ7l20034, or an EOB printing the dependent's suffixed ID, is sent while the ADR presents the remaining gaps as complete.

**Reviewer's fix:** Add each item to the list with its realistic source. Correct ADR:737-738 to say scanned pages are read by Textract and screened, with OCR misreads as the gap. Correct ADR:632 to say tab-separated fields never join while a PDF's columns on one line do and are measured. Optional, and measured first: a confusable fold (O to 0, I/L to 1) on mostly-digit runs, and a 2-digit-suffix or 3-letter-prefix match for stored values of 9 or more characters.


**Skeptic:** Confirmed against the code at 9b7eadfe, with proof in my clone (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-phi-screen-F8).

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

**Skeptic's fix:** In docs/adr/0070 Part 3, "What it gives up", Not caught:

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


## phi-screen:N1 (reviewer nit; verdict nit, not verified) packages/model-gateway/src/patient-records.ts:142

**Finding:** Mutation survivors: the authorizedBy.practiceIds.includes check (departure 6) has no test; the opened-scope assertion (:158) and the default branch of screenContractPages (contract-terms.ts:517-518) are untested and unreachable today.

**Scenario:** Removing the includes check passes every unit test.

**Reviewer's fix:** Add a test with a scope whose access() answers but whose practiceIds lacks the practice. Comment the two unreachable guards as defensive.


## phi-screen:N2 (reviewer nit; verdict nit, not verified) packages/model-gateway/src/index.ts:185

**Finding:** ADR:601-602 says a stub that returns nothing cannot be supplied, but practiceRecordsCheck takes duck-typed pool and authorizedBy (testing.ts builds an issued, practice-bound check over nothing), and the lint test guards only imports of testing.ts. syntheticRecordsCheck is exported from the main entry, usable in production with an evaluation-actor gateway.

**Scenario:** Production code that imports syntheticRecordsCheck, or passes a stub pool, gets a check the screen accepts.

**Reviewer's fix:** Say 'no production caller supplies one'. Move syntheticRecordsCheck to an eval-only entry. Add lint cases restricting syntheticRecordsCheck to eval/ and tests, and practiceRecordsCheck outside tests to the two callers' service pools.


## phi-screen:N3 (reviewer nit; verdict nit, not verified) packages/synth/src/screen/patient-twins.ts:48

**Finding:** The twins' 9-digit member IDs (9 + 8 digits) are justified as 'an area no Social Security number has', but 9xx is the ITIN range: 11,840 of 26,667 are ITIN-shaped. Two of the 11-character alphanumeric IDs are MBI-shaped. In memory only and never written.

**Scenario:** The comment's 'never real-shaped' claim is false.

**Reviewer's fix:** Use a never-issued shape such as 9xx93xxxx (group 93 is never an ITIN), and keep a letter MBIs never use in the 11-character IDs. Re-run the pins.


# security review

Summary: I found no path that sends contract pages to a model without the screen. Two findings are my own: S1 is major and S2 is minor. S3 and S4 are minor findings the PHI-screen review already reported; I reproduced both. Every finding is proven by a test in my clone.

Why the boundary holds:
- **One send point:** the only provider call is gateway.ts:392.
- **What is screened is what is sent:** the request's text is the same string the screen reads (prepared.user).
- **The check:** it is issued only by its two factories, frozen and bound to the call's practice. Forged, copied, other-practice and synthetic-on-practice checks are refused.
- **Tenant isolation:** the screen reads in its own one-practice job scope as a service actor. RLS is unchanged (no migration), and the cross-tenant test passes.
- **Logs and notices:** they carry the practice ID and a code only. The redirect carries the code only, and the notice parameter is a closed list.
- **Oracle:** the screen is not one. A person without phi.read cannot choose the page text, because contract_specialist lacks file.upload.

The findings:
- **S1 (major):** every request runs the whole audited read of the practice before it can be refused. That includes a resubmitted request and a practice whose budget is spent. The only brake is the generic limit of 120 actions a minute.
  - Measured on Postgres: 25,000 audit rows per click, about 2.4 s each. One specialist can therefore write roughly 1 to 6 million audit rows a minute, and that table can never be cleaned.
  - This is worse than the ADR states: it claims "no audited read runs for a call that would be refused anyway" and costs it "once per click".
- **S2 (minor):** the practice's own access log shows screen reads as "a job of the practice" and cannot link them to the person who caused them. It also lists only the first 50 of a screen's reads: one case listed 50 of 301, and at the bound it would be 50 of up to 50,000.
- **S3 (minor):** a value that fails to decrypt rolls back every audit row of reads already made. My run kept only the person's event and none of the reads.
- **S4 (minor):** the purpose specs are not frozen, so one assignment in the same process removes the screen for every caller.

The ADR's "What it gives up" is true as far as it goes, but incomplete. It omits S1 to S4, the PHI-screen review's count race, and the claim that no stub can be supplied, which `testing.ts` contradicts. Refusals before the screen other than the two it names also record the person's event with no reads.

Checks run:
- `pnpm lint:logs` passed, and so did `pnpm check:fixtures`.
- gitleaks found no leaks.
- The PR #42 overlap is limited to the allowed shared files.
- At head: unit 140 passed (6 files), database 62 passed (5 files).
- Review experiments: 2 unit and 3 database tests pass.

The review file is /home/user/ops/approval-summaries/lane-b-model-eval-gate-phi-review-security.md. The experiments are untracked files in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/review-security/packages/model-gateway/src (review-security.test.ts and review-security.db.test.ts). Their outputs are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/sec.

Nits, which are in the review file but not among the findings:
- **Stub claim:** ADR:602 and patient-records.ts:18-20 say a stub cannot be supplied. Fix the wording, and add a lint rule that practiceRecordsCheck is called only from the two production files.
- **Testing-module lint:** it checks direct imports only, and it allows any test-support or route-tests path.
- **Orphan-event list:** ADR:745-748 names only two refusals before the screen. It should say any refusal before the screen (busy, a purpose not served, the PHI boundary, the input checks).
- **Unstated authorization:** "What it gives up" does not say that the screen's read is authorized in the web handler only. Postgres does not re-check the person until F3.

Improvements:
- Ask that F3's proposal also retire S1 and S2.
- Make the tokenizer stop at its first match (the PHI-screen review's #5).


## security:S1 (reviewer major; verdict major) packages/model-gateway/src/gateway.ts:225

**Finding:** Every request runs the full audited read of the practice before it can be refused, including requests the gateway refuses anyway. Up to 50,000 decrypts and up to 50,000 permanent audit_event rows are written each time.
- The screen runs before the idempotency check (gateway.ts:230) and the budget hold (gateway.ts:249).
- proposeTermsAction (apps/web/src/lib/routes/models.ts:42) names no rateLimit, so it falls into the generic 'mutation' bucket: 120 a minute per user (invoke.ts:365, rate-limit.ts:41).
- contract-proposals.ts:177-178 builds a fresh check for every request.
- Nothing bounds the per-time cost. gateway.ts:40 and ADR 0070:607 say "no audited read runs for a call that would be refused anyway", and ADR:851 says "once per click": both understate this.

**Scenario:** Proven in the clone's review-security.test.ts (2 of 2 pass at head, synthetic memory records):
- A replayed proposal with the same request key (a refresh-resubmit) opens the screen's scope, counts, reads and audits both tables, and only then throws DuplicateModelCallError.
- A practice with a spent (zero) budget screens fully on every click, then throws ModelBudgetExceededError.

Measured on Postgres (review-security.db.test.ts, a practice of 24,999 claims and one member ID):
- 3 requests wrote 75,000 audit rows, about 2.4 s a screen, about 325 bytes a row with indexes.
- The only brakes are the call limiter (2 in flight per practice per process) and the 120-a-minute user bucket.
- One contract specialist can therefore write roughly 1 to 6 million rows (0.3 to 2 GB) a minute into audit_event. That table is append-only for every role, so the rows can never be removed.

**Reviewer's fix:** 1. In ModelGateway.limited(), compute the idempotency key and call store.completedCall before this.screen(...). Both are reads, and prepared.inputHashes already exists there.
2. Before the screen, add a read-only budget peek: store.spentSince(practiceId, utcDayStart(now)) >= budgetMicro throws ModelBudgetExceededError with the existing log line. Keep the atomic hold after the screen, so a refused call still holds no budget and writes no model_call row.
3. Give proposeTermsAction its own rate bucket, for example 'model_screen' at 20 per 10 minutes per user. This is code only: add it to RateBucket, RATE_BUCKETS and RATE_LIMITS; rate_limit_take accepts any bucket matching ^[a-z][a-z0-9_]{0,31}$. Reusing 'export' would also do.
4. Add tests that a replay and a zero-budget call take no screen connection (records.reads.connects === 0), and a route test for the bucket.
5. State the per-time bound under ADR 0070 Part 3's Consequences.


**Skeptic:** Confirmed, with three corrections. Clone at 9b7eadfe: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-security-S1.

What the code does:
- gateway.ts:225 runs the screen before completedCall (line 230) and the budget hold (line 249).
- Each screen writes one audit_event per patient_ref row and per claim row of the practice (patient-records.ts:271-282, through readWithAudit, audit.ts:91). It does this in its own committed job scope, so the rows stay even when the call is then refused.
- audit_event is append-only for every role. ADR 0014 says triggers refuse DELETE and TRUNCATE even for superusers, and a nightly copy goes to Object Lock in COMPLIANCE mode, so these rows can never be removed.
- proposeTermsAction (apps/web/src/lib/routes/models.ts:42) names no rateLimit, so it falls into the 'mutation' bucket: 120 a minute per user (invoke.ts:365, rate-limit.ts:41).

Proven through the real route in Postgres. I added a 'verify S1' block to the clone's models-routes.db.test.ts; 3 of 3 pass at head:
- A practice with a zero budget: 3 clicks gave 3 full screens, each ending in ?model=budget.
- An exhibit that names a patient: 3 clicks gave 3 full screens. The version stays a draft and canPropose stays true (the existing assertion at :579), so nothing ends the loop.
- The reviewer's two gateway unit cases also pass in my clone.

Correction 1: the refresh-resubmit scenario cannot happen on the web.
- invoke.ts:251-253 inserts (user_id, request_key) into mutation_request before the handler runs. A same-key resubmit gets status 'duplicate' and never screens; this is proven in the same test block.
- The gateway's own duplicate check is reached only by callers that go to the gateway directly, or after a request was rolled back. The worker's permitted run loads the records once per practice per run.
- So moving the idempotency check is housekeeping, not the brake.

Correction 2: reordering does not bound the rate.
- A document that names a patient is refused only by the screen itself, so it screens in full on every click whatever the order.
- Only a rate limit bounds the cost over time.

Correction 3: who can do this.
- Only contract_specialist holds rate_record.edit. It is an internal-organization role (tenancy.sql:319) with a hardware key and a support grant that expires.
- So this takes a scripted insider or a stolen session, not a customer.
- It stays major: one session can write rows that can never be removed, into a database every practice shares. Also, gateway.ts:40 and the ADR at 605-607 claim "no audited read runs for a call that would be refused anyway", which is false for budget refusals.

ADR "What it gives up" is incomplete:
- It states no limit over time.
- Once the reorder lands, the person's contract_screen_requested event is also written with no reads after it on a budget or duplicate refusal. The ADR lists this gap only for the kill switch and an unserved variant.

The finding's figures check out: up to 50,000 decrypts and up to 50,000 audit rows per screen (identifiers = patients + 2 × claims; rows = patients + claims). Its rows-per-minute range is plausible given the call limiter (2 in flight per practice per process) and the 120-a-minute bucket.

**Skeptic's fix:** Prototyped in the clone. The diff is saved at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/verify-security-S1.fix.diff.

1. Main fix: give the proposal its own rate bucket.
- In apps/web/src/lib/http/rate-limit.ts, add 'model_screen' to RateBucket, to RATE_BUCKETS and to RATE_LIMITS, for example `model_screen: { user: { hits: 20, windowSeconds: 3600 }, address: { hits: 60, windowSeconds: 3600 } }`.
- Add `rateLimit: 'model_screen'` to proposeTermsAction in models.ts:42.
- This is code only: rate_limit_counter.bucket accepts any name matching ^[a-z][a-z0-9_]{0,31}$.
- Prototyped: web http and routes unit tests pass (313 of 313) and the web typecheck is clean.
- 'export' (60 per 10 minutes) is too loose here: it would still allow about 300,000 rows a minute.

2. Run the read-only checks before the screen, in ModelGateway.limited() (gateway.ts:225).
- Move modelId, price, idempotencyKey and store.completedCall above this.screen(...).
- Then add a read-only look at the day's spend, before the screen:
  `if (practiceId !== null && (await store.spentSince(practiceId, utcDayStart(this.now()))) >= budgetMicro)` logs the existing MODEL_BUDGET_EXCEEDED line and throws ModelBudgetExceededError.
- Keep the atomic hold after the screen. The early check is safe: the logged spend is never more than what the hold counts (spend plus holds), so it never refuses a call the hold would allow.
- Prototyped: models-routes.db and gateway.db pass (36 of 36), the zero-budget practice now takes 0 screens, and the gateway typecheck is clean.
- Four MOD-12 order tests in gateway.test.ts (about lines 688, 705, 728 and 747) assert `expect(harness.completedCall).not.toHaveBeenCalled()` and fail after the move. Change them to assert no hold, no model_call row and no request.

3. Tests.
- Unit: a replay and a zero-budget call take no screen connection (`records.reads.connects === 0`).
- Route: clicks at a practice whose budget is spent write no contract_screen reads.
- `proposeTermsAction.rateLimit === 'model_screen'`, plus a database test that the 21st proposal within the hour is refused as rate_limited.

4. Docs.
- gateway.ts:40 and ADR 0070 at 605-607 and 883: the read-only checks (idempotency and budget) now run before the screen.
- Consequences (:851): state the bound, at most 20 screens an hour per specialist, each up to 50,000 audit rows, until F3.
- "What it gives up": add that a refusal for names_patient reads and audits the whole practice again on every click until F3, and that the person's event is also written with no reads after it on a budget or duplicate refusal.

Possible improvement: a per-practice limit (pass the practice ID as the bucket's account subject) would also cap a specialist who holds grants on several practices.


## security:S2 (reviewer minor; verdict minor) apps/web/src/lib/routes/settings.ts:834

**Finding:** The practice's own access log cannot show who caused a screen's reads, and it lists only the first 50 of them.
- practice_access_log labels each screen read 'a job of the practice', via 'system', and returns no request_id, so the join to the person's contract_screen_requested event is invisible.
- The route pages with next set to the last row's `at` only, and the function filters e.at < before_at.
- All of a screen's rows are inserted by one statement and share one `at` (patient-records.ts:271-282), so every page after the first skips the rest of the screen.
- ADR 0070 Part 3 says "the trail says who caused the screen and joins to its reads". That holds only for direct audit_event queries, not for the practice's access report.
- The tie on `at` is older than this PR, but this PR multiplies it by up to 1,000.

**Scenario:** Proven on Postgres (review-security.db.test.ts, output sec/accesslog.json). An internal contract specialist under support grant SQ-77 proposes a document of a practice holding 301 identifier rows, and the practice administrator pages the access log as the route does.
- All 301 screen reads were audited, but the log lists only 50, as 'a job of the practice | system | no ticket'.
- The next page skips the other 251 and shows the person's contract_screen_requested event ('<email> | support | SQ-77').
- Nothing on either page links the reads to that event.
- At the bound, a click lists 50 of up to 50,000 reads.

**Reviewer's fix:** In this PR:
- Add to ADR 0070 Part 3's "What it gives up" that the access log shows screen reads as a job, cannot name who caused them, and lists only the first 50 of a screen's reads.
- Add a db test that pins today's behaviour.

For Lane A, with F3:
- practice_access_log pages on (at, id), and the route's next carries both.
- Reads with purpose contract_screen are labelled from their joined contract_screen_requested event.
- F3's single screen event with matched rows only removes most of the problem.

Do not put the person's grant_id on the screen's reads: the support ticket's trail would then say the person read every patient, which M8 rules out.


**Skeptic:** Confirmed. I reproduced it through the real routes, not an emulation of them. In my clone I appended a describe block to apps/web/src/lib/routes/models-routes.db.test.ts. It builds a CAS-08 practice with 300 more synthetic claims (seedScreenRecords). The specialist, under support grant SYN-MOD, calls proposeTermsAction on the misfiled exhibit and gets names_patient. Then the practice admin pages accessLogPage, following `next` into `before` the way page.tsx's "Older entries" link does. The output is in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/verify-security-S2.result.json.

Results:
- 306 screen reads were audited, and all share one `at`.
- The log showed 50 of them on page 1 and 0 on page 2, so 256 were skipped.
- Every shown read is labelled 'a job of the practice | system | no ticket | contract_screen'.
- The person's event ('email | support | SYN-MOD | contract_screen') appears on page 2. It was written 34 ms before the reads.

Why it happens:
- The cursor holds only `at` (settings.ts:834) and the function filters `e.at < before_at` (packages/db/functions/practice_access_log.sql). Every row with the same `at` as the page's last row is therefore skipped.
- audit_event.at is DEFAULT now(), the start time of the transaction. withJobScope opens one transaction for the whole screen, so every row the screen writes shares one `at`.
- practice_access_log returns no request_id. A service actor with no user is labelled 'a job of the practice', and with no grant it is 'system' (withJobScope sets grantId null).
- ADR:661 says "the trail says who caused the screen and joins to its reads". That is true of audit_event, but not of the only view the practice has. "What it gives up" lists the rollback gap in the audit trail, but not this one.

Corrections to the finding (they do not change the verdict or the severity):
1. The rows are written by two INSERTs (patient_ref, then claim; patient-records.ts:271-282) in one transaction, not by "one statement". They share `at` because now() is the transaction's start time.
2. "Nothing links" is slightly overstated. page.tsx shows "(contract_screen)" in the What column on both the reads and the person's event, and utc() prints only to the minute. An admin can guess the link from the purpose and the timing, but cannot check it. The worker's permitted run writes reads that look the same (a service actor, purpose contract_screen, request ID evaluate-permitted:<run>:screen:<run>) with no person event, and so do two clicks in the same minute.
3. The per-object query still works. Filtering on a claim the unfiltered log skipped shows its read ('read | a job of the practice | system | contract_screen'). So no read is lost, and PRD 6's "who read claim X" is answered, though without the person who caused it.
4. The tie on `at` is older than this PR and affects every multi-row readWithAudit in one transaction. This PR is the first caller that writes up to 50,000 rows in one tie (rows ≤ identifiers ≤ SCREEN_MAX_IDENTIFIERS).

Why minor and not worse: the audit_event rows are complete and per-object lookups are right. The gap is in the practice's report, and fixing it needs a change to a SECURITY DEFINER function, that is, a migration, which Lane B does not open. The route cannot work around it: at_most is capped at 200, and the function takes no id cursor, so a tie larger than 200 rows cannot be paged through.

**Skeptic's fix:** In this PR:
1. ADR 0070 Part 3, "What it gives up", under "The audit trail": add that the practice's access log (practice_access_log, settings.ts:834) shows a screen's reads as "a job of the practice" via "system". It returns no request ID, so it cannot name who caused them; the worker's permitted run writes the same-looking reads with no person event. Its `at`-only cursor also lists only the first 50 of a screen's reads (up to 50,000), and the per-object filter still finds each one.
2. Qualify ADR:661 and the patient-records.ts:28-30 docblock to say "the audit_event trail", not "the trail".
3. Pin the gap with a db test through the real routes in apps/web/src/lib/routes/models-routes.db.test.ts, as my experiment does: proposeTermsAction, then page accessLogPage. Assert that fewer reads are shown than were audited, that a skipped claim is found by the object filter, and the labels. Comment that the test flips when Lane A's change lands.

For Lane A (the same migration as F3, or next to it):
1. Page practice_access_log on (at, id): add a before_id parameter with `(e.at, e.id) < (before_at, before_id)`. Make the route's `next` carry both values and keep the microseconds, since toISOString() drops them.
2. Return request_id and accept it as a filter, so the person's contract_screen_requested row links to the reads it caused. The request ID is opaque, not PHI.
3. Label contract_screen reads from the contract_screen_requested event they join, for example "screen caused by <email> (support SQ-77)". Leave unjoined reads (the worker's runs) as a job.

As the reviewer says, do not put the person's grant_id on the reads: that would say the person read every patient, which M8 rules out.


## security:S3 (reviewer minor; verdict minor) packages/model-gateway/src/patient-records.ts:283

**Finding:** A value that fails to decrypt rolls back every audit row of reads already made. This is the PHI-screen review's finding #3, which I reproduced independently. The values are decrypted inside the withJobScope callback, whose transaction also holds readWithAudit's audit rows, so a decrypt error rolls them back.

**Scenario:** A practice where one claim's patient control number is sealed for another column (the state models-routes.db.test.ts builds for screen_failed).
- My Postgres run (sec/accesslog-decrypt.json): the outcome is screen_failed.
- Under the screen's request ID, only the person's contract_screen_requested event remains. Zero of the screen's read rows are kept, although both tables were read and earlier values decrypted.
- Every later click of every contract repeats the unaudited full read until the row is fixed.

**Reviewer's fix:** - Return the ciphertext rows from the job scope, so the audit rows commit, and decrypt and build the set after withJobScope resolves; a decrypt failure then answers screen_failed with every read audited.
- Make the web's screen_failed test assert that the screen's reads exist.


**Skeptic:** I could not refute it. I confirmed it by reading the code and by a Postgres run in my clone at 9b7eadfe.

**How it happens:**
- In packages/model-gateway/src/patient-records.ts:156-165, load() runs loadContractScreenIdentifiers inside the withJobScope callback.
- The two readWithAudit calls (271-282) INSERT their audit rows on that scope's client (packages/db/src/authz/audit.ts:86).
- The screenSet generator decrypts lazily at 283-292, still inside the callback.
- transaction() (packages/db/src/authz/scope.ts:108-118) issues ROLLBACK on any throw.
- namesPatient's catch (175-180) turns the error into screen_failed and resets `known`, so the next question reads again.
- The web records the person's contract_screen_requested event in the request's own transaction (apps/web/src/lib/models/contract-proposals.ts:178-181). That transaction commits.

**Proof:** a new test, packages/model-gateway/src/verify-s3.db.test.ts, in my clone only.
- Setup: the web login, a contract specialist with a support grant, and 5 member IDs and 5 claims from MOD-12's synthetic practice. The last claim's PCN is sealed for patient_ref.member_id. The person's event is recorded first.
- At head:
  - Both asks answer screen_failed.
  - 13 plaintexts were decrypted on the first ask and 26 after the second.
  - Under the screen's request ID, only the person's event is kept. 0 of the 5+5 read rows survive.
  - Output: scratchpad/phi/progress/verify-security-S3.head.json.
- With the fix:
  - The kept reads are claim 10 and patient_ref 10, which is 5+5 per ask.
  - tsc exits 0. patient-records.db and gateway.db pass (28 tests), and patient-records, gateway and permitted unit tests pass (97).
  - Output: verify-security-S3.fix.json.

**Why it is a defect, not the house rule:**
- ADR 0014:29's rule depends on the request aborting ("an aborted request delivers nothing unaudited"). Here the request does not abort: it commits the person's event and serves screen_unavailable.
- PHI plaintext was produced inside the check, and the trail is left reading "screen requested, nothing read".
- That contradicts ADR 0070 "Every returned row is audited" (around line 655) and "What is recorded" (703-705), and contract-proposals.ts:53-54 ("joins it to every read the screen made").
- The ADR's "What it gives up -> The audit trail" bullet (744-748) does not list this case, so that list is incomplete.
- The existing tests do not catch it:
  - The gateway DB test's decrypt case (patient-records.db.test.ts:159-161) uses a wrong key, so the first decrypt fails and nothing is decrypted. It never exercises a partial decrypt.
  - The web's screen_failed test (models-routes.db.test.ts:609-638) asserts only that there is one event.

**Why minor, not major:**
- Nothing of the PHI leaves the check; only a code does.
- No user can cause it. The columns are NOT NULL with an enc:v1 CHECK (remittances.sql:106-107; member_id is filtered with IS NOT NULL), the app always seals values for the right column, and there is no key rotation. It needs a write bug, tampering, or a restore under the wrong key.

**Corrections to the finding:**
1. The database read is full, but the decrypt is partial: every member ID, then claims in heap order up to the bad one. So "unaudited full read" should read "full read, partial decrypt, both unaudited".
2. It understates the reach: the worker's permitted run is also hit. apps/worker/src/models/permitted.ts:208-237 reuses one check per run and keeps looping after a failure, so every example re-reads and re-decrypts with its audit rows rolled back. That is N unaudited passes per run, plus the job's retries.
3. A COMMIT that fails after the decrypt also loses the audit rows, and the fix covers that case too.
4. The cited line 283 is the decrypt. The cause is load() at 156-165.

**Skeptic's fix:** The reviewer's fix is right. Three additions complete it. My version is in scratchpad/phi/progress/verify-security-S3.fix.diff.

**1. patient-records.ts:**
- Replace loadContractScreenIdentifiers (269-294) with two functions:
  - `readContractScreenRecords(scope, read): Promise<{ patients, claims }>` does the two readWithAudit calls and returns ciphertext only.
  - `decryptContractScreenRecords(records, cipher): ScreenSet` is today's generator plus screenSet.
- Remove the combined function, so that no exported function still decrypts inside a scope. Its only caller is line 164.
- Make load() async:

```ts
const read = await withJobScope(pool, { jobId: screenId, practiceId }, async (scope) => {
  /* the existing guard and count */
  return readContractScreenRecords(scope, { practiceId, requestId: auditRequestId });
});
return read === 'too_many' ? read : decryptContractScreenRecords(read, cipher);
```

- Result: no value is decrypted before its read's audit rows have committed. A decrypt failure still answers screen_failed, and a scope, count or query error still rolls back with nothing decrypted.
- Side benefit: the pooled connection is no longer held inside the transaction during up to 50,000 decrypts.

**2. Tests:**
- Add a partial-decrypt case to patient-records.db.test.ts. Seal one claim's PCN for another column, assert screen_failed, more than 0 decrypts, and audited reads equal to the patient_ref and claim rows.
- In the web's screen_failed test (models-routes.db.test.ts:609-638), assert that the screen's reads per type equal the rows the practice holds.
- Add a worker permitted-run case with two examples.

**3. ADR 0070 Part 3:**
- Rename `loadContractScreenIdentifiers` at line 611.
- "Any error fails closed" (650-653) should say that a decrypt error answers screen_failed after the reads' audit rows have committed.
- If the code is not fixed, the "The audit trail" bullet must instead list that a screen whose decrypt fails keeps none of its reads, on the web and on every example of a worker run.

**Note:** with the fix, a value that stays broken writes a full set of audit rows on every click before answering screen_failed. That is correct, but it adds to S1's audit-row volume, so S1's rate bucket also covers this case.


## security:S4 (reviewer minor; verdict minor) packages/model-gateway/src/specs.ts:11

**Finding:** The spec that decides whether the screen runs is mutable. This is the PHI-screen review's finding #6, which I confirmed. PURPOSE_SPECS and contractTermsSpec are exported and not frozen (`as const` is type-only), and gateway.ts:275 calls spec.screen?.(...). The WeakSet and the freeze protect the check object, but not whether the screen runs.

**Scenario:** Any in-process code runs PURPOSE_SPECS.proposeContractTerms.screen = undefined, and every later contract call in the process is sent without the screen.

**Reviewer's fix:** - Object.freeze each spec and PURPOSE_SPECS, and declare screen readonly.
- Better still, have the gateway call screenContractPages for proposeContractTerms whatever the spec says.
- Add a test pinning PURPOSE_SPECS.proposeContractTerms.screen === screenContractPages and that both objects are frozen.


**Skeptic:** Confirmed at minor. I tested it in my own clone at 9b7eadfe.

What the code does:
- PURPOSE_SPECS (packages/model-gateway/src/specs.ts:11) and contractTermsSpec (functions/contract-terms.ts:522) are plain objects that are never frozen.
- PurposeSpec.screen (spec.ts:47) is declared as an optional method, so it is not readonly. The `as const` at specs.ts:16 makes only the registry's own keys readonly, and only at the type level.
- gateway.ts:275 calls `spec.screen?.(...)`, so a missing screen is skipped without any error.
- index.ts:156 exports PURPOSE_SPECS from the package's public entry. No source outside the package imports it today (only prompts.test.ts, inside the package), and nothing in apps, packages or tools changes a spec.

What the probes showed (packages/model-gateway/src/s4-probe.test.ts, synthetic data):
- Baseline: a contract page reading "Member ID:ZZ 123 4567" is refused with names_patient.
- Object.isFrozen is false for both PURPOSE_SPECS and the contract spec.
- After `delete PURPOSE_SPECS.proposeContractTerms.screen`, the same call is sent. The local provider's requests hold the member ID.
- `tsc --noEmit` passes in strict mode with both `PURPOSE_SPECS.proposeContractTerms.screen = () => Promise.resolve()` and `delete PURPOSE_SPECS.proposeContractTerms.screen` in a source file. So code that compiles and passes lint can turn the screen off for the whole process.

Why minor and not higher:
- No code path in the repository does this.
- It takes a deliberate line of in-process code. Such code could also replace ModelGateway.prototype.screen, or patch Set.prototype.has (pagesName in patient-records.ts relies on set.values.has), or call the provider SDK directly.
- The denial-letter screen has had the same mutable wiring since the base, e908c214.

Why it is still a real gap and not a nit: ADR 0070 Part 3 is headed "Where it runs, and why no caller can skip it". Its departure 5 freezes the issued check "so its practice cannot be changed in-process", and lint.test.ts makes sure no hand-made check can be written. So the PR defends against in-process mutation of the check but leaves open whether the check runs at all. Under the PR's own threat model that guarantee is incomplete. The ADR's "What it gives up" list does not mention this limit.

The finding's "better still" fix is wrong. I froze PURPOSE_SPECS and the spec, then replaced ModelGateway.prototype.screen, and the contract naming the patient was still sent. ModelGateway is exported. Hardcoding screenContractPages in the gateway would therefore not close the class, and it would put purpose-specific code into the shared call path.

I tried the corrected fix (below) in my clone:
- The package's tsc is clean apart from my probe file, which now fails with TS2540 on the assignment and TS2704 on the delete.
- The model-gateway unit tests (src and eval) pass: 444 of 446, including the new pinned test. The 2 failures are probe tests written to show the old behaviour. They now fail because the spec is frozen and assigning or deleting it throws a TypeError, which is the intended result.

**Skeptic's fix:** 1. spec.ts:47: declare `readonly screen?: (input: I, prepared: PreparedCall<C>, context: CallContext) => Promise<void>;` in place of the method signature. Assigning to it is then compile error TS2540 and deleting it is TS2704. The object-literal `async screen(...)` in denial-letter.ts still compiles. Make prepare and verify readonly properties the same way.
2. Freeze each spec where it is defined (contract-terms.ts:522, denial-letter.ts, narrative.ts, evidence-requests.ts), for example `Object.freeze(contractTermsSpec)`. Wrap the registry at specs.ts:11 as `Object.freeze({ ... } as const)`. ESM code then gets a TypeError on any assignment or delete.
3. Remove PURPOSE_SPECS from index.ts:156. Nothing outside the package imports it; requestFor and the gateway methods are the public surface. Code elsewhere then cannot reach the spec objects through the package's two entry points ("." and "./testing").
4. Add a test asserting `PURPOSE_SPECS.proposeContractTerms.screen === screenContractPages`, that Object.isFrozen holds for the registry and every spec, and that deleting the contract screen throws a TypeError.
5. Drop the "have the gateway call screenContractPages whatever the spec says" option. It does not close the class, because ModelGateway.prototype can be patched the same way. If you want that too, add `Object.freeze(ModelGateway.prototype)`; no test spies on it.
6. Add one sentence to ADR 0070 Part 3, under "why no caller can skip it" or "What it gives up". It should say the guarantees hold against what a caller passes and against code that compiles, but not against code in the process that deliberately rewrites the gateway's objects or JavaScript's built-ins, which could as well call the provider directly.


# ux review

Summary: No blocking findings. Two major (should-fix) findings and four minor ones, all fixable by changing words and the uploader, with no migration and no founder ruling.

**UX-1 (major).** Files dropped or chosen before the kind is picked are thrown away, and the person must choose them again. The select is not marked, not focused and not tied to the message, and a second identical refusal is silent to a screen reader. This copies a pattern the baseline already found defective (UX-049) onto Contracts and Reconciliation. Best fix: keep the files in the browser, mark and focus the select, and upload only on an explicit "Upload N files" button. Uploading automatically when the kind is chosen would be wrong: I confirmed in Chromium that each arrow press on a closed select fires a change event, so the files would upload as Contract on the first keypress, and the kind cannot be changed afterwards.

**UX-2 (major).** The names_patient notice tells the contract specialist to "Enter its terms by hand" first, though a payer letter or an EOB has no terms. It says "filed as the wrong kind" with no remedy, and an EOB has no right kind on that screen. It never points to the "Ask the practice" card that is the real next step. "Names a patient" is also inexact: the check matches identifiers, not names, and it also refuses TIN or ZIP+4 collisions. "EOB" appears on no other screen. New words are given. The security reviewer should look at one point: the current words send a specialist without phi.read to read an EOB line by line.

**Minor:**
- UX-3: the screen_unavailable notice says "patient details" and gives no retry, though screen_failed is transient. New words are given, true for both causes.
- UX-4: nothing tells the person, at the moment of choosing, that a document's kind is permanent.
- UX-5: the refusal stays on screen after a kind is chosen.
- UX-6: ADR 0070 Part 3's "What it gives up" leaves out these gaps, and its Consequences say the specialist enters terms by hand for a misfiled EOB.

**Sound:**
- Contracts and Reconciliation now start with no kind.
- The select keeps its label and fits at 390 px.
- The Uploads page is unchanged, with 835 still chosen.
- The two notices name no patient, identifier, kind or count, pass the copy lint, and read correctly in dark and at 390 px.

**Baseline findings:** UX-049 is now worse. UX-097, UX-159, UX-163, UX-197, UX-013, UX-082 and the table overflow at 390 px are still open and unchanged.

Review file: /home/user/ops/approval-summaries/lane-b-model-eval-gate-phi-review-ux.md. Progress notes: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/review-ux.md. Proof script: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/ux-scripts/select-arrow.cjs.


## ux:UX-1 (reviewer major; verdict major) apps/web/src/components/uploads/uploader.tsx:125

**Finding:** A drop or a choice of files made before the kind is chosen throws the files away. The person must choose them again. The kind select gets no aria-invalid, no aria-describedby and no focus. If the person tries again before choosing a kind, the refusal renders the same <li> with the same text, so a screen reader hears nothing the second time. This copies the ERA-system refusal that the baseline found defective (UX-049, C-037, should fix; settled fix: keep the files and start on the choice) onto two more screens, Contracts and Reconciliation. The change makes that finding worse and touches its cause, so it is this change's own.

**Scenario:** An era-manager drags an EOB and a contract onto the Contracts drop zone, whose heading reads 'Drop contracts, exhibits or payer letters here', with the select still on 'Choose the kind of document'. batchProblems pushes CHOOSE_KIND_FIRST (:125-126) and start() returns at :255 without keeping the files. The alert below the zone (:457-468) says 'choose the files again'. On a phone the person goes back through the picker for every file. A screen-reader user who chooses files again without a kind gets no new announcement, because the DOM is unchanged. The PR's own e2e makes that second attempt (contracts.spec.ts:77-89). Shots p.contracts.no-kind.1280, .390 and .1280-dark show the select unmarked above the alert.

**Reviewer's fix:** In uploader.tsx only (no migration): (1) Hold the chosen files in the browser while no kind is chosen; nothing goes to the server. (2) Show the message under the select (id upload-kind-problem), set aria-invalid and aria-describedby on the select, and move focus to it. Words: 'Choose the kind of document for these 3 files, then upload them.' (counted(); 'this file' / 'upload it' for one). (3) Once a kind is chosen, show an explicit 'Upload 3 files' button with 'Clear' beside it. Do NOT start the upload on the select's change event. Proven in the clone (scratchpad/phi/ux-scripts/select-arrow.cjs, Chromium 1.56): ArrowDown on a closed select fires change on every press (contract, exhibit, payer_letter), so auto-start would upload under Contract on the first keypress. That is the misfiling this PR prevents, and it cannot be undone (F4). (4) A second drop adds to the held files and updates the count, so the message changes and is announced. (5) Apply the same hold to the ERA-system refusal, which closes UX-049. Tests: a pure held-batch helper in uploader.test.tsx, and contracts.spec asserting the files are kept, the select is aria-invalid and focused, and the upload starts only on the button.


**Skeptic:** Confirmed against the code at 9b7eadfe, in a real browser, and in the shots.

What the code does:
- apps/web/src/components/uploads/uploader.tsx:125-126 pushes CHOOSE_KIND_FIRST when the kind is null.
- start() (:251-257) then returns. The files exist only in the local `chosen` array, and the input's value is cleared at :449, so they are thrown away.
- The select (:381-401) never gets aria-invalid or aria-describedby, and nothing moves focus to it.
- The refusal is an Alert (packages/ui alert.tsx, role="alert" by default) holding `<li key={problem}>`. A second refusal has the same key and the same text.

On base e908c214 the Contracts and Reconciliation panels preselected kinds[0], so neither screen ever refused for kind. On the head both start with no kind:
- contracts/page.tsx passes three kinds.
- reconciliation/page.tsx passes posting_export and eft_export.
- Neither passes initialKind.

So this refusal-and-discard is new behaviour on both screens. It is the first thing anyone meets who drops or picks files before choosing a kind, and the zone's heading invites the drop.

Design 5.9 asked for these words, but no founder ruling covers discarding the files. N4 only leaves the kind unset. The project's reviewer checklist (.claude/agents/ux-brand-reviewer.md:35) says "A refusal keeps every value, files too ... tied by aria-describedby ... Focus moves to the error". The baseline rated the same pattern "should fix" (UX-049, C-037; ops/designs/lane-b-ux-review.md:2427). That baseline case is on the rarer ERA path, so major matches it. ADR 0070 Part 3's "What it gives up" does not list the cost.

Proof in a browser: I bundled the real Uploader with esbuild in my clone (apps/web/ux1-harness, next/navigation stubbed, three synthetic kinds) and drove it with Chromium 1.56 using /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/verify-ux-UX-1-scripts/second-drop.cjs.
- First drop of 3 files: one DOM change, the Alert being inserted. No fetch.
- A second drop, then a choice through the file input, both with no kind: zero changes under the alert, so a screen reader announces nothing.
- In every state the select has aria-invalid null and no aria-describedby, and focus stays on BODY.
- After choosing "Contract", nothing is held and nothing starts. The alert still says "Choose the kind of document first" while the select shows Contract.

Re-running /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/verify-ux-UX-1-scripts/select-arrow.cjs in my clone gave ["contract"] after one ArrowDown and ["contract","exhibit","payer_letter"] after three. Starting the upload on the select's change event would therefore misfile it.

The shots p.contracts.no-kind.1280, .1280-dark and .390 (all 7 tiles) show the select unmarked above "Nothing was uploaded". Every cited line is correct (:125-126, :255, :457-468, contracts.spec.ts:77-89), and the e2e's second attempt passes only because the text is identical.

Severity and the fix's direction are right. The fix needs the refinements below.

**Skeptic's fix:** Keep the finding's fix (uploader.tsx only, no migration), with these refinements:

1. **Hold the files.** While no kind is chosen, or while an ERA export has no system chosen (this closes UX-049), keep the dropped or chosen files in component state. Nothing goes to the server. Run batchProblems on everything held each time files are added, so maxFiles and the empty-file checks still apply.

2. **Mark the select.** Put the message under the select as `<p id="upload-kind-problem">` (for the ERA case, `upload-format-problem` under the system select). Set aria-invalid="true" and aria-describedby on the select and move focus to it.
   - Words: "Choose the kind of document for these 3 files, then upload them.", built with counted(). For one file: "this file" and "upload it".
   - Do not use the "Nothing was uploaded" alert for this case.

3. **Clear the message once the kind is chosen.** It is proven stale today. Then show "Upload 3 files" with "Clear" beside it, and start the batch only on that button, never on the select's change event (arrow keys fire change on every press).
   - A new file choice made while files are held joins the held batch and waits for the button.

4. **A second drop.** It adds only the files not already held, matched by name, size and lastModified, so re-dropping the same file does not create a held duplicate on the server. Every refused attempt must also be announced, even when the count does not change: key the message node by an attempt counter so it is re-inserted into the live region.

5. **Tests.**
   - A pure held-batch helper (merge, dedupe, count, words) in uploader.test.tsx.
   - contracts.spec.ts should assert:
     - the dropped file is kept and the message names its count;
     - the select is aria-invalid and focused;
     - a second drop changes the message;
     - nothing is requested until "Upload N files" is pressed.
   - The spec must press "Clear" before uploadContract, so the held synthetic dropped.pdf is not uploaded as a contract.

6. **Record the choices.**
   - Record the departure from UX-049's chosen words ("They upload as soon as you choose") as a numbered departure in ADR 0070 Part 3, citing the arrow-key proof, and amend UX-049's Fix line in the UX review, so UX PR 47 (co-001/ux-uploader) does not add auto-start back.
   - Until the fix lands, list the discard under ADR 0070 Part 3 "What it gives up".

Improvement: while no kind is chosen, make the zone's heading and the "Choose files" hint say "Choose the kind of document, then drop or choose files", so fewer people meet the refusal at all.


## ux:UX-2 (reviewer major; verdict minor) apps/web/src/lib/models/notices.ts:26

**Finding:** The names_patient notice gives the contract specialist a next step that is wrong for the case it describes, and no step for that case. (1) 'Enter its terms by hand' comes first, but a payer letter or an EOB has no contract terms. ADR 0070:849 repeats this. (2) 'It was filed as the wrong kind' gives no next step and cannot be acted on (no re-filing until F4). For an EOB there is no right kind on Contracts at all: the kinds are contract, exhibit and payer_letter (lib/routes/contracts.ts:47). (3) The real next step is already on the page and goes unnamed: the always-shown 'Ask the practice' card (version page.tsx:449). (4) 'Names a patient' is not what the check proves. It reads identifiers only, never names, and it refuses a TIN or ZIP+4 equal to a stored member ID, which names no patient (ADR 'Refused that names no patient'). (5) 'EOB' appears on no screen before this PR and is not expanded. For the security reviewer: the words send a specialist who holds no phi.read (ADR alternatives table) to read a patient's EOB line by line to 'enter its terms'.

**Scenario:** A practice uploads a synthetic EOB as a Contract and tags it. The contract specialist clicks 'Propose the terms'. The gateway refuses with names_patient, and the version page shows 'Nothing was proposed: This document names a patient of the practice, so it was not sent to the model. Enter its terms by hand. If it is a payer letter or an EOB, it was filed as the wrong kind.' (shots p.abstraction-version.model-names-patient.1280 and .390). The specialist can neither re-file the document nor find terms in it, and is not pointed to Ask the practice.

**Reviewer's fix:** notices.ts:26 (and path.test.ts:31, plus the ADR's quoted text at 0070:688-689) becomes: 'This document holds an identifier from the practice's patient records, so it was not sent to the model. If it is a contract or an exhibit, enter its terms by hand below. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: ask the practice for the contract below.' It names no patient, identifier, kind or count (m14's own words: 'holds an identifier of the practice'). It promises no re-filing (F4). Both 'below' targets exist on a draft version, the only state that offers Propose (page.tsx:107, :173, :449). No migration.


**Skeptic:** Not refuted: the finding's core holds against the code at 9b7eadfe. I am lowering the severity from major to minor.

What I checked:

(1) The text. notices.ts:26 says what the finding quotes, word for word. It is the design's own text (lane-b-model-eval-gate.md:987-989), and ADR 0070:688-689 quotes it. The after shots p.abstraction-version.model-names-patient.1280 (tile 01) and .390 (tile 01) show it under "Nothing was proposed". The before shots show no notice.

(2) The next step does not fit the main case. "Enter its terms by hand" comes first, but an EOB or a payer letter has no terms to enter. "It was filed as the wrong kind" gives no action:
- tagging.ts has no untag or re-kind path;
- F4 is the only re-filing path, and it is not built;
- CONTRACT_DOCUMENT_KINDS (lib/routes/contracts.ts:47) is contract, exhibit and payer_letter, so an EOB has no right kind on Contracts.
PRD:256 asks for "every error shown with a next step", and the case this notice exists for gets no step it can use. ADR 0070:848-849 and :853 repeat the same claim ("the specialist enters the terms by hand"; "hand entry is the way on").

(3) The right next step is on the page but goes unnamed.
- The "Ask the practice" card is drawn on every version (abstraction page.tsx:449).
- The specialist holds its permission (rate_record.edit, abstraction.ts:447).
- Propose is refused unless the version is a draft (contract-proposals.ts:143). On a draft, both "Enter a rate record" (:173) and "Ask the practice" sit below the notice (:105), so the fix's word "below" is true.

(4) "Names a patient" overstates what the check finds. It reads only member IDs, patient control numbers and payer claim numbers, never names. The ADR's own "Refused that names no patient" lists a TIN or ZIP+4 equal to a stored member ID. Disposition m14 itself describes the refusal as saying the document "holds an identifier of the practice". This is wording accuracy, a nit-level part of the finding.

(5) "EOB" appears in no screen text in apps/web/src at e908c214, and the notice does not expand it. This is a nit: the reader is an internal contract specialist in medical billing, who knows the term.

Where the finding overstates:
- The security aside does not hold as a defect of this text. The specialist can already read a misfiled document's pages in the review's "The page" panel. lib/contracts/evidence.ts serves the pages of contract, exhibit and payer_letter documents, with audit purpose contract_evidence. Payer letters, which carry PHI, are read there routinely. The notice creates no new exposure, and m14 accepted this.
- On severity: no number, stage, approval or PHI goes wrong, and nothing is sent. The remedy is on the same page and is a step specialists already take ("Ask the practice"). The cost is friction and a sentence that does not fit its main case. So it is minor, not major.

The fix's guard: the proposed text passes path.test.ts's no-identifier guard (/member|claim number|control number|\d/i). I checked this in node. It names no patient, identifier, kind or count (m14), and it promises no re-filing (F4).

Improvement: the redirect carries only the code (routes/models.ts:30: ?model=names_patient). On a version holding two contract-kind documents (MOD-12's zip of a contract and an EOB, both filed as a contract), "this document" does not say which one was refused, and the select goes back to the first option. Adding the refused document's opaque ID to the redirect (an ID, not PHI) would let the notice name it by its documentLabel and preselect the other document.

**Skeptic's fix:** 1. apps/web/src/lib/models/notices.ts:26: set names_patient to "This document holds an identifier from the practice’s patient records, so it was not sent to the model. If it is a contract or an exhibit, enter its terms by hand below. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: propose from the version’s contract or exhibit instead, or ask the practice for it below."
   - This changes the reviewer's last clause. In MOD-12's zip case the real contract is already in the version, so "ask the practice for the contract" alone is not the best step.
2. apps/web/src/lib/models/path.test.ts:31: expect the same text. The existing /member|claim number|control number|\d/i guard still passes; I checked it.
3. ADR 0070:688-689: quote the new text.
4. ADR 0070:848-849 ("and the specialist enters the terms by hand") and :853 ("hand entry is the way on"): say that a misfiled letter or EOB has no terms, that the specialist proposes from the version's contract or asks the practice, and that a contract refused by a false match (a TIN or ZIP+4) is entered by hand.
5. No migration and no gateway change. NAMES_PATIENT_MESSAGE (contract-terms.ts:481) and the log line are internal and never shown on a screen; aligning their wording ("holds an identifier of a patient of the practice") is optional.
6. Optional improvement: carry the refused document's ID in the redirect, so the notice names that document and the select preselects another.


## ux:UX-3 (reviewer minor; verdict minor) apps/web/src/lib/models/notices.ts:27

**Finding:** The screen_unavailable notice says the document 'could not be checked for patient details'. The check reads three identifier kinds, not names, dates of birth or addresses, and the sibling notice uses another name for the same records. The same notice covers screen_failed (path.ts:179, :195-196), a read failure that a second click may clear (ADR 0070:692), yet it offers only hand entry.

**Scenario:** A transient database fault during the screen gives screen_failed. The specialist reads 'Enter its terms by hand.' and abstracts a whole contract by hand, when a retry a minute later would have worked. Shots p.abstraction-version.model-screen-unavailable.1280 and .390.

**Reviewer's fix:** notices.ts:27 (and path.test.ts:33, ADR 0070:690-691) becomes: 'This document could not be checked against the practice's patient records, so it was not sent to the model. Try again later; if it is refused again, enter its terms by hand below.' This is true for both the bound and the failure, and keeps one code: no change to ?model= or the route schema.


**Skeptic:** I could not refute it: the scenario happens, and minor is the right severity. Here is the path at 9b7eadfe, checked in my clone (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/verify-ux-UX-3):
1. Any load error makes patient-records.ts:175-181 catch, reset `known` and answer screen_failed. That covers a connect, query, decrypt or scope fault.
2. contract-terms.ts:514-518 throws InputRefusedError('screen_failed').
3. path.ts:179 maps screen_failed to the screen_unavailable notice. notices.ts:27 then says only "Enter its terms by hand."
4. A retry does work. The web builds a fresh check per request (contract-proposals.ts, with a new randomUUID screenId). FormKeys gives each render a new requestKey. The screen runs before the budget hold, and no model_call row is written (gateway.ts:270-280), so a second click is a full, free re-check. ADR 0070:691-692 and the design's 5.4 both say so.
5. Every other temporary problem tells the person to try again (budget, busy and failed at notices.ts:22-24). This one does not.

Proof in the clone: apps/web/src/lib/models/ux3-proof.test.ts passes. It shows screen_failed gets the screen_unavailable notice with no "try again", while busy and failed have one. packages/model-gateway/src/ux3-proof.test.ts also passes. In it a 'connect' fault answers screen_failed, and the next request's fresh check on a healthy pool answers clear. So a specialist who obeys the notice types up a whole contract that one more click would have had proposed.

It is not major. No data is wrong, nothing leaks, and the "Propose the terms" card stays on a draft version (page.tsx:106), so the retry is one click away; the cost is the specialist's time. The design's lines 991-992 asked for this exact text, but it is not on the accepted list. ADR 0070 departure 3 (:783-786) records "one notice for both" but not that this removes the retry.

The finding's fix needs a correction. Its one merged text tells a practice above the 50,000 bound to "Try again later". That stays false until F3, which has no date, so such a practice is sent to retry every contract for nothing. Its reason for keeping one code is also wrong: the route schemas (abstraction.ts:136, coverage.ts:101, packets.ts:91) are z.enum(MODEL_NOTICES), so adding a code needs no change to the schema or to ?model=.

I applied a split in the clone. With it, `tsc --noEmit` in apps/web reports no errors. path.test.ts:16 and :33 fail only on their old expected values, which the split replaces.

The "patient details" wording is only a nit. The check reads three kinds of identifier, and "What it gives up" (ADR 0070:735) already lists names, dates of birth and addresses. The claim that the other notice names the same records differently is weak: it says "names a patient of the practice" and does not mention records.

**Skeptic's fix:** Give the two cases their own notices. Do not merge them into one text that tells everyone to retry.
- notices.ts:16: add 'screen_failed' to MODEL_PROBLEMS after 'screen_unavailable'.
- notices.ts:27: screen_unavailable (the bound): 'This document could not be checked against the practice’s patient records, so it was not sent to the model. Enter its terms by hand.'
- notices.ts, new entry: screen_failed: 'The practice’s patient records could not be read to check this document just now, so it was not sent to the model. Try again in a minute, or enter its terms by hand.' It has no digit and names no kind of identifier and no count, so it still passes path.test.ts:35 and m14.
- path.ts:179: map screen_failed: 'screen_failed', and update the comment at :172-178.
- path.test.ts:16: expect 'screen_failed'.
- path.test.ts:33: expect the new screen_unavailable text, and add an assertion for the screen_failed text.
- path.test.ts:34: add MODEL_PROBLEM_TEXT.screen_failed to the loop.
- models-routes.db.test.ts:628 and :632 (the decrypt-fault case): expect ?model=screen_failed and modelNotice 'screen_failed'.
- ADR 0070:683-691 and departure 3 (:786): two notices; the failure one offers a retry because a second click reads again.
- Also update the comments at contract-proposals.ts:47 and notices.ts:8-14, and the design's 5.4 (lines 991-992).
- No route schema or ?model= change is needed, because MODEL_NOTICES derives from MODEL_PROBLEMS.
If one code must stay, use the finding's text without "later": '…Try again; if it is refused again, enter its terms by hand below.' That at least does not promise a later time will work for a practice above the bound.
Nit, separately: the gateway's SCREEN_UNAVAILABLE_MESSAGE (contract-terms.ts:483) and NAMES_PATIENT wording could say "the practice’s patient records" instead of "patient details", to match.


## ux:UX-4 (reviewer minor; verdict minor) apps/web/src/components/uploads/uploader.tsx:378

**Finding:** The panel never says a document's kind is permanent, at the one moment the person chooses it. A recorded kind never changes (uploader.tsx:92-97; F4), and on Contracts the kind decides whether a model reads the file. The select has no help line, so the person learns of the permanence only after a wrong choice.

**Scenario:** A billing manager unsure whether a payer's notice is a 'Contract' or a 'Payer letter' picks Contract. Nothing on the panel says the choice cannot be changed. Shots p.contracts.default.* and p.reconciliation.default.*.

**Reviewer's fix:** Under the 'Kind of document' label, add <p id="upload-kind-help" class="max-w-prose text-xs text-muted-foreground">: 'Choose it before adding files: a document's kind cannot be changed once it is uploaded.' Tie it to the select with aria-describedby (as in UX-1), on both panels.


**Skeptic:** Confirmed against the code at 9b7eadfe, and proved with a test in my clone.

What the code shows:
- In apps/web/src/components/uploads/uploader.tsx:376-403 the kind select has only its label, "Kind of document". It has no help line and no aria-describedby. The format select a few lines below (404-428) does have a help line, `upload-format-help`.
- No other text tells the person the kind is permanent:
  - not the panel descriptions passed in by contracts/page.tsx:200-212, reconciliation/page.tsx:286-298 or uploads/page.tsx:32;
  - not the screen help in components/help.ts;
  - not the refusal shown when no kind is chosen ("Choose the kind of document first, then choose the files again.").
- The rule is stated only in a code comment, uploader.tsx:97: "the choice is the person's before the upload, not after."
- The tiles agree. After-run p.contracts.default.1280 tile 02, p.contracts.no-kind.1280 tile 02 and p.reconciliation.default.1280 tile 02 show the label, the "Choose the kind of document" select and "Choose files", with nothing else. The before-run tiles also have no help line; there the select is preset to Contract.

The kind really is permanent, more so than the finding says:
- tp_app may UPDATE only (sha256, scan_status, scan_at, status) on source_document (20261016090000_documents_payers_plans.sql:211) and (page_text_status, page_count) (20261017120000_document_page_text.sql:26).
- Uploading the same file again under the right kind does not help either. The duplicate check, claimBytes (apps/worker/src/intake/intake.ts:124-140), matches on practice, sha256 and coalesce(format_id, ''). On Contracts and on Reconciliation no kind has a format, so the second upload is held as a duplicate of the misfiled one.
- On Uploads, a file re-sent between 835 and ERA export does load, because the format differs. The sentence the fix adds is still true there.
- The names_patient notice (notices.ts:26) says only "it was filed as the wrong kind". It does not say the kind cannot be changed (ADR 0070 Part 3, F4).
- So the person is never told. They find out by looking for an edit control that does not exist, or by having a re-upload held.

Proof:
- My clone's apps/web/src/components/uploads/uploader.ux4.test.tsx renders the Uploader with [Contract, Payer letter] and with [Posting export, EFT export]. It asserts that the kind select has an aria-describedby whose paragraph says "cannot be changed".
- At head it fails on both panels: "the kind select has no aria-describedby".
- With the fix applied in the clone it passes, and so do the existing uploader tests (11 of 11 in components/uploads).

Why minor:
- It is preventive copy on a choice that cannot be undone, and on Contracts that choice decides whether the model reads the file.
- The PR has already removed the worst case, the preset Contract.
- A misfile costs hand entry, not a leak: the screen still catches an identifier-bearing letter filed as a contract.
- The gap existed before the PR, but this PR is the one that turns the select into a required, explicit choice, so it belongs in this review.

**Skeptic's fix:** Make one edit in the shared Uploader. It covers the Contracts, Reconciliation and Uploads panels together, and the sentence is true on all three. Two corrections to the stated fix:

1. Place the help line after the select, not between the label and the select. That matches the component's own `upload-format-help` and the tag form's help lines.
2. The edit lands on all three panels, not only the two the finding names.

In apps/web/src/components/uploads/uploader.tsx:
- Add `aria-describedby="upload-kind-help"` to `<select id="upload-kind">` (line 381).
- Directly after its `</select>` (line 401), still inside the same `flex flex-col gap-1` div, add:

```
<p id="upload-kind-help" className="max-w-prose text-xs text-muted-foreground">
  Choose it before adding files: a document’s kind cannot be changed once it is uploaded.
</p>
```

Add a case to uploader.test.tsx: on a panel of several kinds, the kind select's aria-describedby names a paragraph that says the kind cannot be changed. My clone's probe test does this.

Optional improvement: an optional `kindHelp` prop. Contracts and Reconciliation could then add "Uploading the same file again under another kind is held as a duplicate." That holds there because claimBytes keys on format_id, which is null for those kinds. It must not go on Uploads, where re-sending a file between 835 and ERA export does load.

Nits:
- The new line repeats the "choose the kind first" rule. The refusal CHOOSE_KIND_FIRST could stay as it is, or end with "; it cannot be changed after upload" for a person who missed the help line.


## ux:UX-5 (reviewer minor; verdict nit) apps/web/src/components/uploads/uploader.tsx:386

**Finding:** The refusal stays on screen after the person chooses a kind. The select's onChange (:385-388) sets the kind and the format, but not problems, so the alert contradicts the select.

**Scenario:** After the no-kind refusal, the person chooses Contract. 'Nothing was uploaded / Choose the kind of document first, then choose the files again.' still sits under a select that reads Contract, until the next batch.

**Reviewer's fix:** UX-1's held files replace the message. If UX-1 is deferred, the onChange should at least call setProblems((found) => found.filter((problem) => problem !== CHOOSE_KIND_FIRST)). The ERA-system line should be dropped the same way when a system is chosen.


**Skeptic:** CONFIRMED, but it is a nit, not minor. The finding's fallback fix would also make things worse.

Code at 9b7eadfe: in apps/web/src/components/uploads/uploader.tsx, the kind select's onChange (:385-388) calls only setKind and setFormatId(''). `problems` is written only in start(), at :254 and :266. Nothing else clears it, so the alert at :457-468 keeps showing the last batch's refusal until the next drop or file choice.

Proven in a real browser. The script is scratchpad/phi/verify-ux-UX-5-scripts/kind-after-refusal.cjs and its output is in progress/verify-ux-UX-5.run.log. It ran the Uploader bundle built from the verify-ux-UX-1 clone, which is at 9b7eadfe with no change to any tracked file. Results:
- Dropping a synthetic PDF with no kind chosen shows "Nothing was uploaded / Choose the kind of document first, then choose the files again."
- After choosing Contract (select reads "Contract", checked again after 1.5 s) and then Payer letter, the alert text is unchanged.
- Zero fetches and no batch card at any point.
- The same path exists on Reconciliation (posting and EFT exports, no initialKind).
- The no-kind tiles (p.contracts.no-kind.1280) show the alert directly under the drop zone that holds the select.

Why a nit, not minor: the alert does not contradict the select. "Nothing was uploaded" is still true, and the instruction is two steps. After the person does the first step, the remaining one ("then choose the files again") is still exactly the next step. Nothing is lost or misfiled, and the person is never sent the wrong way. The only cost is that a red alert whose first clause is already done stays on screen. Its root cause is UX-1: the files are thrown away, so the message has to stay as the cue to choose them again. The UX-1 verifier already lists clearing this message as a refinement of the UX-1 fix. This should be folded into UX-1, not tracked as a separate defect.

The fallback fix as written is worse than the defect. `setProblems((found) => found.filter((problem) => problem !== CHOOSE_KIND_FIRST))` empties the list when that message is the only problem. The alert then disappears with no batch card and no hint. The screen would no longer say that the dropped files were discarded and have to be chosen again. Baseline UX-049 settled on "They upload as soon as you choose" for the same pattern, so an alert that vanishes when the kind is chosen reads as "your files are uploading" while nothing is sent.

The ERA-system part is not this PR's. At e908c214 neither the kind nor the format onChange touched `problems`, and the PR leaves the format onChange as it was. That staleness is baseline UX-049 (UX PR 47). Also, CHOOSE_KIND_FIRST and the ERA line can never show together: Uploads names its 835 (initialKind), and neither Contracts nor Reconciliation offers a kind with formats.

**Skeptic's fix:** Preferred: make it part of UX-1's fix. Keep the dropped files in the browser while no kind is chosen, and show them under the select with their count. When the person chooses a kind, replace the refusal with the held files and an Upload button that starts the batch on a click, not on the change. The message is then gone because its cause is resolved.

If UX-1 is deferred, do not just filter the message out. In the kind select's onChange (uploader.tsx:385-388), swap it for a next-step line:
setProblems((found) => found.map((problem) => (problem === CHOOSE_KIND_FIRST ? NOW_CHOOSE_FILES : problem)))
with NOW_CHOOSE_FILES = 'Now choose the files again; the ones chosen before the kind were not kept.'
Show that line as a note, not with the destructive "Nothing was uploaded" styling, once it is the only entry left. Add a uploader.test.tsx or e2e step to contracts.spec.ts: after the refusal, select Contract and expect the note instead of CHOOSE_KIND_FIRST.

Leave the ERA-system line to UX PR 47 (baseline UX-049).


## ux:UX-6 (reviewer minor; verdict minor) docs/adr/0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md:728

**Finding:** Part 3's 'What it gives up' (:728-750) lists only detection and audit gaps, and leaves out what a person meets. Missing: the no-kind refusal discards the chosen files (UX-1), and :721 calls it 'the ERA format check's pattern' without noting that the baseline found that pattern a defect (UX-049); a screen_failed refusal offers no retry (UX-3); the kind's permanence is not told at upload (UX-4). Consequences :849 and :853 say the specialist 'enters the terms by hand' for a misfiled payer letter or EOB, which has no terms. The rest of the list matches the code as far as a screen shows it.

**Scenario:** A reader of the ADR (the founder, Lane A, a later reviewer) takes the gaps as complete and the hand-entry path as the remedy for a misfiled EOB. Neither holds.

**Reviewer's fix:** Add a 'What a person meets:' bullet to :728-750 naming the three gaps above, or remove it once UX-1, UX-3 and UX-4 are fixed. Reword :848-849 and :853: '... is refused before the model, with no model_call row; the specialist asks the practice for the contract, and enters the terms by hand only for a contract or exhibit that holds an identifier.'


**Skeptic:** I could not refute it; every claim holds at 9b7eadfe. (1) ADR :728 is "### What it gives up". Its scope sentence at :730 limits the list to documents the check sends or refuses, so it says nothing about what a person meets. The sentence is not even true of its own list: the "audit trail" and "trace of a failure" items are neither kind of document. (2) UX-1 is real. In apps/web/src/components/uploads/uploader.tsx, :125-127 push CHOOSE_KIND_FIRST and :255 returns early, so the chosen files are never held. ADR :721 calls this "the ERA format check's pattern", and it is that pattern (:129-130 has the same "then choose the files again"). But /home/user/ops/designs/lane-b-ux-review.md:2427 (UX-049, should fix, UX PR 47 not landed) found that pattern defective. The ADR cites a known defect as precedent and never mentions UX-049 (a grep for "UX-0" returns nothing). (3) UX-3 is real. path.ts SCREEN_PROBLEMS maps screen_failed to the screen_unavailable notice, whose text (notices.ts) is "Enter its terms by hand", with no retry. The ADR only half records this: :692-693 says a second click reads again, and departure 3 says there is one notice for both, but neither is stated as a gap. (4) UX-4 is real: the kind select (:376-401) has no help text about permanence. It is pre-existing (the base preselected Contract, and the kind is immutable at the base, per ADR :545), so it is a gap a person meets rather than something Part 3 gives up. (5) :848-849 and :853-854 say the specialist "enters the terms by hand" and that "hand entry is the way on" for a misfiled payer letter or EOB. An EOB or a claim-level payer letter has no contract terms. The upload goes through "Documents to tag to a payer" as a new contract (shot p.contracts.no-kind.1280 tile 02). There is no untag route (tagging.ts) and no kind change (F4). The real way on is the "Ask the practice" card on the same version page (askQuestionFormAction), so the finding's rewording names a path that exists. Line numbers 721, 728, 849 and 853 are correct. The finding is understated in three ways. The same wrong remedy appears in docs/runbooks/model-evaluation.md:219-220 ("it is a misfiled payer letter or EOB, and its terms are entered by hand"). That runbook line tells an operator that every MODEL_INPUT_NAMES_PATIENT is a misfiled letter, which misleads the triage of a false-refusal report on a real contract (ADR :864; collisions on a TIN or ZIP+4 at :739-741; the single-case agreement in P8 at :930). docs/product/PRD.md:575 likewise equates holding any practice identifier with misfiling. The list also leaves out UX-5 (kind onChange at :384-387 does not clear the problems, so the refusal stays after a kind is chosen) and UX-2 (a collision's notice says the document "names a patient"). Minor is the right severity: the error is in records the founder approves (the ADR, runbook and PRD), with no outcome for data, money or PHI. The notice text itself is UX-2. The fix is best done after UX-1, UX-3 and UX-5 are fixed in code, which shrinks the new bullet. No test was needed, because this is a documentation finding proven by the cited code and the screenshot tiles.

**Skeptic's fix:** ADR 0070 Part 3: (a) Rewrite :730 as "Each gap is a document the check sends that names a patient, a document it refuses that does not, a record it leaves incomplete, or a step a person meets:". (b) Add to :732-750 a bullet "**What a person meets** (each until its fix lands): a drop or choice made with no kind discards the files, which must be chosen again, and the refusal stays after a kind is chosen (UX-1, UX-5); a screen_failed refusal reads as the bound's and says to enter the terms by hand, not to try again, though a second click reads again (UX-3); a TIN or ZIP+4 collision's notice says the document names a patient (UX-2); and, as before this part, the panel does not say a kind is final (UX-4, until F4)." Drop each item as UX-1, UX-2, UX-3 and UX-5 are fixed in this PR, which is the preferred path. (c) Change :721 "(the ERA format check's pattern)" to "(the ERA format check's pattern, which the baseline review found defective: UX-049, UX PR 47)", or describe the held files once UX-1 is fixed. (d) Replace :848-849 with "...is refused before the model, with no `model_call` row; the specialist asks the practice for the contract (Ask the practice), and enters terms by hand only for a contract or exhibit that holds an identifier (a single-case agreement, P8) or a false refusal." (e) Replace :853-854 with "A misfiled document cannot be re-filed until F4: it stays a contract with its draft version; the notice says it was filed as the wrong kind, and the way on is the practice's contract, not hand entry." Apply the same correction in docs/runbooks/model-evaluation.md:219-220: "(the document holds one of the practice's identifiers: most often a misfiled payer letter or EOB, for which the specialist asks the practice for the contract; also a contract that names a patient, or a collision on a TIN or ZIP+4, whose terms are entered by hand)". Also change docs/product/PRD.md:575 "is a misfiled payer letter or EOB, and is refused" to "is refused, never sent (most often a misfiled payer letter or EOB)".


## ux:N-1 (reviewer nit; verdict nit, not verified) apps/web/src/lib/models/path.ts:198

**Finding:** screen_invalid falls to the generic refused text, 'The input cannot be sent to a model as it is; enter it by hand.' That blames the document for what the ADR calls the code's mistake.

**Scenario:** It cannot happen in production: lint.test.ts holds issue() as the only way to make a check. If it ever shows, the specialist is told the document is at fault.

**Reviewer's fix:** Leave it as is, or give screen_invalid its own text: 'Something went wrong on our side; nothing was sent. Try again, or ask support.'


## ux:N-2 (reviewer nit; verdict nit, not verified) apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx:111

**Finding:** The 'Have the model propose the terms' card says 'A payer letter is never sent to it' but says nothing of the new check, so UX-2's refusal comes unannounced (recommendation).

**Scenario:** The specialist proposes and is surprised by 'Nothing was proposed'.

**Reviewer's fix:** Add to the card description: 'Each document is first checked against the practice's patient records, and one that holds a patient's identifier is not sent.'


## ux:N-3 (reviewer nit; verdict nit, not verified) apps/web/src/app/p/[practiceId]/contracts/page.tsx:192

**Finding:** Pre-existing, not caused by this PR: the upload region is named 'Upload a contract or exhibit' while its title reads 'Upload a contract, exhibit or payer letter'. The baseline asks for regions named as their titles (UX PR 24).

**Scenario:** A screen reader's landmark list names the region without 'payer letter'.

**Reviewer's fix:** Set aria-label to the title, or point aria-labelledby at the CardTitle (and update the e2e locator at contracts.spec.ts:75).
