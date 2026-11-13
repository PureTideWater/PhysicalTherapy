# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/f344a4ea-3385-5c28-91fb-5af3309c1929/scratchpad/trees-17028cfa/base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/f344a4ea-3385-5c28-91fb-5af3309c1929/scratchpad/trees-17028cfa/head/packages/model-gateway/src` (redact.ts bb0502c11cf5)
- corpus: 975489 letters, sha256 89a133ca67449143; 771 s
- stats: letters 975489, same 975468, differ 21, refusedA 462984, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 3, annotated 18, msRunA 1544722.4319580528, msRunB 1504215.370824954, msClassify 117.86294600028486, msParse 7997.641143030483

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

### KEEP.changed.text: 1
- how: no SSN/phone word 1
- by source: T5/MOD-13 letterCase@3fcb9359 1
  - "birth date Aug 4, 1933, Patient: K.FGK😀 for K.FGK😀 Dear FGK, K.😀 RE: Patient Fgk, Kre I.😀 " [KRE I FGK] A: "birth date [DATE_OF_BIRTH], Patient: [PATIENT_NAME].[CLAIM_1]😀 for [PATIENT_NAME].[CLAIM_1]😀 Dear [CLAIM_1], [PATIENT_NAME].😀 RE: Patient [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME].😀 " B: "birth date [DATE_OF_BIRTH], Patient: [PATIENT_NAME].[CLAIM_1]😀 for [PATIENT_NAME].[CLAIM_1]😀 Dear [CLAIM_1], [PATIENT_NAME]: Patient [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME].😀 "

### KEEP.refused.letter-with-identifiers: 6
- by source: harness/rg-review-phi-1__fuzzdob.mts__2 5, harness/rg-review-phi-1__fuzzdob.mts__1 1
  - "01/02/2020May 2020|01/12/01" [JUNE Q VANTREE; MAY ZEPHYRA] A: "01/02/2020May 2020|[DATE_OF_BIRTH]" B: REFUSED
  - "Seen 01. 12-01/02/2020May 2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen [DATE_OF_BIRTH]/02/2020May 2020" B: REFUSED
  - "1961-03-03\nJan. 01/02/2020June 1" [JUNE Q VANTREE; MAY ZEPHYRA] A: "[DATE_OF_BIRTH]\nJan. 01/02/2020June 1" B: REFUSED
  - "1961-03-03/May01/02/2020|June/12 Jan 2001" [JUNE Q VANTREE; MAY ZEPHYRA] A: "[DATE_OF_BIRTH]/May01/02/2020|[PATIENT_NAME]/[DATE_OF_BIRTH]" B: REFUSED
  - "Seen 150.00, 01/02/2020June_March 3, 1961. 12" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen 150.00, 01/02/2020June_[DATE_OF_BIRTH]. 12" B: REFUSED

### KEEP.refused.must-stay.other: 12
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 7, harness/rg-review-phi-1__fuzzdob.mts__2 5
  - "DOS 3rd01/02/2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS 3rd01/02/2020" B: REFUSED
  - "Seen of-June01/02/2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen of-June01/02/2020" B: REFUSED
  - "Seen Jan / 01/02/2020May" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen Jan / 01/02/2020May" B: REFUSED
  - "Paid 3rd01/02/2020\n03|Jan" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Paid 3rd01/02/2020\n03|Jan" B: REFUSED
  - "DOS Jan-of01/02/2020. 0.00" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS Jan-of01/02/2020. 0.00" B: REFUSED

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

