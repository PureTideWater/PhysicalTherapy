# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate39/base` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate39/aclazy` (redact.ts 779be702fefd)
- corpus: 975489 letters, sha256 89a133ca67449143; 1021 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1948003.6898959884, msRunB 2101824.7511610333, msClassify 0, msParse 7428.678041014047

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

max A 1274 ms, max B 7510 ms, budget 3000 ms; over budget in B: r3 timez: many parts run, r3 timez: many parts run zZ, r3 timez: many parts run ZzZ, harvest: rg-review-gateway-3__timez.mts__default #2, harvest: rg-review-gateway-3__timez.mts__default #3

| case | chars | A | B |
|---|---:|---:|---:|
| r3 timez: many parts run ZzZ | 100002 | 934 | 7510 |
| r3 timez: many parts run zZ | 100002 | 1008 | 7396 |
| r3 timez: many parts run | 100002 | 841 | 7294 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 865 | 7239 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 930 | 7169 |
| r3 timey: long glued zZ run | 100002 | 478 | 2135 |
| r3 timez: ZZ/ZZZ run | 100002 | 386 | 2027 |
| r3 timey: long glued ZZZ run | 100002 | 420 | 1960 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 391 | 1861 |
| dl: dates with slashes | 99995 | 1228 | 1401 |
| dl: dates with spaces | 99995 | 1262 | 1312 |
| dl: digit and CRLF | 99999 | 1274 | 1296 |
| dl: digit and bare break | 100000 | 1189 | 1210 |
| dl: dates with a claim between | 99988 | 910 | 968 |
| dl: date ranges | 99990 | 833 | 962 |
| dl: digit dash break | 99999 | 979 | 936 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 241 | 822 |
| r3 timey: month words + overlap dates | 100000 | 752 | 811 |
| r3 timey: camel AbAb glued | 100002 | 269 | 809 |
| r3 timey: camel aB | 100000 | 255 | 806 |
| dl: amount before a date | 99997 | 750 | 793 |
| dl: keep-noun list | 100004 | 696 | 784 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 829 | 783 |
| r3 timey: Q1Q initials | 100000 | 829 | 771 |
| dl: digit and dash | 100000 | 794 | 764 |
| dl: amounts after a range | 99974 | 781 | 764 |
| dl: long gap after a name and many initials | 100008 | 871 | 758 |
| r3 timer: LI run | 100002 | 289 | 750 |
| dl: amount ranges | 99988 | 718 | 735 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 656 | 731 |
| r3 timey: spaced member chars | 100000 | 737 | 704 |
| dl: date ranges glued to next word | 99994 | 703 | 703 |
| dl: ranges glued to ordinal-like word | 99990 | 623 | 701 |
| r3 timez: initials Z run | 100002 | 343 | 687 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 662 | 678 |
| r3 timex: overlap dates 1.1.1 | 100000 | 595 | 667 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 569 | 657 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 577 | 655 |
| dl: digit and indented break | 99996 | 610 | 654 |
| r3 timey: Z1 near-miss | 100000 | 572 | 647 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 544 | 644 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 632 | 644 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 560 | 639 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 523 | 637 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 530 | 625 |
| dl: digit and ZWSP | 100000 | 652 | 613 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 517 | 595 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 524 | 594 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 553 | 588 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 538 | 587 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 584 | 585 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 506 | 584 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 545 | 582 |
| r3 timey: camel own name before label numbers | 100000 | 359 | 579 |
| r3 timey: own number near-miss | 100000 | 459 | 576 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 611 | 572 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 503 | 567 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 436 | 558 |
| r3 timey: placeholders chain | 100004 | 417 | 553 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 468 | 553 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 289 | 542 |
| dl: digit two dashes break | 99996 | 576 | 531 |
| r3 timer: DE LA run 2 names | 100002 | 324 | 531 |
| r3 timer: DE LA run caps | 100002 | 407 | 530 |
| r3 timer: XU MA run | 100002 | 308 | 526 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 320 | 525 |
| r3 timey: Jane1 repeated | 100000 | 383 | 518 |
| r3 timey: Q1 initials | 100000 | 513 | 517 |
| r3 timer: LI camel words | 100000 | 335 | 515 |
| r3 timey: own number glued | 100000 | 358 | 515 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 405 | 513 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 325 | 508 |
| r3 timer: DE LA run 3 names caps | 100002 | 360 | 505 |
| r3 timer: DE LA glued words | 100000 | 355 | 505 |
| r3 timer: DE LA run camel | 100002 | 372 | 503 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 405 | 503 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 401 | 496 |
| r3 timey: month glued dense | 100000 | 438 | 491 |
| r3 timey: placeholder glued digits | 100000 | 398 | 488 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 333 | 488 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 439 | 484 |
| r3 timey: zephyra pieces spaced | 100004 | 350 | 473 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 324 | 463 |
| r3 timex: words glued both sides | 100000 | 378 | 453 |
| r3 timey: SSN label glued own name | 100000 | 422 | 447 |
| r3 timey: JANE repeated glued | 100002 | 295 | 443 |
| r3 timey: month words at run ends | 100000 | 369 | 427 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 351 | 425 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 351 | 423 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 397 | 423 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 311 | 422 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 361 | 420 |
| r3 timey: DOB glued readings | 100000 | 422 | 412 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 355 | 408 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 374 | 408 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 377 | 406 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 367 | 405 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 362 | 394 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 352 | 392 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 364 | 385 |
| dl: gap after a name as long as the letter | 99990 | 246 | 362 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 308 | 356 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 302 | 355 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 303 | 349 |
| dl: nine-digit runs | 100000 | 296 | 348 |
| r3 timex: long word one glue | 100000 | 329 | 347 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 279 | 341 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 324 | 340 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 282 | 336 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 279 | 335 |
| dl: SSNs back to back | 99996 | 298 | 334 |
| dl: phone label before nine digits | 100000 | 346 | 333 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 296 | 333 |
| r3 timex: medium words before digits | 100002 | 272 | 331 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 286 | 331 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 270 | 330 |
| dl: 100 k digit run | 100000 | 270 | 329 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 333 | 329 |
| dl: spaced phone chains | 99996 | 360 | 328 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 291 | 328 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 287 | 326 |
| dl: one word glued to a digit | 100000 | 372 | 325 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 303 | 322 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 276 | 321 |
| dl: initials run after a name | 40008 | 341 | 315 |
| dl: initials run before a name | 40007 | 292 | 302 |
| dl: phones back to back | 99990 | 232 | 228 |
