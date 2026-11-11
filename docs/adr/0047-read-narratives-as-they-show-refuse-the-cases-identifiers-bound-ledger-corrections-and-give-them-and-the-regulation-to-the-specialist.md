# 0047. Read narratives as they show, refuse the case's identifiers, bound ledger corrections, and give them and the regulation's confirmation to the specialist

- **Status:** accepted (amends 0041 for the verifier, approval and submissions; 0042 and 0046 for who adjusts an entry
  and how far; 0044 for the packet builder's approval panel; 0045 for the monthly summary); amended 2026-10-28 by
  [0086](0086-read-every-narrative-figure-in-the-role-its-words-give-it-and-hold-each-input-to-the-roles-its-record-gives-it.md): each figure held to the role its words give it ("Amendment (`co-001/packet-day-counts`, 2026-10-28)", below)
- **Date:** 2026-10-27
- **Deciders:** founder (engineering)
- **PRD sections:** 2 (step 5), 6 (Submissions and payer responses), 12 (The packet, Approval, Submission, response
  and follow-up), 13 (Entries), 16 (Encryption), 18 (Mutation testing); CLAUDE.md rules 1 and 4; test matrix CAS-08,
  CAS-10, CAS-11, CAS-12, CAS-13, CAS-14, LED-04, LED-07; ADRs 0028, 0041, 0042, 0044, 0045, 0046

## Context

A review of milestones 8 and 9 found:

1. The verifier read figures with ASCII `\d`: a figure in fullwidth, superscript or mathematical digits, in another
   script's digits, or split by a zero-width space or a soft hyphen was never read, so never checked, and such
   narratives were stored as passing, approved and exported.
2. It caught no identifier without a digit: a patient's name or a letters-only member ID passed.
3. Counts, ordinals and multiples in words outside its list (a dozen, the fifth, twice, half, a level IV appeal, ½)
   were not figures.
4. Nothing in Postgres bounded a ledger entry's amount but the row cap of ADR 0046: an adjustment could take a line's
   recovered to a million dollars, a correction could net a row below zero, and a line could be posted past its
   approval. Any billing manager could adjust, where PRD 13 gives the correction to "a specialist".
5. No route let a contract specialist confirm the Medicare Advantage regulation, which the database requires before
   such a packet is approved: every Medicare Advantage packet dead-ended.
6. A submission could be logged for a version an edit had replaced.
7. Five encrypted free-text columns had no `enc:v1` CHECK; an export's keys could name another tenant's key space.
8. No report showed the single-user approval gap, and nothing reminded anyone when a follow-up came.

## Decision

**A narrative is read as it shows (`@tp/packets` `readableText`).** Each grapheme cluster is put in its NFKC form
before the scanner reads it, so compatibility digits read as the digits they show, a vulgar fraction as digits around
a fraction slash. A hidden character (controls other than tab and line breaks, format characters, private-use,
surrogate and unassigned code points, line and paragraph separators, every default-ignorable code point, and a
combining mark on anything but a letter) is a `hidden_character` mismatch and is left out of the scanned text, so the
digits around it are read as the figure they show. A number character that is not 0 to 9 after NFKC is an
`unreadable_figure`. `writePacketVersion` stores the narrative in NFKC, so the stored text, the positions and the
export are the same characters; the browser's check maps positions back to what the person typed.

**The case's own identifiers fail a narrative (`identifier_in_narrative`).** When a version is written, the worker
reads the schedule rows' patient and insured names, member IDs and claim numbers from the canonical records (an
audited read, `packet_verification`), and the verifier fails every whole-word occurrence of any of them, or of a word
of a name, of two letters or digits or more, without regard to case, outside placeholders, citation markers and
dates (a month's name in a date is the date). The report holds positions only. The browser never holds identifiers,
so its live check cannot say so; the stored result can, and it alone gates approval.

**More figures in words.** dozen and score multiply like hundred; ordinal words (first to twentieth, the tens,
hundredth, thousandth, millionth) are the numbers they order; a capitalized month with an ordinal day is a day of a
month (or a date with its year); half, twice and thrice are 0.5, 2 and 3; a Roman numeral after level, appeal or
tier is its number; a fraction in digits is an identifier, allowed only where a quoted text holds it. Each must be
among the inputs like any other figure.

**The verifier's format is `tp-packet-verifier/2`,** and the database approves only a version whose report is in it
(`packet_version_current_verifier`), so a version an earlier verifier passed is written again; the approval panel
says so (`verifier_outdated`).

**Ledger corrections are a specialist's, and bounded.** PRD 13 gives `adjusted` to "a specialist"; the only specialist
persona who reaches a practice is the contract specialist, under a support grant (ADR 0028). The new permission
`ledger.adjust` is theirs alone (the reviewer is denied it as a write), checked by the route, `adjustEntry` and
`ledger_entry_rules`; a billing manager no longer adjusts. Postgres holds, for every role: a row's entries, corrections
included, net between zero and the row's amount (`ledger_entry_within_evidence`); a line's posted, and its deposited,
never exceed its approved, corrections included (`ledger_entry_within_line`); and an adjustment keeps its entry's net
between zero and its evidence (the row's amount for a posting or deposit, the entry's own amount otherwise), so it
only ever corrects downward what a remittance, a response or a PLB evidenced, and moves a posting between the lines of
its row. A reversed match is undone latest first, its adjustments before their entries, so it never nets below zero
on the way. The specialist's stage events are the ledger's moves only (`line_status_set_by_case_workers`).

**The specialist's two pages.** `/p/<practice>/abstraction/regulations` lists each current, unapproved version citing
the regulation and confirms it in the specialist's name (`confirmRegulation`: a practice they reach and the platform
permission `pricing.answer`, as `rate_record.approve` is checked; audited). `/p/<practice>/abstraction/ledger` shows
the ledger's totals, the shortfalls and the entries, without codes, dates of service or reasons, each standing entry
with its correction. The console's specialist queue counts the regulations to confirm per practice. The packet
builder shows who confirmed it and when.

