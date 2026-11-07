# 0086. Read every narrative figure in the role its words give it, and hold each input to the roles its record gives it

- **Status:** proposed (`co-001/packet-day-counts`, Lane B); accepted when the founder approves its pull request
  (docs/adr/0063). Amends [0047](0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md)
  (what the verifier holds a figure to), [0054](0054-match-model-figures-whole-and-in-role-read-letters-only-through-their-reader-hold-budgets-before-calls-and-serve-only-evaluated-prompts.md)
  (the role check moves into `@tp/packets`) and [0061](0061-verify-a-deadline-only-from-signed-off-evidence-refuse-an-unverified-export-in-sql-and-attest-the-export-over-its-hashes.md)
  (the tp-packet/2 facts); reverses none of their rulings. Amended by
  [0089](0089-write-a-narratives-figures-as-fact-tokens-rendered-by-code-refuse-every-free-figure-and-read-english-only-for-contradiction.md)
  (format /3: a narrative's figures are fact tokens rendered by code, and this reader checks only for contradiction).
- **Date:** 2026-10-28; one cue's role per figure, quoted figures in their own role and the gateway's proof against
  the base, 2026-11-01 (the review of 2026-11-01's fix round); a stored version read again at each step and on each
  screen, and the editor's words, 2026-11-01 (the same fix round, its second part); the reader and its words split
  into layers and families, each mutated in a shard of its own, 2026-11-02 (its third part); what a figure is stated
  per and "respectively" read under three closed rules, 2026-11-04 (the converging fix of the rounds of fix and recheck);
  a scope granted only by a phrase beside the figure, and none in a sentence that names a part of the lines, 2026-11-04
  (rules 1 and 2 as amended at 11:00 UTC)
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
billed: 2", "line 2", "claims 1 through 3", "lines 1–3"), the words after it ("3650 days", "a second-level appeal", "3
claims", "3 97110 lines", "2-unit line", the ordinal "the third claim", the partitive "2 of the 3 claims"), a list after
a label ("pages 1 and 2"; across a comma alone only after a plural label or while the list goes on with "and", "or" or
"to", never "version 1, 2 of them"), or the words that make it a year (a whole number from 1900 to 2199 after "in",
"during", "for", a possessive, "its", CY, FY or "year", or before a year's noun such as "fee schedule" or "rates", which
makes it the fee schedule's year). A count's noun right after a year-shaped figure beats a year's lead: "the 2026
claims" and "these 2026 claims" are counts of claims, and "these 2026 services" a year, since "services" dates the
lines. A count's noun also beats a label that is a verb too ("We appeal 3 claims"). An ordinal before any noun that is
not a row's, or before another number, is prose ("the sixth unit", "the second appeal", "the first 3 claims"); before
a row's singular noun it is that row ("the third claim"). A partitive's part is a part of its whole, at most the whole
("2 of the 3 claims", "Of the 3 claims, 2 ...", "2 of them"). A number with no role has none. A five-digit figure is a
code unless its words make it a number; before a count's noun after an article or a preposition ("the 97110 lines") it
may be either. Two decimals without a dollar sign before a count's noun or "days" are a number ("1.25 units").

**One cue's role per figure, never the union of its clause's cues** (the review of 2026-11-01, PE-1, PE-4, CORR-4).
An amount, a percentage, a date (a month, a day of a month, a year), a day count and a page each take one cue's roles,
found in this order (`roles.ts` names each step):

1. "respectively" maps a list's figures to its cues, in order, in one of its two plain forms alone (rule 3 below); a
   list in neither plain form fails at every figure, which is read in no role (until the fix round's third part such a
   list was read in no role, which every figure passed: "These were $300.00 and $91.00, respectively" passed an
   invented $91.00; from then until the converging fix, a list was read past "respectively" and across clause edges by
   rules that each round widened or narrowed, CORR-D1 to N4 below);
2. the cue right after the figure ("the $30.00 difference", "$5.76 in interest", "9% a year", "3650 days late", "2025
   rates"), or the noun it completes with "of" ("a shortfall of $90.00");
3. the nearest cue before it in its own clause, the longer at the same end: a participle after a noun is the noun's
   ("the interest owed is"); a verb for the payer's act beats a noun for its object ("the payer paid the contract rate,
   $100.00" is what the payer paid); a copula takes its subject's cue ("the shortfall of $30.00 per line comes to
   $90.00" is the shortfall's total, CRIT-2); a cue that names two roles is narrowed by one beside it that names one;
4. for an amount, the nearest cue after it, up to the next figure or edge;
5. the cues of the clauses before it, since the figure before it: one role when they name one, and when they name
   several, every one of them, each of which must hold it ("The contract requires more than the payer paid: $56.00"
   fails);
6. past a figure of another family, the words before that figure ("the payer paid $56.00 on 2026-03-05" is a payment
   date; "the window ends 3650 days after payment, on 2036-04-05" is the deadline, since "days after payment" is the day
   count's own phrase, CRIT-3 and CRIT-4); after a figure of its own family with no cue of its own, that figure's role,
   never "any" ("the payer allowed $70.00 per line and $100.00 in total" holds $100.00 to the allowed total, CORR-6);
7. for a date or a percentage, the nearest cue after it, past a comma when it opens its sentence ("On 2036-04-05, the
   payer paid" is a payment date, CRIT-3);
8. with no cue at all, any role of its kind.

"Business days" or "working days" are days to pay alone. A page takes the window's page or the citation's from the
words around it; "clause", "quote", "section" and "cited" may be either. "first" with no role is prose, as "one" is.

**What a figure is stated per, and "respectively": three closed rules** (the converging fix of 2026-11-04). An amount
and a count of units also say what they are stated per (`scope`): each line, each unit, or the lines in total, and the
verifier holds them to the inputs' values so stated (CORR-7). Five rounds of fix and recheck (d7d587a2, 063274c8,
6b49d9ac, 9aa178c0) widened and narrowed how far a figure's scope reached (an opening "each" walked into later clauses,
a word after "respectively" did or did not open a clause of its own), and each fix opened another false pass or false
failure (NEW-N1 to N4). The session decided, by the founder's standing rule, with accuracy and AI safety first and then
maintainability: a false pass sends a wrong figure to a payer, a false failure only makes a person reword. So the reach
is replaced by this closed rule set, word for word:

1. ~~A figure's scope is read only from (a) words inside its own clause, bounded by edges (comma, semicolon, colon,
   dash, parenthesis) and by a coordinating conjunction or subordinator that opens a new clause, with the existing
   7-token cap; or (b) one sentence-opening scope phrase ("For each line,", "On each of the N lines,", "In total,",
   "For the claim,") that covers the whole sentence unless a clause states its own. No other reach: nothing from a
   trailing clause, nothing across a figure.~~ Superseded by the amended rule 1 below.
2. When the sentence's words give a figure no scope by 1, and the per-line and total values of its role differ, the
   figure fails, and its editor words say plainly: state whether this figure is per line or in total. An unscoped
   figure is never held to both values. Where per-line and total are equal, or the role has one value, it passes as
   before. (With the amendment below, "by 1" is by the amended rule 1, and its fail-closed triggers fail a figure the
   same way.)
3. "respectively" is read only in two plain forms: cues directly before the list ("The contract expected and the payer
   allowed $A and $B, respectively") or cues directly after it ("$A and $B were (the) expected and allowed (amounts),
   respectively" / "$A and $B, respectively, were the expected and allowed amounts"), where between the list and its
   cues there are only cue words, determiners, "were"/"are", "amounts", scope words given per cue, and "and"/commas; the
   cue count must equal the figure count. A per-cue scope maps in order. Any other "respectively" sentence: every
   figure of the list fails, and its editor words say: give each figure its own words instead of "respectively". Never
   a fall back to per-figure guessing or to any role.

**Rules 1 and 2 as amended** (2026-11-04 11:00 UTC; they supersede rule 1 above, word for word): a scope is granted ONLY
by a scope phrase adjacent to the figure, from a closed list: right after it ("$X per line", "$X for each line", "$X on
each of the N lines" where N is the pattern's line count, "$X a line", "$X in total", "$X in all", "$X for the claim"
only when the pattern has one claim, "$X across the N lines" with N the pattern's count) or right before it ("per line,
$X" is NOT adjacent: only "each line's $X"/"a total of $X"/"the total of $X"/"the per-line $X"-style determiner phrases
directly before). The sentence-opening phrase rule is DROPPED. Nothing in any other clause, before or after, lends a
scope. FAIL-CLOSED triggers: if the figure's sentence names any part of the lines (a count of lines other than the
pattern's count, 'remaining', 'other', 'first', 'last', 'some', 'two of', a code, a date of service, a patient, 'line
N'), an amount whose per-line and total values differ fails with needs=scope (the editor words already ask to state per
line or in total; add "for all N lines" guidance if useful). Where per-line and total are equal, scope is irrelevant and
it passes as now. The respectively rule 3 stays; its per-cue and list-wide scopes follow the same adjacency list.

Everything else the reader does (the cue each figure takes, quotes in their own role, a year's lead against a count's
noun) is unchanged. How the reader applies the rules (`roles-reader/numbers.ts` and `roles-reader/cues.ts`; the words in
`roles-words/prose.ts`):

- **The closed list of scope phrases** (`roles-reader/numbers.ts` `phraseAfter()`, `scopeAfter()`, `scopeBefore()`;
  the words in `roles-words/prose.ts`). Right after the figure (after a count of units, right after its noun): "per" or
  "a" before one line's noun ("line", "visit", "row", "service") or "unit"; "for" or "on" before "each" or "every" and
  that noun, or "of", "the" or not, the lines' count and the lines in the plural ("on each of the 3 lines"); "in total",
  "in all"; "for" or "on" before "the claim" not followed by a line's noun or written as a possessive; "across", "for"
  or "over" before at most two of "the", "all", "these", "those" and the rows in the plural with their count or after
  "all" ("across the 3 lines", "for all the lines"). Right before it: "each" or "every" before a line's or a unit's
  possessive ("each line's $70.00"), "per-line" or "per-unit" written with a hyphen ("the per-line $70.00"), and "a" or
  "the" before "total of". A count of units joined to "unit" by a hyphen before a line's noun ("a 2-unit line") is each
  line's. No dash or parenthesis stands between the figure and its phrase or inside it; a second phrase right after the
  first that states another grants none ("$70.00 in total for each line", "$70.00 per line for the 3 lines"); a phrase
  before the figure and one after it that differ grant none. Nothing else grants a scope: no opening phrase ("Per line,
  $70.00", "In total, the payer allowed"), no subject ("Each of the 3 lines was allowed"), no other clause, no phrase
  past a comma or another word ("$70.00, per line", "$70.00 after each line was reprocessed"), and no "apiece", "each",
  "total" or "altogether" alone. The count a phrase states, and "the claim", are held to the pattern's by the triggers
  below, so "across the 2 lines" of 3 and "for the claim" of 3 claims grant nothing.
- **What names a part of the lines** (the fail-closed triggers; `NumberReader.parts()`, held to the pattern by
  `verifier/mismatches.ts` `namesPart()`), read from the other side after the review of the amended rule (PE5-1,
  CORR5-1, CORR5-2): a noun of the lines names all of them only in the closed few forms that do, and any other form
  names a part. In the figure's whole sentence (a semicolon does not end it: "$300.00 in total; that is per claim"): a
  figure read as a row, a claim's or a patient's ("line 2", "claim 1", "Patient 2", "the third line"); a code or a
  modifier; a date read as a service date or in no role, and any date, month or day of a month a line's service date is
  or falls in (a year names none: "the 2026 fee schedule"); a partitive ("2 of the 3 lines", "two of them"), a number
  in no role before "of", or "one of"; an ordinal read as prose; "remaining", "other", "others", "some", "last",
  "first", "rest", and an exclusion ("excluding", "except", "excepting", "besides", "minus", and "but" before "one" or a
  figure or after the lines in the plural: "all lines but one"); a quantifier before "of" ("both", "either", "neither",
  "most", "many", "several", "few", "half", "any", "none"); a month's or a weekday's name ("early March", "the Thursday
  visit"; "May" only capitalised); one line's noun ("line", "visit", "row", "service") with any word before it but
  "each", "every" or "per", past an owner's word and a joined count ("a line", "a single line", "the earliest visit",
  "line A", "row B", "her visit", "Jane Roe's line", "the claim line", "a 2-unit line"; never "each claim line", "every
  patient's row", "each 2-unit line"), unless it is in a scope phrase beside a figure, says "in line with" or "its own
  line", is "of service" (but "date of service"), or qualifies the noun after it ("the service lines", "the line
  items"); "encounter", "session" and "appointment" whatever stands before them, and "a day", "per day" or "each day";
  the lines, claims or patients in the plural after any word but the closed few that name them all (determiners such as
  "the", "all", "these", prepositions, conjunctions, "are", "has", "covers" and the like, and "service", "visit",
  "claim", "therapy", "billed", "paid", "underpaid", "disputed", "affected", "listed", "reprocessed", "same"), unless a
  figure stands right before them or one word before them, a count the verifier holds to the pattern's ("both lines",
  "most lines", "the GP lines", "the March lines" name a part; "the 3 GP lines" of 3 does not); a claim's noun ("a
  claim", "her claim", "the claim number", "for the claim") and a patient's or a member's ("the patient", "a patient",
  "patient B", "the patient owes", "the patient's share") in any place, unless it qualifies the noun after it ("the
  claim lines", "the claim filing indicator", "the patient share", "the patient responsibility"; a possessive never
  does), a part where the pattern has more than one; and a count of lines, claims or patients the pattern does not hold
  so ("for 2 lines" of 3). Two more triggers fail a figure whose words state its scope where that scope is contradicted
  (CORR5-4, PE5-3): a scope phrase of the closed list that stands beside no figure and states another scope ("On each
  line the payer allowed $210.00 in total", "$300.00 in total; that is per line"; a "respectively" list's own words,
  and "per-visit" joined by a hyphen to its noun, are none), and, for a figure stated in total, "each", "every" or "per"
  before a claim's or a patient's noun where the pattern has more than one ("$300.00 in total per claim", "Each patient
  was allowed $210.00 in total"). Where a trigger fires, an amount or a count of units in all keeps no scope but each
  unit's (each line's units, "2 units per line" or "97110 x 2", are read per line by their own words), and it passes only
  where the inputs hold it as its words state it and with no scope too, so a trigger only ever fails a figure ("the
  patient owes ... $50.00 per line" is no line's $50.00 rate per unit): where its role's per-line and total values
  differ it fails by rule 2 with `needs` `scope`, whatever phrase is beside it; where they are one (a one-line pattern)
  it passes. The reading reports the scope it kept (`CheckedFigure.scope`). A bare "each line" elsewhere in the
  sentence ("Each line was allowed $210.00 in total", "after each line was reprocessed") is no trigger: CORR5-4's
  proposal to make it one awaits the founder's ruling.
- **A "respectively" list.** In a sentence that says "respectively", among the amounts, percentages and dates before
  it (since the "respectively" before, if any, and since the last clause an edge and a conjunction start before the
  list: "The payer paid $56.00 per line, and the contract expected ..." leaves $56.00 its own; CORR3-2),
  the run of them joined by commas, "and" or "or" alone that ends at the last; when it is in neither plain form, every
  one of them fails ("$70.00 and $100.00 per line on 2026-04-08 were ..."; PE3-3), and when it is in one, the others
  read as any other figure. After a "respectively" with none before it ("Respectively, $1.00 and $9.00 were ..."),
  those after it fail. The list's figures must be two or more, of one kind, joined by commas, "and" or "or" alone. Its cues before it: the words back from the list that are cues or the list's own (determiners, "were",
  "are", "amounts", a scope's words, "and", "or", "the payer"), with "respectively" right after the list and then an
  edge or the sentence's end. Its cues after it: the words after the list that are cues, the list's own, commas and one
  "respectively", to "respectively" when it follows the cues, else to an edge or the sentence's end, and once every
  figure has its cue, no further cue, "and", "or" or "the payer". A cue's own scope is the phrase of the closed list right
  after its words (past a participle that is its noun's, "the interest owed in total", and past "amounts"), never one
  before it or set off by a comma; the whole list's is the phrase right after the list, or right after "amounts" after
  the last cue ("the expected and allowed amounts per line"); a figure's cue's and the list's that differ state none.
- **The report.** A figure that fails by rule 2 or 3 is `figure_not_in_input` with its kind, like any other: the
  database's report check lists the codes, and a new code is a migration, Lane A's. The reading carries why (`needs`:
  `scope` or `own_words`; `verifier/mismatches.ts` `FigureNeeds`), and the editor, the builder's stored narrative and
  a refusal say it beside the figure marked (`apps/web/src/lib/packets/view.ts` `NEEDS_TEXT`: "state whether this figure
  is per line or in total right after it (“per line”, “in total”, “across all the lines”), and keep any one line, group
  of lines, code, date of service, claim or patient in a sentence of its own", "give each figure its own words instead of “respectively”"). The gateway's notice names no
  wrong role for such a figure (`functions/narrative-roles.ts`); its draft fails on the verifier's report.

Every reproduction of the rounds is a named example (`role-examples.ts` `REVIEWED`), read by the amended rule:
every false pass fails (PE-D1, PE-D2, NEW-N1's "In total ... $70.00", NEW-R2P2-1, NEW-R2P2-2, N3's totals, N4, PE3-1,
PE3-2, PE4-1, CORR3-1, CORR4-1, PE4-2); a sentence with the right figure and a scope phrase of the closed list beside it
passes (NEW-N2, PE-D3, the cue-after controls of R1-NF-3, CORR3-2's second form); every other sentence fails with the
plain instruction, `scope` for a figure with no phrase beside it or in a sentence that names a part of the lines
(NEW-N1's totals before "which", an opening "For each line," "On each of the 3 lines," or "In total," in PE-D2, NF-2,
NEW-R2P2-1, N1, N2 and N4, NF-3's phrases set off by commas, N3's "the claim line", N2's "for the claim" of 3 claims,
PE3-2's "on line 1", "Patient 2's line" and "the third line", CORR3-1's "per line for lines 1 and 2", PE4-1's fronted
and trailing clauses, CORR4-1's patients and remaining lines), and `own_words` for a list in neither plain form. The
older examples that passed with an opening phrase or a subject's scope (CORR-6, CORR-7, CORR-9, CORR-12, CORR-20,
CORR-D1, CORR-D2, the payment-engine probes L5, L12, L13 and L15, 42 of CAS-44's hand-written forms) are reworded so the
scope phrase stands beside each figure, and pass; a section of its own (the amended rule) names each adjacency form,
each non-adjacent form and each trigger. NEW-N3 is the builder's words, unchanged here.

**Facts by role, `facts.ts`.** `NarrativeFacts` holds each value an input holds, by kind, with the roles its record
gives it (`roles`), through one adder that names a role, so no value enters without one. A date's month, day of the
month and year carry its role. The contract window's days are the window's days and its page the window's page; the
interest's day counts are its own; the citation's page is the citation's. Each amount and count of units also carries
what it is stated per: a value every line of the pattern holds per line, and every line's value as some line's
(`row`, which rule 2 reads: a value only some lines hold is held per line by none, so "$150.00 per line" of line 2's
$150.00 fails where lines 1 and 3 hold $100.00; PE5-2), the pattern's and each code's in total, the contract's amount per
unit (and per line, for a per-visit rate); what the lines paid and what the patients owe are held in total too (CORR-20). The fee schedule's year is the
contract's locked year (`year_basis` `LOCKED:<year>`), or else the service dates' years (CORR-10).

**A quoted text is never an input of a role** (the review's blocking finding B1). Every quoted text is kept as its
tokens (`quotes`), with each of its figures read by the same reader. A narrative figure that is not held in its role
passes only as a repetition of a quoted figure with the words around it (`quotedHolds`), and an edge counts as matched
only where the narrative's clause and the quote's both end there: a figure in no role beside the word before it when
that word means something ("Section 4", "GROUP 77"), or with two of its words one of which means something, or with
both clauses ending on one side and a word matched on the other; a figure in a role only where the quote's own words
give it that same role, and then with four of its words or more, the word after it among them unless both clauses end
there. A figure that fills a whole quoted clause (a code list, a figure after a colon) passes in no role on that alone
(the review of 2026-11-01, PE-3, CORR-3, CORR-14). So "A level 2 appeal is raised within 90 days" may be repeated;
"This is a level 2 appeal" fails when the dispute is at level 1; a code of the clause "97014, 97545, 92508 - 12" is no
day count, page, release or count of units; and the statute's "paid within 33 days of receipt" is no dispute window.
Procedure codes and modifiers the clause or the regulation's statement names are codes; identifiers any quoted text
holds are compared whole, as before.

**The check asks one question** (`verifier/mismatches.ts`): does the input hold this value of this kind in a role its
words give it, stated per what its words say? A figure whose words name several roles at once (step 5) must be held in
every one; a partitive's part must be at most its whole. A day count in business or working days passes only where the
record counts business days (a prompt-pay rule's `day_basis`). The `DAYS_AFTER` and `PAGE_BEFORE` patches and the
five-digit rule are gone; the reader owns context. A letter of another script inside a Latin word ("аllowed" with a
Cyrillic "а") is a `hidden_character`, since it would hide a cue from the reader (CORR-16).

**The report does not change.** The format stays `tp-packet-verifier/2`, with its eight codes and kinds; a role
failure is `figure_not_in_input` with the figure's kind (a five-digit figure that may be a code reports `code`). The
database checks all three; changing the format is a migration, Lane A's alone (see Consequences). The export job runs
the verifier again over what it prints (`apps/worker/src/packets/export.ts`), so a stored version an older reading
passed and this one fails is refused there (`verifier_failed`), and nothing wrong reaches a payer.

**Until the format moves, a stored pass is read again wherever it counts** (the review of 2026-11-01, CORR-5). A
version stores the report from when it was written, and the database approves only a stored pass, so a version an
older reading passed would show "Verifier passed" and could be requested and approved into an export that refuses it.
`apps/worker/src/packets/verifier-now.ts` holds the one rule, `verifierNow()`: a stored failure stands; a stored pass
is a pass now only if the verifier passes the same narrative now (and its report is of that narrative), else it
"fails now". The export job asks it over what it prints. A request for approval and an approval ask it first
(`verifyVersionNow()`: the narrative decrypted and the schedule rows' identifiers read again, each an audited read under
`packet_verification`, as when the version was written) and refuse a version that fails now with plain words and each
mismatch by its sentence, a figure in the role's words (what it was read as and what the records hold it as) and any
other by its kind, never the narrative's words, the same item once with how many times; with no mismatch (its report
is not of this narrative) it asks for the narrative to be saved again; nothing is written, and the form keeps the
person's place (a server action's refusal is its state, not a redirect). The screens ask it for every version of the case
(`caseVerifiersNow()`: only stored passes are read again, without identifiers, which the stored report checked and each
step checks today): the builder's badge reads "Verifier fails it now" with why and what to do by where the version
stands (not approved: it cannot be approved; approved: it cannot be exported, and a new version needs approval again;
exported: the exported files stand; an earlier version: a later one is current; UX-D1) and by its cause (a figure
the check fails: correct the marked figures; a mismatch it marks nothing for, such as a sentence without a citation:
correct the narrative; no mismatch: the stored narrative no longer matches its verifier report, so save it again,
never naming the figure check or marked figures; NEW-N3), its marks and list are of today's report, the approval panel
is blocked ahead (`verifier_now`), the Export card holds the export back with the reason, by the same cause, and a
disabled button before the click, a refusal says its figures are marked only when the builder marks one, the history says "Fails now (passed when written)", and the case's
packet line and timeline say it too (the timeline only that the verifier passed it then and fails it now). The database cannot run the reader; refusing such a
version in Postgres too is Lane A's `tp-packet-verifier/3` migration.

**One reading serves every screen.** `checkedFigures()` (the package root) and `checkReading()` (`@tp/packets/check`,
browser-safe) return each figure with the roles it was read in, whether it passed and, when it failed, the roles its
value is held in. The narrative editor builds the version's facts once and reads the narrative once per keystroke:
`checkReading()` gives the check and the figures from one reading (`readNarrative()`; PE-9). The editor and the
builder's stored narrative say a failing figure in plain words, with what it was read as and what the records hold it
as ("$100.00: read as what the payer paid; the records hold it as what the contract requires"), worded from
`FIGURE_ROLES` (`apps/web/src/lib/packets/view.ts` `ROLE_TEXT`, which TypeScript holds complete); a number with no
word for what it counts is asked to say it ("3 claims, 6 units, page 2, 3650 days"); a figure whose words must say more
is asked for it (`NEEDS_TEXT`, the closed rules 2 and 3 above). Counts are in the mono font. The
editor's status line, which a screen reader hears, carries only the summary, once the typing pauses (the UX review of
2026-10-28). The gateway's `roleMismatches()` reads the same facts: a failed figure whose value is held in another
role is `figure_in_wrong_role`, so a model's swap reads as misstated. Its `role` is the one its nearest cue names, and
`roles` and `every` say all of them (CORR-21). The gateway's check before a model's draft is written is the
verifier's, and it is at least as strict as the gateway's own reading was before the verifier read roles:
`functions/narrative-roles.test.ts` runs that reading, vendored unchanged from the base 83d71fd6 as a fixture only
(`narrative-roles.base.fixture.ts`), over 246 generated swaps and every misstated example of the review, and requires
each one it caught to fail the gateway (PE-2).

**The reader's words are their own module and built on each read** (`roles-words/` `vocabulary()`), not when the
module loads, so each word is a mutant only the tests that read it run (a value built at load is a static mutant
every test reruns: 1,570 of the reader's first 1,988). The reading and its words are mutated in shards of their own,
each within the mutation job's 30 minutes (the fix round of 2026-11-01, its third part, PE-5): the reading in three, by
layer (`roles-reader/`: the walk over the tokens with `roles.ts` itself, `packets-roles`; the cues, `packets-roles-cues`;
the numbers' words, `packets-roles-numbers`), and the words in five, by family, each its own file built on each call
(`roles-words/`: the labels and nouns, the amounts' cues, the day counts', pages' and percentages' cues, the dates'
cues, and the prose words, `packets-words-labels`, `-amounts`, `-days`, `-dates` and `-prose`). In two shards the
reading (1,917 mutants after the fix round's first part) ran past 40 minutes and the words (1,507) past the job's 30.
The rest of packets' set, grown to 1,515 mutants and about 24 minutes by the same fix round, runs in three: the
verifier's check with the text it reads (`packets-verifier`), the facts a narrative is held to with the payer's names
and the placeholders (`packets-facts`), and the arithmetic (`packets-rest`). A mutation run's test files run shortest
first (`vitest.mutation.config.ts`) and its properties stop at their first counterexample, unshrunk
(`tools/stryker/seed-setup.ts`), so a mutant meets the unit tests that kill it before the reader's properties. Every
packets shard ran in 11 minutes or less on 4 shared CPUs on 2026-11-02 (`docs/runbooks/ci.md`), and packets scored
98.84% (7,556 of 7,644; its 88 undetected mutants are the recorded equivalents), up from 98.59%.

## Alternatives considered

- **A narrower patch:** send the window quote's numbers to the day counts. It fixes the reported "10000 visits" alone
  and leaves every other row of the probes.
- **Quoted figures keep the roles their own words give them** (the design's first reading). Rejected in review (B1): a
  clause's "level 2 appeal", "90 days", "page 9", "12 units" and "4 claims" then pass as the record's level, days late,
  citation page, units and claims, the reported defect again by another path.
- **Nearest cue only** for amounts and dates (the gateway's rule of ADR 0054). Rejected in review (B2): "The payer paid
  nothing toward the $30.00 difference" and "The payer paid for these services on April 8, 2026" fail. The pull
  request's first build therefore took every cue since the figure before it, and the noun after.
- **Every cue in the clause, held in any of them** (that first build). Rejected in the review of 2026-11-01 (PE-1,
  PE-4, CORR-4): when a clause names two roles, a value held in the farther one's passes in the nearer one's, so a
  dispute stated backwards ("Under the contract, the payer allowed $100.00"), a swapped day count, the payment date as
  the deadline and the contract's percentage as the interest rate passed the verifier, the export's re-check and the
  gateway, which caught 246 of 246 such amount swaps before. One cue's role, in the order above, fails them and keeps
  B2's sentences: "the $30.00 difference" takes the noun after it (step 2), and "paid for these services on April 8,
  2026" the payer's act before it, since the services are its object (step 3).
- **Keeping the gateway's own nearest-cue reading as a second gate** on a model's draft (PE-2's first option). Not
  taken: one reading of roles stays the rule for every screen, and the proof (`narrative-roles.test.ts` with the base's
  reading as a fixture) holds the gateway to every swap that reading caught.
- **Slots** (ADR 0054, Alternatives) remain the stronger step for a model's draft. They do not replace this check: a
  person edits the text, and the payer reads text.
- **Bumping the report format to `tp-packet-verifier/3` now.** It needs `packet_verifier_report_valid` to accept it and
  `packet_version_current_verifier` to require it: a migration (CO-02). Deferred to Lane A; until then the export's
  re-verification is the guard, and before launch no real version exists.

## Consequences

- A narrative states each figure with the words of its role ("3 claims", "6 units", "page 2", "3650 days", "release
  900001"). A bare number fails unless a quoted text holds it with the same words in the same role; "twice", "half" and
  an ordinal with no noun after it ("This line is the fifth") fail. "The payer paid $70.00" fails where $70.00 is the
  allowed amount and $56.00 was paid. "within 3650 business days" fails for a calendar-day window. "It is a 3650-day
  window" now passes. A figure's words that name two roles hold it to both, so "The contract requires more than the
  payer paid: $56.00" fails; the person says which it is.
- An amount or a count of units states what it is per, with a scope phrase of the closed list beside it, wherever its
  role's per-line and total values differ: "The payer allowed $210.00" fails with "state whether this figure is per
  line or in total right after it ...", and "The payer allowed $210.00 in total" passes; "In total, the payer allowed
  $210.00" and "Each line was allowed $70.00" fail too, and are written "$210.00 in total", "$70.00 per line". A sentence
  that names a part of the lines (a row, a code, a date of service, a patient, "remaining", a partitive, another count
  of lines) states no amount whose two values differ: the person moves the code or the dates to a sentence of their own.
  The code-built draft (`draft.ts`) therefore states the lines, claims and service dates in a sentence with no amount
  ("The pattern is 3 lines on 3 claims with service dates from ... to ..."), then "The remittances allowed $210.00 in
  total for those lines", "those lines come to $300.00 in total, a shortfall of $90.00 in total", and a per-visit rate in
  a sentence of its own with its codes in the next ("That rate is for 97110"); the MOD-03 reference narratives
  (`packages/synth/src/eval/narrative-set.ts`) and the CAS-08 fixture are reworded the same way. MOD-03's set therefore
  changed, so its hash did: the local model's narrative entry in `packages/model-gateway/eval/baseline.json` was
  re-recorded on the changed set with `eval --record --new-set` (the same prompt version, prompt hash, provider and
  model; the two-step rule of ADR 0070 allows a set change alone), and scored 300 of 300 with no verifier failure, the
  zero-tolerance gate unchanged; the contract entries' tallies are unchanged, and only their report's hash moved
  (`eval/reports/e08319c6...json`). Nothing of the gate was lowered. A stored version
  an older reading passed that states an amount with no scope now reads "fails now" (CORR-5) and is reworded before its
  approval. A "respectively" list outside its two plain forms fails at every figure; the person writes each figure with
  its own words. A label before a colon ("Allowed per line: $70.00") states nothing past the colon.
- The design's and the first review's probes, the hand-written forms of CAS-44 (134, none drawn from the drafting
  templates), the 300 MOD-03 reference narratives, the code-built draft of every generated pattern and the CAS-08
  fixture are each as designed; CAS-43's 87 misstatements each fail at their figure. Every reproduction of the review of
  2026-11-01, of its fix round and of the rounds of fix and recheck after it, and each verifier's variant, is a named
  example (`role-examples.ts` `REVIEWED`, 492: 374 fail at the figures they misstate, CAS-43, each with what its words
  must say when that is why; 118 pass, CAS-44), asserted by the verifier, the gateway and the reader's tests. The
  properties (`roles.property.test.ts`) add sentences with two cues, the figure held only in the farther one's role;
  quoted figures that fill a list between edges; a year's lead before a count's noun; every date role, the deadline's
  among them; and, with the closed rules, each amount written with and without its scope (rule 2), a "respectively"
  list in both plain forms mapped to its cues and their scopes in order with the swap failing, and a list in neither
  plain form failing at every figure (rule 3), and, after the review of the converging fix, a stated total or no scope
  with a trailing "after each line" clause, a row's noun alone ("in line with") and a part of the rows ("for lines 1
  and 2", "on 1 of the N lines"), each held to its scope or failing by rule 2; and, with the amended rule, a scope
  phrase of the closed list beside the figure (right after it or right before it) holding it to that scope, the same
  phrases anywhere else in the sentence (an opening, past a comma, a dash or a word, another clause) granting none, and
  a sentence that names a part of the lines (a row, a patient, a code, a date of service, "remaining", "some", "other",
  "one of", "the last line", "the first line") failing an amount whose two values differ whatever its phrase; and,
  after the review of the amended rule, the triggers it found ("both lines", "a line", "line A", "most lines",
  "excluding a line", "the session", "early March", "the GP lines", "the earliest visit", "all lines but one", a patient
  or a claim where there are more than one, "per claim" after a total) and a count of units in all among them, each
  figure passing only where it is held as stated and with no scope too, and patterns whose lines' values differ, a
  value per line held only where every line holds it (the earlier ones each ran over 40 seeds, these over 10, with no
  failure).
- The gateway's swap faults (`eval/gate.golden.test.ts`) now fail the packets verifier too
  (`figure_not_in_input` beside `figure_in_wrong_role`).
- What it does not do: amount, percentage and date roles rest on cue words, so a narrative can still place a cue the
  input does not contradict; a quoted figure is repeated only as its text writes it ("Section 422.214 of 42 CFR" does
  not repeat "42 CFR 422.214"); a five-digit input code before a noun after an article reads as the code. A difference
  written with no role's word ("$14.00 less than the $70.00 it allowed", after "paid $56.00") takes the figure before
  it's role and fails; "a patient share of $14.00 per line" passes. The amended rule's false failures are the
  price of its accuracy: "The payer allowed $70.00 per line for the 3 lines" (two phrases), "Per line, the payer
  allowed $70.00" (an opening) and "The payer allowed $70.00 per line for 97110" (a code) fail with the scope
  instruction, and are reworded.
- Known limit (2026-11-04): the fail-closed triggers are a list of the words that name a part of the lines, and English
  has more of them than any list holds. A total stated "in total" in a sentence that names a part some other way still
  passes as the pattern's total: "on a couple of lines", "on a subset of the lines", "on her service lines", "on the
  lines save one", "that were not denied", "for each of the claims", "apiece", "per date", "to the claimant", "for her".
  The base reading passed every one of these too (its facts were sets by kind), so this is a gap this decision narrows,
  not one it opens; the person who approves a packet reads its narrative, and the export job reads it again. The
  review rounds of 2026-11-04 added triggers pass after pass and each found more, so the list is not grown further
  here. Closing the class needs a narrative whose figures are not read from English at all (Revisit when, below).
- A request for approval, an approval and the builder and case screens run the verifier again over a stored version
  that passed (CORR-5): a few milliseconds of reading per version shown, an audited read of each version read again, and
  at a step an audited read of its claims' identifiers. A version an older reading passed says "fails now" and is
  refused before approval, not at the export.
- Lane A: one migration to accept `tp-packet-verifier/3` and make it current, then a one-line `VERIFIER_FORMAT`
  change, so a version the older reading passed reads `verifier_outdated` in Postgres too: the database then refuses its
  request and approval itself, which the code's re-reading does until then.

## Revisit when

- A real model's drafts (ADR 0051's evaluation) or people's narratives show a role form the reader does not know: add
  its words to the reader and a named example to CAS-44, never a looser rule.
- The verifier format moves to `/3` (Lane A's migration).
- The narrative's figures become placeholders bound to the facts by code (written and checked by role and scope as
  data, rendered to text only at export), with any free-text number in a model's narrative refused. This closes the
  known limit above without reading English, and keeps every figure computed by code (CLAUDE.md rule 1). Decided
  2026-11-04 as its own item (`co-001/packet-figure-placeholders`, after this one); not this decision. **Done
  (2026-11-06):** [0089](0089-write-a-narratives-figures-as-fact-tokens-rendered-by-code-refuse-every-free-figure-and-read-english-only-for-contradiction.md)
  decides it; format /3 is built behind an explicit format, and served once Lane A's migration flips `VERIFIER_FORMAT`.