max A 1054 ms, max B 1005 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 1054 | 1005 |
| dl: digit and CRLF | 99999 | 1037 | 955 |
| dl: dates with spaces | 99995 | 925 | 936 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 859 | 889 |
| dl: dates with slashes | 99995 | 877 | 859 |
| r3 timez: many parts run zZ | 100002 | 830 | 843 |
| r3 timez: many parts run ZzZ | 100002 | 810 | 790 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 790 | 771 |
| dl: digit dash break | 99999 | 902 | 761 |
| r3 timez: many parts run | 100002 | 741 | 692 |
| r3 timey: Q1Q initials | 100000 | 653 | 660 |
| dl: digit and dash | 100000 | 621 | 647 |
| dl: long gap after a name and many initials | 100008 | 715 | 638 |
| r3 timey: spaced member chars | 100000 | 628 | 621 |
| dl: date ranges | 99990 | 631 | 617 |
| dl: amount before a date | 99997 | 627 | 609 |
| dl: amounts after a range | 99974 | 646 | 609 |
| r3 timey: month words + overlap dates | 100000 | 547 | 598 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 652 | 598 |
| dl: keep-noun list | 100004 | 597 | 593 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 532 | 582 |
| dl: amount ranges | 99988 | 635 | 579 |
| dl: dates with a claim between | 99988 | 592 | 578 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 495 | 553 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 562 | 544 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 489 | 541 |
| dl: ranges glued to ordinal-like word | 99990 | 564 | 539 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 530 | 529 |
| dl: date ranges glued to next word | 99994 | 520 | 524 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 487 | 520 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 499 | 519 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 527 | 518 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 537 | 499 |
| dl: digit and indented break | 99996 | 506 | 495 |
| r3 timey: Z1 near-miss | 100000 | 547 | 490 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 513 | 487 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 575 | 486 |
| dl: digit and ZWSP | 100000 | 647 | 485 |
| r3 timex: overlap dates 1.1.1 | 100000 | 595 | 484 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 500 | 484 |
| dl: digit two dashes break | 99996 | 470 | 483 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 525 | 483 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 493 | 481 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 549 | 479 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 522 | 473 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 474 | 468 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 496 | 460 |
| r3 timey: own number near-miss | 100000 | 409 | 427 |
| r3 timey: Q1 initials | 100000 | 364 | 404 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 361 | 387 |
| r3 timey: month glued dense | 100000 | 414 | 361 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 425 | 355 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 334 | 353 |
| r3 timey: placeholder glued digits | 100000 | 337 | 346 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 366 | 341 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 324 | 337 |
| r3 timey: long glued zZ run | 100002 | 351 | 336 |
| r3 timey: month words at run ends | 100000 | 317 | 330 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 300 | 330 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 348 | 326 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 301 | 320 |
| r3 timez: ZZ/ZZZ run | 100002 | 334 | 319 |
| r3 timey: placeholders chain | 100004 | 322 | 319 |
| r3 timey: long glued ZZZ run | 100002 | 309 | 318 |
| r3 timex: words glued both sides | 100000 | 307 | 318 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 311 | 318 |
| r3 timey: Jane1 repeated | 100000 | 310 | 312 |
| r3 timey: SSN label glued own name | 100000 | 314 | 309 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 311 | 306 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 296 | 304 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 302 | 302 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 304 | 299 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 297 | 298 |
| r3 timey: camel own name before label numbers | 100000 | 314 | 297 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 298 | 296 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 301 | 293 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 297 | 293 |
| r3 timey: own number glued | 100000 | 323 | 291 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 340 | 291 |
| r3 timer: DE LA run 2 names | 100002 | 273 | 284 |
| r3 timer: DE LA glued words | 100000 | 285 | 279 |
| r3 timey: DOB glued readings | 100000 | 289 | 272 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 256 | 271 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 251 | 269 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 243 | 265 |
| dl: gap after a name as long as the letter | 99990 | 165 | 262 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 268 | 261 |
| dl: one word glued to a digit | 100000 | 240 | 260 |
| r3 timer: LI camel words | 100000 | 234 | 260 |
| r3 timer: DE LA run 3 names caps | 100002 | 263 | 258 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 256 | 256 |
| r3 timer: XU MA run | 100002 | 265 | 254 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 241 | 254 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 253 | 254 |
| r3 timex: long word one glue | 100000 | 245 | 248 |
| dl: SSNs back to back | 99996 | 230 | 241 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 255 | 241 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 240 | 241 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 251 | 240 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 246 | 240 |
| dl: spaced phone chains | 99996 | 238 | 239 |
| dl: phone label before nine digits | 100000 | 232 | 239 |
| r3 timez: initials Z run | 100002 | 240 | 239 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 251 | 238 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 238 | 238 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 227 | 238 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 259 | 238 |
| r3 timey: zephyra pieces spaced | 100004 | 235 | 237 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 233 | 236 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 252 | 236 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 244 | 235 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 243 | 235 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 239 | 234 |
| r3 timer: DE LA run caps | 100002 | 230 | 233 |
| dl: nine-digit runs | 100000 | 238 | 231 |
| r3 timer: DE LA run camel | 100002 | 229 | 231 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 232 | 230 |
| dl: initials run after a name | 40008 | 274 | 226 |
| dl: 100 k digit run | 100000 | 214 | 223 |
| r3 timey: JANE repeated glued | 100002 | 231 | 220 |
| dl: initials run before a name | 40007 | 209 | 215 |
| r3 timer: LI run | 100002 | 225 | 215 |
| r3 timey: camel AbAb glued | 100002 | 207 | 209 |
| r3 timex: medium words before digits | 100002 | 194 | 209 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 194 | 204 |
| r3 timey: camel aB | 100000 | 210 | 195 |
| dl: phones back to back | 99990 | 169 | 170 |