**Submissions send the current version,** or a version an edit replaced only when it was sent before the edit (its
date before the next version's), in `submission_belongs` and `logSubmission`. `packet_version_matches_case` is not
required: a window that closes after the packet went out writes off a line, and the submission that was sent must
still be logged.

**Encryption and keys.** `ledger_match.reversal_reason`, `ledger_entry.reason`, `line_status.reason`,
`case_line.written_off_text` and `case_line.reopen_reason` get the `enc:v1` CHECK every other encrypted column has, and
the catalog test now fails any `ENCRYPTED_COLUMNS` column without one. An export's keys lie under
`practices/<its practice>/packets/<its packet>/` (a CHECK).

**The gap and the reminders.** The monthly summary stores, prints and lists (CSV: the count) every packet of the
practice approved alone, as of the day generated. The daily monitor tells a case's owner (or the practice's people)
once in the app when a submission's follow-up date has come with no response (`follow_up` notifications, counts
only). The audit report is milestone 6's, checked figure by figure against its worksheet, and keeps its contents.

**Mutation testing covers the verifier's reader** (`readable.ts`, `scan.ts`, `facts.ts`, `placeholders.ts`), in
`stryker.config.mjs`'s globs and in `stryker.verifier.config.mjs`, which measures the verifier alone. Under Vitest 5 the
vitest runner reports most of these mutants as survived without running a test (a reported survivor, applied by hand,
fails the packets suite), so the verifier's configuration uses Stryker's command runner over the packets unit suite.
Run on 2026-10-16, it scored 86.17%: 1,377 of 1,598 mutants killed or timed out, against the 85% PRD 18 asks before
Monitoring v1 (the first measurement, before `facts.test.ts` and the scanner's table tests, was 70.34%).
*Amended 2026-10-22 (PR 6b-1; ADR 0064):* the cause was the vitest runner's test names, joined by spaces where Vitest 5
filters by `fullTestName` (joined by " > "), so a mutant run selected no test. `patches/@stryker-mutator__vitest-runner@10.0.0.patch`
fixes it, a canary in `.github/workflows/mutation.yml` checks it on every run, and `stryker.config.mjs`'s vitest runner
now scores the pricing engine, the ledger and the verifier; the verifier's own configuration keeps the command runner
its score above was measured with.
*Amended 2026-10-25 (`co-001/ci-mutation`; docs/adr/0066, Part 4):* `stryker.verifier.config.mjs` and
`stryker.config.mjs` are retired, and so is the patch. Stryker 10.1.1's vitest runner scores packets per package
(`stryker/packets.config.mjs`) in two of the mutation workflow's shards: `packets-scan` (`scan.ts`) and `packets-rest`.
The packets set is the verifier and what it reads (`verifier/**`, `readable.ts`, `scan.ts`, `facts.ts`, `payer.ts`,
`placeholders.ts`) and the packet's arithmetic (`interest.ts`, `calculation.ts`, `dates.ts`, `windows.ts`,
`assemble.ts`). 10.1.1 matched the command runner mutant for mutant on the scout's packets sample. On the widened set
(2,365 mutants without `windows.ts`) it scored 85.40%: 2,018 detected, 345 undetected, and 2 load failures in
`readable.ts`, which 10.0.0 counted as survivors. The `mutation` gate requires the package above 85% with every
survivor killed by a test or recorded as equivalent. With `windows.ts` and that part's tests it scores 95.87% (2,299
of 2,398 detected; 99 undetected, each a reviewed equivalent, counted as survivors; 2 load failures left out), from
85.61% (2,053 of 2,398) on the runner bump alone (ADR 0066, Part 4, "Measured").

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Strip hidden characters silently | The person would never see what was taken out, and the stored text would differ from what they wrote |
| Map other scripts' digits to 0 to 9 | Every Unicode digit block would need a table; failing them is safer and asks for digits the payer reads anyway |
| Match identifiers in the browser | It would send every patient's name to the browser with the packet; the stored result says it after a save |
| Keep adjustments with `posting.reconcile` | PRD 13 names a specialist; a billing manager reconciles postings, and an unbounded correction was the review's probe |
| Give the specialist `report.read` for the Reconciliation screen | Wider reach than the correction needs; their page shows amounts and stages only |
| Change `pricing.answer` to a practice permission | It is the specialist's platform permission, checked as `rate_record.approve` is; the route needs `rate_record.edit` |
| A deferred constraint trigger for the line bound | Errors at commit lose the form's message; the reconcile writes approvals before postings, so a row trigger holds |
| Show the gap in the audit report | Its contents are checked against the independent worksheet line for line; the monthly summary is the recurring report |
| Switch `stryker.config.mjs` to the command runner | Every pricing and ledger mutant would run every test of the three packages; that runner's report on them is not this change's to judge |

