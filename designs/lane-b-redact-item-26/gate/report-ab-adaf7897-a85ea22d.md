# Gate report

- tree A: `/home/user/snapA/packages/model-gateway/src` (redact.ts 2a75833ad675)
- tree B: `/home/user/snapB/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- corpus: 975489 letters, sha256 89a133ca67449143; 745 s
- stats: letters 975489, same 975476, differ 13, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 13, annotated 0, msRunA 1702975.6555089927, msRunB 1246611.8151209597, msClassify 73.79233699996257, msParse 9393.93219595652

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

### KEEP.changed.short-name-part: 3
- how: no SSN/phone word 3
- by source: T5/MOD-13 letterCase@3fcb9359 3
  - "Claim#07∙142‧008; Records in a timely manner. " [ZE, INA I] A: "Claim#[CLAIM_1]; Records in a timely manner. " B: "Claim#[CLAIM_1]; Records [PATIENT_NAME] timely manner. "
  - "appeal by SYN4335 973 was denied. Records in a timely manner. for WLFQNRV, INA I..\nRE: Patient ina was seen. seen on 9/25/1953. " [INA I WLFQNRV] A: "appeal by [CLAIM_2] was denied. Records in a timely manner. for [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME]..\nRE: Patient [PATIENT_NAME] was seen. seen on [DATE_OF_BIRTH]. " B: "appeal by [CLAIM_2] was denied. Records [PATIENT_NAME] timely manner. for [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME]..\nRE: Patient [PATIENT_NAME] was seen. seen on [DATE_OF_BIRTH]. "
  - "RE: Patient Cass Oe, I., seen on 59922360;\nThe claim was denied because prior authorization was not obtained. DOB 1‍936-07-06. for CASSOE, INA I. was seen. Claim#yy38845 was denied. Records in a timely manner. " [CASSOE, INA I] A: "RE: Patient [CLAIM_1], [PATIENT_NAME]., seen on [MEMBER_ID];\nThe claim was denied because prior authorization was not obtained. DOB [DATE_OF_BIRTH]. for [CLAIM_1]. was seen. Claim#[CLAIM_2] was denied. Records in a timely manner. " B: "RE: Patient [CLAIM_1], [PATIENT_NAME]., seen on [MEMBER_ID];\nThe claim was denied because prior authorization was not obtained. DOB [DATE_OF_BIRTH]. for [CLAIM_1]. was seen. Claim#[CLAIM_2] was denied. Records [PATIENT_NAME] timely manner. "

### KEEP.changed.text: 13
- how: no SSN/phone word 12, after an SSN/phone word 1
- by source: T5/MOD-13 letterCase@3fcb9359 11, T5/MOD-13 letterCase@cc3dd7f6 2
  - "Records in a timely manner. " [TBTVN XSBOWLM INA] A: "Records in a timely manner. " B: "Records [PATIENT_NAME] timely manner. "
  - "Claim#07∙142‧008; Records in a timely manner. " [ZE, INA I] A: "Claim#[CLAIM_1]; Records in a timely manner. " B: "Claim#[CLAIM_1]; Records [PATIENT_NAME] timely manner. "
  - "😀I.Ssn.\nseen on 11/15/1982. Claim: “ss·n; for ina, RE: Patient INA.\nRecords in a timely manner. " [INA Q SSN] A: "😀[PATIENT_NAME].[CLAIM_1].\nseen on [DATE_OF_BIRTH]. Claim: “[CLAIM_1]; for [PATIENT_NAME], RE: Patient [PATIENT_NAME].\nRecords in a timely manner. " B: "😀[PATIENT_NAME].[CLAIM_1].\nseen on [DATE_OF_BIRTH]. Claim: “[CLAIM_1]; for [PATIENT_NAME], RE: Patient [PATIENT_NAME].\nRecords [PATIENT_NAME] timely manner. "
  - "claim number SYN559736 was denied. Claim#syn55973;6 was denied. seen on Jul 25, 1962, Records in a timely manner. " [INA NI STRAUSS] A: "claim number [CLAIM_1] was denied. Claim#[CLAIM_1] was denied. seen on [DATE_OF_BIRTH], Records in a timely manner. " B: "claim number [CLAIM_1] was denied. Claim#[CLAIM_1] was denied. seen on [DATE_OF_BIRTH], Records [PATIENT_NAME] timely manner. "
  - "RE: Patient Birth.\nRecords in a timely manner. To appeal, submit a written request by May 30, 2026. 😀birth.\nfor i. birth, " [BIRTH, INA XUR] A: "RE: Patient [CLAIM_1].\nRecords in a timely manner. To appeal, submit a written request by May 30, 2026. 😀[CLAIM_1].\nfor [PATIENT_NAME]. [CLAIM_1], " B: "RE: Patient [CLAIM_1].\nRecords [PATIENT_NAME] timely manner. To appeal, submit a written request by May 30, 2026. 😀[CLAIM_1].\nfor [PATIENT_NAME]. [CLAIM_1], "

## (1b) Unplaced: B sends a letter A refused that has 7+ digits after an SSN/phone word but no SSN/phone the oracle can place

_a fuzz letter of a random 9xx SSN, or a must-stay row after a phone word: judge by the examples and hits file_

none

## (3a) Reverse PHI: A sent in clear, B redacts or refuses

_information_

none

## (3b) Reverse KEEP: A changed or refused, B sends unchanged

_information_

none

## Information

_partial-in-clear: some but not all letters/digits of an occurrence sent by B where A sent none_

none

## (4) Timing (ms, one run after a warm-up, redactLetterForScreen + holdsIdentifier)

max A 1038 ms, max B 1130 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| r3 timez: many parts run zZ | 100002 | 885 | 1130 |
| dl: dates with slashes | 99995 | 1038 | 1037 |
| dl: digit and CRLF | 99999 | 843 | 1021 |
| dl: digit and bare break | 100000 | 876 | 1012 |
| dl: dates with spaces | 99995 | 1007 | 886 |
| dl: amounts after a range | 99974 | 608 | 806 |
| dl: digit dash break | 99999 | 716 | 789 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 811 | 772 |
| dl: long gap after a name and many initials | 100008 | 624 | 748 |
| r3 timez: many parts run | 100002 | 488 | 747 |
| r3 timez: many parts run ZzZ | 100002 | 722 | 740 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 688 | 730 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 669 | 713 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 618 | 682 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 596 | 681 |
| dl: amount ranges | 99988 | 690 | 670 |
| dl: date ranges | 99990 | 615 | 660 |
| dl: dates with a claim between | 99988 | 620 | 655 |
| dl: digit and dash | 100000 | 655 | 644 |
| r3 timey: spaced member chars | 100000 | 644 | 636 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 764 | 635 |
| dl: digit and ZWSP | 100000 | 726 | 622 |
| dl: amount before a date | 99997 | 561 | 614 |
| r3 timey: Q1Q initials | 100000 | 660 | 612 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 493 | 585 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 533 | 579 |
| r3 timey: month words + overlap dates | 100000 | 529 | 576 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 603 | 565 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 563 | 557 |
| dl: keep-noun list | 100004 | 730 | 553 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 504 | 549 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 542 | 544 |
| r3 timex: overlap dates 1.1.1 | 100000 | 608 | 542 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 488 | 531 |
| dl: ranges glued to ordinal-like word | 99990 | 491 | 528 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 484 | 524 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 493 | 518 |
| r3 timey: Z1 near-miss | 100000 | 449 | 511 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 550 | 511 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 609 | 508 |
| dl: date ranges glued to next word | 99994 | 510 | 506 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 583 | 505 |
| dl: digit two dashes break | 99996 | 422 | 492 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 498 | 491 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 467 | 490 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 537 | 478 |
| dl: digit and indented break | 99996 | 439 | 476 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 489 | 445 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 317 | 438 |
| r3 timey: own number near-miss | 100000 | 429 | 424 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 346 | 415 |
| r3 timey: month glued dense | 100000 | 412 | 403 |
| r3 timey: placeholders chain | 100004 | 328 | 403 |
| r3 timey: SSN label glued own name | 100000 | 397 | 364 |
| r3 timey: own number glued | 100000 | 289 | 353 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 303 | 353 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 331 | 351 |
| r3 timey: Q1 initials | 100000 | 362 | 345 |
| r3 timey: DOB glued readings | 100000 | 275 | 345 |
| r3 timex: words glued both sides | 100000 | 364 | 337 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 362 | 332 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 297 | 330 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 330 | 328 |
| r3 timey: placeholder glued digits | 100000 | 340 | 321 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 325 | 319 |
| r3 timey: long glued ZZZ run | 100002 | 293 | 317 |
| r3 timey: long glued zZ run | 100002 | 360 | 317 |
| r3 timey: month words at run ends | 100000 | 302 | 316 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 350 | 311 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 278 | 304 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 265 | 300 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 335 | 299 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 271 | 293 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 292 | 293 |
| dl: 100 k digit run | 100000 | 195 | 292 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 262 | 290 |
| r3 timey: zephyra pieces spaced | 100004 | 265 | 284 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 293 | 282 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 284 | 278 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 243 | 278 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 315 | 277 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 242 | 276 |
| dl: spaced phone chains | 99996 | 279 | 275 |
| dl: SSNs back to back | 99996 | 297 | 274 |
| r3 timey: camel own name before label numbers | 100000 | 257 | 270 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 378 | 269 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 349 | 265 |
| r3 timey: Jane1 repeated | 100000 | 297 | 264 |
| dl: initials run after a name | 40008 | 233 | 262 |
| dl: initials run before a name | 40007 | 200 | 262 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 368 | 262 |
| dl: nine-digit runs | 100000 | 262 | 261 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 260 | 260 |
| r3 timer: DE LA glued words | 100000 | 277 | 259 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 325 | 257 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 272 | 255 |
| r3 timer: XU MA run | 100002 | 230 | 253 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 286 | 252 |
| r3 timer: LI camel words | 100000 | 194 | 251 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 246 | 251 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 316 | 251 |
| r3 timez: initials Z run | 100002 | 242 | 244 |
| r3 timer: DE LA run 3 names caps | 100002 | 237 | 241 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 265 | 240 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 248 | 239 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 242 | 239 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 278 | 236 |
| r3 timez: ZZ/ZZZ run | 100002 | 256 | 235 |
| r3 timex: long word one glue | 100000 | 260 | 233 |
| r3 timer: DE LA run camel | 100002 | 244 | 232 |
| r3 timer: DE LA run 2 names | 100002 | 227 | 232 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 244 | 231 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 263 | 230 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 249 | 227 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 221 | 226 |
| dl: gap after a name as long as the letter | 99990 | 251 | 219 |
| dl: phone label before nine digits | 100000 | 221 | 219 |
| r3 timey: camel AbAb glued | 100002 | 285 | 219 |
| r3 timer: DE LA run caps | 100002 | 226 | 217 |
| dl: one word glued to a digit | 100000 | 221 | 210 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 220 | 207 |
| r3 timex: medium words before digits | 100002 | 199 | 198 |
| dl: phones back to back | 99990 | 207 | 191 |
| r3 timey: JANE repeated glued | 100002 | 207 | 188 |
| r3 timer: LI run | 100002 | 193 | 184 |
| r3 timey: camel aB | 100000 | 169 | 182 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 236 | 175 |
