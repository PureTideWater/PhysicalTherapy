# Review 1 (LEAKS) of Queues item 34 (MOD-25)

2026-11-12. Head 846968af against base a97d73e4, `packages/redact/src/redact.ts`. Synthetic values only. Every
outcome below is from the two laid trees by the gate worker's path: `redactLetterForScreen`, then `holdsIdentifier`
on its text; SENT means the check did not refuse, and what is sent is that text. Coverage is from `redactionSpans`,
as `worker.mts` and `generated-run.mts` take it. The gate's oracle and classes were not run on these letters.

Scripts (scratch, not in any repo): `/tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/review-1/`
(`lib.mts`, `repro.mts`, `probe1.mts` to `probe3.mts`, `a6.mts`, `fuzz1.mts`, `fuzz2.mts`, their `.out` files).
One command per finding, from the gate's directory:

    cd /home/user/ops/designs/lane-b-redact-ssn-phone/gate && PATH=/opt/node24/bin:$PATH node --import ./ts-resolve.mjs /tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/review-1/repro.mts <id>

Patient in every row unless stated: `{ pseudonym: 'synthetic-patient-r1', names: ['JANE ZEPHYRA'], datesOfBirth: ['1961-03-03'], memberIds: [M] }`,
claims `[{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r1', claimNumbers: [C] }]` (`mk` in `lib.mts`).

## Summary

| id | severity | one line |
| --- | --- | --- |
| R1-1 | REGRESSION (partial) | A name or a number whose end is its beginning: the head's wider gap (A-4, A-5) starts a match earlier, ends it inside the real writing, and the rest of that writing is sent in clear where the base hid all of it. Up to all but the first letter (7 of 8) or digit (4 of 5). |
| R1-2 | LEAK (base the same) | A digits-only number after an identifier label written with "." or "/" and glued to a letter (`Claim No. 7654.3210B`) is sent whole: rule (a) reads the forms' `pattern`, never `labeled`. 128 of 128. The narrative check passes it too. |
| R1-3 | LEAK, unless the "digit beside" ruling is read to hold it (base the same) | A number character that is no decimal digit right beside the number (`Ref ↀ76543210`, U+2180): sent in clear for 1,890 of 1,906 placings of 953 characters. |
| R1-4 | LEAK (base the same) | A control character or U+0085 inside the number (`Member ID 7654<U+0085>3210`): the standing number is sent in clear for 57 of 62 characters, glued too; A-4 joins the same characters inside a name. |
| R1-5 | LESSER | Point 28: the refused text. No product caller shows or stores it; `redactLetter`'s text carries U+0001 on the head only where some placeholder is written, and holds the glued number in clear either way. |
| R1-6 | LESSER (base the same) | A-6 makes `\n\r+` one line ending and no other mixture: `\f\r`, `\v\r`, U+2028 `\r`, U+0085 `\r`, `\r` U+0085, `\r\f`, `\n` U+0085 are sent where their one-character control is refused. |

No letter was found that the base REFUSES and the head sends: 0 of 52,858 fuzzed letters, 0 of 170 hand rows.
No digits-only number of 5 digits or more glued to a letter was found in any text the head sent, outside R1-2 to R1-4.

## Findings

### R1-1 REGRESSION (partial): an earlier match under the wider gap leaves the rest of the real writing in clear

Bears on A-4 (`GAP.apart` = `runOfMarks()`), A-5 (`runOfMarks(own)` in `numberForm`), review points 1, 3, 13 and the
ruling "nothing the base redacts or refuses may be shown or sent by the head".

