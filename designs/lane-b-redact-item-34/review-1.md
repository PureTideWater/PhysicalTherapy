# Review 1 of design.md (Queues item 34): adversarial

Probes: `/home/user/m34/review/{a,b,w}.mts` and their `.out` (proto; floor 0 = base, 6), `probe-base.out` (the note's
probe.mts), `noW/` = the proto without `widerReading = true`. Twins only.

**R1 blocker. The recorded residual is misstated.** Claim: sent only when "glued to digits on both sides". a.out,
floor 6: `Ref 0076543210 ok`, `Ref 7654321001 ok`, `Ref 976543210 ok`, `Ref 765432109B ok`, `Member ↀ76543210 ok` all
SENT. A digit (any `\p{N}`) on ONE side is enough, a letter beyond it too. Zero padding and a suffix glued are the
realistic writings. The (a) row's example is also false: `XYZ7654321001` is not refused, it is sent as `XYZ[PHONE]`. Change: "a digit on either side"; name the padded and suffix forms; fix the example.

**R2 blocker. (a) does not read the number as stored.** Claim: "matched with its own gaps"; (c) "under (a) when
digits alone and glued". proto.sh's `digitsGluedToLetter` reads `formsOf(subject)`, the first reading's forms. a.out:
held `7654/3210`, `Fax X7654/3210 ext` f6 SENT, while `Fax 7654/3210 ext` is redacted. P6, A-5 and (c) writings glued
to a letter stay sent, and work.mts charged none of those cores. Change: say (a) reads the wider forms (as stored,
A-5, pieces) or record the leak; run work.mts again with them.

**R3 should-fix. Work budget.** (i) "+0.2M to +1.2M" and "about 0.3%" hold for two numbers on one fold. The charge is
2 x numbers x characters x folds x writings. w.out, ten digits-only claim numbers: +2.0M per 100k; +5.8M prose CR LF
150k; +11.6M (2.8%) with one Cyrillic letter. (ii) "none is known" is false: `dates spaces 100k` with ten 7-digit
claim numbers, 418.78M sent, 420.78M refused. (iii) "it takes the stored view" is true only because the proto sets
`widerReading = true` (redact.ts:568-590, `takenAgain`; the `Stored` comment keeps that for `widerMatchesIn`).
Without it (noW), two numbers: +3.4M per 100k reading, +9.9M CR LF 150k, +19.8M with a look-alike. Change: give the
formula, the worst case by count of numbers, the known row; state the flag as part of the rule.

**R4 should-fix. The floor.** (i) Cell L=5 "`97110`: 2,784" is wrong: floor-summary.json `all L=5` top is
`00102 in 4508`. Over all sent letters there is no break at 6 (4,508 at 5, 6 and 7); the break is T3's alone.
(ii) "6, by measurement" measures cost only; nothing counts stored numbers of 5 digits or fewer, and
redact.ts:4934-4945 itself expects "a five-digit patient control number". (iii) 0.15% is T3's handful of codes. Floor
5 costs a refusal, floor 6 a number in clear: the note's own "refuse where no boundary can be known" points to 5 until
that count exists. (iv) `SCREEN_FLOORS` is cited selectively: it holds 8 for patient control numbers. (v) The residual is knowable per call; no count or warning is proposed.
Change: fix the cell; title it "6 proposed: cost measured, exposure not"; rule 5 pending the count or argue why not.

**R5 should-fix. A pinned row that does not turn.** `redact.property.test.ts:1064-1066` asserts
`redactLetter(...).text` is as written. Rule (a) refuses, never redacts: a.out, `redactLetter f6 Room AB99887766 ->
"Room AB99887766"`. The row stays green and its comment ("stay") becomes false. Change: list it as "kept; add
`holdsIdentifier` true". The block `review B, the recorded costs` (leaks test 1121-1123, "recorded ... for Queues item
34") is not mentioned: say which of its rows turn.