## Consequences

`packages/packets` has property tests over digit alphabets, hidden characters and identifiers; the worker's packets
and ledger database tests run the review's probes; the generated route tests cover the four new routes (the route-test
world seeds a Medicare Advantage case waiting for confirmation). Versions written before this change cannot be
approved until written again. A name equal to a common word (a patient named May) fails a narrative that uses the
word outside a date; the person rephrases. The 221 surviving mutants are mostly the scanner's regular expressions
(quantifiers and lookarounds no narrative of the tests tells apart) and fact sources that repeat another source's value
(a pattern's first service date is a line's). Whether `stryker.config.mjs`'s vitest runner scores the pricing engine and
the ledger truly under Vitest 5 is not checked here (*settled 2026-10-25*, docs/adr/0066, Part 4: Stryker 10.1.1, whose
canary proves it in every shard). The time log the ROI statement's pursuit hours need is scheduled by no
milestone of the plan: it stays an open decision, and pursuit hours stay zero, stated on the statement. The e2e worker
runs the monitoring chain's planning step for the recovery journey's practice too, so J10's remittances reach the ledger
through the chain's own monitor, price, triage and reconcile in the browser journey (the spec starts the monitor job a
parse queued without its batch wait), not only in `chain.db.test.ts`. The queue's regulations column first joined
each practice's versions to every practice's packets in its all-practices scope; measured at 600 synthetic practices it
took 405 seconds, and the generated route tests timed out on it. `20261028090000_specialist_queue_by_practice.sql`
counts it from the practice's own packets and their current versions instead (about a second, the same counts).

