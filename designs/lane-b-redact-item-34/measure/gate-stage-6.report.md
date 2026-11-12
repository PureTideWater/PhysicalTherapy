# Gate report

- tree A: `base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `head/packages/model-gateway/src` (redact.ts 23a48071a491)
- corpus: 975489 letters, sha256 89a133ca67449143; 736 s
- stats: letters 975489, same 975487, differ 2, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 2, annotated 0, msRunA 1524042.9471749824, msRunB 1394535.2278449857, msClassify 24.016800999990664, msParse 7705.520189984867

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

### KEEP.changed.text: 1
- how: no SSN/phone word 1
- by source: T5/MOD-13 letterCase@3fcb9359 1
  - "birth date Aug 4, 1933, Patient: K.FGK😀 for K.FGK😀 Dear FGK, K.😀 RE: Patient Fgk, Kre I.😀 " [KRE I FGK] A: "birth date [DATE_OF_BIRTH], Patient: [PATIENT_NAME].[CLAIM_1]😀 for [PATIENT_NAME].[CLAIM_1]😀 Dear [CLAIM_1], [PATIENT_NAME].😀 RE: Patient [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME].😀 " B: "birth date [DATE_OF_BIRTH], Patient: [PATIENT_NAME].[CLAIM_1]😀 for [PATIENT_NAME].[CLAIM_1]😀 Dear [CLAIM_1], [PATIENT_NAME]: Patient [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME].😀 "

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

max A 1290 ms, max B 1177 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 1152 | 1177 |
| dl: dates with spaces | 99995 | 1290 | 1134 |
| dl: digit and CRLF | 99999 | 1182 | 1073 |
| r3 timez: many parts run zZ | 100002 | 1104 | 1033 |
| dl: dates with slashes | 99995 | 998 | 998 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 986 | 966 |
| r3 timez: many parts run ZzZ | 100002 | 885 | 937 |
| r3 timez: many parts run | 100002 | 956 | 903 |
| dl: digit dash break | 99999 | 907 | 891 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 898 | 886 |
| r3 timey: Q1Q initials | 100000 | 735 | 881 |
| r3 timey: spaced member chars | 100000 | 765 | 880 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 745 | 833 |
| dl: long gap after a name and many initials | 100008 | 808 | 777 |
| dl: date ranges | 99990 | 675 | 726 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 588 | 720 |
| dl: digit and dash | 100000 | 698 | 714 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 675 | 710 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 536 | 710 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 747 | 695 |
| dl: amount ranges | 99988 | 697 | 684 |
| r3 timex: overlap dates 1.1.1 | 100000 | 669 | 671 |
| dl: amounts after a range | 99974 | 656 | 669 |
| dl: dates with a claim between | 99988 | 730 | 661 |
| dl: amount before a date | 99997 | 704 | 659 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 693 | 653 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 622 | 645 |
| r3 timey: Z1 near-miss | 100000 | 571 | 641 |
| r3 timey: month words + overlap dates | 100000 | 596 | 640 |
| dl: digit and indented break | 99996 | 682 | 636 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 710 | 628 |
| dl: keep-noun list | 100004 | 715 | 627 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 657 | 610 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 529 | 602 |
| dl: digit two dashes break | 99996 | 589 | 601 |
| dl: date ranges glued to next word | 99994 | 580 | 597 |
| dl: ranges glued to ordinal-like word | 99990 | 603 | 597 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 648 | 578 |
| dl: digit and ZWSP | 100000 | 602 | 575 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 494 | 575 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 581 | 570 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 563 | 564 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 511 | 555 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 536 | 548 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 539 | 527 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 586 | 522 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 529 | 517 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 394 | 486 |
| r3 timey: own number near-miss | 100000 | 438 | 472 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 442 | 471 |
| r3 timex: words glued both sides | 100000 | 358 | 434 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 400 | 432 |
| r3 timey: SSN label glued own name | 100000 | 349 | 426 |
| r3 timey: Q1 initials | 100000 | 493 | 424 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 328 | 417 |
| r3 timey: long glued zZ run | 100002 | 395 | 411 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 447 | 409 |
| r3 timez: ZZ/ZZZ run | 100002 | 428 | 408 |
| r3 timey: month glued dense | 100000 | 396 | 408 |
| r3 timey: placeholder glued digits | 100000 | 409 | 399 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 385 | 387 |
| r3 timey: placeholders chain | 100004 | 494 | 382 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 385 | 382 |
| r3 timey: Jane1 repeated | 100000 | 376 | 368 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 375 | 368 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 359 | 364 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 420 | 361 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 374 | 358 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 352 | 352 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 334 | 352 |
| r3 timey: month words at run ends | 100000 | 352 | 348 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 351 | 348 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 327 | 345 |
| r3 timer: DE LA glued words | 100000 | 318 | 341 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 348 | 338 |
| r3 timex: long word one glue | 100000 | 386 | 337 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 349 | 337 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 341 | 337 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 396 | 336 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 337 | 333 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 412 | 333 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 282 | 331 |
| r3 timey: long glued ZZZ run | 100002 | 343 | 330 |
| r3 timey: own number glued | 100000 | 307 | 314 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 370 | 314 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 285 | 314 |
| dl: nine-digit runs | 100000 | 247 | 310 |
| r3 timey: DOB glued readings | 100000 | 312 | 310 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 303 | 299 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 332 | 298 |
| r3 timey: camel own name before label numbers | 100000 | 285 | 294 |
| dl: gap after a name as long as the letter | 99990 | 310 | 293 |
| r3 timer: DE LA run 2 names | 100002 | 284 | 293 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 362 | 292 |
| r3 timer: XU MA run | 100002 | 276 | 290 |
| dl: initials run after a name | 40008 | 305 | 289 |
| dl: spaced phone chains | 99996 | 299 | 289 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 262 | 289 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 278 | 288 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 271 | 287 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 284 | 283 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 370 | 281 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 337 | 281 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 305 | 281 |
| r3 timer: DE LA run caps | 100002 | 249 | 275 |
| r3 timer: DE LA run 3 names caps | 100002 | 279 | 273 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 314 | 272 |
| r3 timez: initials Z run | 100002 | 269 | 271 |
| r3 timer: DE LA run camel | 100002 | 274 | 270 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 322 | 268 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 272 | 268 |
| r3 timey: zephyra pieces spaced | 100004 | 284 | 266 |
| dl: phone label before nine digits | 100000 | 248 | 263 |
| r3 timer: LI camel words | 100000 | 285 | 262 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 297 | 261 |
| dl: 100 k digit run | 100000 | 235 | 260 |
| dl: SSNs back to back | 99996 | 254 | 258 |
| dl: one word glued to a digit | 100000 | 252 | 258 |
| r3 timey: JANE repeated glued | 100002 | 305 | 258 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 260 | 257 |
| r3 timey: camel AbAb glued | 100002 | 225 | 242 |
| dl: initials run before a name | 40007 | 236 | 230 |
| r3 timer: LI run | 100002 | 271 | 230 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 218 | 226 |
| r3 timex: medium words before digits | 100002 | 226 | 222 |
| r3 timey: camel aB | 100000 | 222 | 216 |
| dl: phones back to back | 99990 | 237 | 199 |
