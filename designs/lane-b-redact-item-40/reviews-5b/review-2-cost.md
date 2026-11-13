# Stage 5b, fix round 1: review 2 (cost and regressions)

Delta 61600c7c..ae0b6a3f. OLD = /tmp/claude-0/m5b/s3, NEW = /tmp/claude-0/m5b/head. Production path everywhere
(`redactLetterForScreen`, then `holdsIdentifier(r.text, P, C, checkWorkOf(r))`). Patient and claims as in the brief
(member IDs 76543210 and ZZ7654321, claim ZZ99887). All data synthetic. Probe scripts are in /tmp/claude-0/rev5b-2/
(probe1 to probe5). `w` below is `checkWorkOf(r)`, which does not include the caller's final check.

## Findings

### C-1 (should): one footnote mark makes an ordinary claim-detail letter refused on cost from about 62,000 characters (OLD: about 97,000)

The ADR's recorded cost 6 and the S-1 test pin a narrower case than what happens. They describe prose with one `½`
**and** one U+0085, refused from about 77,600 characters. With the check now charged, a letter that has **only** one
number character is refused far earlier when it is shaped like a real letter: CR LF line endings and digits on every
line. The CR LF means the check reads the text twice, and the further reading's check is now charged too.

Input (probe3.mts): `'Dear Jane Zephyra, member ID 76543210. See note¹.\r\n'` followed by repeated lines of the form
`'Line <i>: CPT 97110 billed USD <45..94>.00 on 03/<dd>/2025, allowed 38.12, paid in part.\r\n'`, cut to L characters.
The control is the same letter without the `¹`.

