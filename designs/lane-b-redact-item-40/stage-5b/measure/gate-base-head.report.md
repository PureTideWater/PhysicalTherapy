# Gate report

- tree A: `/tmp/claude-0/m5b/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/m5b/head/packages/model-gateway/src` (redact.ts 52bd8b4f09cc)
- corpus: 975489 letters, sha256 89a133ca67449143; 1022 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 2015230.209371038, msRunB 2048595.0040119442, msClassify 0, msParse 7872.381797040968

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

max A 1349 ms, max B 1287 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1299 | 1287 |
| dl: digit and bare break | 100000 | 1219 | 1255 |
| dl: digit and CRLF | 99999 | 1349 | 1215 |
| dl: dates with slashes | 99995 | 1193 | 1145 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 993 | 1101 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 1088 | 1019 |
| r3 timez: many parts run zZ | 100002 | 1007 | 1004 |
| dl: digit dash break | 99999 | 967 | 985 |
| r3 timez: many parts run ZzZ | 100002 | 930 | 984 |
| dl: dates with a claim between | 99988 | 958 | 956 |
| dl: date ranges | 99990 | 862 | 932 |
| r3 timey: month words + overlap dates | 100000 | 940 | 923 |
| r3 timey: Q1Q initials | 100000 | 789 | 913 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 851 | 883 |
| dl: long gap after a name and many initials | 100008 | 777 | 854 |
| dl: amounts after a range | 99974 | 900 | 851 |
| dl: keep-noun list | 100004 | 746 | 845 |
| r3 timey: spaced member chars | 100000 | 801 | 827 |
| dl: digit and dash | 100000 | 804 | 799 |
| r3 timez: many parts run | 100002 | 902 | 796 |
| dl: digit and ZWSP | 100000 | 717 | 795 |
| dl: amount ranges | 99988 | 760 | 763 |
| dl: amount before a date | 99997 | 815 | 754 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 614 | 745 |
| dl: digit and indented break | 99996 | 710 | 744 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 678 | 736 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 729 | 716 |
| dl: ranges glued to ordinal-like word | 99990 | 747 | 704 |
| dl: date ranges glued to next word | 99994 | 726 | 702 |
| r3 timey: Z1 near-miss | 100000 | 643 | 687 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 651 | 687 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 574 | 672 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 575 | 665 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 707 | 658 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 567 | 656 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 701 | 648 |
| r3 timex: overlap dates 1.1.1 | 100000 | 626 | 640 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 644 | 631 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 581 | 626 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 585 | 624 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 589 | 623 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 562 | 621 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 651 | 612 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 602 | 611 |
| dl: digit two dashes break | 99996 | 624 | 610 |
| r3 timey: own number near-miss | 100000 | 618 | 605 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 549 | 605 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 627 | 603 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 453 | 517 |
| r3 timey: month glued dense | 100000 | 510 | 492 |
| r3 timey: long glued zZ run | 100002 | 469 | 486 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 467 | 485 |
| r3 timex: words glued both sides | 100000 | 446 | 473 |
| r3 timey: Q1 initials | 100000 | 475 | 470 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 485 | 467 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 382 | 457 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 377 | 444 |
| r3 timey: own number glued | 100000 | 565 | 443 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 445 | 438 |
| r3 timer: DE LA run 2 names | 100002 | 410 | 433 |
| r3 timer: DE LA glued words | 100000 | 548 | 428 |
| dl: initials run before a name | 40007 | 346 | 424 |
| r3 timey: DOB glued readings | 100000 | 550 | 422 |
| r3 timez: ZZ/ZZZ run | 100002 | 410 | 418 |
| r3 timey: SSN label glued own name | 100000 | 423 | 412 |
| r3 timey: placeholder glued digits | 100000 | 473 | 411 |
| r3 timey: placeholders chain | 100004 | 458 | 410 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 420 | 410 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 370 | 409 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 452 | 407 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 388 | 398 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 377 | 391 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 409 | 390 |
| r3 timey: Jane1 repeated | 100000 | 384 | 389 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 394 | 384 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 349 | 384 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 411 | 378 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 368 | 377 |
| r3 timey: month words at run ends | 100000 | 518 | 375 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 404 | 375 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 319 | 375 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 378 | 373 |
| r3 timer: LI camel words | 100000 | 341 | 372 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 346 | 372 |
| r3 timer: DE LA run caps | 100002 | 310 | 369 |
| r3 timey: long glued ZZZ run | 100002 | 375 | 369 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 397 | 367 |
| r3 timer: XU MA run | 100002 | 318 | 364 |
| r3 timer: DE LA run 3 names caps | 100002 | 390 | 362 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 376 | 362 |
| dl: nine-digit runs | 100000 | 315 | 360 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 392 | 359 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 438 | 355 |
| r3 timey: camel own name before label numbers | 100000 | 442 | 341 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 324 | 335 |
| r3 timey: JANE repeated glued | 100002 | 336 | 329 |
| dl: spaced phone chains | 99996 | 330 | 328 |
| dl: phone label before nine digits | 100000 | 319 | 328 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 315 | 327 |
| r3 timey: camel aB | 100000 | 249 | 323 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 357 | 322 |
| dl: SSNs back to back | 99996 | 377 | 321 |
| r3 timer: DE LA run camel | 100002 | 324 | 320 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 351 | 315 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 319 | 314 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 366 | 313 |
| r3 timex: long word one glue | 100000 | 337 | 304 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 318 | 304 |
| r3 timez: initials Z run | 100002 | 345 | 303 |
| dl: one word glued to a digit | 100000 | 332 | 301 |
| r3 timey: zephyra pieces spaced | 100004 | 307 | 299 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 353 | 299 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 315 | 299 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 325 | 298 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 312 | 298 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 306 | 298 |
| dl: initials run after a name | 40008 | 321 | 297 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 296 | 296 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 300 | 294 |
| dl: 100 k digit run | 100000 | 287 | 293 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 327 | 292 |
| r3 timey: camel AbAb glued | 100002 | 260 | 267 |
| dl: gap after a name as long as the letter | 99990 | 261 | 262 |
| r3 timer: LI run | 100002 | 303 | 261 |
| r3 timex: medium words before digits | 100002 | 266 | 251 |
| dl: phones back to back | 99990 | 244 | 250 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 272 | 248 |
