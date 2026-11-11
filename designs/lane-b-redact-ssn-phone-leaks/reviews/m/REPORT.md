# Review M: the screen's second reading in `redactLetterForScreen` (ac412151 -> 247a53e3)

The reviewer's report as its last message (2026-11-11; 21 tool calls), saved here by W13. Look-alike characters are written
`<U+XXXX>` in this copy. Scripts are beside this file (synthetic twins only). W13's verification is in `../l/VERIFIED.md`.

One MAJOR finding under (C); (A), (B), (D), (E) hold.

## M-1 (MAJOR, claim C): the L-1 repair restores nothing when a token of the hidden number is itself one of the call's short identifiers

Letter `"Member ID: ZZ1980O314\n555-0123\nPaid in full."`. Patient: names `['JANE Q ZEPHYRA']`, DOB `['1980-03-14']`,
memberIds `['ZZ19800314']`, claims `[['0123']]`.

| tree | text | refused | `5550123` among candidates |
|---|---|---|---|
| base | `"Member ID: ZZ1980O[PHONE]\nPaid in full."` | false | yes |
| before | `"Member ID: [MEMBER_ID]\nPaid in full."` | false | no |
| head | `"Member ID: [MEMBER_ID]\nPaid in full."` | false | no |

Head's candidates here equal before's: `3145550123 3145550123PAID ZZ1980O3145550123 ZZ1980O3145550123PAID`.

Same letter, memberIds `['ZZ19800314','555']`, claims `[['SYNCLAIM0001']]`: same three texts, none refused. Base offers
`5550123`; before and head do not. Here head's candidates do differ from before's (it gains `0123PAID`, `0123PAIDIN`).

The test's other L-1 rows fail the same way with one short identifier added (text and refusal identical on head and before;
base offers `5550123`, before and head do not):
- `"7654E210 555-0123"`, memberIds `['7654321','76543210']`, claims `[['0123']]`: head sends `"[MEMBER_ID]"`, base `"7654E[PHONE]"`.
- `"Claim SYN445S667\n555-0123"`, memberIds `['ZZ7654321','0123']`, claims `[['SYN4455667']]`: head sends `"Claim [CLAIM_1]"`, base `"Claim SYN445S[PHONE]"`.
- `"Member ID: ZZ1980O314\n555-0123"`, memberIds `['ZZ19800314']`, claims `[['SYNCLAIM0001'],['0123']]`: head sends `"Member ID: [MEMBER_ID]"`.
- memberIds `['ZZ19800314','0123']` with the first letter: same outcome.

Control: `"Call 314 555-0123 today."` with claims `[['0123']]` (no look-alike writing) offers `5550123` on all three trees.
The short identifier inside a number is handled on its own; it fails only combined with the merged span.

Found by the random generator too (fuzz seed 23): a letter with memberIds `['ZZ7654321','555']`, claims
`[['SYN4455667'],['SYN4455668','4455667']]`, a look-alike writing of the first claim number, a zero-width space and
`555-0123`: head sends it with `[CLAIM_1]-0123`, not refused; base offers `5550123`, head does not.

Mechanism. In `redactLetterForScreen`, `ownText = written(normal, merge(found.filter((match) => !isPatternKind(match.kind))))`
removes the pattern's match before `merge` runs. So `merge`'s own rule (a match of the call's own inside, and not equal to, a
Social Security or phone number lends that span no rank: `reach`, R6b) never applies, and the short identifier is replaced by
itself. `ownText` becomes `"Member ID: [MEMBER_ID]\n555-[CLAIM_1]\nPaid in full."`, whose pieces are under five characters;
`screenText` still hides the whole merged span. On base the span is `[PHONE]`, left as written, so `555-0123` is read.

Rate.
- `family2.mts` (9,578 letters sampled from 38,304): with the number's last four or first three digits as an own member ID
  or claim number, 209 sent letters where base offers the number and head does not (100 and 109), and 0 restored.
- Same run, no own identifier inside: 0 missing, 48 restored. With an own four digits that are not a whole token of the
  number: 0 missing, 108 restored.
