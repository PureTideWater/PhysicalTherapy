## What changes

A payer letter read by the denial-letter reader (`readDenialLetter`, behind its own flag) is redacted, or refused for a
person to read, in forms that the range fix (#138, ef3e8d20) left as three accepted residuals. Nothing a person sees
changes: the refusal reuses `identifier_left`. All of it is in `packages/redact/src/redact.ts` (the letter reader's
`redactLetterForScreen` and `holdsIdentifier`), with a look-alike table beside it; the rules, their counts and what is
still not covered are in ADR 0054's amendment of 2026-11-11.

- **Ruling A, Social Security and phone numbers** (test matrix MOD-21):
  - glued to another number where structure says whose the other digits are: a currency amount's digits, an amount's
    cents or a date's end before the number's own shape; cents (a range after them too), a second number or a date
    after it; a date after a bare nine or ten; an amount's cents before a bare nine or ten;
  - glued to more digits under its own label, in the number's usual writing too (`SSN No. 900-12-345678`,
    `Phone number (202) 555-01234567`); a reference a listed noun names is kept (`Case No. 123-45-678901.00`);
  - behind a label with the call's own identifier or the label's list number between them (`Call <name> at 555-0123`,
    `Phone 1: 555-0100`, `Phone (2) 555-0100`), read as the label reads the text without them;
  - masked and glued to a word, a year, a date, an amount's cents, a currency amount or three digits or more; after a
    Social Security label glued to a word;
  - in a letter whose digit chain only the range fix's barriers hold (a letter cc3dd7f6 refused whole): the shapes no
    structure decides are refused there, as cc3dd7f6 refused them.
- **Ruling A', the call's own name, member ID, claim number and date of birth** (MOD-22): written with another script's
  look-alike letters or digits (a table from the Unicode confusables data, in the repository), with a digit for a
  letter or a letter for a digit, with a middle dot or a bullet inside the name, glued inside a longer run, and, in a
  held letter, the date of birth in writings no rule read.
- **Ruling B:** a month's word that is a name part is a date's month only in a date with two numbers or more; `May 2020`
  for a patient named May is redacted as the name.
- **One principle keeps the base's reading whole:** ef3e8d20's own matches are read first, and a match it did not make
  is applied only where the letter is not refused without it; whatever is left as written the check finds again and
  refuses. The survivor scan reads a text as ef3e8d20 read it too wherever its own reading reads a label ef3e8d20 did
  not or may hold less in a chain, and takes the worse answer: a letter ef3e8d20's scan refuses stays refused by
  construction (`survivorIn`).
- **The other-patient screen is offered a number that merges under one of the call's own placeholders.** Such a number is
  hidden in what is sent; the screen now reads the letter once more with the call's own matches alone replaced, so it is
  asked about the number as it is written, as ef3e8d20 asks.
- **A letter that itself writes one of the checks' three control characters (U+0001 to U+0003) is refused whole.**
  ef3e8d20 read a letter's own mark as its placeholder and refused such letters in places; text that holds one is no
  text to trust.

## Why

The orchestrator's rulings A, A' and B of 2026-11-07 on the three residuals that end ADR 0054's amendment of
2026-11-04 (`lanes/STATE.md` item 3; `LANES.md` Queues item 22): they are to be closed before any real PHI is
processed. Acceptance: every pinned row of `redact.residuals.json` classes `ssnPhone` (697) and `ownIdentifierA` (406)
is redacted or refused, ruling B's five rows have a decided rule, and the differential gate against cc3dd7f6 reads no
Social Security or phone letter. MOD-23 (`LANES.md` Queues item 26) owns the two name forms this change leaves and pins
as they are sent today.

## What is still not covered

Recorded in ADR 0054's amendment, each pinned in `redact.leaks.test.ts` as it behaves today, and queued in `LANES.md`
Queues item 26 to be closed before any real PHI is processed:

- **A Social Security label that a CR LF puts out of reach (review K-1).** A label owns a number up to 24 characters
  after it, counted in characters, and a CR LF counts as two. `SSN on file. Statement`, a line break and `No.
  900-12-3456150.00` is refused when the line break is LF and sent as written when it is CR LF, because the noun
  "Statement" then names the number as a reference. ef3e8d20 and cc3dd7f6 send it too; this change does not make it worse.
