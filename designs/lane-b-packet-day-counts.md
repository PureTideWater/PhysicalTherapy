# The packet verifier holds every figure to its role (`co-001/packet-day-counts`)

Lane B, branch `co-001/packet-day-counts`, worktree `/home/user/packet-day-counts`, cut from `claude/build-platform`
at 0dd1ba7. Design of 2026-10-28. Design step only: nothing was built, committed, pushed or posted. Status:
`approval-summaries/lane-b-packet-day-counts-status.md`. Reserved: ADR 0086; test-matrix CAS-43 to CAS-44;
`packages/synth` cases CAS-43 to CAS-44 (module 5).

Source: product observation (b) in `approval-summaries/lane-b-test-flakes-status.md`. `facts.ts:235`
`sets.quoted(source.quote, sets.dayCounts)` sends a five-digit number in a contract-window quote to `codes`, so "10000
visits" passes when the window says 10000 days.

Evidence. Every claim below was probed on 0dd1ba7 with temporary vitest files, since deleted. The outputs are in
`/tmp/claude-0/-home-user-PhysicalTherapy/c2897427-570e-5954-bd7a-54cacd103451/scratchpad/progress/`:
`pdc-probe1.txt` (62 narratives against today's verifier and the gateway's role check), `pdc-proto3.txt` and
`pdc-proto3.json` (85 narratives against a prototype of this design), `pdc-proto-suite.log` and
`pdc-proto-suite2.log` (the unit suites with the prototype wired into the verifier), and `pdc-proto-golden.log` (the
gateway's evaluation gate with the prototype). The prototype's source is kept there as `zz-pdc-proto.ts.keep`. Its
year rule was tightened after the `.keep` copy (section 2.2).

---

## 0. In one screen

- **The root.** The scanner types a figure by its shape alone. The facts are sets by kind. So a value passes in any
  role the narrative gives it, and a quoted text's figure passes in any role at all. The day-count and page rules
  are two patches on that model. They miss every other role.
- **What goes wrong.** 42 of the first 62 probes pass wrongly today, and 2 fail wrongly. Codes, counts, day counts, pages, years, releases, versions,
  levels, units, rows, amounts, percentages and dates each pass as another (section 1).
- **The fix.** One role reader in `packages/packets/src/roles.ts`. It reads every figure with its role from the words
  around it. The facts store each value with the roles its record gives it. Quoted texts are read by the same
  reader. A figure passes only in a role its input holds.
- **Measured.** The prototype gets all 85 probes right. The 300 MOD-03 reference narratives, 500 generated drafts
  and the CAS-08 fixture still pass. Six existing tests change, each on purpose (section 3.3).
- **No migration.** The report keeps format `tp-packet-verifier/2`, its codes and its kinds. A role failure is
  `figure_not_in_input` with the figure's kind. Bumping the format to `/3` needs Lane A's migration (section 5.2).

---

## 1. What goes wrong

### 1.1 The mechanism

1. `scan.ts` types each figure by shape. Five digits are a code (`scan.ts:437`). Two decimals are an amount
   (`scan.ts:429`). Everything else with digits is a number (`scan.ts:473`).
2. `facts.ts` puts each value in one set per kind. `numbers` holds counts, units, the citation's page, versions,
   releases, the dispute level, interest day counts and every date's year (`facts.ts:85`).
3. `FactSets.quoted()` (`facts.ts:90`) scans a quoted text with the same scanner. Each figure goes to its kind's set.
   It never looks at the words around it. So the window quote's "10000 days" goes to `codes`, not `dayCounts`.
4. `inInputs()` (`verifier/mismatches.ts:80-110`) checks value and kind only. A number matches anything in
   `numbers`. A five-digit code also matches a number (`mismatches.ts:92-93`). Only `dayCounts` and `pages` look at
   context (`DAYS_AFTER`, `PAGE_BEFORE`).
5. The gateway's `functions/narrative-roles.ts` reads roles for counts before "lines, claims, patients, units" and for
   amounts after a cue. It runs only on a model's draft, before it is stored. It skips code-shaped figures. It never
   runs on a person's narrative, in the browser editor, at write time or at export. The packets verifier runs on all
   of those.

### 1.2 Every misfiling class

Content: the CAS-08 SYNTHETIC packet from `test-support.ts` (3 lines of 97110 x 2, expected $100.00, allowed $70.00,
paid $56.00 each, page 2, version 1, release 900001, window 3650 days on page 1, service dates 2026-03-05 to 07,
paid 2026-04-08, window end 2036-04-05), with the overrides named. "Today" is the packets verifier. "Gateway" is
`roleMismatches`. Every row passes the verifier today.

| # | Class (fact role -> narrative role) | Synthetic narrative | Facts it passes against | Why | Gateway |
| --- | --- | --- | --- | --- | --- |
| A1 | Window quote's day count -> count of a thing no input counts | "It affected 10000 visits [3]." | window `days: 10000`, quote "within 10000 days" | the quote's 10000 is typed `code` by shape and goes to `codes` | passes |
| A2 | Window quote's day count -> units | "There were 10000 units [3]." | same | same; the gateway skips a code-shaped figure | passes |
| A3 | Window quote's day count -> procedure code | "CPT 10000 was billed [1]." | same | same | passes |
| C1 | A date's year -> claims | "There were 2026 claims [3]." | service dates 2026 | `date()` adds every date's year to `numbers` | fails |
| C2 | A window end's year -> units | "There were 2036 units [3]." | window end 2036-04-05 | same | fails |
| C3 | Year -> page | "The clause is on page 2026 [1]." | any 2026 date | `numbers` has no page rule | passes |
| C4 | Year -> release | "Release 2026 priced the lines [2]." | same | same | passes |
| C5 | Year in words -> claims | "There were two thousand twenty-six claims [3]." | same | words read as 2026, then as C1 | fails |
| R2 | Year -> units after "x" | "Three claims billed 97110 x 2026 [3]." | same | same | passes |
| D1 | Release -> units | "There were 900001 units [3]." | release 900001 | releases go to `numbers` | fails |
| D2 | Release -> page | "The clause is on page 900001 [1]." | same | same | passes |
| E1 | Citation page -> claims | "There were 7 claims [3]." | citation `page: 7` | the citation's page goes to `numbers`, not `pages` | fails |
| E3 | Units -> dispute level | "This is a level 2 appeal [1]." | units 2, level 1 | levels share `numbers` | passes |
| E4 | Units -> level in Roman | "This is a level II appeal [1]." | same | same | passes |
| E5 | Units -> level as an ordinal | "This is a second-level appeal [1]." | same | same | passes |
| E6 | Units -> version | "The contract, version 2, applies [1]." | units 2, version 1 | same | passes |
| E7 | Units -> release | "Release 2 priced the lines [2]." | units 2 | same | passes |
| E8 | Units -> page | "The clause is on page 6 [1]." | pattern units 6, page 2 | same | passes |
| E9 | Dispute level -> claims | "There were 2 claims [3]." | level 2, claims 3 | same | fails |
| E10 | Version -> lines | "There was 1 line [3]." | version 1, lines 3 | same | fails |
| F1 | Interest days to pay -> lines | "There were 33 lines [3]." | `days_to_pay: 33` | interest day counts go to `numbers`, not `dayCounts` | fails |
| F2 | Interest days to pay -> page | "See page 33 [1]." | same | same | passes |
| T20 | Interest days late -> units | "There were 33 units [3]." | `days_late` 33 | same | fails |
| G1 | Regulation reference -> claims | "There were 42 claims [3]." | reference "42 CFR 422.214" | a quoted text's numbers pass in any role | fails |
| G2 | Regulation section -> units | "There were 422.214 units [3]." | same | same | fails |
| G4 | Practice name -> units | "There were 77 units [3]." | practice "SYNTHETIC PT 12345 GROUP 77" | same | fails |
| G5 | Practice name -> procedure code | "CPT 12345 was billed [1]." | same | the name's 12345 is typed `code` | passes |
| G6 | Practice name -> lines | "There were 12345 lines [3]." | same | same; gateway skips code shapes | passes |
| G7 | Contract title's year -> claims | "There were 2025 claims [3]." | title "SYNTHETIC AGREEMENT 2025" | same as G1 | fails |
| G8 | Contract quote's visits -> units | "There were 12 units [3]." | quote "Section 4 covers 12 visits" | same | fails |
| G9 | Contract quote's section -> days | "The payer had 4 days [1]." | same | same | passes |
| I1 | Page -> procedure code | "CPT 12345 was billed [1]." | citation `page: 12345` | a five-digit code may match any number (`mismatches.ts:93`) | passes |
| I4 | Procedure code -> page | "The clause is on page 97110 [1]." | code 97110 | the code shape wins; `codes` has it | passes |
| I5 | Procedure code -> day count | "Disputes are raised within 97110 days [1]." | same | same | passes |
| L2 | Contract amount -> units | "There were 50.00 units [3]." | `amount_cents: 5000` | two decimals are an amount by shape | passes |
| M1 | Interest rate -> contract percentage | "The contract pays 9% of the Medicare fee schedule [1]." | `annual_rate_percent: 9` | percentages are one set | passes |
| N1 | Expected amount -> allowed | "The payer allowed $100.00 per line [3]." | line expected 10000 | amounts are one set | fails |
| N2 | Allowed amount -> shortfall | "The shortfall was $210.00 [3]." | pattern observed 21000 | same | fails |
| O1 | Service date -> payment date | "The payer paid the lines on 2026-03-05 [3]." | service date | dates are one set | passes |
| O2 | Window end -> service date | "The service date was 2036-04-05 [3]." | window end | same | passes |
| O3 | Service month -> payment month | "The payer paid in March 2026 [3]." | service dates in March | months derive from every date | passes |
| Q1 | A schedule row that does not exist | "The sixth line was short [3]." | 3 rows, units 6 | an ordinal is a number; 6 is a count | fails |
| S1 | A count with no noun | "Of these, 2 were short [3]." | units 2 | a bare number matches any number | passes |
| T22 | Year -> count of a thing no input counts | "It affected 2026 visits [3]." | any 2026 date | as C1 | passes |

Two false failures go the other way. A legitimate "It is a 3650-day window [1]." fails, because `DAYS_AFTER` wants a
space before "days". A legitimate "Each line billed 1.25 units [3]." fails when the line's units are 1.25, because
"1.25" is read as the amount $1.25.

Classes checked and found sound today: amounts against percentages ($, %, "percent"); modifiers ("modifier 59" is
a modifier, "59 units" a number); hidden characters and other digits (`readable.ts`); placeholders; remittance keys;
identifiers (hyphenated groups and fractions are compared whole as written; section 3.4 keeps them so).

### 1.3 The two rules the item names

- **The five-digit code matches a number** (`mismatches.ts:92-93`). It was added so a page of 12345 can be stated
  ("page 12345"). It lets any five-digit number fact stand as a code (I1), and any code stand as that number in any
  role (I4, I5, A1 to A3 through the quote).
- **The year from every date** (`facts.ts:85`). It was added so "the 2026 fee schedule" passes. It lets every year
  of every date stand as any count, page, release or level (C1 to C5, R2, T22).

### 1.4 The gateway's role check

`functions/narrative-roles.ts` covers N1, N2 and the count-noun rows where the figure is not code-shaped (C1, C2,
C5, D1, E1, E9, E10, F1, G1, G2, G4, G7, G8, Q1, T20). It misses A1 to A3, G5, G6 and I1 (code shapes), every page,
version, release, level, day-count, percentage and date row, and S1. It runs only before a model call. A person's
narrative, the browser editor, the stored result and the export check never see it.

---

## 2. The fix

### 2.1 Shape

- **`packages/packets/src/roles.ts` (new).** One reader: `readFigures(text)`. It scans the readable text and returns
  each figure with its kind, value and role, plus the word before and the word after it. The verifier reads the
  narrative with it. `facts.ts` reads every quoted text with it. The browser gets it through `@tp/packets/check`.
- **`facts.ts`.** `NarrativeFacts` holds each value with the roles its record gives it: `held(kind, value)` returns
  the set of roles. Every fact goes in through one adder that requires a role, so TypeScript refuses a fact without
  one. `codes`, `modifiers`, `identifiers`, `rows` and `markers` stay. `numbers`, `dayCounts` and `pages` go.
- **`verifier/mismatches.ts`.** `inInputs()` asks one question: does the input hold this value of this kind in this
  role? The `DAYS_AFTER` and `PAGE_BEFORE` patches and the five-digit rule go; the reader owns context.
- **`model-gateway/src/functions/narrative-roles.ts`.** Its grammar moves into `roles.ts`. `roleMismatches()` stays
  as the gateway's API. It becomes a thin reading of the same facts: a figure whose value is held under another
  role is `figure_in_wrong_role`, so the person still sees `misstated`. One grammar serves both.

### 2.2 How a figure's role is read

Roles for numbers: `days`, `page`, `version`, `release`, `level`, `year`, `lines`, `claims`, `patients`, `units`,
`row`. A number with none of these has no role.

In order, the first that applies:

1. A label before it, in its sentence: "page", "pages", "p.", "pp." -> page; "version", "v." -> version;
   "release", "release no." -> release; "level", "appeal", "tier" (a Roman numeral there too) -> level; "x" or "x" joined
   ("x 2", "x2") -> units.
2. Words after it: "day" or "days" (with "calendar", "business" or "working" between, "(30) days" after "thirty",
   and the joined "3650-day") -> days; "level" or "appeal" ("second-level appeal") -> level; a count noun, at
   once or after one word not in the "more, other, of, per, and ..." list -> lines ("line", "lines", "row", "rows"),
   claims, patients or units. An ordinal before a singular "line", "claim", "patient" or "row" is a row position.
3. A partitive: "2 of the 3 claims" -> claims for both numbers.
4. A whole number from 1900 to 2199 after "in", "during", "since", "until", "through", "of", "for", "year", "the",
   "from", "to", "by", "before" or "after" -> year.
5. Otherwise, no role.

Shape and context together:

- **A five-digit figure.** It is a code unless its words make it a number of a closed role: days, page, version,
  release, level, or units after "x". Before a count noun it is either ("the 97110 lines"): it passes as the input's
  code or as a count the input holds. The rule at `mismatches.ts:93` is removed.
- **Two decimals without "$".** Before a count noun or "days" it is a number ("1.25 units"). Otherwise an amount.
- **The word "first" alone** is prose, as "one" and "zero" are today ("is the first [3]" in
  `apps/worker/src/packets/packets.db.test.ts`). "First" before a role word is that role ("first-level", "the first
  line"). Every other ordinal alone is a number with no role.
- **Amounts** keep the gateway's cues (expected, observed, variance, interest), nearest cue between the previous
  figure and this one. No cue: any amount.
- **Percentages:** "of the Medicare fee schedule", "contract" -> contract percentage; "interest", "a year",
  "annual" -> interest rate. No cue: any percentage.
- **Dates, months and days of a month:** the nearest cue since the previous figure: "service", "visit", "billed"
  -> service; "paid", "payment", "remittance" -> paid; "received" -> received; "due" -> due; "deadline", "until",
  "window", "ends" -> deadline; "effective", "in effect" -> effective; "as of" -> as of. No cue: any date.

### 2.3 The facts' roles

| Input (`facts.ts`) | Role |
| --- | --- |
| `pattern.lines`, `content.lines.length`, `code.lines` | lines |
| `pattern.claims` / `pattern.patients` | claims / patients |
| `pattern.units`, `code.units`, `line.units` | units |
| 1 to the schedule's rows | row |
| `citation.page`, the window's `page` | page |
| `citation.version_no` | version |
| `rule_releases[].release_no`, `interest.release_no` | release |
| `dispute_level` | level |
| the window's `days`, `days_to_pay`, a stated line's `days_late` and `days_unpaid` | days |
| every date's year, `pattern.contract_years` | year |
| expected / observed and paid / variance / interest amounts (as `roleInputs` has them) | expected / observed / variance / interest |
| calculation steps, rounding, patient share | an amount with no role: passes only where the narrative names none |
| `contract_percentages`, a `percent` parameter / `annual_rate_percent` | contract / rate |
| `as_of`, effective dates, service dates, `paid_on`, `received_on`, windows and deadlines, `due_on` | as of, effective, service, paid, received, deadline, due |
| procedure codes, modifiers | code, modifier |

**Quoted texts** (the contract clause and title, the regulation reference and statement, the practice, payer and
plan as printed, the window quote, the statute) are read by `readFigures()`, the narrative's own reader. A quoted
figure keeps the role its own words give it ("within 10000 days" is days; "page 4" is a page). A quoted figure with no
role is held with its two neighbouring words. A narrative figure with no role passes only against such a figure, and
only with the same word before or after it ("GROUP 77", "42 CFR 422.214", "Section 4"). So a quote's figure may be
repeated as the quote holds it, and in no other role. A five-digit quoted figure is a code only in the contract
clause and the regulation statement. In a name, a title, the statute or the window quote it is a number.

Amounts in the contract clause and the regulation statement are expected amounts (as `roleInputs` holds them now).
Percentages there are contract percentages; the statute's are rates. Other quoted amounts, percentages and dates
have no role, so they pass where the narrative names none.

### 2.4 Format, codes and the screens

- The report's shape is unchanged: format `tp-packet-verifier/2`, the eight codes, the same kinds. The database
  checks all three (`packet_verifier_report_valid`, `packet_version_current_verifier`). A role failure is
  `figure_not_in_input` with the figure's kind. That is true: the figure is not in the input in that role.
- The export job runs the verifier again over what it prints (`apps/worker/src/packets/export.ts:198`). A stored
  version the old verifier passed and the new one fails is refused there (`verifier_failed`). Nothing wrong reaches a
  payer. The person writes the version again.
- `apps/web/src/lib/packets/view.ts`: `figure_not_in_input` reads "a figure that is not in the packet's input
  records in the role its words give it", and `number` reads "number or count; say what it counts or names: 3 claims,
  6 units, page 2, 3650 days, release 900001". The editor shows the role it read beside a failing number ("read as
  a count of claims"), from `readFigures()` in the browser. The stored report does not carry it.

### 2.5 What does not change

`scan.ts` keeps its kinds and its tests. `readable.ts`, placeholders, markers, identifiers, the case's identifiers
and sentence splitting are untouched. `packages/pricing` is not touched. No migration.

---

## 3. Why it is complete

### 3.1 Every path goes through one reader

The verifier reads every figure the scanner emits through `readFigures()`. Every fact enters through one adder that
requires a role. Every quoted text enters through `readFigures()`. So a figure and a fact meet only as (kind, value,
role). No set holds a value without its role. A new fact source cannot be added without naming its role: the adder
will not compile without one.

### 3.2 The four allowances, and why each is safe

1. An amount, percentage or date with no cue passes as any of its kind. Its kind already says what it is: money, a
   rate, a day. The cue only narrows which one.
2. A number with no role passes only against a quoted figure with the same neighbouring word. It repeats the quote.
3. An input's code before a noun is that code ("97110 visits" means visits billed as 97110). A code shape becomes a
   number only where its words make it one, and then it must be held in that role.
4. "First" alone is prose, like "one".

Everything else must be held in its role.

### 3.3 Measured on the prototype

| Corpus | Today | Prototype |
| --- | --- | --- |
| 85 probes (every row of 1.2, both false failures, 32 legitimate forms) | 47 wrong passes, 2 wrong failures | all as designed ("It affected 97110 visits" passes as the code, allowance 3) |
| MOD-03 reference narratives (300, six styles) | 300 pass | 300 pass |
| `draftNarrative` over 500 generated contents (seed 42) | pass | pass |
| CAS-08 fixture | fails on 1234.56 only | fails on 1234.56 only; the cited form passes |
| unit suites: packets, model-gateway, worker packets, web packets (1,097 tests) | pass | 6 fail, each a deliberate change below |
| golden: the gateway's evaluation gate (52 tests) | pass | 50 pass; 2 assertions change; every injected fault still fails the gate |

The tests that change, and why:

1. `verifier.test.ts:396` "fails a draft into which any count not in the input is written": "It affected N
   visits" no longer passes when N is a count of something else. The oracle becomes "N is an input's five-digit
   code".
2. `verifier.test.ts:416` "passes any narrative made of the inputs' own figures": its pool writes figures bare. Each
   figure is now written with its role's words.
3. `verifier.test.ts:439` (other digits): the same oracle as 1.
4. `verifier.test.ts:177` "Each line billed twice [3]." now fails: "twice" says 2 of nothing. The test writes "2
   units". "This is the fifth dispute [3]." still fails.
5. `verifier.test.ts:536` "It is a 3650-day window [1]." now passes, on purpose. "3650 units in the days after" still
   fails.
6. `model-gateway/src/functions/narrative-roles.test.ts:79` "the packets verifier alone passes it": the packets
   verifier now fails a swap. The gateway still reports `figure_in_wrong_role`. In `eval/gate.golden.test.ts`, the
   swapAmounts and swapCounts faults now list `figure_not_in_input` beside it.

`facts.test.ts` asserts the old sets (`numbers`, `dayCounts`, `pages`). It is rewritten against `held()`, with the
same facts. `scan.test.ts` and `readable.test.ts` do not change. The e2e packets narratives are drafts plus a
sentence with no figure, so they do not change. The db tests' narratives ("Claim {{...}} is the first [3].",
"The payer paid 97110 short [1].") do not change.

### 3.4 What it does not do

- Identifiers (hyphenated groups, fractions, a statute's section) stay compared whole as written. Their shape is
  their identity, and only quoted texts hold them.
- Amount, percentage and date roles rest on cue words. A narrative can still place a cue the input does not
  contradict. Slots (ADR 0054, Alternatives) remain the stronger step for a model's draft. They do not replace this
  check: a person edits the text, and the payer reads text.
- A five-digit input code stated before a noun reads as the code (allowance 3).

---

## 4. Tests

### 4.1 Property test (`packages/packets/src/roles.property.test.ts`)

The generator extends the verifier's `contentArbitrary` with: a window source (days from 1 to 99,999, a quote that
states them, its page), interest with days to pay and days late, either citation kind, quoted texts holding random
numbers in random contexts, random releases, versions, levels and pages.

The oracle is built in the test from the content's fields, by role, not from `narrativeFacts()`, so the test is not a
tautology. Each role has templates: "within {n} days", "page {n}", "version {n}", "release {n}", "a level {n}
appeal", "in {n}", "{n} lines", "{n} claims", "{n} patients", "{n} units", "the {ordinal} line", and a bare "{n}".
Each value is written in digits, with thousands commas, and in words.

1. For any fact (value v held in role r) and any template of role r', the sentence passes if and only if the
   oracle holds v in r'. Both sides are asserted.
2. Any value v not held in role r' fails in r'.
3. A quoted figure with no role passes beside its own neighbouring word and fails bare in any other sentence.
4. The code-built draft passes for every generated content (kept from `verifier.test.ts`).

Counts are biased toward the facts' own values and their neighbours (each code, each year and the next, the window's
days), as `countArbitrary` is today.