## Revisit when

A payer's narrative needs a script other than Latin digits; a practice asks a billing manager to correct amounts; the
model gateway drafts narratives (milestone 10), whose verifier is this one.

## Amendment (`co-001/packet-day-counts`, 2026-10-28): each figure in its role

The verifier still reads the narrative as it shows (this ADR), and now holds each figure to the role its own words give
it, not to its kind alone ([0086](0086-read-every-narrative-figure-in-the-role-its-words-give-it-and-hold-each-input-to-the-roles-its-record-gives-it.md)): "3650 days" is the dispute window's days, "page 2" the citation's page, "3 claims" the
claim count, "the payer allowed $70.00" the allowed amount, and a value the inputs hold in another role fails
(`figure_not_in_input`, with the figure's kind). Each figure takes one cue's role, never the union of every cue in its
clause, so "Under the contract, the payer allowed $100.00" fails where the payer allowed $70.00; a total stated per
line fails, and a line's value stated as a total; an amount with no scope phrase beside it, or in a sentence that names a
part of the lines, fails where its role's per-line and total values differ, and a "respectively" list outside its two
plain forms fails at every figure (ADR 0086's closed rules, 2026-11-04, rule 1 as amended). A quoted text's figure is repeated only with its own words, in the
role the quote's own words give it, its clause ending where the quote's does; never in a role of the record's. A
letter of another script inside a Latin word is a `hidden_character` (it would hide a cue). The report's format, codes
and kinds are unchanged (`tp-packet-verifier/2`); the export's re-verification refuses a stored version an older
reading passed. Test matrix CAS-43 and CAS-44 (each reproduction of the review of 2026-11-01 a named example).

## Amendment (`co-001/packets-verifier-identifier-fold`, 2026-11-11): the case's identifiers in every form redaction reads

The Decision above fails "every whole-word occurrence" of an identifier, "without regard to case". That reading passed
a narrative that wrote `Zoe` for ZOË, `O’Quill` (a keyboard's apostrophe) for O'QUILL, `Treeby` for VAN-TREEBY, `Jo Ann`
for JOANN, or a letters-only member ID with a space in it: the forms a person typing in the editor produces without
meaning to. The letter reader's redaction has read each of them since its one-pass matcher
([0054](0054-match-model-figures-whole-and-in-role-read-letters-only-through-their-reader-hold-budgets-before-calls-and-serve-only-evaluated-prompts.md),
amendments of 2026-10-27 and 2026-11-04). A digit-bearing identifier written with joiners (`ZZ-123-4567`) failed
already, but as a figure the inputs do not hold, not as an identifier.

**The server's reading is now two readings joined, and it never finds less than the whole-word reading did**
(`packages/packets/src/verifier/identifiers.ts`):

1. the whole-word reading above, unchanged;
2. the reading the letter reader's matcher has of a name or a number, `@tp/redact` `nameOrNumberMatches`: the same
   matcher and the same subject as the narrative drafter's check of its facts (`holdsNameOrNumber`; ADR 0054,
   amendment of 2026-11-11), asked where. A test holds the two to one answer, so neither comes to read a form the
   other does not, but for one thing the verifier leaves the drafter's check on purpose: a part of a name's word
   under four letters by itself (below).

Overlapping spans are joined into one. The report holds positions only, as before, and its format is unchanged
(`tp-packet-verifier/2`, and /3 as [0089](0089-write-a-narratives-figures-as-fact-tokens-rendered-by-code-refuse-every-free-figure-and-read-english-only-for-contradiction.md) left it: `verifier/template.ts` takes the same reading).

**What the matcher's reading adds**, each as redaction reads it:

- a name with its marks, case, apostrophes and dashes written any way (`Zoe`, `STRAUSS` for Strauß, `O’Quill`, `OQuill`,
  `Van–Treeby`, `Van Treeby`), a part of it of four letters or more alone (`Treeby`), a part hyphenated at the end of a
  line, and a part in capitalized pieces (`Jo Ann`);
- a member ID or claim number with its characters joined any way (`ZZ-123-4567`, `ZZ 1234567`, `SYN.CCN.0001`), glued
  to a label (`ICNSYNCCN0001`), and its digits written as a calendar date after a label that says they are the number
  (`Claim 2026-03-05` for 20260305).

No Social Security or phone number is read by its pattern (ADR 0054, amendment of 2026-11-04, Scope): every digit of a
narrative is a figure the inputs must hold, and a payer's phone number quoted from a contract is one of them.

**A part of a name's word fails a narrative by itself only from four letters** (`SHORTEST_PART`; a part is what a
dash, an apostrophe, a period or an underscore sets off inside a word). The letter reader's redaction takes every part
of two letters or more, which costs a letter a word or two. A narrative it would cost everything: "in" is a part of
HYE-IN, "to" of TO-UYEN, "the" of THE-ANH and "van" of VAN-TREEBY, and the code's own draft uses each (the second
design review's finding: one such name failed every draft, and the gateway already refuses to draft for it, so no
packet could be approved). Four is the letter path's own floor for a part read by itself (`ownIdentifierGlued`). The
whole name, each whole word of it (as the whole-word reading splits words) and each number still count at any length
and in every form: `Hye-In`, `hye in` and `HyeIn` fail, and so does `Zoe` for ZOË.

