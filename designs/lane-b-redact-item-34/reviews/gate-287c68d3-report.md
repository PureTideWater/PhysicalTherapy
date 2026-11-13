# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/179e1ec1-f2e5-5e51-954e-b58916f3dd83/scratchpad/trees-287c68d3/base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/179e1ec1-f2e5-5e51-954e-b58916f3dd83/scratchpad/trees-287c68d3/head/packages/model-gateway/src` (redact.ts 186a4e47b6f2)
- corpus: 975489 letters, sha256 89a133ca67449143; 768 s
- stats: letters 975489, same 975468, differ 21, refusedA 462984, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 3, annotated 18, msRunA 1396639.75867203, msRunB 1636169.361632979, msClassify 136.50243399971805, msParse 9378.606469016417

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

max A 975 ms, max B 1068 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 975 | 1068 |
| dl: dates with spaces | 99995 | 896 | 1039 |
| dl: digit and CRLF | 99999 | 966 | 985 |
| dl: dates with slashes | 99995 | 874 | 967 |
| dl: date ranges | 99990 | 583 | 810 |
| r3 timez: many parts run ZzZ | 100002 | 692 | 791 |
| dl: amount ranges | 99988 | 641 | 763 |
| dl: digit dash break | 99999 | 770 | 747 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 695 | 741 |
| dl: dates with a claim between | 99988 | 601 | 729 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 688 | 729 |
| r3 timez: many parts run zZ | 100002 | 734 | 717 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 705 | 717 |
| dl: long gap after a name and many initials | 100008 | 716 | 707 |
| dl: digit and dash | 100000 | 646 | 706 |
| r3 timey: month words + overlap dates | 100000 | 543 | 685 |
| r3 timez: many parts run | 100002 | 622 | 679 |
| dl: amount before a date | 99997 | 579 | 672 |
| r3 timey: spaced member chars | 100000 | 702 | 672 |
| dl: amounts after a range | 99974 | 627 | 660 |
| dl: date ranges glued to next word | 99994 | 484 | 655 |
| r3 timey: Q1Q initials | 100000 | 704 | 652 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 508 | 612 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 532 | 611 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 524 | 597 |
| dl: ranges glued to ordinal-like word | 99990 | 507 | 585 |
| r3 timex: overlap dates 1.1.1 | 100000 | 553 | 576 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 595 | 567 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 485 | 556 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 485 | 554 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 496 | 545 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 540 | 544 |
| dl: digit and ZWSP | 100000 | 546 | 541 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 455 | 540 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 502 | 538 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 488 | 534 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 474 | 534 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 450 | 527 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 544 | 527 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 501 | 522 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 465 | 518 |
| r3 timey: Z1 near-miss | 100000 | 445 | 513 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 529 | 512 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 453 | 509 |
| dl: keep-noun list | 100004 | 478 | 504 |
| dl: digit and indented break | 99996 | 543 | 502 |
| r3 timey: Q1 initials | 100000 | 355 | 443 |
| dl: digit two dashes break | 99996 | 478 | 439 |
| r3 timey: placeholder glued digits | 100000 | 350 | 419 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 334 | 414 |
| r3 timey: own number near-miss | 100000 | 380 | 409 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 358 | 400 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 332 | 399 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 323 | 385 |
| r3 timey: SSN label glued own name | 100000 | 317 | 365 |
| r3 timey: month glued dense | 100000 | 366 | 356 |
| dl: phone label before nine digits | 100000 | 239 | 355 |
| r3 timey: month words at run ends | 100000 | 358 | 352 |
| r3 timey: placeholders chain | 100004 | 335 | 350 |
| r3 timey: long glued zZ run | 100002 | 314 | 345 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 328 | 334 |
| r3 timey: DOB glued readings | 100000 | 308 | 333 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 281 | 330 |
| r3 timey: camel own name before label numbers | 100000 | 265 | 329 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 266 | 327 |
| r3 timez: ZZ/ZZZ run | 100002 | 301 | 325 |
| r3 timer: DE LA glued words | 100000 | 269 | 324 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 300 | 324 |
| r3 timey: own number glued | 100000 | 279 | 322 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 293 | 322 |
| r3 timex: words glued both sides | 100000 | 293 | 319 |
| dl: initials run before a name | 40007 | 214 | 317 |
| r3 timer: LI camel words | 100000 | 237 | 317 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 270 | 316 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 269 | 316 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 299 | 315 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 260 | 315 |
| r3 timer: DE LA run 3 names caps | 100002 | 268 | 310 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 247 | 310 |
| r3 timey: Jane1 repeated | 100000 | 285 | 309 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 326 | 309 |
| r3 timey: long glued ZZZ run | 100002 | 346 | 308 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 292 | 304 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 279 | 304 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 297 | 299 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 284 | 298 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 246 | 295 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 292 | 294 |
| r3 timer: XU MA run | 100002 | 257 | 293 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 260 | 289 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 243 | 286 |
| r3 timey: zephyra pieces spaced | 100004 | 241 | 285 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 256 | 280 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 267 | 276 |
| r3 timer: DE LA run 2 names | 100002 | 241 | 273 |
| dl: initials run after a name | 40008 | 267 | 272 |
| r3 timez: initials Z run | 100002 | 235 | 272 |
| r3 timey: JANE repeated glued | 100002 | 218 | 268 |
| r3 timer: LI run | 100002 | 201 | 267 |
| dl: SSNs back to back | 99996 | 279 | 266 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 286 | 265 |
| dl: nine-digit runs | 100000 | 228 | 264 |
| r3 timex: long word one glue | 100000 | 242 | 262 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 268 | 262 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 232 | 261 |
| dl: gap after a name as long as the letter | 99990 | 266 | 258 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 243 | 258 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 261 | 258 |
| r3 timer: DE LA run camel | 100002 | 229 | 256 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 241 | 256 |
| dl: spaced phone chains | 99996 | 226 | 255 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 270 | 255 |
| r3 timer: DE LA run caps | 100002 | 234 | 252 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 239 | 252 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 254 | 252 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 247 | 251 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 221 | 250 |
| r3 timey: camel AbAb glued | 100002 | 207 | 249 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 245 | 247 |
| dl: 100 k digit run | 100000 | 174 | 243 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 245 | 237 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 248 | 237 |
| r3 timey: camel aB | 100000 | 176 | 233 |
| dl: one word glued to a digit | 100000 | 215 | 227 |
| r3 timex: medium words before digits | 100002 | 203 | 223 |
| dl: phones back to back | 99990 | 205 | 207 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 202 | 202 |