| L (body) | control OLD / NEW | with `¹` OLD | with `¹` NEW |
|---|---|---|---|
| 60,000 | sent, 60.4M / 60.4M | sent, w 122.8M | sent, w 258.4M |
| 62,000 | sent | sent, w 126.8M | sent, w 267.0M |
| 64,000 | sent | sent, w 130.9M | **REFUSED** (cost: w 275.6M, then the final check passes 420M) |
| 78,000 to 96,000 | sent | sent | **REFUSED** |
| 98,000 | sent | REFUSED (OLD's uncounted check also stopped at the budget) | REFUSED |

The same happens with `½` in place of `¹`. Work per character with one number character: OLD about 2,050, NEW about
4,300 before the final check, plus about 2,250 for the final check. The control costs about 1,000. Wall time stays
about 2 s, so this is a refusal and not a timeout.

The accounting is correct and matches what S-2 asked for, so this is not a code bug. It is a regression in outcome
for ordinary letters: a single footnote mark, fraction, ① or Ⅳ is common, and the letter is now refused below the
100,000 characters the reader's time budget promises. The ADR's cost item and the S-1 test should state this case
(about 62k, one character, CR LF with digits) rather than the prose-plus-U+0085 case, or Queues item 39 needs to be
ruled in. Code: redact.ts 3899-3907 (the new charged check) on top of the further reading at 3880-3881.

### C-2 (nit, pre-existing, not changed by the delta): redactionSpans' stages each count from zero

`redactionSpansBesideNumberCharacters` calls `refusedWithNumberCharactersAsOne(text, …, 0)` with no `further` (line
3669). The new `check` count is computed and then thrown away, just as before. `redactionSpans` then calls
`refusedWithUnseenCharactersJoined(…, { spent: 0 })` (line 3660). So that entry can still spend several budgets in
total. This is unchanged by the delta and is the documented design of that entry ("counts its work from nothing"),
but it is still work that no single budget bounds.

### C-3 (nit, tests): the S-1 pin is too optimistic

The S-1 test pins only prose: refused at 100,000, the plain prose sent. It passes, but it does not pin the earlier
threshold that real letters hit (C-1). A row such as the 64,000-character CR LF letter above, refused, with its
control sent, would pin the recorded cost honestly.

## Checked and found sound

- **Accounting of change 1.** `holdsIdentifierCounted` writes `min(checkWorkSpent, BUDGET+1)` in `finally`, and
  `BUDGET+1` when the budget is passed (lines 4232-4241). Its early returns (a private mark in the text, or a count
  outside 0..BUDGET) leave `check.spent = counted`, but both of those refuse anyway.
- **No double counting.**
  - On the `redactLetterForScreenBesideNumberCharacters` path, the new check reads `again.text` (the asOne reading).
    The caller's final check reads `read.text`. These are different texts, each charged once.
  - On the `refusedWithUnseenCharactersJoined` path, the nested number-character check reads the unseen-joined
    asOne text, and line 3803 reads the unseen-joined reading's own output. These are distinct, each charged once.
  - Where `asOne === text`, `asGiven` is set and no check is asked, as before.
- **Short-circuit order is unchanged:** refused, then placeholder, then count, then holds. The returned boolean is the
  same as OLD for every input that stays within the budget; only `further.spent` grows.
  - Small letters with a number character cost about 45 to 50% more. Examples: `'Dear Jane Zephyra, member ID 76543210. Visit ¹ on 03/14/2025: CPT 97110 x 2 units, $45.00 paid.'`
    goes from 471,830 to 704,848, and `'Claim ZZ99887 paid ½ of $90.00 for 97110.'` from 348,540 to 521,900. Both are
    sent, with the same text.
- **No new way to exceed wall time.** OLD's uncounted check was itself limited to the budget from `counted`, so OLD's
  overrun was at most one check. NEW removes even that.
- **Regex cost of the wider joiners.** Each of these takes 0.06 to 0.8 s, OLD and NEW alike, and every unit is counted:
  - a run of 20,000 U+2180 or U+FFFC between digits;
  - 20,000 alternating `7ↀ`, and the same with spaces as a control;
  - 60,000 characters of alternating `76` and U+FFFC;
  - 40,000 characters of alternating `7654` and `❶`.

  The joiner class shares no characters with `\d`. `\s` was already in it, so a `[J]*` gap adds no new ambiguity.
- **Ordinary letters under the wider joiner (probe1 and probe5, 40 letters).** Text and refusal are the same as OLD
  in every case except where the joined digits are exactly a stored number. Letters with no identifier issue that
  behave the same:
  - list markers ① and ❶ to ❸, Ⅰ and Ⅱ, Ⅳ and ⅳ;
  - `2½` and `7654½ units; 3210`;
  - footnote ¹ and ² next to CPT codes;
  - U+FFFC before, after or between CPT codes, dates, page numbers and the stored number (`76543210￼5`,
    `76543210￼2025-03-14`, `Page 1￼2￼3`).

  Changed outcomes, all of them the stored digits joined:
  - `Invoice 7654￼3210 …`, `Totals 7654 ￼ 3210`, `765￼43￼210` and `7654￼\n3210`: OLD sent the
    digits in clear, NEW writes `[MEMBER_ID]`.
  - `Codes 765 ❹ 43210 billed.`, `Line 7 6 5 4 ↀ 3 2 1 0 here.` and `Ref 765ⅰ43210.`: OLD sent, NEW REFUSED.

  This over-reach is the same kind the old joiners already accept for spaces (`765 43210` matched before). I found
  no realistic letter where a footnote mark or U+FFFC joins a stored number to unrelated digits.
- **The S-2 row's measurement is sound.** For a text that holds no identifier, the check's work W does not depend on
  where it starts. It refuses exactly when `middle + W > BUDGET`, so the outcome is monotone in `middle`. The least
  refusing value is `BUDGET − W + 1`, and the formula recovers W. A text that holds an identifier would give
  `BUDGET + 1` and fail loudly. The row fails on OLD for the stated reason: OLD pinned `plain + asOne` exactly, and
  W is greater than 0.
- **The other new tests.**
  - The S-4 U+FFFC rows fail on OLD, which sent the digits in clear.
  - The "same prose alone is sent" row and the item 42 row pass on OLD too. They are labelled as controls, which is
    fine.
  - The 20 s limits apply to rows that take 2 to 4 s alone.
  - The property test has no explicit limit, but its letters are short (about 15 ms each), so it is not a flake risk.

No blocker found.