Mechanism: each form's matches are leftmost and do not overlap. Where the value V ends as it begins (V = P + B, and V
starts with B), the text "P, mark, V written in the base's wider form" lets the head match P + mark + the first B of
the real writing; the scan then goes on from inside the real writing and its remainder matches nothing. The base
cannot cross the mark, so it matches the real writing whole. The first reading does not save it, since the real writing
is one only the wider reading takes (a name written apart; a number with the records' separator).

Names (A-4):

- names `['ZEPHYRAZ']`, M `'SYN555001'`, C `'ZZ99887'`; text `'ZEPHYRA: Z E P H Y R A Z'`
  - base: SENT `'ZEPHYRA: [PATIENT_NAME]'`
  - head: SENT `'[PATIENT_NAME] E P H Y R A Z'` (7 of the name's 8 letters, where the base showed a cut form and hid the name)
- names `['AMBRIDA ZEPHYRA']`; text `'Ambrid, a m b r i d a'`: base `'Ambrid, [PATIENT_NAME]'`, head `'[PATIENT_NAME] m b r i d a'`
- Counted (`repro.mts R1-1`): 8 invented names (ZEPHYRAZ, ORLENDO, AMBRIDA, ELVANNE, TARKETT, NOXIAN, QUIXQU, ZEPHZE),
  10 marks, 3 gaps, 2 cases of the cut form, 2 cases of the name: **960 letters; the base hides the whole name written
  apart in 960; the head shows letters of it in 960, refuses 0; most shown 7.**

Numbers (A-5), `repro.mts R1-1n`:

- M `'7,654,7'`; text `'7: 654 # 7,654,7'`: base SENT `'7: 654 # [MEMBER_ID]'`, head SENT `'[MEMBER_ID],654,7'` (4 of 5 digits, with the records' own separators)
- M `'7,654,7'`; text `'Paid 7.654 $7,654 7 today'`: base `'Paid 7.654 $[MEMBER_ID] today'`, head `'Paid [MEMBER_ID],654 7 today'`
- M `'2,212,2'`; text `'2\r\n212 $2,212 2'`: base `'2\r\n212 $[MEMBER_ID]'`, head `'[MEMBER_ID],212 2'` (found by `fuzz2.mts 202`)

The fuzzers found the same class 11 times in 52,858 letters and no other (below). In each the head covers more letters
of the letter than the base overall; what turns is which occurrence is in clear. The gate's worker would class these
`INFO.partial-in-clear`, not `PHI.*` (some of the value's characters are covered), so the gate and the generated set
cannot see it. A fix that holds the ruling: apply the base's wider matches too (the union of both gaps' matches), or
refuse where a wider match ends inside a longer run that the narrower gap reads as the value.

### R1-2 LEAK (base the same): the labeled form glued to a letter

Bears on rule (a) ("in each of its wider forms"), points 6, 17, 19 and (d).

- M `'76543210'`, C `'ZZ99887'`; text `'Claim No. 7654.3210B paid'`: base SENT unchanged, head SENT unchanged (the member ID whole).
- Controls on the head: `'Claim No. 7654.3210 paid'` is `'Claim No. [MEMBER_ID] paid'`; `'Claim No. 76543210B paid'` is REFUSED.
- Counted (`repro.mts R1-2`): the number as member ID and as claim number, 8 labels (`Claim No. `, `Claim `, `ICN `,
  `Member ID: `, `DCN `, `Claim # `, `Policy No. `, `Ref. No. `), "." and "/", glued `X` before, `B`, `mg` after, `q` before:
  **128 of 128 sent by the head with the number in clear; the 32 controls not glued are all hidden or refused.**
  `holdsNameOrNumber` passes 128 of 128 of the same texts (names `['JANE ZEPHYRA']`, numbers `['76543210']`).

Cause: `digitsGluedToLetter` builds its cores from `form.pattern` alone (`coreOf`); a digits-only form's `labeled`
pattern (`GAP.labeledNumber`: "." and "/" join after an identifier label) is a writing the first reading takes when the
number stands, and no reading takes when a letter is against it. Not a "Left" cell and not the recorded residual.

### R1-3 LEAK unless ruled into "a digit right beside": a number character that is no decimal digit

Bears on rule (a) (`\p{L}` on each side) against `BEFORE`/`AFTER` (`[\p{L}\p{N}]`), and ruling 4.

- M `'76543210'`; text `'Ref \u218076543210 on file.'` (U+2180, a Roman numeral sign): base and head SENT unchanged.
- text `'Ref 76543210\u1369 on file.'` (U+1369, an Ethiopic digit, class No): base and head SENT unchanged.
- Counted (`repro.mts R1-3`): every character below U+20000 that is \p{N}, not \p{Nd}, and unchanged by NFKC: 953
  characters, each right before and right after: **1,890 sent in clear, 16 refused, 0 replaced.**

The first reading does not take the number (a \p{N} stands against it) and rule (a) asks for a letter. The ruling
records "a digit right beside the number: another, longer number"; these are not digits of a longer number of the
records' kind (letter-like numerals, fraction and currency signs of class No). If the ruling is read to hold every
\p{N}, this is recorded and not a finding; it is not written so in the design's "Left" cell, which lists digits only.

### R1-4 LEAK (base the same): a control character or U+0085 inside the number

Bears on point 21, A-4 and A-5 ("a run of marks joins" only inside a name's part and where the records write a separator).

- M `'76543210'`; text `'Member ID 7654\u00853210 paid'`: base and head SENT unchanged. With `\n` there: `'Member ID [MEMBER_ID] paid'` on both.
- text `'Fax X7654\u00853210 ext'`: base and head SENT unchanged. With `\n`, `\f`, `\v` or U+2028 there the head REFUSES (`probe3.out`, h1).
- text `'Member ID 7654\u00003210 paid'`: base and head SENT unchanged; U+200B there is replaced on both.
- Counted (`repro.mts R1-4`): 62 characters (U+0000, U+0004 to U+001F, U+007F, U+0080 to U+009F), in `Member ID 7654?3210 paid`
  and `Fax X7654?3210 ext`: **standing, 57 sent in clear and 5 replaced (the white space ones); glued, 57 sent in clear
  and 5 refused.**

The same characters inside a name are joined by A-4 on the head (`'Dear Zeph\u0000yra,'` is `'Dear [PATIENT_NAME],'`;
the base sent it), and U+0085 was a line break inside a name on the base already (`LINE_BREAK`). In a number they are no
joiner (`NUMBER_JOINERS` has `\s`, which does not hold U+0085 or any C0 control but the white space ones), so the eight
digits go to the model with one invisible character between them. Point 21's question answered for numbers: no control
character joins there, a line break (U+0085) included. A visible mark in the same place (`7654.3210`) is the design's
"never where the records write nothing"; an invisible one and a line ending are not stated anywhere as left.

### R1-5 LESSER: what a refused letter returns (point 28)

`repro.mts R1-5`. M `['76543210', '21318-5']`.

- `'Fax 21318-5B ext, Jane Zephyra'`: head `redactLetterForScreen` text `'Fax 21318-5B ext, [PATIENT_NAME]\u0001'`, the
  number in clear before the mark; `candidates` are the first reading's, the same list as the base's
  (`["21318","213185B","213185BEXT","5BEXT","FAX21318","FAX213185B"]`), so they hold the patient's own number glued, as on the base.
  `redactionSpans` text: `'Fax 21318-5B ext, Jane Zephyra\u0001'`. `redactLetter` text: `'Fax 21318-5B ext, [PATIENT_NAME]\u0001'` (base: the same without the mark).
- `'Fax X76543210 ext 12'`: no placeholder, so no mark on any entry: head `redactLetter` and `redactionSpans` return the
  letter unchanged, as the base does. Only `holdsIdentifier` refuses it.
- Callers (grep over `packages/`, `apps/`, tests left out): one, `packages/model-gateway/src/functions/denial-letter.ts:230-240`,
  which throws `InputRefusedError('identifier_left')` before `context` (text, candidates) is built: nothing shown or
  stored. `redactLetter` is exported (`packages/model-gateway/src/index.ts:208`) and has no product caller; `redactionSpans` none.
- What to note: the mark is not a signal a caller of `redactLetter` can rely on (present only when something else was
  replaced), and its text now ends with a control character where it did not. No leak today.

### R1-6 LESSER (base the same): line-ending mixtures A-6 does not read as one

`repro.mts R1-6`. M `'76543210'`; text `'SSN verified. Account ' + E + 'No. 900-12-345678'` (the pinned A-6 row's frame).

- `\n\r`, `\n\r\r`, `\r\n\r`: base sent, head REFUSED (A-6 as designed).
- **Sent by the head where its one-character control is refused: 9 of 17 mixtures tried**: `\f\r` (control `\f`), `\v\r`, U+2028 `\r`,
  U+0085 `\r`, `\r` U+0085, `\r\f`, `\n` U+0085 (control `\n`), and two that depend on how they are counted:
  `\r\r` and `\n\r\n\r` against one `\n` (against `\n\n`, which the head also sends, they are consistent).
- What is sent is the SSN-shaped account number of the pinned row, not a stored identifier.

## Point 4 of the brief (points 20, 26, 32): what is left in clear under one first-reading span

`probe3.out`, section B. In every replaced-not-refused row no digit of the number is left:

- M `'8852780545'`: `'Fax X8852780545 ext'` is `'Fax X[MEMBER_ID] ext'`; `'Fax X8852780545B ext'` is `'Fax X[MEMBER_ID]B ext'`;
  `'Tel X885-278-0545 ext'` is `'Tel X[MEMBER_ID] ext'`; two occurrences, each glued, each replaced. Left: the letters X and B.
- M `'128852780545'`: `'Fax 12-8852780545B ext'` is `'Fax [MEMBER_ID]B ext'`. Left: B.
- M `'900123456 01'`: `'Fax 900123456B ext'` is `'Fax [SSN] ext'` (the B taken too); `'SSN 900123456X01'` is `'SSN [SSN]X01'`
  (left: `X01`, the piece under 5, recorded); `'Fax 900-12-3456B'` is `'Fax [SSN]'`.
- M `'900123456'`: `'Fax X900123456 ext'` is `'Fax X[MEMBER_ID] ext'`; `'B900123456B'` is `'B[MEMBER_ID]'`.
- M `'12345'`: `'Acct12345'` is `'Acct[MEMBER_ID]'`; `'Acct12345\u200bB'` is `'Acct[MEMBER_ID]\u200bB'`.
- Where a span takes a PART, the head refuses each row tried: `'Fax X8-852780545 ext'`, `'Fax X12-8852780545 ext'`,
  `'SSN 900-12-3456-01B'` (base sent `X8-[SSN]`, `X12-[PHONE]`, `[SSN]-01B`); for M `'03777'`, `'DOB 1961-03-03 777B'`
  (base `'DOB [DATE_OF_BIRTH] 777B'`); for M `'3456777'` and C `'0199555'`, `'SSN 900-12-3456 777B'`, `'Tel. 555-010-0199 555B'`.

## What held

- Differential fuzz `fuzz1.mts` (stored names with + & ( * : marks, numbers with separators and shared pieces, digits of
  four other scripts, 52 marks, glue letters, labels, LF/CR mixtures): seeds 101, 102, 103: 13,536 + 17,676 + 9,036 =
  40,248 letters. Base refused and head sent: 0. Head threw: 0. Head text not equal to its spans' writing: 0. Base
  covers a character the head shows: 4 letters, all R1-1's class (2 to 4 letters of a name).
- Small-alphabet fuzz `fuzz2.mts` (names and numbers over 2 or 3 characters, so writings overlap): seeds 201, 202:
  6,820 + 5,790 = 12,610 letters. Base refused and head sent: 0. Base covers, head shows: 7 letters, all R1-1's class
  (6 names, 1 number); none with a stored value whole in the head's text.
- Sent-text detectors on seeds 102 and 103 (26,712 letters): a digits-only number or piece of 5+ digits glued to a letter
  in the head's sent text: 0. Standing whole: 9 flagged, each read by hand: 8 a piece written as a date (6 `2026-11-15` for a number held
  `20261115 000123`, the design's exception; 2 a piece `12345` written `1 - 23 - 45` and `12—3—45`, which I take to be
  the same exception and did not confirm in the source: `Fax 1 - 23 - 45 x` is sent on both trees), 1 a digit beside
  the piece (`912345`): recorded.
- Hand rows `probe3.out`: 170 rows; base refused and head sent 0; rows the head refuses and the base sends: 58; rows both refuse: 19 (and 1 more, base and head each refusing);
  rows where the head's sent text holds a stored number whole: 5 (all R1-4's).
- Bordered numbers under A-5 with an amount shape (`probe2.mts`, stored `c1/Yc1`): 2,700 letters, 0 where the head
  shows the value and the base does not (the `AFTER` guard stops a match inside a run of digits).
- Point 2 (apostrophe letters): 18 rows; pieces split at U+02BC, U+02B9, U+02CA; `ʼ12345`, `12345ʼB`, `xʼ12345` refused.
- Point 3 (two numbers share a piece): 13 rows; every piece replaced, the first in the call's order giving the placeholder; nothing in clear.
- Points 19 and 27: 26 rows (a part under a birth date's, [SSN]'s, [PHONE]'s or a shorter number's span; a private mark,
  U+FEFF, U+FFFD, brackets inside): 24 refused on the head, 2 replaced whole with nothing left (`X900-12-3456 777` for a
  number held `3456777` is `X[MEMBER_ID]`; `7654<U+0000>3210` for one held `7654/3210` is `[MEMBER_ID]`); no reading found
  that rewrites a part without a span.
- Point 25 (no placeholder written, so the check alone reads rule (a)): no miss found; 0 glued numbers in 26,712 fuzzed
  sent texts; `'Fax X76543210 ext 12'`, `'x76543210'`, `'76543210b'`, start and end of text, refused.
- Other scripts and NFKC forms glued (`probe1.mts`): fullwidth, Arabic-Indic, keycap (U+20E3), `ª`, `µ`, U+212B, U+33A1,
  U+FDFA, tatweel, U+30FC: refused. U+2103 and superscript two after the number: replaced as on the base.
- LF, CR LF, LF CR, CR, CR CR LF, FF, VT, U+2028, hyphen and line break inside or beside a glued number: 24 rows
  (`probe1` 6, `probe3` h1 18): 19 refused, 4 replaced whole (the line ending stands between the letter and the number),
  1 sent (U+0085: R1-4).
- Narrative check: 31 texts, base true and head false 0 (`probe3.out`, section I).

## Not tested

- The gate's worker with its oracle and classes on these letters (only its path and its coverage rule were used); the
  generated set with a second seed; the battery; any test file; work budget and timing (point 29).
- Whether R1-1 can leave a whole value (every letter) in clear: not found in 53,818 letters built for it; the mechanism
  as read always covers the first B characters.
- Look-alike letters for digits beyond two rows (`X7654321O`, refused on both); names in other scripts; texts over a few hundred characters.
- U+24FB and like digit signs with no NFKC form (`Ref ⓻6543210` is sent on both, one row): not counted.