- **Two name forms (MOD-23).** A name written with a lower-case piece after a space or a period (`Zephy ra`) or letter by
  letter (`Z e p h y r a`) is sent in clear in a letter with no held range, as on ef3e8d20 and cc3dd7f6.
- **The screen is asked more than before in one case (reviews N-1, N-2).** Where one of the call's own identifiers stands
  inside a number that is hidden under another of its placeholders, the other-patient screen is now asked about that
  identifier joined to what follows it, or in another script's digits. Nothing more is sent; a match in the practice's
  records would refuse the letter.

The full list of forms no rule reads is the paragraph that ends the amendment.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged. No file under it is in the diff.
- Ledger (`packages/ledger`): unchanged. No file under it is in the diff.
- Database schema and migrations: unchanged. No migration, no SQL, no function file.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: unchanged. No workflow, action, manifest, lockfile or settings file is in the diff.

Also unchanged, which a reader might assume moves:

- **The narrative's check and the packet verifier** (`holdsNameOrNumber`, `nameOrNumberMatches`; `@tp/packets`) read a
  name and a number exactly as before: the new name joiners, the look-alike fold and the digit-for-letter forms are the
  letter reader's alone, and the verifier's own test that pins what the matcher does not read passes untouched.
- **Contract pages** are sent as stored: none of this reads for a contract-screen function.
- **No new prompt version**, and no field the reader returns changes; `[SSN]`, `[PHONE]` and the call's own
  placeholders are the ones the prompt already describes.
- **`redactLetter` and `redactionSpans`**, which no check follows, redact what ef3e8d20 redacted and more, never less.
- **What must stay** is sent as before but the costs ADR 0054 records (each the safer reading, each measured there).

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