**R6 should-fix. A-6: the note and its script differ.** Note: "each such pair". lfcr.mts folds `\n\r+`. a.out,
`\n\r\r`: third(pair) false = sent; third(`\n\r+`) true = refused. Item 26 took `\r\r\n` as one ending. Change: write `\n\r+`, pin `\n\r\r`, record that `\n\r\n`, `\n\n\r`, `\n \r` stay sent as `\n\n` does today.

**R7 should-fix. (c).** (i) A piece under 6 is not in the residual: b.out, held `ZZ123 01`, `Member ID: ZZ123` SENT;
held `12345 01`, `Member ID: 12345` SENT, a label before it. (ii) A piece that is a date: held `20261115 000123`,
`Seen 2026-11-15` is kept today; under (c) the 8-digit piece (dashes join) replaces the date of service, and
`2026-11-15to` refuses under (a). The date and amount exceptions are stated for A-5 only. (iii) Unstated: a piece two
of the call's numbers share (which placeholder), and whether a joiner (`ZZ12345-01`, sent today) is a "separator".

**R8 should-fix. (b).** Leaks left and not recorded, b.out: held `ZEPHYRA2` (a digit marker), `Ms. Zephyra` and
`Jane Zephyra` SENT; held `JANEZEPHYRA`, `Ms. Zephyra` and `JANE` SENT. Cost not stated: held `ZEPHYRA*MEDICARE`
makes `MEDICARE` a word of the name, so every "Medicare" is replaced and, under (d), every narrative that says it is
refused (today SENT). Change: record both leaks or split at digits; state that cost.

**R9 should-fix. A-4's cost.** a4-cost.out's 64 names omit the surnames slash abbreviations spell. b.out: `N A` for
NA, `h o` for HO, `L E` for LE are replaced today; `N/A`, `h/o`, `L/E`, `w/o` SENT. A-4 turns each into
`[PATIENT_NAME]`. No script in scripts/ produces a4-cost.out (proto.sh holds no A-4; cost-names.mts is item 26's).
 Change: add the
script; measure NA, HO, LE, WO, DO, RO, CO, YO on texts that hold these.

**R10 note. A-5.** "Up to three" is not argued (b.out: `ZZ12345), (01` SENT today and after); whether joiners count
toward the three is unstated.

**R11 should-fix. Stated as measured, not in measure/.** lfcr.mts's output ("0 of 975,489"); "6 to 10 digits, one of
4"; "the longest is 1,780 characters"; "none of the gate's 5,292 patients" for (b), (c), A-5. floor-summary.json's
`newlyRefused` and `census` are `{}`: say 0 is read from absent keys. Change: add the outputs or mark as not measured.

**R12 note.** The gate's digits-only numbers are 6 to 10 digits: floors 2 to 6 are one test, 11 reads nothing.

**R13 note. Build.** Stage 6 (gate, generated set, two batteries, ADR, matrix, registry, two reviews) is not one
session, and the gate first runs after five stages. Stage 2's (c) changes stage 1's function (R2).

## Checked and found true
- Every "Today" cell, (d)'s too (probe-base.out; A-4: 36 sent = 33 as written, `[` `]` `｡` normalised).
- (a) at floor 6 refuses a letter before or after, look-alike and Cyrillic letters, a composed accent, digits of
  another script, joiners, LF, CR LF. Invisible characters or combining marks between: redacted by the first
  reading. Glued label words: redacted, not refused. No placeholder row refused. `X12345` sent, `X123456` refused;
  `97110GP` and `G0283` sent for 97110. Dates and amounts refused, as admitted.
- The hook: `holds` only, after both readings, in both writings; the redacted text is unchanged.
- measure.mts: no bug that makes a false 0 (census and prototype agree); T3 columns match the json but for R4(i).
- work-floor6.out's deltas; 0 units with no number at the floor, with or without the flag.
- Pins 835, 861, 1096, 1109, 1115 turn as listed. A-6 is well defined on `\r\n\r\n`, `\n\r\n`, `\r\n\r`, `\n\n\r`.
