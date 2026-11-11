# Review B: queues item 26 (MOD-23): must-stay, time, the other-patient screen

Head `/home/user/rev/head/redact.ts` against base `/home/user/rev/base/redact.ts` (f3f5a642). Synthetic letters only.
Everything below was run; scripts and their outputs are in `reviews/b/` (list at the end). The machine was loaded
throughout (load average 6 to 8 on four cores), so seconds are inflated and only head/base ratios are meant.

## Verdict

**No BLOCKING finding.** Five findings, all OTHER.

| ID | Severity | Finding |
| --- | --- | --- |
| B-1 | OTHER | The name rule does refuse by itself: a third family of new refusals, not one of the two stated costs. |
| B-2 | OTHER | The cost table understates which names lose words: ORA loses about as much as INA, and others. |
| B-3 | OTHER | A replacement takes a deadline's month, half a hyphenated word, a code's letter, an abbreviation. |
| B-4 | OTHER | A stored number with a separator replaces more than "that exact writing", including `$1234.56`. |
| B-5 | OTHER | One name written apart costs 1.7 times the base's time; with CR LF, 2.5 times. |

What was checked and held (no finding):

- **The claim.** 96,164 generated letters (two seeds) and 12,000 more around stored numbers: the base refuses and the
  head sends, 0; the head shows text the base replaced, 0; a candidate the base offers is not offered, 0; a refused
  letter's text differs between the trees, 0. `redactLetter` and `redactionSpans` on 4,400 kept rows: 0 spans of the
  base not covered, 0 letters showing more.
- **The screen.** The head added a candidate in 6 of 11,636 letters both send, never one of the call's own numbers
  (each is a run glued to a label word that the new placeholder uncovers, for example `99887766MEMBERID` from
  `"99887766 Member IDZZ12345/01 01"`). In the 96,164 letters it added none.
- **CR LF.** All 24 CR LF letters the base sends and the head refuses are letters whose LF writing both trees refuse
  (the stated cost). No CR LF letter was refused where its LF writing is sent; 189 CR LF prose texts gave the same
  answer as their LF writing.
- **Growth with length.** No shape grew faster than its length (ratios steady from 25,000 to 100,000 characters).

## B-1 (OTHER): the name rule refuses by itself: a family that is neither stated cost

The design says of the name forms "Redaction only, never a refusal by itself". It is not so. The Social Security and
phone patterns are read before the wider matches exist, so a label does not read through a name written apart to the
number after it and the number stays. The check then reads the sent text, where the wider match is a placeholder, reads
through it, and refuses. With the name written whole the base replaces the number and sends. This is not "a wider match
left in the text" (the instrumented copy shows the first reading's own check refusing the wider-redacted text) and not
CR LF.

Patient for all rows: `pseudonym 'synthetic-patient-1'`, `datesOfBirth ['1980-03-14']`, one claim
`{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers }`.

| Letter (JSON) | names; memberIds; claimNumbers | Base | Head |
| --- | --- | --- | --- |
| `"Call in\na\n555-0123"` | `["INA"]`; `["SYNMEMBER0042"]`; `["SYNCLAIM0001","15000"]` | sent `"Call in\na\n555-0123"` | REFUSED (wrote `"Call [PATIENT_NAME]\n555-0123"`) |
| `"Call Ina\n555-0123"` (the name whole) | same | sent `"Call [PATIENT_NAME]\n[PHONE]"` | sent, the same |
| `"Social Security number of V a n t r e e, 555-0123"` | `["JUNE MARCH","J VANTREE"]`; `["ZZ7654321"]`; `["C2026000417","76543210"]` | sent, unchanged (the name in clear) | REFUSED (wrote `"Social Security number of [PATIENT_NAME], 555-0123"`) |
| `"Social Security number of Vantree, 555-0123"` (whole) | same | sent `"Social Security number of [PATIENT_NAME], [SSN]"` | sent, the same |
| `"SSN on file as a Member ID SYNMEMBER0042 As a 555-0123"` | `["ASA"]`; `["SYNMEMBER0042"]`; `["SYNCLAIM0001","15000"]` | sent `"SSN on file as a Member ID [MEMBER_ID] As a 555-0123"` | REFUSED |
| `"SSN on file Asa Member ID SYNMEMBER0042 Asa 555-0123"` (whole) | same | sent `"SSN on file [PATIENT_NAME] Member ID [MEMBER_ID] [PATIENT_NAME] [SSN]"` | sent, the same |
| `"Units 2026.00 123.45 555-0123"` | `["JANE Q ZEPHYRA"]`; `["SYNMEMBER0042"]`; `["2026.00123"]` | sent, unchanged | REFUSED (wrote `"Units [CLAIM_1].45 555-0123"`) |
| `"Ref 1,234.00 555-0123"` | `["JANE Q ZEPHYRA"]`; `["ZZ12345,01"]`; `["1,234"]` | sent, unchanged | REFUSED (wrote `"Ref [CLAIM_1].00 555-0123"`) |

