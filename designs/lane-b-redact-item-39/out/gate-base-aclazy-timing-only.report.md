# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate39/base` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/52a9063e-bc41-5b91-af65-4380455bc645/scratchpad/gate39/aclazy` (redact.ts 08ea36b02270)
- corpus: 975489 letters, sha256 89a133ca67449143; 0 s
- stats: 

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

max A 1197 ms, max B 1284 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1197 | 1284 |
| dl: dates with slashes | 99995 | 1049 | 1173 |
| dl: digit and bare break | 100000 | 1181 | 1164 |
| r3 timez: many parts run zZ | 100002 | 963 | 1068 |
| dl: digit and CRLF | 99999 | 1075 | 1054 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 921 | 1021 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 824 | 1020 |
| r3 timez: many parts run ZzZ | 100002 | 825 | 987 |
| dl: dates with a claim between | 99988 | 883 | 939 |
| r3 timez: many parts run | 100002 | 761 | 895 |
| dl: digit dash break | 99999 | 801 | 817 |
| r3 timey: month words + overlap dates | 100000 | 694 | 786 |
| dl: long gap after a name and many initials | 100008 | 719 | 771 |
| dl: date ranges | 99990 | 731 | 763 |
| r3 timey: spaced member chars | 100000 | 703 | 723 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 732 | 720 |
| dl: digit and dash | 100000 | 690 | 711 |
| dl: date ranges glued to next word | 99994 | 577 | 705 |
| r3 timey: Q1Q initials | 100000 | 743 | 703 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 593 | 691 |
| dl: amount before a date | 99997 | 657 | 688 |
| dl: amount ranges | 99988 | 617 | 687 |
| dl: amounts after a range | 99974 | 733 | 682 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 625 | 675 |
| dl: keep-noun list | 100004 | 653 | 660 |
| r3 timex: overlap dates 1.1.1 | 100000 | 591 | 637 |
| dl: ranges glued to ordinal-like word | 99990 | 606 | 631 |
| r3 timey: Z1 near-miss | 100000 | 603 | 616 |
| dl: digit and ZWSP | 100000 | 764 | 605 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 603 | 593 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 594 | 591 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 631 | 591 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 552 | 585 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 622 | 583 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 650 | 575 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 544 | 572 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 599 | 552 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 599 | 552 |
| dl: digit and indented break | 99996 | 561 | 550 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 579 | 548 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 549 | 546 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 561 | 541 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 556 | 541 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 533 | 537 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 526 | 535 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 520 | 524 |
| dl: digit two dashes break | 99996 | 479 | 511 |
| r3 timey: long glued ZZZ run | 100002 | 327 | 480 |
| r3 timez: ZZ/ZZZ run | 100002 | 360 | 474 |
| r3 timey: Q1 initials | 100000 | 426 | 472 |
| r3 timey: own number near-miss | 100000 | 428 | 471 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 408 | 468 |
| r3 timey: long glued zZ run | 100002 | 346 | 457 |
| r3 timey: month glued dense | 100000 | 413 | 456 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 435 | 443 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 350 | 442 |
| r3 timey: placeholders chain | 100004 | 371 | 438 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 348 | 437 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 433 | 436 |
| r3 timey: placeholder glued digits | 100000 | 382 | 422 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 338 | 420 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 293 | 420 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 384 | 413 |
| r3 timex: words glued both sides | 100000 | 340 | 412 |
| r3 timey: camel own name before label numbers | 100000 | 329 | 402 |
| r3 timey: DOB glued readings | 100000 | 348 | 400 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 347 | 398 |
| r3 timey: SSN label glued own name | 100000 | 461 | 395 |
| r3 timey: month words at run ends | 100000 | 370 | 394 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 336 | 394 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 303 | 392 |
| r3 timey: own number glued | 100000 | 331 | 389 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 349 | 389 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 357 | 387 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 342 | 379 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 320 | 379 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 386 | 376 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 342 | 375 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 318 | 372 |
| r3 timer: DE LA glued words | 100000 | 306 | 371 |
| r3 timey: Jane1 repeated | 100000 | 371 | 371 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 334 | 367 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 348 | 367 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 368 | 356 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 308 | 354 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 310 | 351 |
| r3 timer: DE LA run 3 names caps | 100002 | 332 | 349 |
| r3 timey: zephyra pieces spaced | 100004 | 289 | 343 |
| r3 timez: initials Z run | 100002 | 273 | 342 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 312 | 339 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 283 | 333 |
| dl: spaced phone chains | 99996 | 328 | 331 |
| r3 timer: DE LA run camel | 100002 | 253 | 327 |
| dl: gap after a name as long as the letter | 99990 | 229 | 325 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 291 | 323 |
| dl: 100 k digit run | 100000 | 280 | 322 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 278 | 321 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 294 | 320 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 252 | 319 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 257 | 319 |
| dl: initials run before a name | 40007 | 295 | 317 |
| r3 timer: DE LA run 2 names | 100002 | 275 | 317 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 279 | 317 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 299 | 317 |
| r3 timey: camel AbAb glued | 100002 | 245 | 316 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 260 | 316 |
| dl: phone label before nine digits | 100000 | 278 | 315 |
| r3 timer: XU MA run | 100002 | 272 | 315 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 274 | 315 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 258 | 312 |
| r3 timer: DE LA run caps | 100002 | 278 | 311 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 290 | 311 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 268 | 310 |
| r3 timer: LI camel words | 100000 | 281 | 309 |
| r3 timex: long word one glue | 100000 | 279 | 309 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 262 | 307 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 230 | 306 |
| r3 timer: LI run | 100002 | 269 | 305 |
| dl: SSNs back to back | 99996 | 285 | 299 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 282 | 297 |
| dl: initials run after a name | 40008 | 341 | 296 |
| dl: one word glued to a digit | 100000 | 246 | 296 |
| dl: nine-digit runs | 100000 | 293 | 293 |
| r3 timey: camel aB | 100000 | 229 | 290 |
| r3 timex: medium words before digits | 100002 | 220 | 284 |
| r3 timey: JANE repeated glued | 100002 | 265 | 275 |
| dl: phones back to back | 99990 | 234 | 220 |
