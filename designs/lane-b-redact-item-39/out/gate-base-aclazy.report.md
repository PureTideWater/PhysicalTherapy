# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate39/base` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate39/aclazy` (redact.ts 08ea36b02270)
- corpus: 975489 letters, sha256 89a133ca67449143; 1036 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1981614.3872250237, msRunB 2121460.854835071, msClassify 0, msParse 7701.36500600075

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

max A 1166 ms, max B 1214 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1166 | 1214 |
| r3 timez: many parts run zZ | 100002 | 941 | 1168 |
| dl: dates with slashes | 99995 | 1077 | 1150 |
| dl: digit and bare break | 100000 | 1113 | 1130 |
| dl: digit and CRLF | 99999 | 1103 | 1109 |
| r3 timez: many parts run ZzZ | 100002 | 886 | 1085 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 943 | 1048 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 821 | 1020 |
| r3 timez: many parts run | 100002 | 812 | 966 |
| dl: dates with a claim between | 99988 | 963 | 917 |
| dl: digit dash break | 99999 | 814 | 890 |
| dl: long gap after a name and many initials | 100008 | 799 | 803 |
| dl: date ranges | 99990 | 772 | 799 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 665 | 780 |
| r3 timey: month words + overlap dates | 100000 | 754 | 758 |
| dl: amount ranges | 99988 | 700 | 733 |
| dl: amount before a date | 99997 | 690 | 728 |
| dl: amounts after a range | 99974 | 709 | 725 |
| dl: digit and dash | 100000 | 757 | 701 |
| r3 timey: spaced member chars | 100000 | 676 | 692 |
| dl: keep-noun list | 100004 | 677 | 683 |
| r3 timey: Q1Q initials | 100000 | 667 | 675 |
| dl: date ranges glued to next word | 99994 | 637 | 674 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 481 | 672 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 567 | 666 |
| r3 timex: overlap dates 1.1.1 | 100000 | 588 | 664 |
| dl: ranges glued to ordinal-like word | 99990 | 632 | 641 |
| dl: digit and indented break | 99996 | 568 | 624 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 603 | 621 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 627 | 609 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 530 | 606 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 475 | 602 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 486 | 602 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 606 | 595 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 477 | 576 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 473 | 569 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 489 | 566 |
| dl: digit and ZWSP | 100000 | 658 | 564 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 483 | 563 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 546 | 559 |
| r3 timey: Z1 near-miss | 100000 | 559 | 557 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 485 | 554 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 498 | 554 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 468 | 545 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 465 | 542 |
| dl: digit two dashes break | 99996 | 538 | 540 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 503 | 518 |
| r3 timey: long glued zZ run | 100002 | 406 | 508 |
| r3 timez: ZZ/ZZZ run | 100002 | 388 | 494 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 408 | 494 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 363 | 492 |
| r3 timey: month glued dense | 100000 | 427 | 487 |
| r3 timey: own number near-miss | 100000 | 473 | 479 |
| r3 timey: long glued ZZZ run | 100002 | 341 | 472 |
| r3 timey: Jane1 repeated | 100000 | 334 | 457 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 404 | 456 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 423 | 455 |
| r3 timey: placeholder glued digits | 100000 | 343 | 451 |
| r3 timey: placeholders chain | 100004 | 354 | 437 |
| r3 timey: Q1 initials | 100000 | 405 | 434 |
| r3 timey: own number glued | 100000 | 342 | 429 |
| r3 timex: words glued both sides | 100000 | 364 | 413 |
| r3 timey: camel own name before label numbers | 100000 | 326 | 409 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 361 | 409 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 376 | 394 |
| r3 timey: SSN label glued own name | 100000 | 359 | 392 |
| r3 timey: month words at run ends | 100000 | 401 | 386 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 352 | 382 |
| r3 timey: DOB glued readings | 100000 | 361 | 378 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 359 | 378 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 391 | 378 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 360 | 377 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 300 | 374 |
| r3 timer: DE LA glued words | 100000 | 324 | 368 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 339 | 368 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 367 | 365 |
| r3 timer: DE LA run caps | 100002 | 341 | 363 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 356 | 363 |
| dl: gap after a name as long as the letter | 99990 | 370 | 360 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 337 | 360 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 328 | 360 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 332 | 357 |
| r3 timer: DE LA run 2 names | 100002 | 296 | 356 |
| r3 timer: DE LA run 3 names caps | 100002 | 304 | 355 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 252 | 351 |
| r3 timez: initials Z run | 100002 | 293 | 348 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 332 | 348 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 351 | 343 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 282 | 342 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 299 | 340 |
| r3 timer: LI camel words | 100000 | 332 | 337 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 270 | 336 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 269 | 333 |
| r3 timer: DE LA run camel | 100002 | 279 | 331 |
| dl: 100 k digit run | 100000 | 268 | 329 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 287 | 329 |
| r3 timer: XU MA run | 100002 | 302 | 327 |
| dl: spaced phone chains | 99996 | 298 | 321 |
| r3 timey: zephyra pieces spaced | 100004 | 268 | 320 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 295 | 319 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 268 | 319 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 249 | 319 |
| dl: SSNs back to back | 99996 | 319 | 318 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 277 | 318 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 272 | 317 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 337 | 317 |
| r3 timex: long word one glue | 100000 | 286 | 316 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 268 | 314 |
| r3 timer: LI run | 100002 | 249 | 310 |
| dl: phone label before nine digits | 100000 | 289 | 309 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 279 | 307 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 295 | 306 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 279 | 306 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 268 | 305 |
| dl: one word glued to a digit | 100000 | 255 | 304 |
| r3 timey: JANE repeated glued | 100002 | 276 | 302 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 276 | 301 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 294 | 300 |
| r3 timey: camel aB | 100000 | 238 | 299 |
| r3 timey: camel AbAb glued | 100002 | 238 | 296 |
| dl: initials run after a name | 40008 | 334 | 295 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 282 | 291 |
| dl: initials run before a name | 40007 | 303 | 288 |
| dl: nine-digit runs | 100000 | 263 | 287 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 227 | 285 |
| r3 timex: medium words before digits | 100002 | 223 | 276 |
| dl: phones back to back | 99990 | 235 | 236 |
