# Queues item 40: Lane B's adversarial reviews, summary

Change reviewed: `git diff 17c234d2 e17c1192` (branch co-001/wip-redact-item-40). Probes ran on worktrees of both
commits through the production path the gateway uses (`redactLetterForScreen`, then `holdsIdentifier` with
`checkWorkOf`). The three files in this directory hold the reviews: `review-1-leaks.md`, `review-2-cost.md` and
`review-3-rulings.md`. One skeptic re-tested each blocker and should finding with its own script, and its verdict is
in `skeptic-A.md` to `skeptic-H.md`. A finding counts here only if its skeptic reproduced it. The head's three test
files pass: 2,717 tests in 236 s.

**Headline.** No blocker survives. Item 40 closes what it set out to close:
- No `\p{Nl}`/`\p{No}` character beside a stored identifier is sent. That is 0 of 41,544 rows beside a number and 0
  of 2,308 beside a name, where base sent 3,804 in clear.
- No unseen `\p{C}` character inside a stored identifier is sent. Review 1 probed 756 characters (lone surrogates and
  unassigned code points among them) in 32 forms.
- Nothing base refuses is sent by head (0 of 7,197 letters).
- No new pattern backtracks: a run of 50k–100k characters costs 0–7 ms per pattern.

Two of the surviving findings are new costs that item 40 itself introduced (S-1, S-2). The other three gaps also
exist on base.

## Surviving findings

| # | Sev. | Identifier in clear? | On base? | Finding (synthetic input → head output → should be) | Skeptic |
|---|---|---|---|---|---|
| S-1 | should | no (false refusal) | **no: new** | A long ordinary letter is refused on cost. Prose plus one `½` (or `²`) and one `\u0085`, with no identifier, is refused (`identifier_left`) from about **77,600 characters**; base sends up to about 254,000. `\u0085` alone moves the limit to about 118,500 and `½` alone to about 163,500. This breaks the product's promise of a 100,000-character letter checked within the budget (test-support/time-budget.ts). Each unseen character makes head read the whole letter again; each number character adds one more full reading. Head should send such a letter at 100k characters. | F reproduced the thresholds. Its `"5\n"`×28,378 example was wrong, but the effect shows at 20,000 copies. |
| S-2 | should | no | **no: new** | Part of the new reading's work is never counted. `refusedWithNumberCharactersAsOne` (redact.ts:3895-3903) sets `further.spent = counted` and only then calls `holdsIdentifier(again.text, …, counted)`, so that check's work never reaches `checkWorkOf`. The work happens twice when a letter has both kinds of character: about 98M units uncounted on the worst row still sent (n=89,687). Real work comes to about **1.23×** the budget (about 518M units). The wall time of 2.0–2.3 s holds about 0.4 s of uncounted work. Every outcome is still right, because the uncounted check is capped at `budget − counted` and can only refuse. The doc comments ("charged in full", "one budget still holds") are untrue until this is fixed. | E reproduced the ordering. Review 2's "~2×" and its example were misread: that refusal is the outer check failing closed. |
| S-3 | should | no | **no: new** | Three new tests near the budget can time out on a loaded runner. Item 40 adds **no** explicit time limit. The four `{ timeout: 20_000 }` (redact.leaks.test.ts:2562; denial-letter.test.ts:72, 439 and 452) are on base too, and the unit project keeps the 5 s default. The three tests (redact.leaks.test.ts:2863, 3041, 3047) take 3.6–3.9 s alone. With two copies run in parallel on 4 cores, 2 of 3 failed in each copy with `Test timed out in 5000ms` (6.9–10.4 s). They should carry 20 s, or the file's 60 s `LONG`. | H reproduced it in both runs under that load. |
| S-4 | should | **yes** (any stored identifier) | yes, the same | A character that is no joiner, inside a stored identifier, hides it from every reading. `Member ID 7654ↀ3210 was denied.` is sent as written. `7654Ⅰↀ3210` → `7654Iↀ3210`; `Zeph²yra` → `Zeph2yra`; `7654\u0085ↀ3210` is sent too. Skeptic A sampled 47 `Nl`/`No` characters across 6 kinds: 259 of 282 sent. Review 1's 5,718 of 5,718 overstates it, because characters NFKC turns into digits are caught by pattern (`7654¹3210` → `[SSN]`). **This is not an Nl/No gap.** A plain `X` does the same (`7654X3210`, `C20260X00417`), and so do symbols: skeptic D found 7,386 of 7,468 `\p{So}` and 951 of 960 `\p{Sm}` sent with all 8 digits recoverable. The cause is ADR 0054's closed joiner list for a digits-only number (a comma joins nothing either). The narrow new point is `￼` (object replacement), which is plausible in text taken from a PDF and could join the list. The broader question is a policy one: should any lone character inside a run of digits or letters that would otherwise match refuse the letter? | A and D: the leak reproduces on both commits. Not caused by item 40. |
| S-5 | should | initials only | yes, the same | Initials pass when an unseen character comes before their period, or when the joiner is uncommon. For JANE Q ZEPHYRA, `Dear Zephyr A\u0085.J\u0085.Q\u0085., your claim` → `Dear [PATIENT_NAME]\u0085.J\u0085.Q\u0085., your claim`; the same with `​`, `­` and `⁠`. `Dear Zephyra J\u0085.Q\u0085.` sends Q, and `Dear J​. Q​. Zephyra` sends J and Q. The joiners `A/J/Q/`, `A:J:Q:`, `A·J·Q·` and `A。J。Q。` send J and Q. `itsPeriod`/`dotted` (redact.ts:1826-1828) look for `.` only right at the end of the range, and `INITIAL_GAP`/`INITIAL_GAP_AFTER` do not accept those joiners. Head's own tests treat a sent initial as a defect (redact.leaks.test.ts:3216-3285). | C reproduced it on both commits and corrected the mechanism for the joiners. |

