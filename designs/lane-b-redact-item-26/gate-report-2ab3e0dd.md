# Gate report

- tree A: `/home/user/snapA/packages/model-gateway/src` (redact.ts 2ba7e0235c4b)
- tree B: `/home/user/snapB/packages/model-gateway/src` (redact.ts 47182c09dd63)
- corpus: 975489 letters, sha256 89a133ca67449143; 694 s
- stats: letters 975489, same 975476, differ 13, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 13, annotated 0, msRunA 1590052.3898949844, msRunB 1155081.0107350077, msClassify 45.76914899993426, msParse 8875.37192304192

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

max A 1017 ms, max B 994 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and CRLF | 99999 | 707 | 994 |
| dl: digit and bare break | 100000 | 1017 | 949 |
| dl: dates with spaces | 99995 | 866 | 922 |
| r3 timez: many parts run zZ | 100002 | 772 | 813 |
| dl: dates with slashes | 99995 | 746 | 785 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 644 | 767 |
| dl: digit dash break | 99999 | 699 | 737 |
| r3 timez: many parts run ZzZ | 100002 | 704 | 708 |
| dl: long gap after a name and many initials | 100008 | 688 | 683 |
| r3 timey: spaced member chars | 100000 | 597 | 654 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 743 | 624 |
| dl: date ranges | 99990 | 665 | 618 |
| r3 timey: Q1Q initials | 100000 | 666 | 618 |
| dl: amounts after a range | 99974 | 553 | 613 |
| dl: amount before a date | 99997 | 540 | 604 |
| dl: dates with a claim between | 99988 | 631 | 597 |
| r3 timez: many parts run | 100002 | 551 | 591 |
| dl: digit and dash | 100000 | 658 | 590 |
| dl: amount ranges | 99988 | 528 | 580 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 608 | 571 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 495 | 558 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 462 | 544 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 527 | 543 |
| r3 timex: overlap dates 1.1.1 | 100000 | 586 | 542 |
| dl: date ranges glued to next word | 99994 | 490 | 528 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 489 | 521 |
| dl: keep-noun list | 100004 | 453 | 516 |
| r3 timey: month words + overlap dates | 100000 | 552 | 516 |
| dl: digit and indented break | 99996 | 510 | 509 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 488 | 502 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 545 | 501 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 480 | 490 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 509 | 484 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 493 | 480 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 531 | 473 |
| dl: ranges glued to ordinal-like word | 99990 | 488 | 472 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 476 | 469 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 481 | 468 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 490 | 462 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 414 | 461 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 450 | 461 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 432 | 460 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 443 | 445 |
| dl: digit and ZWSP | 100000 | 559 | 437 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 553 | 422 |
| dl: digit two dashes break | 99996 | 437 | 401 |
| r3 timey: Z1 near-miss | 100000 | 543 | 387 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 369 | 376 |
| r3 timey: own number near-miss | 100000 | 356 | 363 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 293 | 361 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 355 | 358 |
| r3 timey: month glued dense | 100000 | 383 | 352 |
| r3 timey: placeholder glued digits | 100000 | 296 | 342 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 328 | 336 |
| r3 timey: long glued ZZZ run | 100002 | 363 | 330 |
| r3 timey: Jane1 repeated | 100000 | 345 | 330 |
| r3 timey: long glued zZ run | 100002 | 313 | 325 |
| r3 timey: Q1 initials | 100000 | 374 | 321 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 256 | 321 |
| r3 timey: SSN label glued own name | 100000 | 338 | 317 |
| r3 timex: words glued both sides | 100000 | 310 | 315 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 343 | 311 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 321 | 305 |
| dl: SSNs back to back | 99996 | 224 | 303 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 302 | 301 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 361 | 300 |
| r3 timey: placeholders chain | 100004 | 369 | 299 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 304 | 296 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 286 | 295 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 270 | 288 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 235 | 286 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 279 | 285 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 288 | 284 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 271 | 281 |
| r3 timez: ZZ/ZZZ run | 100002 | 282 | 279 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 333 | 278 |
| dl: initials run before a name | 40007 | 184 | 276 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 358 | 276 |
| r3 timey: month words at run ends | 100000 | 313 | 272 |
| r3 timey: DOB glued readings | 100000 | 281 | 270 |
| dl: initials run after a name | 40008 | 241 | 269 |
| r3 timer: XU MA run | 100002 | 235 | 269 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 237 | 268 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 333 | 266 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 300 | 265 |
| r3 timer: DE LA glued words | 100000 | 243 | 264 |
| r3 timey: camel own name before label numbers | 100000 | 222 | 261 |
| r3 timer: DE LA run 2 names | 100002 | 214 | 258 |
| dl: gap after a name as long as the letter | 99990 | 294 | 255 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 240 | 253 |
| r3 timey: own number glued | 100000 | 232 | 250 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 238 | 250 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 242 | 248 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 247 | 246 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 229 | 243 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 245 | 243 |
| r3 timex: long word one glue | 100000 | 258 | 240 |
| r3 timer: DE LA run 3 names caps | 100002 | 241 | 239 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 238 | 238 |
| dl: phone label before nine digits | 100000 | 234 | 236 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 209 | 236 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 263 | 234 |
| r3 timez: initials Z run | 100002 | 222 | 230 |
| r3 timey: camel AbAb glued | 100002 | 195 | 228 |
| r3 timey: zephyra pieces spaced | 100004 | 253 | 228 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 244 | 228 |
| r3 timer: DE LA run camel | 100002 | 214 | 225 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 250 | 225 |
| dl: spaced phone chains | 99996 | 247 | 222 |
| dl: 100 k digit run | 100000 | 204 | 221 |
| dl: nine-digit runs | 100000 | 180 | 221 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 210 | 220 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 221 | 219 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 256 | 218 |
| dl: one word glued to a digit | 100000 | 210 | 215 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 183 | 214 |
| r3 timer: LI camel words | 100000 | 195 | 212 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 227 | 211 |
| r3 timer: DE LA run caps | 100002 | 213 | 207 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 202 | 207 |
| r3 timer: LI run | 100002 | 201 | 206 |
| r3 timey: camel aB | 100000 | 168 | 205 |
| r3 timex: medium words before digits | 100002 | 171 | 199 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 189 | 188 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 196 | 184 |
| r3 timey: JANE repeated glued | 100002 | 199 | 169 |
| dl: phones back to back | 99990 | 156 | 164 |