**Which of the matcher's matches are kept.** The whole-word reading skips placeholders, citation markers and dated
figures as it always has. Of the matcher's:

- none that touches a token (an identifier placeholder, a citation marker, and at format /3 a fact token or stray
  braces): nothing there is the narrative's own words;
- one that overlaps a dated figure only when it holds the whole figure. A month's name in a date is the date, as
  above, and so is a part of a date (`2026` or `03-05` inside `2026-03-05`). The matcher reads a whole written date as
  a number of the case only after a label that says so, so `Claim 2026-03-05` fails for 20260305.

**An identifier written across a token is read too** (the first design review's finding: `Quar[1]rington` passed). A
letter holds no token, so the matcher alone never reads across one. The reading takes the matcher over the text a
second time with each token as one invisible character, which redaction reads across, and keeps from it only a match
that holds a token, under the same rule for dated figures; its span holds the token. The words around a token
are otherwise read as written: a label is no number's label through a placeholder (`Member ID {{member_id:1}}
2026-03-05` is a date).

**The caller says which identifiers are names and which are numbers** (`CaseIdentifiers`, required by
`verifyNarrative`, `verifyTemplate` and `verifyAtFormat`; a flat list no longer type-checks). The two are read
differently: a space joins a number's characters anywhere, a name's only between capitalized pieces, so a patient
named INA is not "in a". Every caller knows: the worker reads each from its own column (`ScheduleIdentifiers.numbers`
beside `names`) and gives the gateway's drafter both lists (`NarrativeInput.numbers` beside `names`), so a draft is
verified with the split its version will be written with. A value in both lists is read both ways. Only a caller with
no records (an evaluation case) leaves the lists out, and `identifierKinds` then reads a value with no digit as a name.

**The matcher never reaches the browser, and the browser's check has no identifier to read for.**
`verifier/mismatches.ts` and `verifier/template.ts` take the reading as a function; `check.ts` passes
`readsNoIdentifier`; only the server's entry (`verifier/index.ts`) imports `verifier/identifiers.ts`. A test loads the
browser's module with the matcher and the server's reading made to throw on load, and another bundles it for a
browser and reads the bundle's inputs (the worker's `browser-check-bundle.test.ts`).

### Alternatives considered

- *Import the gateway from packets.* The gateway imports packets, so it would be a cycle, and the gateway's entry
  brings the provider SDKs, the database and a file reader into the verifier's closure and the browser's bundle.
- *A second matcher in packets, held to the gateway's by a test.* Drift is the defect; two implementations only make
  it a test's job to notice.
- *The matcher's reading alone, without the whole-word reading.* It would lose what the whole-word reading alone
  catches (each `/`, `;`, `,` or space-separated piece of a number by itself), and "nothing caught before is lost"
  would rest on argument instead of construction.
- *Guess which values are names* (no digit means a name, as the gateway's fallback does when it is not told). Every
  caller knows, so the verifier does not guess.
- *Each token masked so nothing matches across it* (as the gateway masks its own placeholders). That is the first
  reading; alone it passes `Quar[1]rington`.
- *Every part of a name from two letters, as a letter's redaction takes them.* See above: it leaves a patient named
  Hye-In no narrative that passes. *A list of common words, or a rule on capitals* ("in" is the word, "In" the name)
  was not taken either: a sentence starts with a capital, and a list is a second place to keep right. A length is the
  matcher's own rule, already written down.

### Consequences

- **A stored pass can fail now.** The steps that count a stored pass (a request for approval, an approval, the export)
  run the verifier again with today's identifiers (ADR 0086), so a version whose narrative holds an identifier in one of
  these forms is refused there (`fails_now`), until it is written again without it. Screens read for no identifier, as
  before, and say "passed" until a step refuses.
- **A number is read through its joiners wherever it is written**: `12-34` is patient control number 1234, and `SYN-1`
  is member ID SYN1 even where a fact holds `SYN-1`. An identifier written exactly as a held figure already failed
  (a claim number 97110, `$300.00` for 300); this is the same rule for joined forms, and short numeric identifiers make
  it likelier. The person rephrases.
- Not read, as before: a name glued to other letters (`DearQuarrington`), a nickname, and what the matcher itself does
  not read (ADR 0054's amendment of this date lists it: a name's letters split by a character that joins no name, such
  as `Quar*rington` or `Quar[x]rington`, where `[x]` is prose and no citation marker). The verifier reads across its
  own tokens only, since a letter has none; every other separator is the matcher's to define, once, for letters and
  narratives alike. A look-alike letter inside a name fails as a `hidden_character`, and a name glued to digits as a
  figure. The check is for what a person or a keyboard writes without meaning to; a second person approves every
  packet, and reads the narrative.
- **A name that is, or folds to, a word of the narrative still fails it, at any length**: a patient named To or The
  did before this change, and one named Thế or Tô does now, since the mark is folded; so does a part of four letters
  or more that is a word (`page` for PAGE-SMITH). This is the Consequences' "patient named May" case, and for "to" and
  "the" no rephrasing avoids the word. It is not new with this change except for names with marks, and it is recorded
  for a ruling of its own (the build's queue): the fold does not decide it.
- The matcher's reading reads only the identifiers the text can hold (it first looks for each one's letters and
  digits in the text's), so it adds about 20 ms for a case of 10,000 identifiers that the narrative holds none of
  (measured on the build's machine). The whole-word reading's own cost at that size, a pattern compiled for each form
  (about 3 s on a case's first check), is as it was. A screen's check, with no identifier, runs neither.
- Test matrix MOD-19 (every written form fails; the generator of the forms is the oracle) and MOD-20 (what a narrative
  is meant to say is never read as an identifier; the verifier against the two readings it is made of).