### 4.2 Named examples (`packages/packets/src/roles.test.ts`, `verifier.test.ts`)

Every row of 1.2 fails as a named case. Each passing form passes as a named case: "within 10000 days", "10,000
days", "ten thousand days", "3650-day", "page 12345", "version 1, page 1", "release 900001", "a first-level appeal",
"the second line", "1.25 units", "Section 4 covers 12 visits", "42 CFR 422.214", "SYNTHETIC PT 12345 GROUP 77", "For
plan year 2026", "The 2026 fee schedule", "Interest of 9% a year", "paid on April 8, 2026", "serviced on 2026-03-05
and paid on 2026-04-08", "The 97110 lines", "It affected 97110 visits". Each failure asserts its code, kind and
position, so the screen marks the figure.

`roles.test.ts` pins the reader alone: each label, each noun, the partitive, the ordinal rules, the year words, the
five-digit and two-decimal rules, and the neighbouring words.

### 4.3 CAS-43 and CAS-44

| ID | Case | Assertion |
| --- | --- | --- |
| CAS-43 | A narrative states an input's figure in another role (a window's 10000 days as visits, a date's year as claims, a page as a code, a release as units, a quoted name's number as a count, the allowed amount as the shortfall, a service date as the payment date) | The verifier fails each figure (`figure_not_in_input`, at the figure); approval is blocked; the export refuses the version |
| CAS-44 | A narrative states each figure in the role its input holds, or as a quoted text holds it | Passes: days, pages, versions, releases, levels, years, counts, units and rows each with their words, in digits, with commas or in words; a quoted figure beside its own word; a number with no role fails |

