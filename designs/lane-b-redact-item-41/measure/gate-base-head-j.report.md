# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-j/packages/model-gateway/src` (redact.ts 3157562f884d)
- corpus: 975489 letters, sha256 89a133ca67449143; 1008 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1956101.9172380008, msRunB 2054069.7520609724, msClassify 0, msParse 7342.746311028626

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

max A 1243 ms, max B 1821 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1203 | 1821 |
| dl: digit and bare break | 100000 | 1124 | 1708 |
| dl: dates with slashes | 99995 | 1050 | 1653 |
| dl: digit dash break | 99999 | 844 | 1306 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 629 | 1175 |
| dl: amount ranges | 99988 | 658 | 1164 |
| dl: dates with a claim between | 99988 | 928 | 1149 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 780 | 1124 |
| r3 timey: Q1Q initials | 100000 | 714 | 1122 |
| dl: digit and CRLF | 99999 | 1243 | 1120 |
| r3 timey: Z1 near-miss | 100000 | 565 | 1114 |
| dl: long gap after a name and many initials | 100008 | 774 | 1111 |
| dl: date ranges | 99990 | 815 | 1079 |
| dl: amount before a date | 99997 | 716 | 1078 |
| r3 timey: spaced member chars | 100000 | 688 | 1029 |
| r3 timey: month words + overlap dates | 100000 | 722 | 1025 |
| dl: digit and dash | 100000 | 715 | 1022 |
| dl: digit and ZWSP | 100000 | 613 | 998 |
| r3 timez: many parts run zZ | 100002 | 958 | 950 |
| r3 timex: overlap dates 1.1.1 | 100000 | 557 | 945 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 969 | 926 |
| dl: date ranges glued to next word | 99994 | 660 | 922 |
| r3 timez: many parts run ZzZ | 100002 | 906 | 919 |
| dl: ranges glued to ordinal-like word | 99990 | 630 | 915 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 647 | 907 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 575 | 889 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 566 | 879 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 557 | 871 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 559 | 868 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 545 | 864 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 867 | 864 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 537 | 854 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 545 | 851 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 587 | 850 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 542 | 848 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 558 | 845 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 563 | 844 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 553 | 843 |
| r3 timez: many parts run | 100002 | 808 | 825 |
| dl: digit and indented break | 99996 | 648 | 815 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 551 | 804 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 576 | 785 |
| dl: digit two dashes break | 99996 | 548 | 779 |
| dl: keep-noun list | 100004 | 683 | 740 |
| r3 timey: own number near-miss | 100000 | 483 | 713 |
| dl: amounts after a range | 99974 | 733 | 711 |
| r3 timey: month glued dense | 100000 | 457 | 690 |
| r3 timey: long glued zZ run | 100002 | 424 | 660 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 675 | 645 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 431 | 639 |
| r3 timey: Q1 initials | 100000 | 460 | 621 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 354 | 613 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 599 | 612 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 361 | 573 |
| r3 timex: words glued both sides | 100000 | 399 | 571 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 364 | 571 |
| r3 timez: ZZ/ZZZ run | 100002 | 436 | 564 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 356 | 561 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 357 | 555 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 363 | 554 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 358 | 553 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 363 | 551 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 355 | 551 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 357 | 550 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 357 | 549 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 363 | 547 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 391 | 545 |
| r3 timey: long glued ZZZ run | 100002 | 365 | 541 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 323 | 500 |
| r3 timer: DE LA run 2 names | 100002 | 311 | 481 |
| r3 timer: DE LA run camel | 100002 | 302 | 472 |
| r3 timer: DE LA run 3 names caps | 100002 | 336 | 456 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 458 | 456 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 461 | 454 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 307 | 453 |
| r3 timez: initials Z run | 100002 | 333 | 451 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 301 | 447 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 305 | 446 |
| r3 timey: DOB glued readings | 100000 | 352 | 445 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 285 | 436 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 306 | 430 |
| r3 timer: XU MA run | 100002 | 314 | 428 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 301 | 428 |
| r3 timex: long word one glue | 100000 | 301 | 426 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 291 | 426 |
| r3 timey: zephyra pieces spaced | 100004 | 275 | 425 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 296 | 425 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 293 | 425 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 303 | 424 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 291 | 422 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 293 | 418 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 279 | 417 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 279 | 415 |
| dl: 100 k digit run | 100000 | 281 | 412 |
| r3 timey: camel own name before label numbers | 100000 | 335 | 412 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 381 | 408 |
| r3 timer: DE LA run caps | 100002 | 299 | 406 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 299 | 406 |
| dl: initials run before a name | 40007 | 346 | 401 |
| dl: one word glued to a digit | 100000 | 275 | 397 |
| dl: initials run after a name | 40008 | 355 | 396 |
| r3 timey: SSN label glued own name | 100000 | 423 | 387 |
| r3 timey: placeholders chain | 100004 | 378 | 386 |
| r3 timey: placeholder glued digits | 100000 | 384 | 379 |
| r3 timey: camel AbAb glued | 100002 | 263 | 378 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 326 | 376 |
| r3 timer: LI run | 100002 | 274 | 368 |
| r3 timer: LI camel words | 100000 | 302 | 368 |
| r3 timey: Jane1 repeated | 100000 | 368 | 365 |
| r3 timey: month words at run ends | 100000 | 443 | 364 |
| r3 timex: medium words before digits | 100002 | 244 | 363 |
| dl: nine-digit runs | 100000 | 299 | 358 |
| r3 timey: own number glued | 100000 | 348 | 354 |
| dl: phone label before nine digits | 100000 | 293 | 350 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 381 | 348 |
| dl: SSNs back to back | 99996 | 300 | 339 |
| r3 timer: DE LA glued words | 100000 | 343 | 329 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 397 | 329 |
| r3 timey: camel aB | 100000 | 248 | 323 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 242 | 323 |
| dl: gap after a name as long as the letter | 99990 | 243 | 322 |
| dl: spaced phone chains | 99996 | 303 | 322 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 319 | 317 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 318 | 314 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 294 | 281 |
| r3 timey: JANE repeated glued | 100002 | 280 | 273 |
| dl: phones back to back | 99990 | 263 | 238 |
