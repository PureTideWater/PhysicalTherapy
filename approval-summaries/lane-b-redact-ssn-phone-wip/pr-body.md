## What changes

A payer letter read by the denial-letter reader (`readDenialLetter`, v1.5, behind its own flag) now has every Social
Security number and every phone number redacted **by pattern** before the model reads it, wherever and however the
letter writes them, and not only the patient's own identifiers found by exact match. A letter in which an SSN- or
phone-length chain could still survive is refused and goes by hand, with a fixed sentence that names no number. Nothing
else a person sees changes: no screen, no prompt version, no field the reader returns.

All of it is in `packages/model-gateway/src/redact.ts` (the one-pass folded matcher #80 built and #75 and #115 extended)
and `functions/denial-letter.ts`, with tests in `src/redact.property.test.ts`, `src/redact.test.ts` and
`functions/denial-letter.test.ts`, test matrix rows MOD-15 and MOD-16, and the records in PRD 14, ADR 0054 (a new
amendment, 2026-11-04), ADR 0070 N6 and reconciliation-001. Every example below is a synthetic twin (SSNs in the 9xx,
000 and 666 areas, phones NPA-555-01xx).

### The patterns, their kinds and placeholders

- **Where they run.** Inside `matchesIn`, last, into the same found list as the call's own identifiers, only for the
  letter reader (`letterSubject`'s `patterns`): `redactLetter`, `redactionSpans` and `holdsIdentifier` read them; the
  narrative check (`holdsNameOrNumber`) and every contract-screen function do not. They read the letter's folded view
  with every decimal digit read as its value (full-width, Arabic-Indic and Devanagari digits too), on both readings of
  an invisible run (joined, and as a space), so `On 11/01/2026<ZWSP>202-555-0123` is read.
- **Social Security number, placeholder `[SSN]`.** A 3-2-4 (`SSN 900-12-3456` becomes `SSN [SSN]`); a masked one
  (`XXX-XX-3456`, `***-**-3456`, `###-##-3456`, `___-__-3456`, and after an SSN label `*****3456`); a bare nine
  (`member 900551234` becomes `member [SSN]`); a HICN's suffix inside the span (`HICN 900123456A`, `Medicare no. 900-12-3456-A` become `HICN [SSN]`, `Medicare no. [SSN]`).
- **Phone number, placeholder `[PHONE]`.** `(AAA) EEE-LLLL` and `AAA EEE LLLL` with an area code 2-9 (`(202) 555-0147`,
  `202.555.0175`), with `+1` or `1` and an extension inside the span (`1 (202) 555-0147 ext. 22`, `202.555.0175x301`),
  `+` and ten digits, a bare ten (`2025550119`), `1` and ten after a phone label, and a seven-digit local number after a
  phone label.
- **Between two groups:** one or two dashes with up to two spaces or a wrapped line around them (`900 - 12 - 3456`), one
  to three spaces or tabs, a line break with indentation (`SSN 900-12-34`, line break, `   56`), a period, one of the
  number joiners the call's own number reads (an underscore, a bar, a backslash, grouping apostrophes and primes, `~`,
  middle dots and bullets: `202·555·0188`), or an invisible run; **inside a group**, an invisible run or a wrapped line.
  A form feed (pdftotext's page break) and a vertical tab are line breaks; U+1680 and the braille blank U+2800 are
  blanks (`SSN 900<FF>12<FF>3456` becomes `SSN [SSN]`).
- **Glued forms.** A letter may touch a match (`Tel202-555-0123`, `SSN#900554321`,
  `Phone:2025550119,SSN:900-33-1212;` gives `Phone:[PHONE],SSN:[SSN];`); a digit may not.

### Labels and keep-nouns

- A bare nine or ten is decided by its words, read in a window of 64 characters before it that ends at the last match
  already found, a barrier, a digit or a second line break, a word counting within 24 characters.
- **Keep-nouns:** claim, ICN, DCN, reference, appeal, case, NPI, TIN, EIN, tax ID or tax identification, check, EFT,
  trace, control, invoice, authorization, ZIP, group. One keeps a number only when it names it, with nothing but
  connectors between (white space, `:`, `#`, a dash, `.`, `*`, `=`, `(`, an opening quote, one comma, `NO`, `NUMBER`,
  `NBR`, `NUM`, `ID`) and no sentence end but an abbreviation's full stop: `Ref. No. 2025550123` is kept, `See our
  claim. 900551234` becomes `See our claim. [SSN]`.
- **SSN and phone labels** (SSN, SS#, SS No., Social Security, Soc. Sec., HICN; phone, ph, tel, telephone, fax,
  facsimile, call, TTY, TDD, toll-free, cell, mobile, contact; `Medicare` for a nine):
  an SSN or phone label in the window decides over a keep-noun wherever the two sit (the nearer of an SSN and a phone
  label picks the placeholder), a phone label never keeps a nine, and a Luhn-valid ten named by NPI (`NPI 2340178906`)
  and a nine named by TIN, EIN, tax ID or tax identification (`Tax identification number 900123457`) are always kept. `Medicare 2025550142` is `Medicare [PHONE]`.
- **No word:** a nine is `[SSN]`; a ten starting 3-9, or 2 and failing the NPI check, is `[PHONE]`; a ten starting 0 or
  1 is kept.
- **Lists:** a keep-noun names a list whole. A number whose own words decide nothing and that follows another number,
  the call's own claim or a placeholder across a comma, "and", "or" or "&" is kept when the list's first decided number
  is kept: `Claim number(s) 900123456 and 900123457.` and `Reference numbers 2025550123, 2025550124.` are sent as
  written. A label in the list (`Claim 900123456 and SSN 900551234` gives `... and SSN [SSN]`), any other word, a line
  break or a sentence end ends it; a list after an SSN or phone label is no keep; a list is followed back sixteen
  numbers at most (`decideNamed`, shared by the patterns and the scan).

### Guards for what must stay

- Amounts, every date `datesIn` reads (the date of birth by its own rule), NPIs, procedure, adjustment and diagnosis
  codes, ZIPs and ZIP+4s, TINs, ICNs of 11 digits or more, EFT traces, checks and references named by a word: no
  pattern takes them (MOD-16). Examples sent unchanged: `Billed $150.00 2026-11-01`, `CPT 97110-GP`, `ICN 10012345678`,
  `TIN 12-3456789`, `Check 000555012`.
- **R1a:** a period or a joiner never sits in one match with white space, and a match with white space between groups is
  never one beside an amount's decimal point or cents (`Paid 150.00 2026-11-01` stays; a spaced dash counts as white
  space, so `Paid 150.00 - 2026 total` stays too).
- **R1b, the currency guard:** no shaped match follows a currency sign: `Paid $202-555-0123 in full.`, `Billed $202 555
  0123 total`, `Paid $900 12 3456 total` and `Paid €202.555.0123` are sent as written.
- **Ranges:** two dates or two unsigned amounts joined by one or two dashes are a range, sent as written and read by the
  scan as a barrier: `Service 10/01/2026-10/15/2026.`, `From 2026-10-01-2026-10-15.`, `Billed 150.00-120.00 allowed.`
  A range joined to a further group is no barrier (`Seen 10/01/2026-10/15/2026-0123` is refused).
- **Wrapped lines:** a number with a group wrapped across a line break is never read into a number on the next or
  previous line: no digit across a break beside it that no other match holds, and no other match over its ends.
- **The call's own identifiers keep their placeholders.** `[SSN]` and `[PHONE]` rank below the call's own (`RANK`:
  claim, member, birth, name, ssn, phone). A pattern match that is the call's own member ID or claim number (whole, by
  its core digits, or joined to the token written against it) takes its placeholder: the call's claim written
  `Claim (202) 555-0123` is `Claim [CLAIM_1]`. A match of the call's own strictly inside another number's span lends
  it no rank (the call's short claim `1234` inside another patient's `900-55-1234` is `[SSN]`). A claim reference holding
  a placeholder without being one of the call's claims (`ZZ-[SSN]`) is rejected by the verifier as `unknown_claim`.
  `PLACEHOLDER` and `masked` read `[SSN]` and `[PHONE]` as every placeholder, so a patient named `PHONE` reads none.

### The independent survivor scan and its refusal

- `holdsIdentifier` runs the patterns on the masked sent text and also a scan written apart from them, on the digits
  view with invisible runs dropped and read as spaces, after barriers (placeholders; whole separated dates with a
  reading; a date glued to a word, read with its letters as blanks; amounts; ranges; numbers a keep-noun names, alone or
  in its list; the NPI and TIN rule).
- **Unlabeled chains:** one to four consecutive digit groups joined by white space (up to sixteen spaces or tabs, or
  one line break with up to sixteen on each side) with at most one joiner (dashes, `.`, `(`, `)`, `/`, every non-white
  number joiner, `;` with no space after it, and U+30FC, U+2053, U+02C9, U+2215, U+2044, U+3001) holding 9 or 10
  digits, or 11 starting with 1, are refused, unless one group has five digits or more (codes, ZIPs, TINs, ICN columns)
  or the one group is a ten starting 0 or 1, a ten starting 2 that passes the NPI check, or eleven digits or more.
  Refused: `202/555-0123`, `SSN 900-12-34 56` (an OCR space in a group), `Tel 202    555    0123`.
- **Labeled chains:** when an SSN or phone label (or `Medicare`, for a nine) is the nearest word before the first group
  within 24 characters, with no keep-noun or code word (CPT, HCPCS, code, modifier, revenue, ICD, ZIP) after it, the
  chain runs over any number of groups and is refused at 9 or 10 digits, or 11 starting with 1, whatever their
  lengths; a comma joins there and an unsigned amount is no barrier. Refused: `Phone: 202-5550123`, `SSN 90012-3456`,
  `SSN 9 0 0 1 2 3 4 5 6`, `SSN 900.12 3456`. Sent: `Please call about CPT 97110 97140.`, `Call our office, TIN
  12-3456789`, `Claim lines 1 2 3 4 5 6 7 8 9`.
- **The refusal** is `identifier_left` with the fixed sentence "the letter still holds an identifier after redaction;
  it is not sent": no number, no span, nothing of the letter. A letter that glues the patient's name to a pattern span
  (`RE: Vantree900-12-3456`) is refused the same way.

### The screen

- The one-patient screen is asked about the redactor's candidates (`redactLetterForScreen`, used by `denial-letter.ts`
  only and not exported from the package): the runs of the sent text, the runs of the letter with only the call's
  identifiers replaced, and the compact form of every SSN or phone match that is not the call's own, whole, by its core
  digits and joined to the token on either side (`900-55-1234-01` offers `90055123401`).
- The call's own member IDs and claim numbers are never among them. The candidates live only in the prepared call's
  context, are never sent, logged or stored, and the screen's refusal is the fixed `more_than_one_patient` (MOD-14,
  MOD-16): a letter naming another patient's `900551234` that the records hold is refused with nothing sent, and sent as
  `[SSN]` when the records hold none. `apps/worker/src/packets/letter-records.ts` changes in its header comment only.

### Linear time

- Every pattern is a fixed sequence of bounded pieces, run once per start; the label window is read once per bare
  match; the scan's chains run at most four groups from each start, or under a label until they hold more than eleven
  digits (twelve groups at most); ranges are settled in one pass each way; a list is followed back sixteen numbers at
  most.
- A letter with no invisible run is read once, not on two readings, by the patterns and by the scan (a letter of a
  digit and a bare line break repeated, `5`+line break, 100 kB: 1.59 s to 0.79 s in vitest). A test counts
  `RegExp.prototype.exec` runs rather than a clock, so it cannot flake: it requires a letter's runs to be under 90 in 100
  of the same letter with one ZWSP added, and fails with the fix taken out (about 1,150 runs against 1,175).
- The folded view no longer reads the end of a string it is building, which made a letter of invisible runs quadratic
  (`5<ZWSP>` at 100 kB: 2.7 s before, about 0.34 s now).
- The 100 kB time rows (crafted shapes, `5`+line break, `1`+CRLF, `5-`+line break, date ranges, amount ranges, one long
  list after a keep-noun) are redacted and checked within the 3 s budget; a 100 kB list takes 0.8 s and a 400 kB list
  3.3 s.

## Why

The founder's ruling: the founder (Tyler Williams) ruled on 2026-11-01 that a payer letter has its Social Security
numbers and phone numbers redacted by pattern before the model reads it (`readDenialLetter`), as a PRD 14 "PHI
minimization" requirement. The co-founder relayed it to Lane A (session_01TrKDxeLbxVo7t7zwRXFzrg, commit 18bbe0e9,
14:04 UTC) and confirmed it in session_01FcouKNNHsdecRMzfTs7XwW at about 14:40 UTC.

Until now the gateway redacted only the patient's own names, date of birth, member IDs and the call's claim numbers, by
exact match, and ADR 0054 (the `co-001/redact-placeholders` amendment) listed "addresses, phone numbers and Social
Security numbers, which PRD 14 does not list for redaction" as residuals. This pull request records the ruling with who
and when in PRD 14, ADR 0054 (amendment of 2026-11-04), ADR 0070 N6 (a dated bullet) and reconciliation-001 (a "Ruled
by" paragraph), and builds it to the design `designs/lane-b-redact-ssn-phone.md` (on `claude/build-ops`), section 17,
R1-R14. The design's section 15 points went to the co-founder, each decided as the safer option (reconciliation-001):
unlabeled bare nines and tens are redacted; the payer's own phone numbers are redacted with any other; a reference in an
SSN or phone shape is redacted; an SSN or phone label beats a keep-noun, but for an NPI or TIN it names; a letter gluing
the patient's name to a number, or holding a chain no pattern read, is refused and goes by hand. No pull request into
main.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged. No file under it is in the diff; `tools/engine-freeze/check.ts`
  reports nothing let through and no problems.
- Ledger (`packages/ledger`): unchanged. No file under it is in the diff.
- Database schema and migrations: unchanged. No migration, no SQL, no function file.
- Content releases (`content/`): unchanged; `pnpm verify-content` passes every content set.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: unchanged. No workflow, action, manifest, lockfile or settings file is in the diff (so
  `pnpm actions:check` and `pnpm toolchain:check` are not needed).

Also unchanged, which a reader might assume moves:

- **Addresses stay a residual:** the ruling does not cover them, and a bare ZIP+4 with no `ZIP` word before it becomes
  `[SSN]` (an address part, already a residual of PHI).
- **Contract pages** are sent as stored: the patterns are off for every contract-screen function (a changed page would
  reject true quotes, and a contract's phone numbers are the payer's). The narrative check, the narrative's facts and the
  evidence requests are unchanged.
- **No new prompt version**, and the model evaluation baseline did not move: `[SSN]` and `[PHONE]` are identifiers in
  square brackets, which the prompt and user message already describe; no field the reader returns is an SSN or a phone.
- **The package's exports** (`index.ts`) are unchanged; `redactLetterForScreen` is internal.
- **No fixture file:** MOD-15 and MOD-16 are `none(10, …)` registry entries, and their `expected.json` holds metadata
  with `files: []`, as MOD-13 and MOD-14 do.
- **`packages/observability`'s phi-guard** is unchanged (aligning its shapes is a proposal, design 16.9); its SSN and
  phone examples are pinned as redacted here.
- **No new ADR:** ADR 0088 was reserved and released; ADR 0054 is amended.

The other residuals ADR 0054 records ("Still not covered"):

- an MBI (a member ID, redacted when the records hold it);
- a phone written in words or with letters (`1-800-555-SYNP`);
- an SSN's last four in prose (`ending in 3456`);
- an unlabeled bare ten starting 2 that passes the NPI check;
- a seven-digit local number with no phone label, or with a digit in its label window (`Phone 1: 555-0100`);
- a non-NANP phone number;
- `1` and ten written as one run with no phone label (`Patient 12025550123`, kept as an 11-digit ICN is);
- two phones with nothing between them (`202-555-0123202-555-0124`);
- an SSN written with an OCR space and then a whole slashed or dashed date for its last six (`SSN 900 12/03/56`);
- a number written as two whole dates or two amounts joined by a dash, read as a range (`9-1-26-1-23-45`; no SSN or
  phone shape is one);
- a person's nine or ten written bare in a list a keep-noun names (`Claims 900123456 and 900551234`), kept as the
  keep-noun keeps the first;
- a ten-digit chain of short groups with an area code 0 or 1, refused by the scan rather than sent;
- an SSN or phone written in two groups, one of five digits or more, or in five groups or more, with no SSN or phone
  label nearest it (`Also 202-5550123`, or `Call about claim 202-5550123`, where the keep-noun is nearer), which the scan
  reads as a code, ZIP or TIN column and sends;
- other-script digits in names, member IDs and dates (SSN and phone shapes are read by value);
- a payer letter misfiled as a contract, which reaches `proposeContractTerms` unredacted unless its patient is already
  in the records (a proposal: the contract screen refuses a page holding a 3-2-4, a masked SSN or an SSN-labeled nine).

Refused by the survivor scan, never sent (the letter goes by hand): a slash or a closing parenthesis between groups
(`202/555-0123`, `202)555-0123`), an OCR space inside a group, a semicolon with no space, a number after a digit and an
invisible run that also holds an invisible run inside a group, two numbers each wrapped inside a group on lines next to
each other, a range joined to a further group, a chain of
9 or 10 digits within 24 characters after a phone word with no code word between (`Please call regarding 97110 97140`),
and grouped keep-noun numbers of short groups (`ICN 2026 110 123 456`, `Check 0001 2345 67`; corr-ssn-5 below). A
list item glued to letters that is not the call's own claim ends the list, so the number after it is redacted, not
refused (`Claim SYN123 and 900123457` becomes `Claim SYN123 and [SSN]`).

The design departures ADR 0054 records with their reasons ("Where the build departs from the design, and why"): the N6
property of `src/redact.test.ts` expects `matcher === (letterReads || labeledReads || patterned)`, held from the
generator's side one way only with pinned rows (`Also 202.555.0123`, `Also 900123456*1`), since a full generator-side
oracle would be a second copy of the scan; and a dash with white space around it counts as a white-space gap in R1a
(`Paid 150.00 - 2026 total` is sent, `Call 202.555 - 0123` is refused).

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

CI on d333d70d: <!-- ci -->**green: all 21 check runs completed, none failed** (`notify` and the stryker matrix with no shard affected skipped); the four required runs succeeded: `all green`, `mutation`, `screening-capacity gate` (capacity measured) and `approval-of-record`. Jobs: build, lint, static, domain model, images, unit, db 1/4 to 4/4, e2e 1/2 and 2/2, capacity.<!-- /ci -->

**The full local suite, once, on 10b48fb3** (each step under the heavy-step lock; every step rerun after the base merge
4dc9a110, since that merge changed the base under every earlier total):

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint` | passed, 1,822 files in 3 groups, 0 errors, 0 warnings (an earlier start on 11f0ee29 stopped here on one float literal in `redact.test.ts`; fixed in 10b48fb3 and every step rerun on it) |
| `pnpm lint:logs` | 1,153 files, ok |
| `pnpm lint:copy` | 584 files, ok |
| `pnpm test` (unit) | 461 files passed; 9,621 passed, 4 skipped (9,625), first run, no flake |
| `pnpm test:golden` | 381 passed |
| `pnpm test:oracle` | pyx12 4.0.0 agrees with all 689 (678 valid, 11 malformed rejected); edi835 agrees on every segment |
| `pnpm --filter @tp/model-gateway eval` | gate passed; narratives 300/300 without a critical error |
| `pnpm synth --all` | 312 cases: 0 written, 713 unchanged, 0 removed; 8 EMR: 0 written, 16 unchanged; git status empty |
| `watched.ts --write` | 568 lines; git status empty |
| `pnpm test:db`, 4 shards on fresh migrated databases, each dropped after | 3,297 + 1 skipped / 2,773 / 2,760 / 984: 9,814 passed, 1 skipped; 145 files, exactly the 145 tracked `*.db.test.ts` |
| `tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` | money, pricing, ledger and packets not affected; no shard, so the gate's verdict is "no mutation run" |
| `tools/engine-freeze/check.ts` (merge base) | nothing let through; no problems |
| `pnpm check:fixtures` | 342 guard files, 4,150 searched, ok |
| `pnpm verify-content` | every content set passes |
| `pnpm build`, BUILD_COMMIT stamped | exit 0; stamped 10b48fb3b594fea92abaf7a82dd51258c1596875 |
| `E2E_PREBUILT=1 pnpm test:e2e --workers=2` | 81 passed (15.1 min); database dropped |
| gitleaks over `origin/claude/build-platform..HEAD` | 18 commits scanned, no leaks |
| pre-push hook, standalone (pinned gitleaks 8.24.3) | exit 0: 4 commits checked, 0 fixture files, 9 text files, no secret |
| property seed sweep, `redact.property.test.ts`, seeds 20261106 + 7919·i, i < 8 (on 26aa9ff5's code) | 8/8 passed (69 passed, 2 skipped each) |

**After 10b48fb3:** 36bb44ec (tests only: R1-11's table row of small numbers is an area-000 twin, `Line 000 02 1500`,
never an issued SSN area; critic round 2) and c9641eda, the merge of claude/build-platform f7d609cc (#110) with no
conflict: four files both sides changed (`docs/product/reconciliation-001.md`, `docs/product/test-matrix.md`,
`packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`), every added line of each side kept once.

| Command (on c9641eda) | Result |
| --- | --- |
| `pnpm typecheck` | passed |
| `pnpm lint` | passed, 1,834 files, 0 errors |
| `pnpm lint:logs` | ok |
| `pnpm lint:copy` | ok |
| `pnpm check:fixtures` | 342 guard files, 4,165 searched, ok |
| touched tests (vitest) | 47 files, 1,672 passed |
| `pnpm --filter @tp/model-gateway eval` | gate passed |
| `pnpm install --frozen-lockfile`, `watched.ts --write`, `pnpm synth --all` | wrote nothing; git status empty |

`pnpm test:db`, `test:golden`, `test:oracle`, `test:e2e` and `pnpm build` were not rerun locally on c9641eda: the
merge brings #110's files as the base has them and touches this branch's files only in the four shared documents above;
CI ran them on the head (above).

**The head, d333d70d,** merges claude/build-platform 0f4a5ed5 (#125, Cognito's code emails) with no conflict: both sides
changed only the three shared documents (`test-matrix.md`, synth `matrix.ts` and `registry.ts`), every added line of each
side kept once. On it the generators wrote nothing (synth 317 cases; `watched-paths.txt` 575 lines), and typecheck (23
projects), `check:fixtures` and the synth tests (192) pass. Each push went through the pre-push hook (the fixture check
and gitleaks).

## Reviewer agents' findings

Agents that ran (workflow wf_58fc6224-3b6): a security reviewer and a correctness reviewer (with the redaction oracle)
on the build (9c9b1768, 77f5f1c8, 88aaa649); one skeptic per finding, which tried to refute it (11 confirmed, 1
refuted: corr-ssn-5); two check rounds that fixed the confirmed code findings, most failing first (corr-ssn-3, a guard that already existed, got tests shown real by mutant M4, which critic round 2 accepted; corr-ssn-6 corrected a record outside the repository, no commit; corr-ssn-2's fail-first count test came in check round 2, bf12d736 and 10b48fb3); and two critics, one after each
check round. The payment-engine and EDI reviewers did not run: the change touches no money, pricing, ledger, tenancy or
parsing code (stryker's affected list is empty). The UX and brand reviewer did not run: nothing a person sees changes
(the reader is behind its flag and its refusals reuse `identifier_left` and `more_than_one_patient`), so there are no
screenshots.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Security (SEC-1, blocking; skeptic: confirmed) | A labeled SSN or phone in two groups, one of five digits or more (`Phone: 202-5550123`, `SSN 90012-3456`), was sent: the scan's five-digit-group exception ignored the label. | Fixed in 9c0a90fd: a labeled chain runs over any number of groups and is refused at 9 or 10 digits (or 11 starting 1), the five-digit exception off under the label; 27 new refusal rows failed on 88aaa649, 9 keep guards pass on both. ADR 0054 in d51286e8. |
| Security (SEC-2, major; confirmed) | Four or more spaces or tabs between groups (`Tel 202    555    0123`) got past the patterns and the scan. | Fixed in 881a3fd6: the scan's white space is up to 16 spaces or tabs, or one line break with up to 16 on each side; 5 tests failed on the previous commit (three SEC-2 rows and two MOD-15 properties); column-aligned service lines and ZIP+4 rows still sent. |
| Security (SEC-3, major; confirmed) | A form feed, a vertical tab or U+1680 between groups (`SSN 900<FF>12<FF>3456`) was neither gap nor break, so the number was sent. | Fixed in 93ce734c: `\f` and `\v` are line breaks in the patterns, the wrapped-match rule and the scan; U+1680 is a blank; 19 tests failed on the previous commit. |
| Security (SEC-4, major; confirmed) | An SSN or phone in five or more groups (`SSN 9 0 0 1 2 3 4 5 6`, `phone 20 25 55 01 23`) was sent: the scan summed four groups at most. | Fixed in 9c0a90fd (the labeled chain over any number of groups). The unlabeled case is a recorded residual in ADR 0054. |
| Security (SEC-5, minor; confirmed) | `SSN 900.12 3456` was sent: R1a stopped the pattern and the amount `900.12` was a scan barrier. | Fixed in 9c0a90fd: under an SSN or phone label an unsigned amount is no barrier; refused now. |
| Security (SEC-6, minor; confirmed) | Dash-, slash- and comma-like marks NFKC keeps (U+30FC, U+2053, U+02C9, U+2215, U+2044, U+3001) and U+2800 let a shaped number through. | Fixed in 7029ae14: added to the scan's joiners; U+2800 is a blank; 7 tests failed on the previous commit. |
| Correctness (corr-ssn-1, major; confirmed) | The same as SEC-1 and SEC-4 from the correctness side: 3-7, 6-4, 3-6, 5-4 and five-plus groups after a label were sent and not refused, and ADR 0054 did not list them. | Fixed in 9c0a90fd; the unlabeled remainder recorded as a residual in d51286e8. |
| Correctness (corr-ssn-2, minor; confirmed) | Still linear, but 10 to 30 times slower than base on a digit and a bare line break repeated; no time row covered that shape. | Fixed in a79d731a: a letter with no invisible run is read once by the patterns and the scan; ASCII `digitAcross` with no regex; new 100 kB rows (`5`+line break, `1`+CRLF, `5-`+line break). A deterministic fail-first test in bf12d736 (count of regex runs; fails with the fix taken out: 1,150 against 1,176), its float literal replaced in 10b48fb3. |
| Correctness (corr-ssn-3, minor; confirmed) | No test covered R1b's currency guard on shaped matches: removing it left all tests passing. | Fixed in 5cd823b4 (tests only): rows K-c1 to K-c5 and a currency-prefixed spaced amount in MOD-16's generator. The guard already existed, so no fix fails first; mutant M4 (the guard removed) fails 6 tests. Critic round 2 accepted the mutant run as its proof. |
| Correctness (corr-ssn-4, minor; confirmed) | `Tax identification number 900123457` (the IRS's wording) became `[SSN]`, over-redacting a TIN. | Fixed in 6b1a5060: KEEP_NOUN and the TIN check read `TAX ID` or `TAX IDENTIFICATION`; R5-15a, R5-15b and the MOD-16 kept-letter property failed on the previous commit. |
| Correctness (corr-ssn-5, minor; skeptic: **refuted**) | Grouped keep-noun numbers (`ICN 2026 110 123 456`, `Check 0001 2345 67`) are refused by the scan. | Not a defect: it is the rule as designed and recorded. R7.1 bars only bare runs R5 keeps; design 14 risk 7 and 15.12 accept that an unusual table refuses and goes by hand, never leaks; ADR 0054's scan paragraph states it; unbroken forms (`ICN 2026110123456`) are sent; the proposed barrier would weaken the scan's independence from R5 and trade a safe refusal for a possible leak. No change. |
| Correctness (corr-ssn-6, nit; confirmed) | The build report said every new test failed first; about 90 keep and own-identifier rows pass on base by design. | Not a code defect: the build report's record was corrected (outside the repository) to name those guard rows and cite the mutant runs (keep-noun off fails 18, NPI Luhn off 4, scan off 16, R6b off 1, R10b off 2, wrappedAcross off 1, prefix-1 boundary off 1) as their proof. No commit. |
| Check round 1's seed sweep | A date glued to a word after an amount (`Billed $500-50 2020-01-01Paid $0,000.00`, MOD-16 seeds 20269024 and 20276943) was refused, a kept letter. | Fixed in 6a8cff99: the scan also reads dates with the letters blanked when a digit touches a letter; 2 tests failed without it; 12/12 seeds then passed. |
| Critic round 1 (NOT-READY), 1 | The base moved to f185655c (#121), conflicting in ADR 0054 and reconciliation-001. | Fixed in 4dc9a110: merged, both append-at-end conflicts resolved by hand, base first; the full suite rerun on the merged head. |
| Critic round 1, 2 | Dates and amounts joined by a hyphen (`Service 10/01/2026-10/15/2026.`, `Billed 150.00-120.00 allowed.`) were refused, breaking MOD-16. | Fixed in ef901af6: ranges are a scan barrier when joined to nothing else; a MOD-16 writer for six date forms and three amount forms; 19 of 481 failed before, 481 passed after. |
| Critic round 1, 3 | The second number of a list after a keep-noun (`Claim number(s) 900123456 and 900123457.`) was redacted. | Fixed in 26aa9ff5 (`decideNamed`): 6 failed / 488 passed before (the sixth is R5-36), 494 after; the cost (a person's bare number in such a list is kept) recorded as an ADR 0054 residual in 11f0ee29. |
| Critic round 1, 4 | Test twins read as real numbers (`Medicare 3456789012`, NPI and ICN twins valid as NANP phones). | Fixed in be3b35e6: `Medicare 2025550142`; NPI twin 2340178906 (Luhn-valid, exchange starting 0); ICN twin 10012345678; no other NANP-valid number outside 555-01xx in the added lines. |
| Critic round 1, 5 | Build departures 1 (the N6 oracle) and 2 (a spaced dash is white space) were recorded only in a scratch report. | Fixed in 11f0ee29: ADR 0054's "Where the build departs from the design, and why". |
| Critic round 1, 6 | corr-ssn-2 and corr-ssn-3 had no fail-first test. | corr-ssn-2: fixed in bf12d736 and 10b48fb3 (the count test). corr-ssn-3: accepted by critic round 2 on mutant M4. R5-36's fail-first was shown by a probe (the parent commit gives `[SSN]`), checked again by critic round 2. |
| Critic round 2 (NOT-READY), gap 1 (blocking) | R1-11's row `Line 001 02 1500` (expected `Line [SSN]`) used an issued SSN area. | Fixed in 36bb44ec: `Line 000 02 1500`, an area-000 twin; then the checks on c9641eda above. |
| Critic round 2, base | The base moved to f7d609cc (#110); no conflict. | Merged in c9641eda; four shared documents, both sides kept. |
| Critic round 2, non-blocking | Rows that must stay unchanged hold issued-area digits (`Row 250 10 1500.00` from design R1; two MOD-16 seed counterexamples). | Not a defect: they are amounts and table rows that must be sent as written, not SSNs, and none is redacted; the design's row and the seeds' counterexamples are kept as they reproduce. |
| Critic round 2, minor | Departure 5 (the prefix `1` must stand as a word) is implied by ADR 0054, not stated. | Not changed in the ADR: the pattern rule there ("a letter may touch a match; a digit may not") and the prefix-1 boundary test hold it; stated here: a HICN's `B1` is never read as a country prefix. |

## Freeze exception

No: it changes none of them. The engine's arithmetic, the ledger's semantics, the content pipeline and the milestones
and their gates are untouched (`tools/engine-freeze/check.ts` reports nothing let through). The redaction implements the
founder's own ruling of 2026-11-01 on PRD 14 PHI minimization, recorded in reconciliation-001 as not an exception to
its checks.

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
