# Review D: the delta that puts item 26's readings on the check's work counter (adversarial; about 20 tool calls)

You are reviewing one change to a letter redactor that guards patient identifiers before text is sent to a model.
Everything here is synthetic (patients VANTREE, ZEPHYRA; IDs SYN..., ZZ...; SSNs 900-xx-xxxx; phones 555-01xx). Use only
synthetic letters. Write no file outside `/home/user/review-d/` and your report. Change no file of the repository.

## The three readers (TypeScript, loaded by absolute path)

- **head** (under review): `/home/user/PhysicalTherapy/packages/redact/src/redact.ts`
- **base** (merged, the counter's home): `/home/user/rev/base/redact.ts`
- **c52** (item 26 before the counter, PHI-reviewed, with a character bound `WIDER_WORK_BOUND`): `/home/user/rev/c52/redact.ts`

Run scripts with:
`export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/ops/designs/lane-b-redact-ssn-phone/gate/ts-resolve.mjs"; node your.mts`

The path production runs (`prepare`): `const r = R.redactLetterForScreen(text, patient, claims); const refused =
R.holdsIdentifier(r.text, patient, claims, R.checkWorkOf(r));` (c52 has no `checkWorkOf`: call its `holdsIdentifier`
with three arguments). A letter is SENT when `refused` is false, and what is sent is `r.text`. The path without the
screen: `R.redactLetter(text, patient, claims).text`, then `R.holdsIdentifier(thatText, patient, claims)`.
Shapes: `patient = { pseudonym, names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] }`,
`claims = [{ claimId, patientPseudonym, claimNumbers: ['SYN555001'] }]`.

## What changed (read this diff, and only what it leads you to)

`cd /home/user/PhysicalTherapy && git diff c52f262a HEAD -- packages/redact/src/redact.ts` is the base's counter (already
reviewed and merged: `work`, `WORK`, `someOf`, `CHECK_WORK_BUDGET`, the two entries) plus this delta. The delta alone is
easier to see as `diff /home/user/rev/base/redact.ts packages/redact/src/redact.ts` read beside
`git diff 83e30973 c52f262a -- packages/redact/src/redact.ts` (item 26 as reviewed). What is new in the delta:

1. `WIDER_WORK_BOUND`, `widerWorkOf`, `unreadPastTheBound` are gone. The wider reading (`widerMatchesIn`), the check the
   redaction asks before applying a wider match (`refusedAsFirstRead` -> `holdsAsFirstRead`), and the check's second
   reading of a CR LF letter (`holdsIdentifier`) run inside the two entries and count on `checkWorkSpent`.
2. The shared stores (`inOneReading`: `viewsOfCheck`, `datesOfCheck`, `formsOfCheck`) now keep each answer's cost
   (`Stored`, `takenAgain`, `workSince`, `storeScope`, `widerReading`). Claim: a first reading is charged at least what
   the base charges it, and only the wider reading takes a stored answer for nothing.
3. `ownMatchesIn`: `if (subject.initials && !(wider && names.length === 0))`, the wider reading skips
   `initialsNextToNames` when it found no name. Claim: that function returns nothing for no names.
4. `redactionSpans`: the first reading with no counter, then item 26's additions under a counter from 0 with a `catch`
   of `PastCheckWorkBudget` that returns the first reading's text with U+0001 appended.
5. `holdsAsFirstRead` is the base's check body with `storeScope`; `holdsIdentifier` is the base's entry around item 26's
   two-writing reading.

The ADR's account: `docs/adr/0054-*.md`, the last section ("item 26's readings on the check's work budget").

## Your two questions

**PHI.** Is anything the base or c52 redacts or refuses now sent? Find a letter (and identifiers) where head SENDS a
text holding an identifier character that base or c52 would have replaced or refused. Allowed differences: against the
base, the two name forms and K-1 that item 26 adds (more redacted or refused), and read-to-refused; against c52, only
read-to-refused, and refused-to-read ONLY where c52 refused by its character bound alone (a letter past
`WIDER_WORK_BOUND` whose every identifier head still redacts: check the sent text). Attack in particular:
- the stores: can a stored view, dates or forms answer be stale or wrong (a different fold, text, subject, width), or
  can the cost bookkeeping change an ANSWER (not only a count)? Is `Object.freeze` on forms broken by any reader?
- the count: can any letter cost the head's first reading LESS than the base's, so that a letter the base refuses by its
  budget is read by the head? (Compare `checkWorkOf` head against base over many letters; any head < base is a finding.
  Also the check: for a text and a handed count, base refuses and head sends.)
- the initials skip; an exception other than `PastCheckWorkBudget`; state left behind after a throw (`checkWorkSpent`,
  `storeScope`, `widerReading`, the stores) that changes the NEXT letter's answer or count;
- `redactionSpans`' catch and mark; `holdsIdentifier` given odd counts (NaN, negative, strings) after the change.

**Time.** Does any letter the head still SENDS take more than 3 s, and does any row pass only by how it is run?
Measure thread processor time (`process.threadCpuUsage()`), scaled to the reference calibration as
`/home/user/ops/designs/lane-b-redact-item-26/scripts/dear.mts` does (run it first; it takes a reader path as its
first argument). The budget is fitted under coverage instrumentation, where the code runs roughly 2 to 4 times slower:
to judge that, run the timed rows as the suite runs them:
`cd /home/user/PhysicalTherapy/packages/model-gateway && npx vitest run --coverage src/functions/denial-letter.test.ts -t "work budget"`
(and `-t "crafted to be slow"`), and read whether any row is near its allowance. Hunt for a still-read letter dearer
per counted unit than the rows: text where the wider reading or the second (CR LF) reading does work the counter does
not see (the wider patterns' `apart` gaps on long runs of spaces, periods or U+0085; many names or forms; look-alike
letters so the wider reading runs on both folds; a stored number with separators). Report the dearest still-read letter
you find, its length, time and whether base reads it.

## Report

Write `/home/user/ops/designs/lane-b-redact-item-26/reviews/d/report.md`: for each finding an ID (D-PHI-n, D-TIME-n),
BLOCKING or not, the exact reproduction (a script path under `/home/user/review-d/` and the letter by construction, not
pasted at length), what head, base and c52 each do, and the figures. Say plainly what you tried that found nothing, and
how many letters. A finding is blocking if head sends what base or c52 protects, or a still-sent letter passes 3 s at
the reference calibration, or a timed row passes only by how it is run. Do not propose raising a budget, a weight or a
test's allowance. Your final message: the findings in five lines.