So the head refuses a letter that the same letter with the name whole is redacted and sent: the outcome is safe, and
the letter is lost. The stored-number rows are the same mechanism from the other rule (for those, the base also refuses
the first reading's own writing, `"Units 2026 00123.45 555-0123"`).

How often: seed 1, 85 of 44,553 letters; seed 2, 91 of 51,611. By generator (seed 1, seed 2): gate corpus letters with
the patient's name written apart 39 of 2,244 and 47 of 2,275 (1.7 % and 2.1 %); stored numbers 29 and 19 of 9,000;
the name apart beside labels and numbers 11 and 16 of 14,000; word-names in phrases 6 and 0 of 14,000. In 53 natural
sentences (`s2-cost.mts` part 3) there was one, the stored-number row above; none of the 41 word-name sentences. For a
word-name it needs the phrase broken over a line between a label and a bare number, which is rare.

Scripts: `s5-findings.mts` (rows `B-1`), `s1-differential.mts` (class
`newref-first-check-refuses-wider-redacted-text`, files `out/s1-*.jsonl` and `out/s1b-*.jsonl`).

### S-1 (a stated family, measured; not a finding): a wider match only in the text the check reads

The wider reading is read on the letter as written; the check reads it on the sent text. A name apart glued to a
number the first reading replaces becomes a wider match only once the placeholder stands there, so the letter is refused
and never redacted. `"Zephy ra202.555.0123"` (patient JANE Q ZEPHYRA, SYNMEMBER0042, SYNCLAIM0001): base sent
`"Zephy ra[PHONE]"`, head REFUSED the same text. Also `"J a n e900123456"`, `"Re: Zephy ra900 12 3456"`, and after the
wider matches were applied `"Ju ne Mar ch900123456"` (JUNE MARCH: head wrote `"[PATIENT_NAME] Mar ch[SSN]"`, refused).
Counts: seed 1, 194; seed 2, 261; of the corpus letters with the name apart, 36 of 2,244 and 36 of 2,275 (1.6 %). The
base refuses the same letter with the name whole (`"Zephyra202.555.0123"`), so this matches the base. It is the brief's
first family; I list it because the design's "never a refusal by itself" does not mention it.

## B-2 (OTHER): the cost table understates which names lose words

`cost-names.mts` tries 64 names, and the table reads as if seven names pay. On the design's own text set (its loader,
unchanged: 503 texts, 212,055 characters today), the same measure (`redactionSpans`, the name alone as the patient,
spans the base's do not cover):

| Name | Texts changed | Places | Phrase | In the design's table |
| --- | --- | --- | --- | --- |
| INA | 23 | 32 | "in a" | yes (32, 23 texts) |
| ASA | 17 | 18 | "as a" | yes (19) |
| ISA | 8 | 10 | "is a" | yes (11) |
| TOBE | 4 | 4 | "to be" | yes (5) |
| TOA | 28 | 46 | "to a" | no |
| OFA | 26 | 31 | "of a" | no |
| **ORA** | **20** | **26** | "or a" | no |
| TOAN | 11 | 11 | "to an" | no |
| ONA | 5 | 6 | "on a" | no |
| ASIT | 5 | 5 | "as it" | no |
| ORAN | 4 | 4 | "or an" | no |
| BEAN, ASAN | 3 each | 3 each | "be an", "as an" | no |
| FORAN, ANDIS | 2 each | 2 each | "for an", "and is" | no |
| INAN, ORIN | 1 each | 1 each | "in an", "or in" | no |

ORA, an ordinary given name, loses nearly as much as INA; TOAN is a common given name. The same text set writes
"and a" 49 times, "with a" 34 and "not a" 31 (any name of those letters loses each). In natural sentences HASAN
("has an"), FORAN ("for an"), INAN, ORIN, BEAN, ATA, ONA, ANDI ("and I") all lose words, for example
`"A request for an appeal must be received within 180 days. Call 555-0123."` with names `["FORAN VANTREE"]`: base sent
`"A request for an appeal ... Call [PHONE]."`, head sent `"A request [PATIENT_NAME] appeal must be received within 180
days. Call [PHONE]."`. The gate's 13 changed letters measure the corpus's patients, few of whom have such names.

Not measured: the gate corpus's prose. My sample of it kept 6 texts (the sources I filtered on are short lines), so
the counts above are the design's set only.

Scripts: `s2-cost.mts` parts 1 and 2 (`out-s2.txt`), `s5-findings.mts` rows `B-2`.

## B-3 (OTHER): a replacement that damages a date, a deadline, a word or a code, not two filler words

All with `memberIds ["SYNMEMBER0042"]`, `claimNumbers ["SYNCLAIM0001"]`, `datesOfBirth ["1980-03-14"]`. The base sent
every letter unchanged except for `[PHONE]`.

| names | Letter (JSON) | Head sent |
| --- | --- | --- |
| `["MARCHAND VANTREE"]` | `"The appeal deadline is 31 March and no extension applies."` | `"The appeal deadline is 31 [PATIENT_NAME] no extension applies."` |
| `["MARCHAND VANTREE"]` | `"Visits between 3 March and 14 June 2026 exceed the limit."` | `"Visits between 3 [PATIENT_NAME] 14 June 2026 exceed the limit."` |
| `["MAYA VANTREE"]` | `"The appeal is due by 15 May a year after the date of service."` | `"The appeal is due by 15 [PATIENT_NAME] year after the date of service."` |
| `["JANIS VANTREE"]` | `"The deadline of 31 Jan is final."` | `"The deadline of 31 [PATIENT_NAME] final."` |
| `["MARIN VANTREE"]` | `"Claims received 14 Mar in error were returned."` | `"Claims received 14 [PATIENT_NAME] error were returned."` |
| `["ANDRE VANTREE"]` | `"Please correct the claim and re-submit it within 90 days."` | `"Please correct the claim [PATIENT_NAME]-submit it within 90 days."` |
| `["THEIN VANTREE"]` | `"The in-network rate is $150.00. Call the in-network line 555-0123."` | `"[PATIENT_NAME]-network rate is $150.00. Call [PATIENT_NAME]-network line [PHONE]."` |
| `["INA G VANTREE"]` | `"The service was reported in a G-code and denied CO-45."` | `"The service was reported [PATIENT_NAME] [PATIENT_NAME]-code and denied CO-45."` |
| `["PO VANTREE"]` | `"Mail to P.O. Box 1234, Springfield."` | `"Mail to [PATIENT_NAME]. Box 1234, Springfield."` |
| `["MD RAHMAN VANTREE"]` | `"Reviewed by Jane Roe, M.D., on 03/14/2026."` | `"Reviewed by Jane Roe, [PATIENT_NAME]., on 03/14/2026."` |
| `["NA VANTREE"]` | `"Remark code: N.A. Group code: CO."` | `"Remark code: [PATIENT_NAME]. Group code: CO."` |

Three things the design's table does not say:

- A name that is a month's word plus a short word (MARCHAND, MAYA, JANIS, MARIN) takes the month of a day-and-month
  date. The base's rule that keeps a name inside a whole written date does not cover these.
- The pattern ends at a hyphen, so "and re-submit" is ANDRE and "the in-network" is THEIN.
- A two-letter name now matches its letters with periods (`P.O.`, `M.D.`, `N.A.`), which the first reading did not
  read. The initial beside a wider name takes a code's letter ("G-code").

Script: `s5-findings.mts` rows `B-3`; `s2-cost.mts` part 3.

## B-4 (OTHER): a stored number with a separator replaces more than "that exact writing"

The design: "that exact writing is replaced wherever it stands (`1234.56 units` for a claim held `1234.56`; `$1,234.56`
is kept)" and "the base's exclusions still apply (a claim's digits as a currency amount with cents)". Patient
`names ["JANE Q ZEPHYRA"]`, `datesOfBirth ["1980-03-14"]`. The base sent every letter below unchanged.

| memberIds; claimNumbers | Letter (JSON) | Head sent |
| --- | --- | --- |
| `["SYNMEMBER0042"]`; `["1234.56"]` | `"Paid $1234.56 on 03/14/2026."` | `"Paid $[CLAIM_1] on 03/14/2026."` |
| `["SYNMEMBER0042"]`; `["123456"]` (no separator) | the same letter | unchanged on both trees |
| `["SYNMEMBER0042"]`; `["1234.56"]` | `"Billed 1234.56  Allowed 987.65  Paid $1,234.56"` | `"Billed [CLAIM_1]  Allowed 987.65  Paid $1,234.56"` |
| `["SYNMEMBER0042"]`; `["2026.00123"]` | `"Line 1  97110  2026.00  123.45"` | `"Line 1  97110  [CLAIM_1].45"` |
| `["SYNMEMBER0042"]`; `["2026.00123"]` | `"Total billed: $2026.00\n123 visits remain."` | `"Total billed: $[CLAIM_1] visits remain."` |
| `["SYNMEMBER0042"]`; `["2026.00123"]` | `"Benefit year 2026. 00123 is the group."` | `"Benefit year [CLAIM_1] is the group."` |
| `["ZZ12345.01"]`; `["SYNCLAIM0001"]` | `"Group ZZ12345. 01 unit paid."` | `"Group [MEMBER_ID] unit paid."` |
| `["ZZ12345/01"]`; `["SYNCLAIM0001"]` | `"Plan ZZ12345/01/15/2026 effective."` | `"Plan [MEMBER_ID]/15/2026 effective."` |

- The amount exclusion does not apply to the stored writing: the cents are the number's own last digits, so
  `$1234.56` is replaced for a claim held `1234.56`. Only the thousands comma saves `$1,234.56`.
- The stored separator is added to the usual joiners at that place, and white space is a usual joiner. A claim held
  `2026.00123` therefore takes two amounts of a table row, and an amount with the first digits of the next line.
- One such row is also refused (B-1: `"Units 2026.00 123.45 555-0123"`).

No current fixture or corpus value holds such a separator, as the design says; this is the cost once one does.

Script: `s5-findings.mts` rows `B-4`; `s2-cost.mts` part 3; `s1-differential.mts` generator G3 (3,198 of 9,000 letters
changed on seed 1).

## B-5 (OTHER): time: one name written apart is 1.7 times the base; with CR LF, 2.5 times

Median of five, head and base back to back on the same letter in one process, `redactLetterForScreen` then
`holdsIdentifier`. Growth is linear; the cost is a constant factor above the stated 1.4.

Letter: the repository's synthetic fixtures (`.txt`, `.md`) joined and repeated to 100,000 characters; patient
JANE Q ZEPHYRA, SYNMEMBER0042, SYNCLAIM0001 (`s4-followup.mts` part d):

| Letter | Base | Head | Head/base |
| --- | --- | --- | --- |
| LF, no name apart | 539 ms | 501 ms | 0.93 |
| LF, `"\nDear Zephy ra,\n"` once at the end | 535 ms | 897 ms | 1.68 |
| CR LF, no name apart | 485 ms | 777 ms | 1.60 |
| CR LF, `"\r\nDear Zephy ra,\r\n"` once at the end | 523 ms | 1,294 ms | 2.47 |

Cause, from the diff: when the wider reading finds anything, `screenAsBothRead` runs the first reading's whole check on
the first reading's text, and the caller's `holdsIdentifier` then runs it again on the sent text, and once more for a
CR LF letter. One wider match anywhere in the letter is enough.

Same prose with larger subjects (`s3-time.mts`, shapes `R2`, generator `subject(names, claims, stored)`; the names are
word-names, so the prose itself holds wider matches):

| Subject, line endings | 25,000 | 50,000 | 100,000 characters (base, head, ratio) |
| --- | --- | --- | --- |
| 3 names, 8 claim numbers, LF | 1.77 | 1.83 | 604 ms, 1,066 ms, 1.76 |
| 3 names, 8 claim numbers, CR LF | 2.53 | 2.40 | 586 ms, 1,426 ms, 2.43 |
| 10 names, 24 claim numbers, CR LF | 2.25 | 2.25 | 765 ms, 1,789 ms, 2.34 |
| 50 names, 120 claim numbers, CR LF | 2.26 | 2.36 | 1,402 ms, 3,643 ms, 2.60 |
| 50 names, 120 numbers without stored separators, CR LF | 2.15 | 2.58 | 1,392 ms, 3,386 ms, 2.43 |

The last two rows pass 3 seconds on the head where the base takes 1.4, on this loaded machine; a quiet machine was not
available, so I do not claim the budget is broken there. A CR LF letter with no match at all
(`"Dear Vantree, your visit was denied.\r\n"` repeated) is 1.60 to 1.64 times the base, against the stated 1.4.

The shapes made only of wider matches or near misses stayed at or under 1.43 times the base at 100,000 characters
(three runs each): a space between every two letters (`"Z e p h y r a was seen. "`, 1.05), 20,000 wider matches
(`"in a\n"`, 1.30; with CR LF, 1.43), near misses, long runs of spaces and periods, initials beside wider names (1.14
and 1.33), look-alike letters (1.21 and 1.30), stored-separator amounts (1.18 and 1.19). Lines of ordinary words with
one name apart each were 1.55 to 1.60 with LF (`"Zephy ra 03/14/2026 $150.00 97110\n"` and
`"Dear Zephy ra, your visit was denied.\n"` repeated) and 1.85 with CR LF. All are in `out-s3.txt` and `out-s3b.txt`.

## Suspicions not reproduced

- A stored answer (`inOneReading`: views, dates, forms) reused where the base computed a fresh one and got a different
  answer: no difference in 108,164 letters, 7,000 of them in look-alike letters and digits.
- Growth faster than length: a first run of three showed `"Dear Zephy ra, your visit was denied.\r\n"` repeated going
  from 1.39 to 2.31 times the base between 12,500 and 100,000 characters; five runs gave 1.37, 1.84, 1.85. Not shown.
- An ordinary sentence with no line break inside the phrase, refused for a word-name patient: none in 41 sentences.
- A CR LF letter refused where its LF writing is sent, or sent where its LF writing is refused: none.
- A candidate the head adds that is one of the call's own numbers: none.

## Scripts and outputs (`/home/user/ops/designs/lane-b-redact-item-26/reviews/b/`)

Run with `export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"`, then `node <script>`.

| Script | What it does | Output |
| --- | --- | --- |
| `s5-findings.mts` | Every letter quoted above for B-1 to B-4 and S-1, base and head | `out-s5.txt` |
| `s1-differential.mts` | Seeded letters, base against head, by class. `SEED=1` then `SEED=2 TAG=s1b` | `out-s1.txt`, `out-s1b.txt`, `out/s1-*.jsonl`, `out/s1b-*.jsonl` |
| `s1b-analyze.mts` | Reads `out/s1-*.jsonl`: the refusal rows by family, and what the newly replaced spans hold | `out-s1-analysis.txt` |
| `s2-cost.mts` | The design's measure for more names; natural sentences; stored numbers; CR LF against LF | `out-s2.txt` |
| `s3-time.mts` | Time by shape and length. Second round: `TAG=s3b REPS=5 SIZES=25000,50000,100000 node s3-time.mts "R2 "` | `out-s3.txt`, `out-s3b.txt`, `out/*-time.tsv` |
| `s4-followup.mts` | Name whole against name apart; the screen's candidates; `redactLetter`; one wider match's time | `out-s4.txt` |
| `inst/redact.ts` | The head's file with its private readers exported, for classifying a refusal only | (imported by `s1-differential.mts`) |

Notes on reruns: generator G6 (look-alike letters) was added to `s1-differential.mts` after the seed 1 run, so a rerun
of seed 1 draws the same G1 to G5 letters and 7,000 more (`out-s1.txt` is the run without G6; seed 2 has it, with 9
more B-1 rows of 7,000). `out-s1-analysis.txt` was written again at the end, from the same `out/s1-*.jsonl` files.