`packages/synth` module 5: CAS-43 carries `narratives.json`, the content overrides and the narratives of 1.2 with
each expected mismatch span. CAS-44 carries the passing set. `assertedBy`: `roles.test.ts`,
`roles.property.test.ts`, `verifier.test.ts`, `apps/worker/src/packets/packets.db.test.ts` (approval blocked, the
export refused) and a new `apps/web/src/lib/packets/view.test.ts` (the words; `view.ts` has no test today). `pnpm synth` writes them;
`pnpm verify-content` checks them.

---

## 5. Records

### 5.1 ADR 0086 (new)

"Read every narrative figure in the role its words give it, and hold each input to the roles its record gives it."
The verifier's rules span three ADRs, so one new ADR states them whole:

- context: section 1, with the probe counts;
- decision: section 2, the four allowances, the unchanged report format;
- alternatives: a narrower patch (send the window quote's numbers to `dayCounts`), rejected: it fixes A1 alone and
  leaves the other 40 rows; slots, kept as the next step for a model's draft (ADR 0054); a format bump now,
  deferred to Lane A's migration;
- consequences: the six test changes, the editor's words, the gateway's thinner check.

Amendment notes, each one paragraph pointing to 0086:

- **ADR 0047** (the verifier reads as it shows): figures are now held to their roles; same format.
- **ADR 0054** ("held to their roles"): the role grammar moves into `@tp/packets`; the packets verifier now fails a
  swap; `roleMismatches` stays for the gateway's notice.
- **ADR 0061** (the tp-packet/2 facts): the window's day count and page are role facts like every other.

### 5.2 What is not built here

The format bump. A verifier that reads differently should say so in its report. That needs
`packet_verifier_report_valid` to accept `tp-packet-verifier/3` and `packet_version_current_verifier` to require it:
a migration, Lane A's alone. This part stops here. Until then, the export's re-verification is the guard. Before
launch no real version exists, so nothing stored is affected.

---

## 6. Mutation

`stryker/shards.json`:

- `packages/packets/src/roles.ts` joins **packets-scan**, beside `scan.ts`. It is the other word reader, and
  packets-rest is already the longer shard (997 s against 939 s at 49514e8). The `$comment` says so.
- `facts.ts` and `verifier/mismatches.ts` stay in **packets-rest**. Both get smaller: the context rules leave them.
- `tools/stryker/shards.test.ts` holds every mutated file in exactly one shard. It fails until `roles.ts` is listed.

Scores: the packets gate passes, and each touched file scores at or above its score on 0dd1ba7. The last measured
scores were scan 93.95 and mismatches 97.30 (#76's run) and facts 83.33 (`co-001/pr-05b-plan-type-words`). They are
measured again before the build starts, in this worktree, so the comparison is like for like. `roles.ts` targets
the scan shard's score or better. The named examples of 4.2 pin each label, noun and cue so a removed word is
a killed mutant.

---

## 7. Coordination

`git fetch origin` on 2026-10-28 00:20. Open pull requests: #79, #78, #75, #74, #42 and #33.

- **No open branch changes `packages/packets`.** Checked file by file through the REST API.
- **#75 (`co-001/contract-phi-check`)** changes `model-gateway/src/functions/narrative.ts`, ADR 0054, ADR 0070 and
  the test matrix. This item edits `narrative-roles.ts`, its test and ADR 0054. If #75 merges first, merge
  `claude/build-platform` in and take its ADR 0054 text. The amendment note is its own paragraph, so the conflict
  is textual.
- **#79, #78, #74 and #42** add rows to other modules of `docs/product/test-matrix.md`. CAS-43 and CAS-44 go after
  CAS-39. CAS-40 to CAS-42 are reserved for SUITE-CAP-1 and may land later. The gap is left as is.
- **`co-001/pr-05b-plan-type-words`** (changes `facts.ts`) is stale. Its change is already on `claude/build-platform`
  ("plan type Preferred Provider Organization (PPO)" is in `facts.test.ts`, `CLAIM_FILING_INDICATOR_TEXT` in
  `payer.ts`). The branch is not an ancestor and has no open PR. Nothing to merge.
- **`co-001/main-dependabot-template`** targets `main` and predates the packets changes. It is not affected.
- Lane A: the format bump in 5.2.

---

## Proposals outside this item

1. **Lane A: the verifier format bump** (5.2). One migration: accept `tp-packet-verifier/3`, and make it current.
   Then a one-line follow-up sets `VERIFIER_FORMAT`, so a version the old verifier passed reads `verifier_outdated`.
2. **The narrative prompt, version 2** (`model-gateway/prompts/draft-packet-narrative`): "Say what each number counts or
   names: 3 claims, 6 units, page 2, 3650 days, release 900001." The reference narratives already do. A new prompt
   version needs its evaluation baseline (ADR 0051), which needs model access.
3. **Date and amount roles in the payer's copy words.** `explain/` words each figure from the trace and already
   knows its role. A shared role list between the two would let a test hold both to one vocabulary.

---

## Review and departures (the build, 2026-10-28)

Built in `/home/user/packet-day-counts` (uncommitted). Every finding of the design review was applied as below; where
the build departs from the design or the review, the reason is given.

### Findings and how they were applied

- **B1 (blocking): no quoted figure is a role fact.** Applied as recommended. `facts.ts` keeps each quoted text as its
  tokens (`NarrativeFacts.quotes`); no quoted amount, percentage, date or number enters `roles`. A figure the record
  does not hold in its role passes only as a repetition of a quote (`roles.ts` `quotedHolds`): in a role, with four of
  its tokens or more, the one after it among them unless the quote's clause ends there, or with a whole quoted clause;
  in no role, beside the word before it when that word means something ("Section 4", "GROUP 77"), with two tokens one
  of which means something, or with the quote's clause reached on one side and a token on the other. Q4 to Q8 are in
  CAS-43 (G10 to G14); "A level 2 appeal is raised within 90 days" is in CAS-44 (G5). The per-source forcing of amount,
  percentage and date roles is gone. Codes and modifiers the clause or the regulation's statement names stay codes
  (they are procedure codes by nature; the facts test pins it).
- **B2 (blocking): the 17 false failures.** Applied: row labels before a number (with "no."/"number"), lists after a
  label, positive year contexts (year words without "to", "of", "by" or a bare "the"; a possessive; "its", "this",
  CY, FY, "year"; a year's noun after; "the" before a count's noun), a code or digits between a count and its noun,
  "-unit"/"-line" joined nouns, "N of M noun" with no determiner, "N: label" (a count's noun up to three words before
  a colon), and every cue in the window plus the noun after for amounts and dates, "due" naming due date or deadline.
  CAS-44 holds 134 hand-written forms (none opening like a drafting template's sentence; a test holds that) plus 76
  stated forms (every legitimate row of the design's and the review's probes); all pass. Two of the review's 48 legit
  rows change, each as S1 requires: R16 ("The payer paid $70.00 against an expected $100.00" fails: $70.00 is allowed,
  $56.00 paid) and R10 ("The clause on pages 1 and 2" fails on page 1, which is the window's; the stated form is
  "Pages 1 and 2 of the contract apply").
- **S1: sub-roles.** Applied: `allowed` and `paid`; `window_days`, `days_to_pay`, `days_late` (with `days_unpaid`);
  `citation_page`, `window_page`; `claim_row` and `patient_row` against the claims and patients counts; `line_units`
  against the pattern's units ("Each line billed 6 units" and "97110 x 6" fail); a year carries its dates' roles and
  reads date cues; "business"/"working" days fail unless the record's `day_basis` is business. Each case is in CAS-43.
  "owes" names the shortfall, so W36 fails.
- **S2: year words and anchors.** Applied: no "to"/"of"/"by"/bare "the" year words; an anchor needs a word with meaning
  (a function word list that includes NOT_THE_COUNT, articles, prepositions, pronouns and auxiliaries) or two tokens,
  or the quote's clause edge (see B1).
- **S3: the property plan.** Applied in `roles.property.test.ts`: the generator writes the quoted texts from typed
  templates and records each figure and its label; the oracle (`roleOracle()` in `role-examples.ts`, read from the
  content's fields) never reads `facts.ts` or `roles.ts`; values not held are built (the largest held value plus an
  offset, which is above every year and code), never filtered; the prose cases ("one", "zero") and the code reading of
  a five-digit row are spelled out; every `fc.assert` pins seed 20261028 and its run count; a coverage check asserts
  every pair of number roles (r, r') was reached. The verifier's own properties drop their `fc.pre` the same way.
- **S4: the shard.** Measured on the build: `roles.ts` alone took 18 min 25 s on 4 shared CPUs (about 4,400 s of
  mutant time), far above 400 s, so it has its own shard; with more tests a full shard run took 33 min, over the
  mutation job's 30-minute limit, so the reader's words moved to `roles-words.ts` (`vocabulary()`, 1,128 of the 1,850
  mutants) in a shard of their own: `packets-roles` and `packets-words` (`stryker/shards.json` and its `$comment`,
  `stryker/base.mjs` MUTATE, `tools/stryker/shards.test.ts`, `tools/stryker/affected.test.ts`, the runbook's table). The first measurement found
  1,570 of 1,988 mutants static (the word tables built when the module loads, and one test file reading facts when
  it loads); the tables are now built on each read and the test reads in its test, so none is static.
- **N1: coordination.** `packages/synth/src/cases/matrix.ts` and `registry.ts` gain CAS-43 and CAS-44 after CAS-39, as
  #74, #75, #78 and #79 also touch them (and #75 `workflow.ts`, which this item does not touch): expect textual
  conflicts there and merge `claude/build-platform` before the pull request.
- **N2: allowance 3.** Applied: a five-digit code before a count's noun is also the code only after an article, a
  determiner or a preposition, another figure, or at a sentence's start; never after "were", "totaling", "affected" or
  "of". "There were 97110 units" and "The payer underpaid CPT 12345" fail.
- **N3: the screens' words.** Applied: `apps/web/src/lib/packets/view.ts` `ROLE_TEXT: Record<FigureRole, string>`
  (TypeScript holds it to `FIGURE_ROLES`), `readAsText`, and `mismatchText(code, kind, roles)`; the editor shows what
  a failing figure was read as from `@tp/packets/check` `checkFigures()`; `view.test.ts` (new) pins every role's words.

### Departures

1. **CAS-43 and CAS-44 carry no fixture file.** The design asked for `narratives.json` in `packages/synth` module 5.
   The narratives need the packets' assembled contents, which `packages/synth` cannot build without depending on
   `@tp/packets`; they live in `packages/packets/src/role-examples.ts` (exported through `@tp/packets/testing`, so
   the worker, the gateway and the web tests can use them), and both rows are registered as `none(8, …)` with their
   tests, as CAS-30 to CAS-39 are. `pnpm synth --case` writes their `expected.json`.
2. **The facts' public shape changes** (`numbers`, `dayCounts`, `pages`, `amounts`, `percents`, `dates` give way to
   `roles`, `businessDays` and `quotes`, read through `heldRoles()`). Only packets' own tests read the old sets.
3. **"Each line billed twice" fails** (as the design said) and so does "twice", "half" or any ordinal but "first"
   without a noun; the CAS-08 fixture still fails on 1234.56 alone.
4. **The gateway's role check reports more.** It is now a reading of the packets verifier's own facts, so it also
   names pages, day counts, dates and partitives in the wrong role ("6 of the lines" and "page 6" now report), and its
   roles are `@tp/packets`' (`allowed`, not `observed`). The golden gate's swap faults now fail with both codes.
5. **A list after any role keeps it.** The review asked for "a list after a label inherits it"; the build drops the
   label flag, because a count's or a day count's noun always stands between and so nothing else is inherited (a
   mutant of the flag was undetectable); "Units: 2 and 3" reads 3 as units too.
6. **The reader keeps no sentence index.** Its windows stop at edges (a sentence's end is one), and a period after one
   letter or an abbreviation is none, so "p. 4" and "v. 2" are read as labels even where `sentenceSpans` (which the
   verifier still uses for its sentences and citations) splits them.
