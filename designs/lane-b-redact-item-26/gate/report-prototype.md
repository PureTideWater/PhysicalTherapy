# Gate report

- tree A: `/home/user/snapA/packages/model-gateway/src` (redact.ts 2ba7e0235c4b)
- tree B: `/home/user/snapB/packages/model-gateway/src` (redact.ts f31f894ad508)
- corpus: 975489 letters, sha256 89a133ca67449143; 1079 s
- stats: letters 975489, same 975476, differ 13, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 13, annotated 0, msRunA 2059152.9066510494, msRunB 2236109.6544969976, msClassify 62.55937299999641, msParse 8626.319035970693

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

max A 1103 ms, max B 1616 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1050 | 1616 |
| dl: dates with slashes | 99995 | 965 | 1353 |
| dl: digit and CRLF | 99999 | 811 | 1282 |
| dl: digit and bare break | 100000 | 1103 | 1156 |
| dl: dates with a claim between | 99988 | 722 | 1035 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 957 | 993 |
| r3 timez: many parts run zZ | 100002 | 889 | 964 |
| dl: date ranges | 99990 | 630 | 963 |
| dl: digit dash break | 99999 | 805 | 949 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 857 | 949 |
| r3 timey: month words + overlap dates | 100000 | 617 | 916 |
| r3 timez: many parts run ZzZ | 100002 | 905 | 876 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 662 | 866 |
| dl: long gap after a name and many initials | 100008 | 792 | 865 |
| r3 timey: spaced member chars | 100000 | 682 | 788 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 701 | 777 |
| dl: date ranges glued to next word | 99994 | 606 | 770 |
| dl: digit and dash | 100000 | 716 | 766 |
| dl: amount before a date | 99997 | 628 | 751 |
| r3 timez: many parts run | 100002 | 720 | 742 |
| dl: ranges glued to ordinal-like word | 99990 | 528 | 737 |
| r3 timey: Q1Q initials | 100000 | 718 | 729 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 550 | 708 |
| dl: amount ranges | 99988 | 628 | 706 |
| dl: amounts after a range | 99974 | 692 | 704 |
| dl: keep-noun list | 100004 | 617 | 687 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 518 | 678 |
| dl: digit and ZWSP | 100000 | 698 | 677 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 544 | 675 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 485 | 664 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 607 | 662 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 601 | 648 |
| r3 timex: overlap dates 1.1.1 | 100000 | 636 | 646 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 470 | 646 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 487 | 636 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 586 | 632 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 518 | 620 |
| dl: digit and indented break | 99996 | 568 | 618 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 534 | 602 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 506 | 577 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 532 | 577 |
| r3 timey: Z1 near-miss | 100000 | 548 | 575 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 492 | 575 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 486 | 570 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 475 | 567 |
| dl: digit two dashes break | 99996 | 515 | 564 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 496 | 554 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 394 | 543 |
| dl: initials run before a name | 40007 | 203 | 523 |
| r3 timey: own number near-miss | 100000 | 453 | 506 |
| r3 timey: month glued dense | 100000 | 469 | 495 |
| r3 timey: SSN label glued own name | 100000 | 515 | 492 |
| r3 timey: long glued zZ run | 100002 | 400 | 469 |
| r3 timey: placeholders chain | 100004 | 417 | 456 |
| r3 timey: Q1 initials | 100000 | 369 | 450 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 404 | 449 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 386 | 438 |
| r3 timey: placeholder glued digits | 100000 | 366 | 436 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 331 | 424 |
| r3 timex: words glued both sides | 100000 | 337 | 421 |
| r3 timey: long glued ZZZ run | 100002 | 333 | 420 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 346 | 419 |
| r3 timey: Jane1 repeated | 100000 | 372 | 417 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 396 | 415 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 317 | 410 |
| r3 timey: month words at run ends | 100000 | 347 | 401 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 336 | 399 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 316 | 397 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 331 | 396 |
| r3 timer: XU MA run | 100002 | 251 | 394 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 292 | 393 |
| r3 timez: ZZ/ZZZ run | 100002 | 335 | 390 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 325 | 389 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 243 | 386 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 325 | 381 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 313 | 379 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 317 | 378 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 307 | 375 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 312 | 375 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 316 | 372 |
| r3 timey: DOB glued readings | 100000 | 332 | 365 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 323 | 362 |
| dl: 100 k digit run | 100000 | 244 | 352 |
| r3 timey: own number glued | 100000 | 337 | 351 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 325 | 351 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 301 | 350 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 292 | 349 |
| r3 timer: DE LA run 2 names | 100002 | 284 | 342 |
| r3 timer: DE LA run 3 names caps | 100002 | 275 | 341 |
| r3 timez: initials Z run | 100002 | 256 | 340 |
| r3 timey: camel own name before label numbers | 100000 | 273 | 339 |
| dl: SSNs back to back | 99996 | 275 | 338 |
| r3 timex: long word one glue | 100000 | 282 | 338 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 291 | 334 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 276 | 334 |
| r3 timer: DE LA run caps | 100002 | 241 | 333 |
| r3 timey: zephyra pieces spaced | 100004 | 362 | 333 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 336 | 331 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 263 | 329 |
| r3 timer: DE LA run camel | 100002 | 256 | 328 |
| r3 timer: DE LA glued words | 100000 | 297 | 324 |
| dl: nine-digit runs | 100000 | 262 | 322 |
| dl: phone label before nine digits | 100000 | 243 | 320 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 400 | 320 |
| r3 timey: camel aB | 100000 | 207 | 316 |
| r3 timey: JANE repeated glued | 100002 | 256 | 316 |
| r3 timer: LI camel words | 100000 | 217 | 313 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 255 | 311 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 267 | 309 |
| dl: spaced phone chains | 99996 | 263 | 307 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 239 | 306 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 279 | 306 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 260 | 306 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 279 | 305 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 271 | 304 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 266 | 304 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 268 | 302 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 252 | 298 |
| r3 timey: camel AbAb glued | 100002 | 289 | 297 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 231 | 291 |
| dl: initials run after a name | 40008 | 249 | 290 |
| dl: one word glued to a digit | 100000 | 258 | 284 |
| r3 timer: LI run | 100002 | 249 | 283 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 223 | 274 |
| r3 timex: medium words before digits | 100002 | 212 | 267 |
| dl: phones back to back | 99990 | 181 | 260 |
| dl: gap after a name as long as the letter | 99990 | 192 | 229 |