- Random fuzz: 1 in 5,742 sent letters (seed 23), 0 in 8,925 (seed 11). The generator plants such an identifier in about
  30% of letters that hold a number.

Repair tried, in a private copy only (`fix/redact.ts`): before merging, drop the own matches that lie inside and are not
equal to a pattern's match, by the same `reach` rule `merge` uses. On 3,192 sampled family letters: 0 missing, 34 and 33
restored in the two failing classes, sent text and refusal as before, no candidate lost, no own identifier offered. I did
not check that its candidates are a superset of head's, only of before's.

Reproduce: `probe1.mts` (rows d1 to d10), `family2.mts 4 1` (rows s1 to s8 at the end), `fuzz.mts 70 23 0`. Against the
repair: `HEAD_SRC=/home/user/review-m/fix/redact.ts node family2.mts 12 5`.

## Ran, nothing found

- (A) by reading. Hunk 2: `glued.filter(... found.some ...)` is evaluated in full before the loop pushes pattern matches, so
  `found` there is exactly what the copy held. Hunk 1: `merge` sorts a copy, relabels through spread copies and replaces
  span entries; `written` is pure; `spans`, `sent` and `found` are untouched.
- (A) and (B) by differential run, head and before fed the same sequence so carried state would show: `fuzz.mts` seeds 11
  and 23, 10,633 + 6,763 letters (own identifiers plain, look-alike with l I O S Z B E b, Arabic-Indic and Devanagari
  digits, U+A6EF, split by a joiner; nested ID sets; names with new joiners and digit-for-letter; DOB writings; 24 planted
  numbers; 24 joiners including invisible ones; placeholders and the held sentence as filler); gen2 seed 7011, 3,209
  letters; `family2.mts`, 9,578 letters. Result: sent text, refusal and `redactionSpans` identical; `redactLetter` text and
  `holdsIdentifier` of the raw letter identical (fuzz only); 0 candidates lost; no exception on either tree.
- (D). Across the 298 letters where head gained candidates: 0 equal to an own member ID or claim number; 0 that are not a
  substring of the letter's compact form (nothing joined across a placeholder); 0 placeholder words. The `own.has` filter
  covers the new text by construction.
- (C) other attacks, all clean: a name glued to a number (refused on all trees); `"03/14/1980-555-0123"` (head now offers
  `5550123`, base does not); the date of birth inside nine digits (offered on all trees); the call's date of birth as
  yymmdd inside the number (restored); `"Call 202-555-0123PHYRA today"` (same on all trees); a pattern over two own matches
  (base does not offer the gap); the held ending (restored); planted whole numbers in the fuzz with no own identifier
  inside: 0 that base offers and head does not.
- (E) `time.mts`, best of 3, alternating. No exception, including the empty letter and lone surrogates. Head/before: 1.14
  (200 KB, a merged run on every line), 1.08, 1.07, 1.04, 1.09, 0.98 (200 KB letters of five other kinds), 1.32 (20 KB,
  merged on every line: 40 ms and 53 ms), 1.13 (a 4 KB letter: 11 ms and 12 ms).

## Minor
1. The doc comment on `redactLetterForScreen` describes one "letter with only the call's own identifiers replaced"; the code
   reads two texts, and "as ef3e8d20 offers it" is false for M-1.
2. In `matchesIn`, with the `own` copy gone, `leftToTheCheck` is right only because the filter runs before the push loop on
   the same array; the comment does not say so.
3. None of the five L-1 test rows has an own identifier inside the number, so M-1 is unpinned.
4. Not an M-1 instance, same mechanism: `"ID ZZ1980O900-12-3456"` with memberIds `['ZZ19800900','3456']` loses `123456`
   against base, but the whole `900123456` is still offered through the match's compact forms. Likewise `"Tel
   202-555-7654E210"` with own `555` loses `202555`.

## Did not get to
- `family2` in full (three samples of 1/4, 1/9 and 1/12, not the 38,304).
- The number written before the own run, with a planted check (one probe only).
- More than 3,209 gen2 letters with the extra checks.
- Ten or more claims (`[CLAIM_10]` and up) outside the timing letter.
- Letters over 235 KB.
- Whether the repair's candidates are a superset of head's.
