## What changes

Before any of a contract's or exhibit's pages reach the model, they are checked against the practice's own records (combined audit #120; ADR 0070 Part 3; test matrix MOD-12). This is the second of Lane B's two PRs for LANES.md queue item 12. The first, #53 (the evaluation gate and per-feature serving, ADR 0070 Parts 1 and 2), merged as 88a0e4e.

The PR also carries a hardening of the letter reader's redaction (`packages/model-gateway/src/redact.ts`, ADR 0054) that its review rounds found and fixed on the way (below, "The letter's redaction").

- **The check** (`packages/model-gateway/src/patient-records.ts`, `redact.ts`):
  - The gateway runs `contractTermsSpec.screen` on the exact request text it would send (`prepared.user`), before the terms reader is called.
  - It looks for the three identifiers the practice holds: the member ID (`patient_ref.member_id`), the patient control number (`claim.patient_control_number`, and the posting export's `posting_row.claim_reference` for a posting line with no claim-level match), and the payer claim number (`claim.payer_claim_control_number`).
  - A match is a whole token in compact form (NFKC, upper case, letters and digits). An identifier is still found when the page prints it in groups on one line: joined by a space, a hyphen or dash, a minus sign, or one of `. / _ *` with no space beside it, or by any separator the practice's own stored values hold ("ZZ 123 4567", "ZZ-123-4567", "ZZ.123.4567", "12345/01"). It is also found after a colon, a hash or a parenthesis, and with invisible format characters (a soft hyphen, zero-width characters) in a gap.
  - A newline, a tab or two spaces end a run, so column gaps never join.
  - The tokenizer streams the text and stops at the first match. A 16 MiB page set is screened in under 1 s for prose and about 1.5 s in the worst case, in a 96 MiB heap; at 9b7eadf it ran out of memory.
- **The request's cap in bytes** (P11, built in 4a099795; no longer deferred). `contractTermsSpec.prepare` refuses a framed request over `MAX_REQUEST_BYTES`, 1,000,000 UTF-8 bytes, counted both as it is sent and in the NFKC form the screen reads (`redact.ts` `screenedBytes`), as `too_long`. It checks the pages' total first, then the framed text itself.
  - It runs inside `prepare`, so it comes before the variant's serving check, the idempotency key, the budget, the step before the screen, the screen and the call. A document over the cap reads none of the practice's records, takes no screen limit, writes no person's event, holds nothing and writes no `model_call` row.
  - Bytes, not a string's length: the check round found that a request of a million U+FDFA was within a length cap, yet the screen read it as 18 million characters (1.3 to 2.5 s, past a 192 MiB heap).
  - Set v2's largest document frames to 173,684 bytes, so the cap has a wide margin.
  - The web shows its own notice (`too_long`), and the worker's permitted run counts `refused:too_long` outside the model.
- **The stored-side rules** (session rulings 3 and 4). These apply to the practice's stored values, never to the page:
  - every kind needs a digit;
  - a patient control number needs at least 8 characters;
  - a member ID or payer claim number needs at least 6;
  - an 8-digit value that is a calendar date (YYYYMMDD or MMDDYYYY, a year from 1900 to 2099) is left out.

  A fee schedule's CPT codes, NPIs, ZIP+4s and dates are therefore refused only when one of them **is** a stored identifier at or above its floor.
- **No caller can skip it:**
  - `ContractPagesInput.patientRecords` is required, so a caller without a check does not compile;
  - the gateway accepts only a check it issued itself (a module-private registry), for the call's own practice; otherwise it refuses with `screen_invalid`;
  - the check takes `packages/db`'s own scope and pool only (P12, built in 4a099795): `openPool` records each pool it opens and `withPracticeScope` and `withJobScope` record each scope they open on such a pool while its transaction runs (module-private `WeakMap`s). `practiceRecordsCheck` refuses at construction a pool or a scope they did not record, and reads through the recorded `connect`. A stub pool, a wrapper of a pool's shape, a copied or reassigned scope and a scope kept past its transaction are all refused. Tests build the check by shape with `practiceRecordsCheckByShape`, which `lint.test.ts` holds to `testing.ts` and tests. No #42 file and no migration was needed: both production pools are already `openPool`'s;
  - the check reads through its own job scope as the service screen actor, with `app.practice_ids` set to exactly that practice;
  - any load error (scope, query, decrypt) refuses with `screen_failed`, never `clear`;
  - the purpose specs, the gateway's prototype and each gateway instance are frozen, so an assignment cannot remove the screen;
  - the gateway reads the caller's context once, so a step that runs before the screen cannot move the check to another practice;
  - `lint.test.ts` holds that only the two factories issue a check, that `practiceRecordsCheck` is called only from its two production call sites, and that only tests, test support, the e2e and `eval/` reach `@tp/model-gateway/testing`, by any import form.
- **The screen is last before the budget's hold and the call** (review S1; `gateway.ts`, steps 0 to 10). After the process's cap on calls in flight, the gateway checks, in this order:
  1. the purpose served;
  2. the kill switch and a purpose's own flag;
  3. the PHI boundary;
  4. `prepare` (the kind check, the request's cap in bytes, the framing as data), and the call's own variant served;
  5. a completed call under the idempotency key;
  6. a read of the day's logged spend against the practice's budget;
  7. the caller's step before the screen (`CallContext.beforeScreen`): the web takes the screen's limits and records the person's `contract_screen_requested` event there;
  8. the screen;
  9. then the budget's hold;
  10. and the call.

  So no audited read of a practice's records runs for a call refused by any of steps 1 to 7. The hold can still refuse a call after the screen: it adds the calls in flight under the practice's lock, so calls made at once can reach the budget between one call's read and its hold, and that call is refused with nothing held or sent. `gateway.ts`'s and `spec.ts`'s comments and ADR 0054's amendment say the same (verification 1's wording finding).
  - **The limits:** 20 an hour and 60 a day for a practice, and 20 an hour and 100 a day for a person (`SCREEN_LIMITS`, in the existing rate-limit counters).
  - **Remembered refusals:** a document the server has just found naming a patient is refused again for an hour without a new read. Nothing of the match is held, and a `clear` is never remembered.
  - **The effect:** a click flood that could write millions of audit rows now stops within the hour.
- **Bounded until F3.** Above 50,000 identifiers the check reads nothing and refuses with `screen_unavailable` (fail closed: the person enters the terms by hand). Each read is also capped at what the bound leaves plus one row, so records loaded between the count and the read cannot carry it past the bound. F3, compact keyed lookup hashes with a `SECURITY DEFINER` screen function, is Lane A's migration and removes the bound.
- **What is recorded and logged:**
  - the person's `contract_screen_requested` event;
  - the screen's audited reads, attributed to the service screen ID with purpose `contract_screen` and joined to the person's event by request ID. The reads commit before anything is decrypted, so a decrypt failure leaves every read audited;
  - nothing of the match: not which identifier, its kind, its row or a count;
  - one warn line holding `practice_id` and a `MODEL_INPUT_*` or `MODEL_SCREEN_LIMITED` code only.
- **What a person sees:**
  - On the contract version page, five notices, one per refusal (`too_long`, `names_patient`, `screen_unavailable` and `screen_invalid`, `screen_failed`, `screen_limited`; under Wording below), and one added sentence on the propose card.
  - On the contracts and reconciliation upload panels, no kind is preselected. Under the label "Kind of document", a disabled first option reads "Choose a kind", with a help line under the select: "A document’s kind cannot be changed once it is uploaded."
  - Files chosen or dropped before the kind wait in the panel ("Waiting to upload: 1 file", their names, and Clear). The kind select is marked invalid, described by "Choose the kind of document for this file, then upload it." and focused. Once the kind is chosen, "Upload 1 file" appears. Nothing is filed under a kind the person did not choose.
  - The Uploads page keeps its 835 default. Its kinds now read by their receipt names, "835 remittance" and "ERA export" (fix 3; the old "ERA export from a practice-management system" was cut at 390 px). An ERA export's system select ("Which system’s export", "Choose the system") holds files the same way until a system is chosen, with "Choose which system’s ERA export this file is, then upload it."
  - The kind and system selects keep one width, whatever is written under them (448 px at 1280 px; the column at 390 px).
  - While files wait, leaving or reloading the page asks first (the browser's own question), as it already did while a batch was sending (#78's guard, now `leaveAsks(batch, held)`).
  - The refusal of too many files counts them as the rest of the panel does ("At most 1 file at once…", "At most 1,000 files at once…"; the text at the deployed limit of 100 is unchanged).
- **The worker's permitted run** builds one check per practice per run. A permitted example whose document names a patient scores `refused:names_patient`; one over the cap scores `refused:too_long`. `refused_rose` stays fail closed against a report made before this PR (documented in `permitted.ts` and the model-evaluation runbook, and pinned in its db test).
- **Synthetic data:**
  - `packages/synth/src/screen/patient-twins.ts`: a large twin practice, seeded and built in memory, never written to a file. Of its 80,000 member IDs, a third (26,666) are "ZZ" plus 7 digits, a third (26,666) are 9 digits shaped `9NN00NNNN` (no SSN, ITIN or ATIN has that shape), and the rest (26,668) are 11 letters and digits holding a B, L, S or Z (no Medicare Beneficiary Identifier holds them). It holds 201,000 patient control numbers (200,000 sequential 8-digit numbers from 10000001, and 1,000 five-digit ones below the floor, CPT-code-shaped ones among them) and 200,000 13-digit payer claim numbers starting 77, all invented. A separators variant writes each value with a separator after its second character ("ZZ#7120034"). It also builds adversarial collision twins from set v2's own pages (date, TIN, ZIP+4, word, slash date, date as member ID, decimal).
  - MOD-12's case and fixtures: an EOB filed as a contract, an exhibit with a hyphenated claim number, a fee-schedule twin, and a zip of a contract and an EOB.

### The letter's redaction (`redact.ts`, ADR 0054)

The PR changes `redact.ts` for the contract screen, and the review rounds found gaps in the letter reader's redaction in the same file, some older than this PR. They are fixed here, failing tests first each time. What the redaction of a payer letter now catches (synthetic examples; `[CLAIM_1]` and `[MEMBER_ID]` are the placeholders sent):

- **A written date needs a plausible year** (fix 4, 3a033b32; the orchestrator's request, MOD-13 seed 1162287068). A four-digit year counts only from 1900 to 2099 (`EARLIEST_WRITTEN_YEAR`, `LATEST_WRITTEN_YEAR`, shared with the contract screen's `isCompactCalendarDate`). So claim 00230426 written "Claim 0023-04-26", 00000101 written "0000-01-01" and 21000426 written "2100−04−26" are replaced; "2026-04-26", "April 26, 2027" and "4/26/26" are kept; "DOB 0023-04-26" is still `[DATE_OF_BIRTH]`.
- **"_", "|" and "\" join a number anywhere** (fix 4b, cf61a828; F4-1): "Claim 1234_5678", "Claim 1234|5678", "Claim 1234\5678" and "Member 0023_04_26" are replaced, and the letter's other-patient screen (`letterJoins`, `identifierCandidates`) reads them the same way.
- **A number stays a date only when it is that whole date** (fix 4b, cf61a828; F4-2, `writtenAsDate`): claim 312026 in "Jan 31-2026" and claim 19991 in `1999-1<ZWSP>2-31` are replaced; a real date written with dashes, "_", "|" or "\" is kept.
- **More joiners** (1677792a; R5-1): the apostrophes of digit grouping, "~", the middle dots, the bullet, ";", double quotes and two more minus-like signs: "Claim 12'345'678", "Claim 12’345’678", "Claim 1234~5678", "Claim 1234·5678" and "Member ZZ~7654321" are replaced.
- **An identifier label makes a date-shaped number the number** (1677792a; R5-2): "Claim 1955-07-14" for claim 19550714 becomes "Claim [CLAIM_1]", and after a label digits join over "." and "/" ("ICN 1234.5678"), never as an amount.
- **The other-patient screen joins as the matcher does, and a label is a head word of its kind** (d2a609fd; G1 to G4): `identifierCandidates` offers 12345678 for "ICN 1234.5678" and 7654321 for "Member ID: 7654.321", so `more_than_one_patient` sees them (G1). A label is a head word (claim, ICN, PCN, member, subscriber and so on) with number, no, ID or # after it, or "No."/"ID:"/"Re:"; a bare "number" or "reference" before a whole written date is no label, so "The number 2027-03-15" keeps its deadline (G2). A label's end may hold "*", one "," and "(" or an opening quote: "**Claim:** 2026-04-26", "ICN (2026-04-26)", "Claim: “2026-04-26”" (G3). The primes OCR writes for a grouping apostrophe join a number: "1234′5678" (G4).
- **Digits over "." or "/" after any label again** (49c7a781; phi-G2-regress-1): G2's narrow label had let "Patient ID 1234.5678", "Policy number 1234/5678", "Member's ID 1234.5678", "Policy # 1234.5678" and "ID 1234.5678" through. They are replaced again (`ANY_IDENTIFIER_LABEL`); only a whole written date still needs G2's head word ("ID 2027-03-15" keeps its deadline).
- **A label's end reads "=", any dash and the minus sign** (7639392f; phi-label-end-dash): "Member ID – 1234.5678", "Member ID — 1234.5678", "Member ID = 1234.5678", "Member ID − 1234/5678" and "Claim # – 9988/7766" are replaced.
- **A number glued to its label word** (a8149341; phi-numero-glued): "Claim №99887766 denied" becomes "Claim No[CLAIM_1] denied"; "ICN99887766", "Member ID12345678", "CLAIM NO99887766", "ICN9988.7766" and "Member №ZZ12345678" are replaced, and the candidates offer each number. The text sent stays NFKC with only the spans replaced. Words that are no label are untouched: "Room AB99887766", "Casino 2027-03-15", "Nov 2027-03-15".

The residuals ADR 0054 records for these rounds, each the cost of keeping a deadline, an amount or a word:
- a digits-only member ID or claim number that is itself a real calendar date (a year from 1900 to 2099) written with dashes, "_", "|" or "\" is read as that date and sent when no identifier label stands right before it ("Seen 03-15-61" for member 031561; "Member ID 03-15-61" for that member, and "Claim 03-15-61" for claim 031561, are replaced);
- a claim's digits after a currency sign and with cents are an amount ("$555001.00");
- digits with "/" or "." between them and no label are not a number ("12/34/5678", "1234.5678"), and a comma joins nothing ("1234,5678");
- a bare "ID", "number", lower-case "no", "#" or "reference" before a number written as a whole calendar date is no label ("ID 03-14-1962", "#1955/07/14");
- a claim's label before a member ID written as a whole date, or a member's label before a claim number written so, keeps the date ("Claim# 1955-07-14" for member 19550714);
- a label more than 40 characters before its number, or with other words between them, is none;
- a number glued to a word that is no label word ("Room AB99887766"), or to "NO" after a capital letter ("CLAIMNO99887766"), is not read as labeled;
- the katakana prolonged sound mark U+30FC joins no number ("1234ー5678");
- a date of birth with its day or month spelled out ("MARCH THIRD 1961"), and the ")" after "ZZ(1234567)", sent after the placeholder;
- from before: nicknames, homoglyphs, digits of other scripts, a name glued to the word before it, a bare monogram, an identifier split into more than three tokens, another patient's name.

ADR 0070 Part 3 records the contract screen's own residuals: it still treats a glued label word ("ICN98765432", "№98765432") as a glued prefix, and it does not read Arabic-Indic digits (R5-3; the fold of Unicode decimal digits is a proposal).

### Wording (applied within `.claude/rules/brand.md` and CO-11 under the co-founder's direction; he may reverse any)

| Where | Text |
| --- | --- |
| `apps/web/src/lib/models/notices.ts`, `too_long` | "This document is too long to send to the model, so nothing was sent. Enter its terms by hand below." |
| `notices.ts`, `names_patient` | "This document holds an identifier from the practice’s patient records, so it was not sent to the model. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: choose the version’s contract or exhibit as the document to read, or ask the practice for the contract below. If it is a contract or an exhibit, enter its terms by hand below." |
| `notices.ts`, `screen_unavailable` (and `screen_invalid`) | "This document could not be checked against the practice’s patient records, so it was not sent to the model. Enter its terms by hand below." |
| `notices.ts`, `screen_failed` | "The practice’s patient records could not be read to check this document just now, so it was not sent to the model. Try again in a minute, or enter its terms by hand below." |
| `notices.ts`, `screen_limited` | "Documents have been checked against the practice’s patient records as many times as allowed for now, so this one was not sent to the model. Try again later, or enter its terms by hand below." |
| The version page's propose card, appended | "…A payer letter is never sent to it, and a contract or exhibit is first checked against the practice’s patient records: one that holds an identifier from them is not sent either." |
| `apps/web/src/components/uploads/uploader.tsx`, the kind select | Under the label "Kind of document", the disabled first option "Choose a kind" (`CHOOSE_KIND_PLACEHOLDER`, on the contracts and reconciliation panels); the help line "A document’s kind cannot be changed once it is uploaded." (`KIND_HELP`) |
| `uploader.tsx`, the select that waits (`waitingText`) | "Choose the kind of document for this file, then upload it." (and "for these N files, then upload them."); "Choose which system’s ERA export this file is, then upload it." (and "these N files are, then upload them.") |
| `uploader.tsx`, the held files (`HeldFiles`) | "Waiting to upload: N files" (counted: "1 file"), the files' names, and the buttons "Upload N files" (once nothing waits for a choice) and "Clear" |
| `uploader.tsx`, too many files | "At most N files at once; zip the rest and upload the zip." (counted: "At most 1 file", "At most 1,000 files") |
| The Uploads page's kinds (`apps/web/src/app/p/[practiceId]/uploads/page.tsx`, `KIND_NAMES`) | "835 remittance" and "ERA export" (was "ERA export from a practice-management system"). The system select's "Which system’s export", "Choose the system" and its help ("The practice-management system the ERA export came from. Each file of the batch is read with its layout; a CSV export only.") are the base's, unchanged |
| The contracts page's upload region | Its accessible name is now its title, "Upload a contract, exhibit or payer letter" |

The `names_patient` refusal tells the person that the document holds an identifier from the practice's records. That is accepted (design m14). The person can already open the document in the evidence viewer; the notice names no patient, identifier, kind or count; and a person who can choose a page's text (`file.upload`) already holds `phi.read`.

### Base merges since the PR opened

Each merge commit keeps both lanes' changes (LANES.md rule 6), and the lockfile, `tools/screening-capacity/watched-paths.txt` and the synthetic fixtures are what their generators write on the merged tree.

| Merge | Base | Conflicts and how both sides were kept |
| --- | --- | --- |
| f5292c6c | ecebdc90: #76 test-flakes, #77 ci-browser and the rest (70 commits) | None. The shared documents keep both lanes' rows; the tree equals a clean automatic merge. |
| 871faff9 | a6e754fc: #80 redact-placeholders, #79 table scrolling | Six. `redact.ts`: #80's file through the letter path, then #75's whole screen section byte for byte; #75's widening of `identifierPattern` is dropped with the function #80 removed (the letter path joining "*" next to a letter is proposal P14). `uploader.tsx`: #75's `KindField` with #79's `max-w-full` classes. ADR 0054: both 2026-10-27 amendments, #80's first. `test-matrix.md`, synth `matrix.ts` and `registry.ts`: MOD-12, then #80's MOD-13 and MOD-14. `redact.test.ts`'s property tying the screen to `identifierPattern` is restated over every gap the screen joins. |
| 26388626 | 165c5993: #74 forms keep what the person typed | One, `uploader.tsx`'s ERA system select. Unified through #74's shared helpers: both selects take `controlMarks`, the words are `FieldError` in an alert keyed by the attempt, the help is `Hint` at 14 px; #75's held files, Upload/Clear and `focusNext` kept. Docs a8bf75ca (ADR 0070 Part 3, ADR 0077). |
| 584f5218 | 83d71fd6: #81 SUITE-CAP-1a, #78 a refused download comes back to its page | Three: `uploads/page.tsx` (`initialKind`, #78's `reportFrom` and `receiptsNotice`, `KIND_NAMES`, `searchParams`), `uploader.tsx` (imports united; one module doc) and `uploader.test.tsx` (add/add, every test of both). #78's leave guard and #75's waiting files unified as one guard, `useLeaveGuard(leaveAsks(batch, held))` with `leaveAsks(batch, held) = held > 0 \|\| stillSending(batch)`, so waiting files also ask before leaving; two new tests. Docs 7cd60740 (ADR 0079 and ADR 0070 Part 3, both-sides-LC-1). |
| fe9c8da8 | 43565235: #82 ci-pin-age, #83 the screening result on a phone | None. Six both-sides files checked by hand. #83's `counted()` (now grouped with `toLocaleString('en-US')`) is safe in the uploader, whose batch is at most 100 files; the too-many refusal now goes through `counted()` as well (49156dd8). |
| b81429f4 | 4eaf7124: #92 each sign-in step states its limit | None. ADR 0077 (#75's kind and system lists, #92's notes), `test-matrix.md`, `matrix.ts`, `registry.ts` (MOD-12; SGN-01 to SGN-04), `watched-paths.txt` regenerated. |
| 315ac91e | 88708069: #93 the home's figures, #90 the model client SDK 1.x | None. `test-matrix.md`, `matrix.ts`, `registry.ts` (MOD-12; MOD-17, MOD-18; HOM-01 to HOM-04), `docs/runbooks/model-evaluation.md` (the contract-screen paragraph and #90's note), `watched-paths.txt`; the lockfile as #90 wrote it. |
| a03654ce | 21fa10df: #42 PR 6b-4, #95 one unmapped plan, #91 Dependabot routing | None. Eight both-sides files checked three ways (each side's lines kept, line multisets equal, hunks apart): `contracts.spec.ts`, `PRD.md`, `reconciliation-001.md`, `test-matrix.md`, `packages/db/src/runtime.ts` (#42's `canonicalMailbox` and #75's `openedPool`), `matrix.ts`, `registry.ts`, `watched-paths.txt`. #42's migration touches none of the tables the screen reads; `readWithAudit` and `rate_limit_take` are unchanged, and the screen's buckets are untouched. |

The base has since moved to 7bf7b252 (#94, the aws-cdk minor and patch update; #107, the pinned Trivy install). Neither is merged here yet; a trial merge-tree of a8149341 with 7bf7b252 is clean. The base is merged once more right before the push that precedes the merge (it brings #107, which turns `images` green).

## Why

- **Combined audit #120:** a contract proposal could send a patient's details to the model. The only guard was the document's kind. A payer letter or EOB dropped on a contracts panel was filed as a contract by default, as was every entry of a zip filed as one, and a kind cannot be corrected after upload (F4, Lane A's).
- **LANES.md queue item 12**, claim row "The model evaluation gate (#84) and the contract PHI check before the model (#120)". Reserved: ADR 0070 Part 3, test matrix MOD-12 and synth case MOD-12.
- **Design:** `designs/lane-b-model-eval-gate.md` on `claude/build-ops`, section 5 and Appendix A.3. It was reviewed adversarially, and the dispositions M7, M8, M9, M12, m3, m9, m14 and m15 apply.
- **Rulings:** the session rulings 1, 3, 4 and 8 were made under the co-founder's standing ruling of 2026-10-26 ~00:20 UTC: take the recommended option, and for security the safer one.
- **The redaction hardening:** MOD-13's failure on seed 1162287068 (a claim number written like a date reached the model), reported by #83's session through the orchestrator on 2026-11-01, and then each review round's findings on `redact.ts` (fix 4's review, merge 5's review, the critics). The PR already changes `redact.ts`, so they are fixed here rather than in a second PR on the same file.
- **What the build changed from the design** is listed in ADR 0070 Part 3, "Where the build departs from the design" (31 items, P11 and P12 among them).

## What it does not change

- Pricing engine (`packages/pricing`): no change. `tools/engine-freeze/check.ts origin/claude/build-platform` (from the tip 4846f043; and from the merge base 21fa10df, as CI runs it: the same): nothing let through, no problems.
- Ledger (`packages/ledger`): no change.
- Database schema and migrations: none.
  - The screen uses the existing audit columns: `action`, `purpose` and `request_id` are open code patterns.
  - The screen's limits use the existing `rate_limit_counter` through `src/lib/http/rate-limit.ts`'s form.
  - No grant changes. `packages/db`'s TypeScript changes (`connect.ts`, `authz/scope.ts`, `authz/index.ts`, `runtime.ts`) only record the pools and scopes it opens (P12); they change no query.
  - F3 (lookup hashes and a screen function, which should also retire the limits and S2's remainder) and F4 (correcting a document's kind) are proposed to Lane A as migrations, not built.
- Content releases (`content/`): no change.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: no change.
- CI and the GitHub settings: no change. No workflow, manifest or lockfile changed. `tools/screening-capacity/watched-paths.txt` is regenerated by `watched.ts --write` (LANES rule 6; 553 lines on a8149341, two of them this PR's).
- Other things a reader might assume move:
  - The denial-letter reader's flow and its notices are unchanged (design m9, notice N6). Only its redaction in `redact.ts` reads more ways of writing a number (above), which sends less of a letter's identifiers and changes nothing else it sends.
  - #42 has merged into the base (a03654ce's merge). This PR changes no file #42 alone changed; the files both changed are listed with that merge. `rate-limit.ts` is unchanged here, so the route's own bucket (P10) and S2's access-log change stay proposals.
  - The evaluation set and its baseline are unchanged, and the gate still passes on the committed baseline.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

CI on a8149341 (merge ref 95b61061, a8149341 with 4846f043): <!-- ci -->all 31 check runs completed. **Required:** `approval-of-record` and `mutation` green; `all green` red from `images` only; `screening-capacity gate` red from `capacity` only. Neither red is a fault in this PR's code.
- `images` failed installing Trivy: the installer exits 6 because get.trivy.dev has not resolved since 2026-11-03, across the whole base (PR comment 6623424027). The fix merged into the base afterwards as #107 (7bf7b252); this PR picks it up with its final base merge.
- `capacity` failed with `RUNNER_TOO_SMALL` (2 CPUs where 4 are needed: the repository is private; issue #102, a founder item), so the required `screening-capacity gate` failed (PR comment 6623462279). No change in this PR can clear it.
- Passed: approval-of-record, changes, build, lint, static, domain model, unit, db 1/6 to 6/6, e2e 1/3 to 3/3, and all six stryker shards (pricing 98.67%, packets 97.75%); `notify` skipped.
- CI totals: unit 437 files, 7,453 passed, 1 skipped (the merge ref adds #94's tests); golden 381; db 140 files, 9,675 passed, 0 skipped (the local restore-drill skip runs in CI); e2e 70; oracle 689 agree.<!-- /ci -->

The full local suite ran once on the head, a8149341 (check7; Node 24, each step under the shared lock, one at a time, no code changed after the first step):

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint` / `lint:logs` / `lint:copy` | 1,755 files in 3 groups, 0 errors, 0 warnings / 1,118 files, ok / 557 files, ok |
| `pnpm test` (unit, coverage) | 435 files; 7,436 passed, 4 skipped (7,440) |
| `pnpm test:golden` | 5 files, 381 passed |
| `pnpm test:oracle` | pyx12 4.0.0 agrees with all 689 synthetic 835 fixtures (678 valid, 11 malformed rejected); edi835 agrees on every segment, amount, balance and verdict |
| `pnpm --filter @tp/model-gateway eval` | gate passed; narratives 300 of 300 without a critical error; set unchanged |
| `pnpm synth --all` | 288 cases: 0 written, 689 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged |
| `tsx tools/screening-capacity/watched.ts --write` | 553 lines, unchanged |
| `pnpm test:db`, 4 shards, each on a fresh migrated database | 140 files, each once (every tracked `*.db.test.ts`); 9,674 passed, 1 skipped (3,222 + 1 skipped, 2,793, 2,671, 988) |
| `pnpm build`, BUILD_COMMIT stamped, `E2E_PREBUILT=1 pnpm test:e2e --workers=2` | build exit 0, stamped a8149341; 70 passed |
| `tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` (4846f043; merge base 21fa10df) | money and ledger not affected; pricing and packets affected through `packages/db` (`authz/index.ts`, `authz/scope.ts`, `connect.ts`, `runtime.ts`, P12): shards packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest |
| The six mutation shards as `ci.yml` runs them (canary, verdict, shards, gate) | every canary 5 of 5; mutation gate passed: pricing 98.67% (1,934 of 1,960), packets 97.75% (4,310 of 4,409), every undetected mutant a recorded equivalent |
| `tools/engine-freeze/check.ts origin/claude/build-platform` | nothing let through, no problems (re-run against 4846f043: the same) |
| `pnpm check:fixtures` / `pnpm verify-content` | 342 files read by the guard, 4,044 searched, ok / every content set passes |
| `gitleaks git` over 871faff9..a8149341; the pre-push hook | no leaks (206 commits; a first run on a shallow clone read a base commit at the shallow boundary as adding the whole tree and reported the repository's reviewed false positives; after deepening the clone, none); the hook checked 4 commits, no secret |

The verification of 2026-10-27 read CI on f5292c6c: every check run green, the four required ones included (unit 388 files, 6,474 passed, 1 skipped; golden 381; db 128 files, 9,246 passed; e2e 54).

## Reviewer agents' findings

The first reviews ran on 9b7eadf in fresh clones: the security reviewer (`.claude/agents/security-reviewer.md`), a PHI-screen correctness and AI-safety review, and the UX and brand reviewer (`.claude/agents/ux-brand-reviewer.md`). Each finding was verified by a skeptic in a clone of its own. Every finding of that round, with its verdict, is in `approval-summaries/lane-b-model-eval-gate-phi-review-findings-all.md` on `claude/build-ops`.

Since then: a fresh-clone verification on f5292c6c (FAIL; `lane-b-model-eval-gate-phi-verify-1-summary.md`); fix 3's shots; two adversarial re-reads of base merge 4 (both sides; safety and accessibility), each finding checked by two refuters; a two-lens review (PHI leak, over-redaction) of fix 4; a two-lens review of fixes 4 and 4b and merge 5, each finding refuted twice; completeness critics after merges 4 and 5 and before the push; and a two-lens PHI review of the unreviewed delta (d2a609fd, b81429f4, 315ac91e, a03654ce) with a skeptic per finding. Their reports are in `approval-summaries/lane-b-model-eval-gate-wip/fix/` on `claude/build-ops` (merge4.md, check5.md, fix4.md, merge5.md, merge6.md, check7.md).

**UX sample and shots.** The UX review worked from before (e908c21) and after (9b7eadf) shots, at 1280 and 390 px light and 1280 px dark, of `p.contracts.default`, `p.contracts.no-kind` (after only), `p.reconciliation.default`, `p.uploads.default`, and `p.abstraction-version.model-names-patient`, `model-screen-unavailable` and `model-notice`. The fix round retook them on 53076d2, with `p.contracts.held-ready`, `p.uploads.error-era-system`, `model-screen-failed` and `model-screen-limited`. After base merge 4:
- **shots-ref** (`approval-summaries/lane-b-model-eval-gate-wip/fix/shots-ref.md` on `claude/build-ops`): 24 reference shots on 7f77cb19 (fix 3's head), at 1280 and 390 px light and 1280 px dark, of `p.contracts.default`, `p.contracts.no-kind`, `p.contracts.held-ready`, `p.reconciliation.default`, `p.uploads.default`, `p.uploads.error-era-system`, `p.abstraction-version.model-names-patient` and `p.abstraction-version.model-too-long`. "Choose a kind" and "ERA export" show whole at 390 px; every kind and system select is 448 px at 1280 px.
- **shots6** (`approval-summaries/lane-b-model-eval-gate-wip/fix/shots6.md` on `claude/build-ops`): the same 24 on cf61a828, the merged head, compared pixel by pixel with the reference. **No regression:** every uploader panel and notice box is pixel-identical; only the synthetic data each fresh prepare makes differs (times, hashes, a payer letter). Since cf61a828 the only change in `apps/web` on this PR's side is 49156dd8's too-many text, which no shot state shows.

No gallery link: none was published from this account; the shots are named by shot id in those reports.

Fix commits of the first round: e552399 (the tokenizer), 527f2c5 (the records check), bac083a (the gateway order), 4450750 (the upload panel and notices), 53076d2 (docs).

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Integration (before review) | The screen read `input.pages` a second time after `prepare`, so pages that read differently per access could be screened clean and sent naming a patient | Fixed in 25be3ab: the screen checks `prepared.user`; a getter-pages test fails without it |
| Integration (before review) | `@tp/model-gateway/testing` issues real checks that read no records, and production code could import it | Fixed in 25be3ab, and widened to every import form in 527f2c5 |
| PHI-screen F1 (major) | A stored identifier printed with `.`, `/`, `_` or `*` between its groups was missed | Fixed, e552399: those join with no space beside them, as do the practice's own stored separators. Measured: the ordinary twin practice refuses none of set v2's 63 documents; a new slash-date collision class is refused and counted (fail closed) |
| PHI-screen F2 | Invisible format characters or a minus sign between groups ended a run | Fixed, e552399 |
| PHI-screen F3 = security S3 | A decrypt failure rolled back the audit rows of reads already made | Fixed, 527f2c5: the reads commit before any decrypt (db test) |
| PHI-screen F4 | Records committed between the bound's count and the reads could carry the read past the bound | Fixed, 527f2c5: each read is capped at what the bound leaves plus one row (db race test) |
| PHI-screen F5 (major) | The tokenizer materialized every run of the whole text: a large document could exhaust the web task's heap | Fixed, e552399: it streams with an index and stops at the first match (16 MiB runs in a 96 MiB child; at 9b7eadf it ran out of memory). The cap on the framed request (P11), first deferred, is built in 4a099795: 1,000,000 bytes as sent and as screened (`MAX_REQUEST_BYTES`, `too_long`) |
| PHI-screen F6 = security S4 | The purpose specs were mutable, so one assignment could remove the screen | Fixed, 527f2c5: frozen specs, prototype and instances |
| PHI-screen F7 | A posting export's PCN was not read | Fixed, 527f2c5: posting lines with no claim-level match are read |
| PHI-screen F8 | ADR "What it gives up" was incomplete (OCR, glued prefixes and suffixes, dropped zeros) | Fixed in the ADR, 53076d2 |
| PHI-screen N1, N2, N3 (nits) | Mutation survivors; the "no stub can be supplied" claim; twin IDs in the ITIN range | Fixed, e552399 and 527f2c5. N2's scope and pool brands (P12), first deferred, are built in 4a099795: the check takes `packages/db`'s own scope and pool only, with no #42 file |
| Security S1 (major) | Every request ran the whole audited read before refusals the gateway makes anyway; a click flood could write millions of audit rows | Fixed, bac083a: the screen runs last before the budget's hold and the call, within per-practice and per-person limits, and a patient-naming document is remembered for an hour. A route bucket stays a proposal (ADR P10) |
| Security S2 | The practice's access log cannot name who caused a screen's reads, and lists only the first 50 | Deferred: it needs Lane A's `practice_access_log` function (a migration) and a `settings.ts` change. Stated in the ADR (Open matters), and pinned by a db test that flips then |
| Security nits | The stub claim; the testing-module lint; the orphan-event list; the authorization note | Fixed, 527f2c5 and bac083a; the authorization note is in the ADR |
| Integration I1 (fix round) | The new step before the screen could change the context's practice and make the screen accept another practice's check | Fixed, bac083a: the context is read once and frozen (test fails without it) |
| UX-1 (major) | Files chosen before a kind were thrown away; the select got no `aria-invalid`, description or focus | Fixed, 4450750: files wait, the select is marked, described and focused, and Upload appears once a kind is chosen (unit and e2e) |
| UX-2 | The `names_patient` notice gave the wrong first step for a payer letter or EOB | Fixed, 4450750 |
| UX-3 | "Patient details" named the records a second way | Fixed, 4450750: one name, the practice's patient records; `screen_failed` has its own notice |
| UX-4 | The panel never said a kind is permanent | Fixed, 4450750: the help line under the select |
| UX-5 (nit) | The refusal stayed after a kind was chosen | Fixed with UX-1 |
| UX-6 | The ADR left out what a person meets | Fixed in the ADR, 53076d2 |
| UX N-1, N-2, N-3 (nits) | `screen_invalid` blamed the document; the propose card did not mention the check; the region's name differed from its title | Fixed, 4450750 |
| After-fix shots D-1 (nit) | The kind select spans the width of its help line | Superseded by fix 3 (7f77cb19): both selects are one width, `w-full max-w-md` (448 px at 1280 px), whatever is written under them |
| After-fix shots D-2 (nit), later M3-4, then M4-2 | At 390 px the chosen ERA option's long label is cut inside the closed select | Fixed, 7f77cb19 (fix 3): the Uploads page offers its kinds by their receipt names, "ERA export" shows whole at 390 px; the system select's help says where an export comes from. shots5 and shots-ref: resolved |
| Merged-#74 shots M4-1 | At 390 px the placeholder "Choose the kind of document" was cut inside the select | Fixed, 7f77cb19: "Choose a kind", under the label "Kind of document"; shots5 and shots-ref: whole at every width |
| Merged-#74 shots M4-3 | The selects took the width of the widest line under them and changed width with the error | Fixed, 7f77cb19: `FIELD_BOX` and `FIELD_SELECT`, one width in every state (unit and e2e width tests) |
| Verification 1 (FAIL), item 1 | P11, the cap on the framed request, was deferred for an effort reason though within this PR's reach | Fixed, 4a099795 (the cap, a notice, the path's mapping, the permitted run's count, tests) and 4b886fcc (ADR 0070 Part 3, "The request's length"; the runbook) |
| Verification 1, item 2 | The description was stale: CI on 9b7eadf, no word of f5292c6c, the old base in the freeze and affected.ts lines, 53076d2's counts | Fixed in this description: CI on the head, every base merge, the current base, the suite on a8149341 |
| Verification 1, item 3 | "The screen comes last of the gateway's refusals" was not exact (the budget's hold can refuse after it); `gateway.ts:50` said the same | Fixed, 4a099795 (`gateway.ts` and `spec.ts` comments) and 4b886fcc (ADR 0070 Part 3 departure 26, ADR 0054's amendment); stated here as "last before the budget's hold and the call" |
| Verification 1, item 3 | The twin sentence left out that a third of the member IDs are "ZZ" plus 7 digits | Fixed, 4b886fcc (ADR 0070 Part 3 departure 8) and in this description |
| Verification 1, item 4 | The PR is still a draft | Deferred to the merge step: it leaves draft once verification 2 passes and the required checks are green on the head (the item's status file, "Remaining", step 5) |
| Verification 1, nit | The ADR said P12's pool brand needs `services.ts` (a #42 file), but `openPool` is in `packages/db/src/connect.ts` | Fixed, 4a099795: built in `connect.ts` and `authz/scope.ts`, no #42 file; the ADR's earlier reason is corrected (4b886fcc) |
| Verification 1, informational | Open PR #80 also edits `redact.ts` | Resolved in the merge 871faff9 (above) |
| Merge 4 re-read, both-sides-LC-1 (nit, docs) | ADR 0079 said the guard asks only while a batch file is being sent, but after the merge the guard is `leaveAsks`, which also covers files waiting | Fixed, 7cd60740: ADR 0079 decision 4 points to `leaveAsks` and ADR 0070 Part 3 back to it. The safety and accessibility re-read confirmed nothing more |
| Merge 4 critic (NOT-READY) | The base had moved (#82, #83 and its `counted()`); no full suite on the final head; cf61a828 not itself reviewed; the seed test might no longer pin "0000-01-01" | Fixed: merge 5 fe9c8da8 with `counted()` checked; cf61a828 reviewed (R5 below); "0000-01-01" and "0023-04-26" pinned on their own in 1677792a; the full suite on the final head (check7) |
| MOD-13 seed 1162287068 (the orchestrator's request) | A claim number written like a date with a year below 1900 ("0023-04-26") reached the model unredacted | Fixed, 3a033b32 (fix 4): a four-digit year only from 1900 to 2099; reproduced first, a fixed-seed regression, 4 of 7 new tests fail without it |
| Fix 4 review, F4-1 (minor) | A number joined by "_", "\|" or "\" was never matched (older than fix 4) | Fixed, cf61a828: `NUMBER_JOINERS` and `letterJoins` take them anywhere; tests first |
| Fix 4 review, F4-2 (nit) | The keep-as-date test kept a match that was only part of a date ("Jan 31-2026" for claim 312026) | Fixed, cf61a828: `writtenAsDate`, the match's own written form must be the whole date |
| Merge 5 review, R5-1 (major) | A digits-only number split by a grouping apostrophe, "~", a middle dot, a bullet, ";" or a double quote reached the model, and `holdsIdentifier` passed it (older than this PR) | Fixed, 1677792a: those join anywhere, the candidates read the same, a table pins each writing |
| Merge 5 review, R5-2 (minor) | A labelled claim number that is also a 1900 to 2099 date was kept as a date | Fixed, 1677792a: an identifier label right before it makes it the number; after a label digits join over "." and "/" |
| Merge 5 review, R5-3 (refuted in part) | The contract screen's miss of other-script digits was not recorded | Fixed, 1677792a: recorded in ADR 0070 Part 3 "Not caught", with the fold of Unicode decimal digits as the proposal, and pinned for both paths |
| Merge 5 review, OVR-1, OVR-2 (nits) | `identifierCandidates`' and `Form.digitsOnly`'s comments did not say what `letterJoins` and `writtenAsDate` do | Fixed, 1677792a |
| Merge 5 proposal | The too-many refusal wrote `String(limits.maxFiles)` ("At most 1 files") | Fixed, 49156dd8: through `counted()` |
| Critic G1 | The letter's other-patient screen did not join a labelled digits-only number over "." or "/", so `more_than_one_patient` missed "ICN 1234.5678" | Fixed, d2a609fd (`labeledDigitsJoin`) |
| Critic G2 | R5-2's label took any "number" or "#", so a deadline equal to a claim's digits was replaced | Fixed, d2a609fd: a label is a head word of its kind; a member's label makes a whole date a member ID only, a claim's label a claim's number only |
| Critic G3 | A label's end did not take "*", ",", "(" or an opening quote ("**Claim:** 2026-04-26") | Fixed, d2a609fd |
| Critic G4 | The primes OCR writes for a grouping apostrophe did not join a number | Fixed, d2a609fd; U+30FC recorded as a residual |
| This round, phi-G2-regress-1 (major) | G2's narrow label also gated the non-date branch, so "Patient ID 1234.5678", "Policy number 1234/5678" and "ID 1234.5678" sent the digits | Fixed, 49c7a781: `ANY_IDENTIFIER_LABEL` for digits that are no whole written date; the test and the N6 property fail without it |
| This round, phi-numero-glued (major, older than this PR) | "Claim №99887766" (NFKC "No99887766") glued the label to the digits and was sent | Fixed, a8149341: a number glued to a label word is read as after that label; non-label words stay; the test fails without it |
| This round, phi-label-end-dash (minor) | A label's end did not take "=", an en or em dash or the minus sign ("Member ID – 1234.5678") | Fixed, 7639392f; the test fails without it |
| Critic before the push | The merged head, the three fixes and the suite on a8149341 | READY-TO-PUSH. check7's re-probe: all 19 of the review's examples are replaced on a8149341, and `holdsIdentifier` is false on each output |

## Freeze exception

No: it changes none of them. The engine freeze check passes against the current base; the ledger, the content pipeline, the security program and the milestones are untouched. The upload panel, the gateway screen and the letter's redaction are not frozen code. `packages/db`'s pool and scope records (P12) bring the pricing and packets mutation shards into the run, and their gate passes.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J