**Downgraded or refuted (kept for the record):**
- **Review 3 F1, nit.** "A non-ASCII `\p{Nd}` glued to a digits-only number is sent" was proposed as a blocker. Skeptic G
  ran all 760 such digits: with no label the number goes out in clear, with `Member ID` in front it is hidden, on both
  commits. ASCII digits behave the same (`Ref 376543210` is sent), and ADR 0054 records that as a residual. The
  proposed fix would make a non-ASCII digit stricter than an ASCII one. Closing it needs a re-ruling of that ADR 0054
  residual, not a change to item 40.
- **Review 1 F2, nit.** "`holdsNameOrNumber('Patient Zephↀyra x')` is false" is the recorded cost of a name split
  by a separator: `Zeph yra` is false on both commits too, and the tests pin it (redact.leaks.test.ts:840-843 and
  1768-1772). Head catches more than base here: a number character inside or after a number is caught 1,154 of 1,154
  times, against 0 on base.

**Nits, not sent to skeptics:**
- A footnote mark on a payer phone number now refuses the letter (`call 1-800-321-4567¹.`). Base sent a run of
  digits in phone shape.
- Phone residual (c) depends on the side: the character after the number is refused, but before or inside it the
  number is sent (`Call ↀ555-0123 now`, `Call 555ↀ0123 now`).
- The public `redactLetter` returns the identifier with only the trailing `\u0001` mark, and it is about 7× slower.
  No production code calls it.
- `Zephyr A. U.S. Army` for a patient with a name part U gives `[PATIENT_NAME]. [PATIENT_NAME].S. Army`. Text is
  replaced that needn't be, but nothing leaks.
- An undotted last initial before a lower-case word (`Zephyr A.J.Q was seen.` → `.Q`): this is ruling (f).
- Contrived initial chains are still missed on both commits: `A。J.Q.`, `A.:J.` and `A.. J.`.

## Verdict on each ruling

| Ruling | Verdict | Why | Safer alternative and its cost |
|---|---|---|---|
| (a) A number character beside an identifier refuses the letter, even where the first reading hid the number | **Agree** | All 1,154 `Nl`/`No` characters, in every form, beside a number and beside a name: refused. `Ref ⑴76543210` is refused where base sent `(1)[MEMBER_ID]`. No ordinary letter is damaged: Roman numerals, ½, №, footnote marks and bullets with no identifier beside them all send unchanged. The class only reads *beside* an identifier; the inside case is S-4, a separate and older gap. | Widen it to any character that is not on the joiner list, inside a run that would otherwise match (S-4). Cost: more false refusals of real numbers with typos or OCR noise, and a re-ruling of ADR 0054. |
| (b) An unseen character inside an identifier is caught by one more reading of the whole check, and refuses | **Agree on the outcome, disagree on the method** | It catches every case probed (`7654\u00853210`, `DOB 03/1\u00004/1980`, `ZZ\u00857654321`, `Jane\u0085Q\u0085Zephyra`), and letters with no identifier still send. But reading the **whole** check again is what causes S-1, a long letter refused from about 77.6k characters, and S-2, work that goes uncounted. | Re-read only windows around candidate runs of digits or name letters that hold the unseen character, and charge that check to the count. Cost: more code and a harder count proof, but no new false refusals and the 100k promise kept. At minimum, fix S-2's charging (the outcome does not change). |
| (c) A phone number not stored, found by pattern, still goes out with a number character beside it (residual) | **Agree, with a caveat** | It is not a stored identifier, and refusing on every such phone would refuse ordinary letters with footnoted payer numbers. But the residual depends on the side: after the number it is refused, before or inside it is sent. The residual's test should say which sides it covers. | A second phone-pattern pass that reads number characters as spaces, replacing the number rather than refusing. Cost: low, one more regex pass. |
| (d) Four tests carry an explicit 20 s limit; the product's bound is the counted work budget | **Agree on the principle, disagree on the facts** | A wall-time limit is only a hang guard, and the counted budget is the right product bound. But e17c1192 adds no 20 s limit (the four predate it), and the three new tests near the budget run at the 5 s default and time out under load (S-3). The counted budget does not fully bound the work either until S-2 is fixed. | Give those three tests 20 s, or the file's `LONG`, and fix S-2. Cost: nothing. |
| (e) In the wider reading, the period after a name whose match ends in one letter is the name's, so the initial after it is replaced | **Agree** | It fixes `Zephyr A.J.Q.`, `Ann A.A.`, the folded periods `．` and `․`, and `Maria X.M.`. No ordinary text is over-replaced (`Zephyr A. A claim…`, `Ann A. A claim was denied.`, `Then A.M.` all keep their letters). The accepted cost is another person's initial that happens to be one of the patient's letters (`Zephyr A. Q. Zed`). It does not cover an unseen character before the period, or uncommon joiners (S-5). | Let `itsPeriod`/`dotted` skip VANISHED characters before the period, and accept the folded joiners in `INITIAL_GAP*`. Cost: small. |
| (f) `Maria.M.L.` sends its initials; an undotted last initial before a lower-case word stays | **Agree, as a recorded residual** | Only initials go out; the name is replaced, and both commits give the same output. Taking them in general would replace ordinary capitals (`A`, `I`) in prose. | A cheap partial fix: take `Name.X.` only when another period follows, and take an undotted capital after an initial already taken, except A, I and O. Cost: low, with some risk to sentence starts. |

Context used by the Lane B reviewer session that ran these reviews: about 60k tokens.
