# 0047. Read narratives as they show, refuse the case's identifiers, bound ledger corrections, and give them and the regulation's confirmation to the specialist

- **Status:** accepted (amends 0041 for the verifier, approval and submissions; 0042 and 0046 for who adjusts an entry
  and how far; 0044 for the packet builder's approval panel; 0045 for the monthly summary)
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
