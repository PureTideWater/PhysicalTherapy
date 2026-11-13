# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate40/head` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate40/headwin` (redact.ts 33dcd44adbc9)
- corpus: 975489 letters, sha256 89a133ca67449143; 841 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1828192.893116998, msRunB 1505324.7125910413, msClassify 0, msParse 7328.860819969481

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

max A 1201 ms, max B 1267 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1201 | 1267 |
| dl: digit and bare break | 100000 | 1126 | 1220 |
| dl: digit and CRLF | 99999 | 1108 | 1071 |
| dl: dates with slashes | 99995 | 1146 | 1049 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 1019 | 1007 |
| r3 timez: many parts run zZ | 100002 | 989 | 997 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 984 | 994 |
| r3 timez: many parts run ZzZ | 100002 | 943 | 980 |
| dl: dates with a claim between | 99988 | 918 | 931 |
| dl: digit dash break | 99999 | 832 | 857 |
| r3 timez: many parts run | 100002 | 812 | 826 |
| dl: date ranges | 99990 | 754 | 819 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 810 | 815 |
| r3 timey: spaced member chars | 100000 | 821 | 785 |
| dl: amounts after a range | 99974 | 715 | 739 |
| r3 timey: month words + overlap dates | 100000 | 741 | 738 |
| dl: ranges glued to ordinal-like word | 99990 | 611 | 716 |
| r3 timex: overlap dates 1.1.1 | 100000 | 652 | 712 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 698 | 709 |
| dl: digit and ZWSP | 100000 | 620 | 708 |
| dl: keep-noun list | 100004 | 713 | 704 |
| dl: long gap after a name and many initials | 100008 | 770 | 698 |
| dl: digit and dash | 100000 | 760 | 697 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 834 | 688 |
| dl: amount ranges | 99988 | 721 | 686 |
| r3 timey: Q1Q initials | 100000 | 728 | 686 |
| dl: amount before a date | 99997 | 685 | 684 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 573 | 670 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 660 | 670 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 576 | 663 |
| dl: date ranges glued to next word | 99994 | 743 | 657 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 573 | 640 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 595 | 636 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 570 | 636 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 604 | 634 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 576 | 628 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 626 | 627 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 640 | 625 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 580 | 615 |
| dl: digit and indented break | 99996 | 610 | 609 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 595 | 609 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 647 | 602 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 586 | 602 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 609 | 598 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 625 | 598 |
| r3 timey: Z1 near-miss | 100000 | 642 | 597 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 512 | 551 |
| dl: digit two dashes break | 99996 | 585 | 548 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 537 | 507 |
| r3 timey: own number near-miss | 100000 | 489 | 491 |
| r3 timey: SSN label glued own name | 100000 | 460 | 491 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 478 | 482 |
| r3 timey: month glued dense | 100000 | 479 | 444 |
| r3 timey: Q1 initials | 100000 | 479 | 443 |
| r3 timey: long glued zZ run | 100002 | 474 | 440 |
| r3 timey: placeholder glued digits | 100000 | 410 | 420 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 390 | 416 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 412 | 409 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 377 | 409 |
| r3 timey: placeholders chain | 100004 | 407 | 405 |
| r3 timex: words glued both sides | 100000 | 401 | 396 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 411 | 390 |
| r3 timey: own number glued | 100000 | 359 | 385 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 395 | 385 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 433 | 385 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 410 | 384 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 381 | 384 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 385 | 384 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 394 | 381 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 375 | 380 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 395 | 378 |
| r3 timez: ZZ/ZZZ run | 100002 | 404 | 377 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 327 | 376 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 376 | 373 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 377 | 372 |
| r3 timey: long glued ZZZ run | 100002 | 373 | 369 |
| r3 timey: Jane1 repeated | 100000 | 380 | 369 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 371 | 369 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 409 | 363 |
| r3 timey: DOB glued readings | 100000 | 349 | 359 |
| r3 timey: camel own name before label numbers | 100000 | 381 | 358 |
| r3 timey: month words at run ends | 100000 | 381 | 357 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 347 | 348 |
| r3 timer: DE LA glued words | 100000 | 355 | 341 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 395 | 338 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 329 | 338 |
| dl: SSNs back to back | 99996 | 299 | 327 |
| r3 timer: LI camel words | 100000 | 299 | 327 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 338 | 326 |
| r3 timey: zephyra pieces spaced | 100004 | 296 | 322 |
| r3 timer: DE LA run 2 names | 100002 | 328 | 319 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 315 | 319 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 334 | 319 |
| dl: spaced phone chains | 99996 | 318 | 317 |
| r3 timer: DE LA run 3 names caps | 100002 | 323 | 317 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 307 | 315 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 330 | 314 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 325 | 314 |
| r3 timex: long word one glue | 100000 | 317 | 312 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 325 | 311 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 313 | 307 |
| r3 timer: DE LA run caps | 100002 | 311 | 305 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 343 | 305 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 288 | 304 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 302 | 304 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 302 | 304 |
| r3 timer: DE LA run camel | 100002 | 305 | 303 |
| dl: phone label before nine digits | 100000 | 303 | 301 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 294 | 301 |
| r3 timer: XU MA run | 100002 | 312 | 300 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 325 | 299 |
| dl: initials run after a name | 40008 | 350 | 297 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 307 | 296 |
| r3 timez: initials Z run | 100002 | 303 | 295 |
| dl: nine-digit runs | 100000 | 309 | 294 |
| dl: initials run before a name | 40007 | 354 | 291 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 304 | 290 |
| dl: 100 k digit run | 100000 | 281 | 282 |
| dl: one word glued to a digit | 100000 | 288 | 278 |
| r3 timex: medium words before digits | 100002 | 251 | 259 |
| r3 timey: JANE repeated glued | 100002 | 307 | 258 |
| r3 timey: camel AbAb glued | 100002 | 259 | 257 |
| r3 timer: LI run | 100002 | 257 | 249 |
| r3 timey: camel aB | 100000 | 261 | 245 |
| dl: gap after a name as long as the letter | 99990 | 351 | 242 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 271 | 233 |
| dl: phones back to back | 99990 | 260 | 219 |
