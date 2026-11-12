# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/trees-483ac960/base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/trees-483ac960/head/packages/model-gateway/src` (redact.ts 6983219d3e05)
- corpus: 975489 letters, sha256 89a133ca67449143; 958 s
- stats: letters 975489, same 975486, differ 3, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 3, annotated 0, msRunA 1927373.0928089654, msRunB 1877934.5575020032, msClassify 61.081980999937514, msParse 10216.196164975694

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

max A 1176 ms, max B 1107 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1038 | 1107 |
| dl: digit and bare break | 100000 | 1176 | 1099 |
| dl: digit and CRLF | 99999 | 1087 | 1006 |
| dl: dates with slashes | 99995 | 927 | 932 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 945 | 909 |
| r3 timez: many parts run zZ | 100002 | 874 | 882 |
| dl: digit dash break | 99999 | 794 | 848 |
| r3 timez: many parts run ZzZ | 100002 | 811 | 841 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 836 | 837 |
| r3 timez: many parts run | 100002 | 782 | 811 |
| dl: long gap after a name and many initials | 100008 | 712 | 774 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 633 | 740 |
| r3 timey: spaced member chars | 100000 | 695 | 707 |
| r3 timey: Q1Q initials | 100000 | 702 | 698 |
| dl: digit and indented break | 99996 | 564 | 694 |
| dl: date ranges glued to next word | 99994 | 553 | 693 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 721 | 686 |
| dl: date ranges | 99990 | 646 | 683 |
| dl: dates with a claim between | 99988 | 707 | 670 |
| dl: digit and dash | 100000 | 709 | 667 |
| dl: amounts after a range | 99974 | 670 | 664 |
| dl: amount before a date | 99997 | 644 | 644 |
| r3 timey: month words + overlap dates | 100000 | 621 | 624 |
| dl: amount ranges | 99988 | 673 | 622 |
| dl: keep-noun list | 100004 | 601 | 621 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 571 | 619 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 551 | 609 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 583 | 609 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 548 | 590 |
| r3 timex: overlap dates 1.1.1 | 100000 | 552 | 584 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 580 | 584 |
| dl: digit and ZWSP | 100000 | 561 | 580 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 550 | 573 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 564 | 568 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 583 | 561 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 541 | 555 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 609 | 553 |
| dl: ranges glued to ordinal-like word | 99990 | 530 | 552 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 542 | 549 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 576 | 539 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 563 | 526 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 539 | 521 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 539 | 518 |
| r3 timey: Z1 near-miss | 100000 | 519 | 515 |
| dl: digit two dashes break | 99996 | 591 | 509 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 526 | 493 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 494 | 473 |
| r3 timey: placeholder glued digits | 100000 | 348 | 448 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 334 | 429 |
| r3 timey: Q1 initials | 100000 | 385 | 427 |
| r3 timey: own number near-miss | 100000 | 423 | 410 |
| r3 timey: month glued dense | 100000 | 406 | 402 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 408 | 402 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 391 | 400 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 377 | 382 |
| r3 timey: month words at run ends | 100000 | 332 | 380 |
| r3 timey: long glued zZ run | 100002 | 419 | 370 |
| r3 timez: ZZ/ZZZ run | 100002 | 337 | 366 |
| r3 timey: placeholders chain | 100004 | 358 | 344 |
| r3 timey: SSN label glued own name | 100000 | 343 | 344 |
| r3 timex: words glued both sides | 100000 | 347 | 340 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 337 | 340 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 334 | 340 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 326 | 338 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 361 | 338 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 342 | 338 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 367 | 338 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 321 | 336 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 327 | 336 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 281 | 333 |
| r3 timer: DE LA glued words | 100000 | 292 | 332 |
| r3 timey: long glued ZZZ run | 100002 | 338 | 330 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 322 | 330 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 359 | 323 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 330 | 321 |
| r3 timex: long word one glue | 100000 | 259 | 317 |
| r3 timey: camel own name before label numbers | 100000 | 293 | 316 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 330 | 316 |
| r3 timey: Jane1 repeated | 100000 | 346 | 314 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 318 | 314 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 324 | 313 |
| r3 timey: own number glued | 100000 | 412 | 304 |
| r3 timey: DOB glued readings | 100000 | 319 | 297 |
| r3 timer: DE LA run 2 names | 100002 | 278 | 295 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 273 | 284 |
| dl: SSNs back to back | 99996 | 259 | 283 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 279 | 282 |
| r3 timey: camel AbAb glued | 100002 | 218 | 281 |
| r3 timer: DE LA run 3 names caps | 100002 | 316 | 280 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 265 | 280 |
| r3 timex: medium words before digits | 100002 | 216 | 273 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 298 | 272 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 262 | 271 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 280 | 271 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 275 | 270 |
| dl: initials run before a name | 40007 | 248 | 268 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 265 | 268 |
| dl: initials run after a name | 40008 | 320 | 266 |
| r3 timer: XU MA run | 100002 | 271 | 266 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 268 | 265 |
| r3 timer: DE LA run caps | 100002 | 243 | 261 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 263 | 261 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 270 | 259 |
| r3 timer: DE LA run camel | 100002 | 268 | 258 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 261 | 258 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 306 | 258 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 267 | 258 |
| r3 timer: LI camel words | 100000 | 242 | 257 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 280 | 257 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 283 | 255 |
| dl: spaced phone chains | 99996 | 264 | 250 |
| r3 timey: zephyra pieces spaced | 100004 | 259 | 250 |
| r3 timez: initials Z run | 100002 | 276 | 249 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 242 | 246 |
| dl: 100 k digit run | 100000 | 235 | 245 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 261 | 244 |
| dl: one word glued to a digit | 100000 | 259 | 243 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 259 | 241 |
| dl: phone label before nine digits | 100000 | 240 | 239 |
| dl: nine-digit runs | 100000 | 243 | 237 |
| r3 timey: JANE repeated glued | 100002 | 232 | 236 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 247 | 232 |
| r3 timer: LI run | 100002 | 218 | 230 |
| r3 timey: camel aB | 100000 | 214 | 210 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 207 | 204 |
| dl: phones back to back | 99990 | 200 | 181 |
| dl: gap after a name as long as the letter | 99990 | 195 | 172 |