Run once in the build's container on the merged tree (the base 91bc6b7c merged in; 052ff9e5), output kept in files; the
two steps that failed there were fixed in d06e772d and run again on it, as the rows say. The base moved once more while
the suite ran (#145, the migration runner, no file of this change): it is merged at 7bb7e7ac, where typecheck, lint, the
log, copy, fixture and content checks, the generators (the tree stays clean), the redaction tests, the worker's bundle
test and the runner's unit test pass. CI on this page is the suite of record.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 24 projects |
| `pnpm lint` | passed, 1,934 files, 0 errors, 0 warnings |
| `pnpm lint:logs` | passed, 1,200 files scanned |
| `pnpm lint:copy` | passed, 605 files read |
| `pnpm check:fixtures` | passed, 393 files read by the guard |
| `pnpm verify-content` | passed, every content set |
| `pnpm synth --all` | 338 cases, 0 files written, 790 unchanged; the tree stays clean |
| `tools/screening-capacity/watched.ts --write` | on 052ff9e5 it added `packages/redact/src/confusables.ts`; committed in d06e772d, clean on it |
| `pnpm test` (unit and property) | on 052ff9e5: 14,203 passed, 4 skipped, 1 failed: the worker's test that pins the modules the packets verifier's server entry bundles from `@tp/redact` did not list the look-alike table. Fixed in d06e772d (the list names it; the browser's packet check still bundles nothing of `packages/redact`): the worker's tests pass on it |
| `pnpm test:golden` | passed, 381 tests |
| `pnpm test:oracle` | passed: pyx12 4.0.0 agrees with all 738 synthetic 835 fixtures |
| `pnpm --filter @tp/model-gateway eval` | gate passed |
| `pnpm test:db`, four shards on PostgreSQL 18 | passed: 3,352 (1 skipped), 2,843, 2,938 and 1,089 tests |
| `tools/stryker/affected.ts` | packets affected (the matcher's package is in its closure); the `mutation` check runs its shards |
| `tools/engine-freeze/check.ts` | no problems |
| `pnpm build`, `pnpm test:e2e` | on 052ff9e5 the end-to-end server refused to start on a tree the regenerated watched list had left uncommitted; on d06e772d: build passed, 87 of 87 passed |
| The redaction files under eight fixed seeds (`redact.property.test.ts`, `redact.leaks.test.ts`) | 734 passed under each, on the tree before the base merge |
| The differential gate, 975,489 synthetic letters, against ef3e8d20 and against cc3dd7f6, on the merged tree | no letter in which the older tree redacted or refused an identifier and this one sends it; slowest letter 1,137 ms (budget 3,000 ms) |
| The reviews' fuzzers with fresh seeds, on the last change to what is sent | no letter ef3e8d20 refuses sent but the month-named patient's (ruling B); none showing what ef3e8d20's redaction replaced |

## Reviewer agents' findings

Agents that ran: adversarial reviewers, each with a written brief, a folder of its own and its report as its last
message; their reproduction scripts, the briefs and what each was told is recorded are in the ops repository
(`claude/build-ops`, `designs/lane-b-redact-ssn-phone-leaks/reviews/`). Two on the design; two on the build (B1 for what
is sent, B2 for what must stay); two on the first fix round (C1, C2), which the session's usage limit cut off before a
report and which therefore count for nothing: their reproduction files were read, every row re-run and fixed; then two
on each later fix round's delta, each of which ran to its report (D1 and D2, E1 and E2, G1 and G2, H1 and H2, I1 and I2),
one reviewer with all three lenses (what is sent, what must stay, logic and time) on each of the next two (J, K), and one on each of the last three deltas, which are a few lines each (L, M, N). Every
finding was run on the trees before it was fixed, and each is a row of `redact.leaks.test.ts` on both sides, named by its
id. Beside the reviews, the differential gate was replayed against its last run after each round, and the reviewers'
fuzzers were run with fresh seeds: the gate found three forms a round had re-opened, the fuzzers the 22 letters of G1-1
before the review reported them. The payment-engine and EDI reviewers did not run: the change touches no money, pricing,
ledger, tenancy or parsing code. The UX and brand reviewer did not run: nothing a person sees changes (the reader is
behind its flag and its refusal reuses `identifier_left`), so there are no screenshots.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Design, two reviews | The first design read one look-alike fold everywhere and tested whether a number "stood alone" before redacting it. | Folded into the design before the build: the fold is for the call's own identifiers only, and a match ef3e8d20 did not make is applied only where the letter is not refused without it. |
| B1 (PHI; B1-1 to B1-14) | Four letters ef3e8d20 refuses were sent (an invisible character defeating the stand-alone test; refusals lost to the fold); a label not read through the call's own identifier across its line break; the checks' own control characters read as placeholders; glued labels, masked SSNs and digits glued to a shape in more writings; digit-for-letter forms in pieces and glued; the date of birth with a Roman month. | Fixed: the settled and fresh matches (`Found.fresh`, `appliedMatches`); `gluedShape`; the masked rules; rows B1-1 to B1-14. |
| B2 (must stay; B2-1 to B2-9) | Ordinary tokens read as a name's digit-for-letter form (`11am`, `CO13`); masked account numbers, references with a longer group, the verb "may", a short word of another script and what a held letter places by its structure were refused. | Fixed or recorded as a cost in ADR 0054, each measured; rows B2-1 to B2-8. |
| C1, C2 (cut off: no review) | Their files held 4 and 8 reproductions (a second reading that replaced the first; the look-alike reading replacing ef3e8d20's; amounts and numbers, rows of long numbers, list numbers). | Every row re-run and fixed (f0d6e914, 0c0975a6 to 0ddfa078); rows C1-1 to C2-8. |
| D1 (PHI; D1-1 and a note) | An initial read only beside a name written with a new joiner stood as a settled match, so a letter ef3e8d20 refuses was sent with its nine digits; `redactLetter` redacted less inside a look-alike run. | Fixed in cf5094a0: ef3e8d20's own matches are taken on the text as it read it; `Found.withheld` only where a check follows. |
| D2 (must stay; D2-1 to D2-7) | Four digits or more before a shape refused ordinary references, table rows and file names; a label before a named reference; the verb "may"; masked account numbers. | Fixed in cf5094a0: digits before a shape are another number's only by structure; a noun nearer than a label names the number; the costs recorded. |
| E1 (PHI; E1-1 to E1-8) | A noun after a Social Security label un-named its number; dates, masks, parentheses and list numbers in writings beside the rules; "advice" and a heading two lines up naming a number. | Fixed in 8e599038; rows E1-1 to E1-8. |
| E2 (must stay; E2-1 to E2-6) | E2-1, a fault: a label's list number counted as a digit of the number the label names, so `Telephone call (2) 30.00 60.00` was refused. Four smaller ones; one held-letter cost. | Fixed in 8e599038 (`listNumberAt`); E2-6 recorded as a cost. |
| The fuzzers on 8e599038, and G1 (PHI; G1-1 blocking, G1-2 to G1-5) | 8e599038 took the list number out of chains ef3e8d20 counts it in: 22 fuzz letters ef3e8d20 refuses were sent (`Phone (20) 2555 0123`, a number's own first digits written as a list number), and one more since an earlier round. A year-first date with a one-digit day, the Social Security label right before a noun, a parenthesized phone in a held letter and a point under a Social Security label had been re-opened. | Fixed in d3657ba2: the scan keeps ef3e8d20's reading by construction (`survivorIn`: the text is read as ef3e8d20 read it wherever the strict reading may hold less in a chain, and the worse answer is taken); an audit copy reported no text outside the marked places over 456,096 fuzz letters; rows G1-1 to G1-5. |
| G2 (must stay; G2-1 to G2-3 major, G2-4 to G2-7) | 8e599038 had begun to refuse ordinary rows: a reference before a date written with its month's word (about half of such rows), a pipe row and a file name whose parts read as a date (about a third), a label two line breaks above its number. | Fixed in d3657ba2 and a66fee45 by narrowing each rule to what structure decides; the reviewer's rate generators read 0 on the head; rows G2-1 to G2-7. |
| H1 (PHI; H1-1 to H1-5) | The scan's by-construction claim held: no letter the base's scan refuses was sent over 206,772 letters, and the audit copy printed nothing. H1-1, older than the round: a letter that writes the checks' own U+0002 beside a word that touches a digit is refused by ef3e8d20 and had been sent since B1-4's fix. Four of d3657ba2's narrowings sent more than their record said (a month's word glued to a number with its year after a space; what may follow a date after a bare run; the hyphen bullet; line breaks inside a label). | Fixed in 24ad1075: a letter that writes U+0001 to U+0003 is refused whole; the four rules read what "before" read except the ordinary forms G2 had named; rows H1-1 to H1-5. Its five lines of residuals are in ADR 0054. |
| H2 (must stay; H2-1 to H2-8) | Three new refusals of ordinary text (a Medicare rate after "Social Security Act"; "on" at a line's end before "File Number:"; and, on the sending side, a word on the number's line resetting the count of line breaks), rule lines of underscores that could not match, and the second reading reading one label more than ef3e8d20 did. H2-2, older: a number under a header row of several columns has no name. | Fixed in 24ad1075 (the Social Security label must be the number's own; "on file" on one line; a rule of three rule characters, of underscores and box-drawing lines too; the second reading is ef3e8d20's scan line for line). H2-2 and H2-5 are recorded costs with their rates. |
| I1 (PHI; I1-1, I1-2 to I1-6 minor) | No letter ef3e8d20 or the tree before refused or redacted was sent outside the recorded give-backs, over about 120,000 generated letters; the audit copy printed nothing. I1-1, not a leak: the check did not return on a long rule of underscores or box lines between a noun and a number (a repeated run inside a repeated group). | Fixed in f2f9f05e: the run is taken whole; a row with a time bound holds rules of 48 to 5,000 characters. Its residual lines are in ADR 0054. |
| I2 (must stay; I2-1 to I2-6) | I2-1, the same backtracking, measured (the time grew by about 1.47 for each character of the rule). Five more: a `#` or a colon alone under a label, a table's alignment row, a label of three lines, a cell drawn with box lines, the month's word after a bare run read one way and after a shape another, an amount that begins as a year does. | Fixed in f2f9f05e; rows I2-1 to I2-6. The layout readings among them were withdrawn two rounds later (see J). |
| The gate's replay on 24ad1075 | One letter the round before had closed was sent again: a Medicare number written with a point between its second and third groups, right after its label. | Fixed in f2f9f05e: the label right before a number is the number's own (`LABEL_RIGHT_BEFORE`); the cost (a rate right after "Medicare" or "Fax" with no word between) is recorded. |
| J (three lenses; J-1 to J-5 major, five minor) | No blocking finding in about 33,400 letters. J-1: the guard after a spaced year also turned away a real year before a comma. J-3: one CR LF was read as a blank line, so a label that held one named nothing. J-2, J-4: a stray mark or an empty table row inside a three-line label named a number; an indented number or a padded cell under a ruled label did not. J-5: a table's corner "+" read two ways made the search exponential again. | The reading of a label that stands over its number had now failed a review four rounds running (G2-3, H2, I2, J). 74c32149 withdraws it instead of patching it a fifth time: a noun names its number with one line break at most inside the label and one at most before the number, the safer reading; what that refuses is a recorded cost in ADR 0054. A "+" is no connector, a CR LF is one line break, only an amount's cents make a spaced year an amount; rows J-1 to J-5 and a time bound for every connector repeated. |
| K (three lenses, on 74c32149's delta) | No blocking finding: no letter ef3e8d20 refuses sent and no digit shown that it redacts in 192,590 generated letters, no refusal of ordinary text outside the recorded costs, no slow letter. K-1 (major by its brief): a label's reach is counted in characters and a CR LF counts two, so a Social Security label 24 characters before a number that a noun names owns it in the writing with LF and not with CR LF. Five lesser forms. | Recorded, not changed here (the orchestrator's ruling of 2026-11-11): ef3e8d20, cc3dd7f6 and every head of this build but one send the K-1 letter. It and the lesser forms are residuals in ADR 0054, pinned as sent today in `redact.leaks.test.ts`, and queued to be closed before any real PHI is processed (`LANES.md` Queues item 26). |
| The fuzzers on 74c32149 (the first delta review's, seed 5923) | One letter in 31,200 showed a date that ef3e8d20's redaction replaced: for a patient whose one member ID ends another, the longer one written with a look-alike digit, a line break and a date. The Social Security pattern's match that begins in the ID's last digit was withheld for the check, the ID's placeholder replaced the run, and the date was sent as written. On every head of the build since the look-alike forms were read; no reviewer's generator drew such a patient. | Fixed in ac412151 by one condition in `matchesIn` (the orchestrator's ruling: fixed, not recorded): a pattern's match is withheld only for a run that no match of the call's own covers whole. Three rows and a property that failed first; the property's space in full reads 40 letters before and none after. |
| L (three lenses, on ac412151's delta) | No blocking finding: nothing ef3e8d20 refuses sent and nothing it redacts shown over about 480,000 generated letters; all 2,410 letters that take the branch where the covering match is not applied are refused. L-1 (major): a pattern's number that merges under the call's own placeholder was hidden in what is sent, which is right, and was no longer offered to the other-patient screen as it is written, where ef3e8d20 offers it; the build already did this for a patient with one identifier. L-2 (major, must stay, narrow): a letter with pattern-shaped digits right before such a writing of the ID under a phone or Social Security label is refused where ef3e8d20 sent it (32 of 4,480 letters of its family). | L-1 fixed in 247a53e3 (ruling: fix): the screen reads the letter once more with the call's own matches alone replaced. L-2 recorded as the fix's cost in ADR 0054, the safer reading, as it already was for a patient with one identifier. Its comment notes settled. |
| M (on 247a53e3's delta: what is sent unchanged, the screen offered at least what ef3e8d20 offers) | What is sent is unchanged and no candidate is lost over about 30,000 letters; time ratio 1.3 at most. M-1 (major): where a piece of the hidden number is itself a short identifier of the call's own (a claim number 0123), the second reading replaced that piece and the number was still not offered (576 of 11,136 letters of its family). | Fixed in c9dddaa7 (ruling: fix, the last change to `redact.ts`): the second reading follows `merge`'s own rule, an own match inside a pattern's number is that number's. Four rows that failed first. |
| N (on c9dddaa7's three lines, the same scope) | Nothing blocking: what is sent unchanged, no candidate lost, no identifier of the call's own offered in its own compact form, over about 20,000 letters. N-1 and N-2 (major by its brief): an identifier of the call's own that stands inside a hidden number is now offered to the screen joined to what follows, or in another script's digits, where no tree offered it; every tree offers the same where the number is sent as `[PHONE]`. | Recorded (ruling: any finding of this review that is not blocking is recorded): more is asked of the practice's own records, in memory, and nothing more is sent. Pinned as offered today in `redact.leaks.test.ts`, in ADR 0054, and in `LANES.md` Queues item 26. |

## Freeze exception

No: it changes none of them. The engine's arithmetic, the ledger's semantics, the content pipeline and the milestones
and their gates are untouched. The redaction implements the founder's ruling of 2026-11-01 on PRD 14 PHI minimization
and the orchestrator's rulings of 2026-11-07 on its residuals; it adds no control and removes none.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifADZcDuzjeUkfedYiW
