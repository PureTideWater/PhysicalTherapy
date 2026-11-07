# Baseline: where each head stands against THE BAR (redact-range-glued)

Reference numbers for the judges. Tree A is always cc3dd7f6 (`/home/user/redact-range-glued-probe`, redact.ts
1b9280e790dd). The heads:

- **3fcb9359**: `/home/user/redact-range-glued`, HEAD (redact.ts 155e006367d6), after fix round 2 (21684dff, 5a13c9d9, 8d98b8bb, d9ae7b30).
- **6fc88092**: `git archive` of that commit into `gate/trees/6fc88092` (redact.ts bf597f6df2d1, the same hash as `git show 6fc88092:…`), the head before fix round 2.

Command (each pair):

    gate/run.sh /home/user/redact-range-glued-probe <head> <outdir>

Runs: `gate/runs/pair1-3fcb9359-final/` and `gate/runs/pair2-6fc88092-final/` (report.md, report.json, hits/).
Signatures: `gate/runs/signatures.txt` (`python3 -I gate/analyze.py <outdir>…`). Test logs: `gate/runs/tests-*/`.

## The corpus

975,489 letters (5,292 patients), sha256 `89a133ca67449143…`, fixed and seeded, plus 124 timing letters:

| source | letters |
|---|---:|
| findings: every input of round3-findings.json (PHI3-1..5, GATEWAY3-1..2) and the rows they cite (PHI2-1, PHI2-2, the MOD-16 counterexample) | 59 |
| T1: PHI2-1/PHI2-2 glued shapes, every own-identifier kind (name parts, initials, 16 DOB forms, member IDs, claim numbers) glued before/after a digit, letter, range end, placeholder; patients JANE Q ZEPHYRA, AL Q ZEPHYRA, JANE MA, XU VANTREE, MAY ZEPHYRA, JUNE Q VANTREE, TY Q ZEPHYRA | 49,324 |
| T2: SSN/phone labels (23) with the own identifier glued, camel-case or spaced between label and number | 79,998 |
| T3: codes right after the patient's name and alone (CPT, HCPCS, ICD-10, CARC/RARC, all MA01-MA130, modifiers, units, amounts, dates, IDs, references), 15 patients with short parts | 51,510 |
| T4: the MOD-16 seed shape (range glued to the next word between amounts), varied | 5,998 |
| T5: the property generators of both snapshots (MOD-13 letterCase, gluedLetterCase, MOD-15 ssnPhoneCase, MOD-16 keptSegment) on fixed seeds incl. YEAR_BELOW_1900_SEED, LABEL_BOUNDARY_SEED and the three MOD-16 CI seeds at 300 runs | 23,085 |
| harness: every letter of the reviewers' and fixers' harnesses (177 runs of 150 files, recorded with a stub redactor): rg-review-phi-3 379,010 (sweep1 165,943 whole, sweep2 46,687 whole, ownid3 70,000 of 858,240), rg-fixer-2 106,265, rg-review-gateway-3 78,833, rg-skeptic-gateway 65,418, rg-review-phi-2 30,134, rg-review-phi-1 28,677, rg-fixer-1 14,925, rg-review-gateway-1 11,930, rg-fixer-1b 7,082, rg-sweep 5,882, rg-review-gateway-2 399, rg-skeptic-phi 9 | 728,564 |
| data: string literals of the reviewers' data files (294 files: hits lists, attack lists, findings) | 36,951 |

The direct path equals `denialLetterSpec.prepare` on a 3,904-letter sample in all three trees (3,904 of 3,904 agree:
`gate/prepare-check.mts`). Timing: cold pair 7m21s (pair 1), 3m38s with cc3dd7f6 cached (pair 2).

## Pair 1: cc3dd7f6 vs 3fcb9359 (HEAD)

462,510 of 975,489 letters differ. A refuses 247,791, B 197,567.

### (1) PHI that cc3dd7f6 redacted or refused and 3fcb9359 sends

| kind | letters | how A protected it | signature (analyze.py) |
|---|---:|---|---|
| SSN | 38,604 | refused 34,822, redacted 3,782 | own identifier glued or camel-case between label and number (PHI3-1/PHI3-2) 33,706 (A refused 29,931, A redacted 3,775); own identifier set apart, next to a range (PHI3-5 iii) 485; label word cut by a name read (PHI3-3) 37; a date, amount or range between label and number 3,206; unlabeled at a range end 875; unlabeled other 294 |
| phone | 33,965 | refused 20,368, redacted 11,359, partly 2,238 | glued/camel own identifier (PHI3-1/PHI3-2) 31,263 (A refused 17,666, A redacted 13,597); set apart next to a range 309; label cut (PHI3-3) 6; date/amount/range between 1,799; unlabeled at a range end 405; unlabeled other 167; labeled other 16 |
| DOB | 95 | refused 95 | all glued digit to digit (PHI3-4 a): "DOS 3/14/80150.00 - 01/01/2020.", "114-Mar-1980-150.00" |
| name part | 648 | refused 648 | glued to a lower-case word (the recorded class) 481; invisible character inside (PHI3-4 b) 40; all-caps or other glue such as "SEENZEPHYRA,JANE0.00" 127 |
| initial | 357 | refused 357 | beside a name the recorded class leaves ("150.00J. Math", "PaidJ. Zephyra") |
| member ID | 1 | redacted | "Paid 0.00. 11-02-2019" (recorded: a number written as a date after a full stop, PHI1-3/PHI2-5) |
| claim number | 1 | redacted | "Paid 0.00. 01-01-2020" for claim 01012020 (recorded, same row) |

Also: UNPLACED 1,862 (B sends a letter A refused with 7+ digits after an SSN/phone word the oracle cannot place:
"SSN 2024-03-12-279.23; ", the GATEWAY1-2 fail-safe chains fixed), INFO partial-in-clear (some, not all, characters
sent): claim 80, phone 137, SSN 23, member 18, DOB 1.

### (2) KEEP: must-stay tokens 3fcb9359 changes or refuses that cc3dd7f6 sent unchanged

| class | letters | what |
|---|---:|---|
| code | 3,545 | MA01-MA130 taken for a patient part MA ("Re: QIANG MA\nMA04" to "[PATIENT_NAME]04") 2,279; a code's letter taken as an initial or short part ("M80", "L3908", "G0283", "M54.50") 1,213; modifier XU taken ("97110XU") 52; other 1 (GATEWAY3-1, GATEWAY3-2) |
| unit | 70 | "30MIN", "45min" for a part MIN (GATEWAY3-2) |
| date | 176 | a month-word part glued to digits: "Paid 12May", "DOS June1", "3-3-61May" for patients MAY/JUNE |
| amount | 6 | "DOBMay-150.00" to "DOB[DATE_OF_BIRTH].00" for patient MAY (and JUNE) |
| ref | 600 | an SSN or phone label's letters taken by a short part ("TTY555-0123" for TY, "SSN555.0157" for SN; PHI3-3 shape) 571; other 29 |
| text | 155 | ordinary words: "ofJune" (JUNE), code rows after a name (T3) |
| number | 1 | one digit run inside a DOB pair (fuzzdob) |
| short-name-part | 12,146 | a 1-3 letter part glued, not a listed must-stay token: "0.00–$20jo" (JO), "Tel555-0123" (EL), "12thMay"; ADR 0054 records "a short part may take letters of another word glued to a digit" |
| refused, must-stay, after an SSN/phone word | 6,995 | the GATEWAY2-1 fail-safe class (labkeep2 2,227) and the SEC fuzzers' random 9xx SSN shapes ("Tel 9535874 1.4") |
| refused, must-stay, other | 0 | |
| refused, letter with identifiers (all redacted by A) | 449 | fail-safe refusals ("Paid 0.00.11-02-2019", "SSN 929\n0,740.21-987-29-9789") |

### (3) Reverse (information)

B redacts or refuses what A sent in clear: name 231,429, initial 41,037, SSN 33,007, DOB 21,565, phone 18,137, member
14,263, claim 9,157. B sends unchanged what A refused: must-stay 24,833 (the MOD-16 class this item fixes), letters with
identifiers all redacted 39,018. B no longer changes: date 18, id 4.

### (4) Timing

Max 2,716 ms (B) against the 3 s budget, on the GATEWAY3-3 letter ('1' + 100,000 'Z' + '1' for names
ZZ ZZZ ZZZZ ZZZZZ / ZZ-ZZ ZZZ / ZZZZZZ ZZ; cc3dd7f6 95 ms); the other timez runs 2,276-2,456 ms; every other case
under 1 s. cc3dd7f6's max 412 ms.

## Pair 2: cc3dd7f6 vs 6fc88092

137,767 letters differ. A refuses 247,791, B 257,105.

### (1) PHI

| kind | letters | how A protected it | signature |
|---|---:|---|---|
| name part | 15,064 | refused | PHI2-1: glued to a digit at a range end ("01/01/2020-150.00Al", "Jane0.00-01/02/2020") 10,269; glued to a lower-case word 2,408; all-caps/other 2,387 |
| DOB | 6,036 | refused | PHI2-1: glued to a word ("(0.00−03-14-1980DOB)", "DOB14.03.1980-150.00") 5,758; digit to digit (PHI3-4 a) 278 |
| initial | 3,455 | refused | PHI2-1: "Seen 150.00⁃150.00Q Zephyra", "01/01/2020-150.00J. Ma" |
| member ID | 2,465 | refused 2,464 | PHI2-2: glued at a range end (ownid3 1,824) |
| claim number | 1,511 | refused 1,510 | PHI2-2 ("Seen 0.00-01/02/2020SYNCLAIM0001" shapes) |
| SSN | 7,495 | refused | a date/amount/range between label and number 2,871; unlabeled at a range end 3,505; unlabeled other 626; own identifier set apart next to a range (PHI3-5 iii) 492; labeled other 1 |
| phone | 2,300 | refused | date/amount/range between 1,624; set apart next to a range 317; unlabeled at a range end 256; unlabeled other 87; labeled other 16 |

UNPLACED 1,826; partial-in-clear: claim 446, name 407, phone 72, member 18, SSN 15, DOB 4.

### (2) KEEP

date 4, text 1, number 1 (all fuzzdob DOB-pair rows); refused must-stay after an SSN/phone word 8,455 (GATEWAY2-1
class, labkeep2 3,405); refused must-stay other 0; refused letters with identifiers 413. No code, unit, amount, ID or
reference change.

### (4) Timing

Max 487 ms (B), 430 ms (A).

## Against THE BAR

| part of THE BAR | 3fcb9359 | 6fc88092 |
|---|---|---|
| No PHI that cc3dd7f6 redacted or refused is sent, except ADR 0054 classes with a pinned row | **Fails.** PHI3-1/PHI3-2 (own identifier glued or camel-case between an SSN/phone label and the number): 33,706 SSN + 31,263 phone letters, 17,372 of them redacted to [SSN]/[PHONE] by cc3dd7f6; not recorded (the ADR record covers only a name set apart, and is false next to a range: 794 letters). PHI3-3 label cut: 43. PHI3-4: DOB glued digit to digit 95, name with an invisible character 40: not recorded. Remaining SSN/phone classes (date/amount/range between label and number 5,005; unlabeled 1,741) and the lower-case glued names and initials (about 630) fall in recorded classes (GATEWAY1-2, PHI1-1, PHI1-2, PHI2-4, the round-2 name record) and need row-by-row confirmation from the hits files. | **Fails.** PHI2-1/PHI2-2: name 15,064, DOB 6,036, initial 3,455, member 2,465, claim 1,511 (own identifiers at a range end that cc3dd7f6 refused only by A3). SSN/phone: mostly the recorded range classes (PHI1-1, PHI2-4) and the set-apart own identifier next to a range (809). |
| No must-stay change or refusal that cc3dd7f6 did not make, except recorded fail-safe refusals | **Fails.** GATEWAY3-1/3-2: 3,545 code letters (MA01-MA130 2,279, code letters as initials 1,213, XU 52) and 70 unit letters, not recorded; dates of month-named patients 176, amounts 6. Refusals: 6,995 after an SSN/phone word (recorded GATEWAY2-1 class plus SEC-fuzz SSN shapes), 449 letters with identifiers, 0 other. | **Passes** for changes (date 4, text 1, number 1: fuzzdob DOB pairs, to confirm). Refusals: 8,455 after an SSN/phone word (the GATEWAY2-1 class 8d98b8bb later narrowed), 413 with identifiers, 0 other. |
| MOD-13/14/15/16, LABEL_BOUNDARY_SEED and the three MOD-16 seeds pass | Passes (634 tests; 78 under each seed) | Passes (602; 75 under each seed) |
| Linear time: crafted 100 kB letters within 3 s | Passes, narrowly: max 2,716 ms (GATEWAY3-3 shape) | Passes: max 487 ms |
| The verifier still finds dates and references | Passes (MOD-16 property and denial-letter rows); no KEEP change to a date or reference token outside the month-named-patient rows above | Passes |

## Tests

`gate/tests.sh <tree> <outdir>` in a scratch mirror (`gate/trees/mirror-<sha>`; the tree is not touched): the tree's
own `redact.property.test.ts`, `redact.test.ts` and `functions/denial-letter.test.ts`, then the property file with each
MOD-16 CI seed as fast-check's global seed.

| tree | three files | seed 1034253323 | seed 383403599 | seed -1074798020 |
|---|---|---|---|---|
| 3fcb9359 | 634 passed | 78 passed | 78 passed | 78 passed |
| 6fc88092 | 602 passed | 75 passed | 75 passed | 75 passed |

Both heads pass their own suites (MOD-13/14/15/16, LABEL_BOUNDARY_SEED, the 100 kB rows, and MOD-16's verifier check
of deadlines and references) and the three seeds. The suites do not see the regressions above: no property generator
writes the call's own name glued or camel-case between an SSN/phone label and its number (PHI3-1/3-2), a name part
that spells a label's end (PHI3-3), or a code after the patient's name (GATEWAY3-1/3-2).

## Reading the numbers

- A count is letters, once per kind or class; one letter can be in several kinds.
- The PHI oracle is the generator where it wrote the letter (T1-T5: positions of each secret), else `gate/oracle.mts`
  (SSN 900-xx-xxxx and NPA-555-xxxx shapes, the harness's own digit oracle captured during the harvest, the call's
  member IDs, claim numbers, DOB written forms, name parts; short parts and initials only beside another part or a
  label). Short or month-word name parts glued to words are ambiguous by nature: "Math" for a part MA, "June1" for
  JUNE; the glue context in each hit (left|right) is there to sort them.
- The corpus is weighted by the reviewers' own sweeps (sweep1 is 166k letters of the PHI3-1 shape), so counts compare
  heads on the same corpus; they are not frequencies in real letters.

## Verdict

- **3fcb9359 does not meet THE BAR**: 64,969 corpus letters (33,706 SSN, 31,263 phone) send an SSN or phone that cc3dd7f6 redacted or
  refused (PHI3-1/PHI3-2, unrecorded), plus PHI3-3 and PHI3-4 shapes; 3,615 letters lose a code or unit after the
  patient's name (GATEWAY3-1/3-2, unrecorded). It keeps time within budget with little margin (2.7 s).
- **6fc88092 does not meet THE BAR**: 28,531 letters (counted per kind) send the call's own name, initial, DOB, member
  ID or claim number glued at a range end that cc3dd7f6 refused (PHI2-1/PHI2-2). It keeps every must-stay token.
- A candidate meets the PHI part only when its `PHI.*` counts reduce to classes recorded in ADR 0054 with a pinned
  row (judge from `hits/PHI.*` with `analyze.py`), and the KEEP part when `KEEP.changed.code`, `.unit`, `.amount`,
  `.date`, `.id` and `.ref` are zero or recorded and `KEEP.refused.must-stay.other` is zero.
