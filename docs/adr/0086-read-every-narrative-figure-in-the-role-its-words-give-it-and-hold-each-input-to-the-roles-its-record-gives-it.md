# 0086. Read every narrative figure in the role its words give it, and hold each input to the roles its record gives it

- **Status:** proposed (`co-001/packet-day-counts`, Lane B); accepted when the founder approves its pull request
  (docs/adr/0063). Amends [0047](0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md)
  (what the verifier holds a figure to), [0054](0054-match-model-figures-whole-and-in-role-read-letters-only-through-their-reader-hold-budgets-before-calls-and-serve-only-evaluated-prompts.md)
  (the role check moves into `@tp/packets`) and [0061](0061-verify-a-deadline-only-from-signed-off-evidence-refuse-an-unverified-export-in-sql-and-attest-the-export-over-its-hashes.md)
  (the tp-packet/2 facts); reverses none of their rulings.
- **Date:** 2026-10-28
- **Deciders:** the build (Lane B), on product observation (b) of the test-flakes item; the founder, on the pull
  request's review
- **PRD sections:** 12 (The packet: "any figure that is not in the input fails verification"), 14
  (draftPacketNarrative: "every number, date, code and count in the text must match the inputs exactly"), 7 (Packet
  builder: the narrative editor), 18 (Mutation testing); CLAUDE.md rule 1; test matrix CAS-08, CAS-43 and CAS-44

## Context

The packet narrative verifier is what stops a wrong fact reaching a payer. Product observation (b) reported that
`facts.ts` sent the contract window's quote to the facts as day counts with the scanner's own kinds, so a five-digit
number in the quote went to the procedure codes: a narrative's "10000 visits" passed when the window said 10000 days.

The cause was general. The scanner (`scan.ts`) types a figure by its shape alone: five digits are a code, two decimals
an amount, anything else with digits a number. The facts were sets by kind: `numbers` held every count, units, page,
version, release, dispute level, interest day count and every date's year; every quoted text (the clause, the title,
the statute, the regulation, the practice, payer and plan as printed, the window's quote) went into the sets of its
figures' kinds. The check (`verifier/mismatches.ts`) compared value and kind only, with two patches: the window's days
only before "days", its page only after "page", and a five-digit code allowed to match any number. So a value passed
in any role the narrative gave it, and a quoted text's figure passed in any role at all.

Probed with SYNTHETIC narratives on 0dd1ba7 (the design's `pdc-probe1.txt` and the review's `rev-probe1.txt` and
`rev-probe2.txt`): 42 of 62 first probes passed wrongly, among them a year as a count of claims, a release as units,
the citation's page as a code, the allowed amount as the shortfall, a service date as the payment date, the payer's
paid amount as its allowed amount, the days to pay as the dispute window, and a clause's "level 2 appeal" and "4
claims" as the record's. The gateway's role check (ADR 0054, `functions/narrative-roles.ts`) caught some count and
amount swaps, but only on a model's draft before it was stored: never on a person's narrative, in the editor, when a
version is written or at export.

## Decision

