# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/a728ad9c-6507-5429-9919-94f1e72d18e5/scratchpad/base40/packages/redact/src` (redact.ts 1beb52e2500f)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/a728ad9c-6507-5429-9919-94f1e72d18e5/scratchpad/s5/packages/redact/src` (redact.ts 3e67dd0a8e96)
- corpus: 975489 letters, sha256 89a133ca67449143; 920 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 2011047.9474450292, msRunB 1631848.7289820018, msClassify 0, msParse 10084.125227925422

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

none

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

max A 1187 ms, max B 1279 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1187 | 1279 |
| dl: dates with slashes | 99995 | 1088 | 1155 |
| dl: digit and bare break | 100000 | 1172 | 1079 |
| dl: digit and CRLF | 99999 | 1104 | 1040 |
| dl: dates with a claim between | 99988 | 895 | 1010 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 796 | 980 |
| r3 timez: many parts run zZ | 100002 | 883 | 913 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 719 | 866 |
| dl: digit and dash | 100000 | 676 | 817 |
| r3 timez: many parts run | 100002 | 689 | 813 |
| r3 timez: many parts run ZzZ | 100002 | 855 | 813 |
| dl: digit dash break | 99999 | 818 | 795 |
| dl: long gap after a name and many initials | 100008 | 797 | 773 |
| dl: date ranges | 99990 | 797 | 762 |
| r3 timey: spaced member chars | 100000 | 745 | 751 |
| dl: amounts after a range | 99974 | 705 | 749 |
| dl: digit and ZWSP | 100000 | 694 | 739 |
| r3 timey: month words + overlap dates | 100000 | 665 | 724 |
| r3 timey: Q1Q initials | 100000 | 658 | 692 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 622 | 692 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 720 | 692 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 532 | 676 |
| dl: amount before a date | 99997 | 676 | 666 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 511 | 663 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 552 | 663 |
| dl: amount ranges | 99988 | 705 | 656 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 517 | 653 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 569 | 634 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 589 | 633 |
| dl: date ranges glued to next word | 99994 | 537 | 613 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 668 | 612 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 525 | 611 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 624 | 610 |
| r3 timex: overlap dates 1.1.1 | 100000 | 632 | 605 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 599 | 600 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 568 | 591 |
| dl: digit two dashes break | 99996 | 543 | 590 |
| dl: keep-noun list | 100004 | 636 | 584 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 531 | 580 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 503 | 576 |
| dl: ranges glued to ordinal-like word | 99990 | 561 | 571 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 544 | 569 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 542 | 559 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 499 | 552 |
| r3 timey: Z1 near-miss | 100000 | 545 | 546 |
| dl: digit and indented break | 99996 | 559 | 542 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 517 | 541 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 472 | 523 |
| r3 timey: long glued zZ run | 100002 | 320 | 499 |
| dl: spaced phone chains | 99996 | 313 | 492 |
| r3 timey: SSN label glued own name | 100000 | 371 | 474 |
| dl: initials run before a name | 40007 | 337 | 451 |
| r3 timey: Q1 initials | 100000 | 483 | 448 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 432 | 444 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 451 | 444 |
| r3 timey: placeholders chain | 100004 | 422 | 443 |
| dl: phone label before nine digits | 100000 | 320 | 432 |
| r3 timey: month glued dense | 100000 | 413 | 425 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 354 | 422 |
| r3 timey: own number near-miss | 100000 | 399 | 421 |
| r3 timey: placeholder glued digits | 100000 | 382 | 394 |
| r3 timer: DE LA run 2 names | 100002 | 261 | 393 |
| r3 timey: long glued ZZZ run | 100002 | 386 | 389 |
| r3 timex: words glued both sides | 100000 | 356 | 386 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 336 | 384 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 358 | 380 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 356 | 374 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 382 | 373 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 337 | 370 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 387 | 369 |
| dl: gap after a name as long as the letter | 99990 | 341 | 368 |
| r3 timey: Jane1 repeated | 100000 | 336 | 367 |
| r3 timez: ZZ/ZZZ run | 100002 | 314 | 366 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 346 | 366 |
| r3 timey: month words at run ends | 100000 | 378 | 365 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 330 | 365 |
| r3 timey: DOB glued readings | 100000 | 325 | 362 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 300 | 357 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 397 | 357 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 366 | 356 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 352 | 354 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 360 | 354 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 364 | 347 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 351 | 343 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 277 | 340 |
| r3 timer: DE LA glued words | 100000 | 337 | 335 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 287 | 334 |
| r3 timer: DE LA run 3 names caps | 100002 | 299 | 331 |
| r3 timer: LI camel words | 100000 | 322 | 326 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 343 | 326 |
| r3 timey: own number glued | 100000 | 339 | 323 |
| dl: initials run after a name | 40008 | 343 | 322 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 304 | 322 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 288 | 322 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 352 | 319 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 317 | 316 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 272 | 314 |
| r3 timey: zephyra pieces spaced | 100004 | 272 | 309 |
| r3 timey: camel own name before label numbers | 100000 | 311 | 307 |
| r3 timex: long word one glue | 100000 | 327 | 307 |
| dl: nine-digit runs | 100000 | 298 | 304 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 251 | 304 |
| dl: SSNs back to back | 99996 | 311 | 303 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 350 | 300 |
| r3 timey: camel aB | 100000 | 216 | 299 |
| r3 timey: camel AbAb glued | 100002 | 242 | 299 |
| r3 timer: XU MA run | 100002 | 302 | 298 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 371 | 295 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 298 | 289 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 293 | 286 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 300 | 286 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 266 | 285 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 271 | 284 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 305 | 283 |
| r3 timez: initials Z run | 100002 | 289 | 282 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 265 | 278 |
| dl: one word glued to a digit | 100000 | 342 | 277 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 304 | 274 |
| dl: 100 k digit run | 100000 | 254 | 272 |
| r3 timer: LI run | 100002 | 242 | 269 |
| r3 timey: JANE repeated glued | 100002 | 289 | 269 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 252 | 265 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 290 | 262 |
| r3 timer: DE LA run camel | 100002 | 234 | 257 |
| r3 timer: DE LA run caps | 100002 | 239 | 252 |
| dl: phones back to back | 99990 | 247 | 239 |
| r3 timex: medium words before digits | 100002 | 242 | 238 |