**One reader of roles, `packages/packets/src/roles.ts`.** `readFigures(text)` reads every figure the scanner finds
with the roles its own words give it, from a token stream of words, figures and edges (a comma, a colon, a semicolon,
a sentence's end). The roles are a closed list, `FIGURE_ROLES`:

- numbers: the dispute window's days, the days a payer has to pay, the days a payment was late (with the days unpaid),
  the citation's page, the window's page, the contract's version, a rule release, the dispute level, the counts of
  lines, claims, patients and units, each line's units, and a row, a claim or a patient of the schedule;
- amounts: expected, allowed, paid, the shortfall, interest, the patient's share, and a step of a line's calculation;
- percentages: the contract's percentage and the interest rate;
- dates, months, days of a month and years: a date of service, of payment, of receipt, the due date, the dispute
  deadline, the contract's effective date, the packet's date, and the fee schedule's year.

A number's role comes from a label before it ("page 2", "version 1", "release 900001", "level 2", "97110 x 2", "Units
billed: 2", "line 2", "claims 1 through 3"), the words after it ("3650 days", "a second-level appeal", "3 claims", "3
97110 lines", "2-unit line", the ordinal "the third claim", the partitive "2 of the 3 claims"), a list after a label
("pages 1 and 2"), or the words that make it a year (a whole number from 1900 to 2199 after "in", "during", "for", a
possessive, "its", CY, FY or "year", before a year's noun such as "fee schedule" or "rates", and after "the" before a
count's noun). Which day count, which page and whether units are each line's comes from cue words in the clause
around it; with none, any of them. A number with no role has none. An amount, percentage or date takes every role a
cue names since the figure before it in its sentence and the role of the noun right after it ("the $30.00
difference"); with no cue, any role of its kind. A five-digit figure is a code unless its words make it a number;
before a count's noun after an article or a preposition ("the 97110 lines") it may be either. Two decimals without a
dollar sign before a count's noun or "days" are a number ("1.25 units"). "first" with no role is prose, as "one" is.

**Facts by role, `facts.ts`.** `NarrativeFacts` holds each value an input holds, by kind, with the roles its record
gives it (`roles`), through one adder that names a role, so no value enters without one. A date's month, day of the
month and year carry its role. The contract window's days are the window's days and its page the window's page; the
interest's day counts are its own; the citation's page is the citation's.

**A quoted text is never an input of a role** (the review's blocking finding B1). Every quoted text is kept as its
tokens (`quotes`). A narrative figure that is not held in its role passes only as a repetition of a quoted figure with
the words around it (`quotedHolds`): a figure in no role beside the word before it when that word means something
("Section 4", "GROUP 77"), or with two of its words one of which means something, or with the quote's clause reached on
one side and a word matched on the other; a figure in a role only with four of its words or more, the word after it
among them unless the quote's clause ends there, or with a whole quoted clause. So "A level 2 appeal is raised within
90 days" may be repeated, and "This is a level 2 appeal" fails when the dispute is at level 1. Procedure codes and
modifiers the clause or the regulation's statement names are codes; identifiers any quoted text holds are compared
whole, as before.

**The check asks one question** (`verifier/mismatches.ts`): does the input hold this value of this kind in a role its
words give it? A day count in business or working days passes only where the record counts business days (a
prompt-pay rule's `day_basis`). The `DAYS_AFTER` and `PAGE_BEFORE` patches and the five-digit rule are gone; the reader
owns context.

**The report does not change.** The format stays `tp-packet-verifier/2`, with its eight codes and kinds; a role
failure is `figure_not_in_input` with the figure's kind (a five-digit figure that may be a code reports `code`). The
database checks all three; changing the format is a migration, Lane A's alone (see Consequences). The export job runs
the verifier again over what it prints (`apps/worker/src/packets/export.ts`), so a stored version an older reading
passed and this one fails is refused there (`verifier_failed`), and nothing wrong reaches a payer.

**One reading serves every screen.** `checkedFigures()` (the package root) and `checkFigures()` (`@tp/packets/check`,
browser-safe) return each figure with the roles it was read in, whether it passed and, when it failed, the roles its
value is held in. The narrative editor says what a failing figure was read as ("read as a count of claims"), worded
from `FIGURE_ROLES` (`apps/web/src/lib/packets/view.ts` `ROLE_TEXT`, which TypeScript holds complete). The gateway's
`roleMismatches()` keeps its API and reads the same facts: a failed figure whose value is held in another role is
`figure_in_wrong_role`, so a model's swap reads as misstated.

**The reader's words are their own module and built on each read** (`roles-words.ts` `vocabulary()`), not when the
module loads, so each word is a mutant only the tests that read it run (a value built at load is a static mutant
every test reruns: 1,570 of the reader's first 1,988). The reading and its words are mutated in two shards of their own
(`packets-roles`, `packets-words`): in one they took 33 minutes on 4 shared CPUs, over the job's 30.

## Alternatives considered

- **A narrower patch:** send the window quote's numbers to the day counts. It fixes the reported "10000 visits" alone
  and leaves every other row of the probes.
- **Quoted figures keep the roles their own words give them** (the design's first reading). Rejected in review (B1): a
  clause's "level 2 appeal", "90 days", "page 9", "12 units" and "4 claims" then pass as the record's level, days late,
  citation page, units and claims, the reported defect again by another path.
- **Nearest cue only** for amounts and dates (the gateway's rule of ADR 0054). Rejected in review (B2): "The payer paid
  nothing toward the $30.00 difference" and "The payer paid for these services on April 8, 2026" fail. Every cue in
  the window, and the noun after, keeps them.
- **Slots** (ADR 0054, Alternatives) remain the stronger step for a model's draft. They do not replace this check: a
  person edits the text, and the payer reads text.
- **Bumping the report format to `tp-packet-verifier/3` now.** It needs `packet_verifier_report_valid` to accept it and
  `packet_version_current_verifier` to require it: a migration (CO-02). Deferred to Lane A; until then the export's
  re-verification is the guard, and before launch no real version exists.

## Consequences

- A narrative states each figure with the words of its role ("3 claims", "6 units", "page 2", "3650 days", "release
  900001"). A bare number fails unless a quoted text holds it with the same words; "twice", "half" and every ordinal
  but "first" with no noun fail. "The payer paid $70.00" fails where $70.00 is the allowed amount and $56.00 was paid.
  "within 3650 business days" fails for a calendar-day window. "It is a 3650-day window" now passes.
- The design's and the review's probes (168), the hand-written forms of CAS-44 (134, none drawn from the drafting
  templates), the 300 MOD-03 reference narratives, the code-built draft of every generated pattern and the CAS-08
  fixture are each as designed; CAS-43's 85 misstatements each fail at their figure.
- The gateway's swap faults (`eval/gate.golden.test.ts`) now fail the packets verifier too
  (`figure_not_in_input` beside `figure_in_wrong_role`).
- What it does not do: amount, percentage and date roles rest on cue words, so a narrative can still place a cue the
  input does not contradict; a quoted figure is repeated only as its text writes it ("Section 422.214 of 42 CFR" does
  not repeat "42 CFR 422.214"); a five-digit input code before a noun after an article reads as the code.
- Lane A: one migration to accept `tp-packet-verifier/3` and make it current, then a one-line `VERIFIER_FORMAT`
  change, so a version the older reading passed reads `verifier_outdated` before export rather than at it.

## Revisit when

- A real model's drafts (ADR 0051's evaluation) or people's narratives show a role form the reader does not know: add
  its words to the reader and a named example to CAS-44, never a looser rule.
- The verifier format moves to `/3` (Lane A's migration).
