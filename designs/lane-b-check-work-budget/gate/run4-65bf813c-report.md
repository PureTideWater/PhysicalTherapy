# Gate report

- tree A: `/home/user/tree-base/packages/redact/src` (redact.ts 2ba7e0235c4b)
- tree B: `/home/user/headsrc` (redact.ts 12f7c321e7ab)
- corpus: 975489 letters, sha256 89a133ca67449143; 1057 s
- stats: letters 975489, same 975489, differ 0, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 2209457.4022020577, msRunB 1996383.1586100261, msClassify 0, msParse 8800.318489046062

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

max A 1234 ms, max B 1064 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1234 | 1064 |
| dl: dates with slashes | 99995 | 999 | 1011 |
| r3 timez: many parts run zZ | 100002 | 937 | 977 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 938 | 973 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 1096 | 923 |
| r3 timez: many parts run ZzZ | 100002 | 857 | 905 |
| dl: digit and bare break | 100000 | 1194 | 841 |
| dl: digit and dash | 100000 | 756 | 806 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 726 | 779 |
| r3 timez: many parts run | 100002 | 724 | 720 |
| r3 timey: Q1Q initials | 100000 | 750 | 712 |
| dl: digit and CRLF | 99999 | 803 | 708 |
| dl: digit dash break | 99999 | 803 | 706 |
| r3 timey: spaced member chars | 100000 | 726 | 705 |
| dl: amounts after a range | 99974 | 792 | 690 |
| r3 timey: month words + overlap dates | 100000 | 646 | 684 |
| dl: date ranges | 99990 | 682 | 677 |
| dl: long gap after a name and many initials | 100008 | 677 | 675 |
| dl: dates with a claim between | 99988 | 682 | 671 |
| dl: keep-noun list | 100004 | 632 | 664 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 526 | 656 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 657 | 651 |
| dl: amount ranges | 99988 | 695 | 646 |
| dl: amount before a date | 99997 | 697 | 644 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 631 | 623 |
| dl: ranges glued to ordinal-like word | 99990 | 570 | 616 |
| dl: digit and ZWSP | 100000 | 564 | 611 |
| r3 timey: Z1 near-miss | 100000 | 524 | 591 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 576 | 591 |
| dl: date ranges glued to next word | 99994 | 574 | 586 |
| dl: digit and indented break | 99996 | 598 | 570 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 520 | 569 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 507 | 568 |
| r3 timex: overlap dates 1.1.1 | 100000 | 570 | 567 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 537 | 564 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 516 | 563 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 596 | 558 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 519 | 548 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 511 | 545 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 505 | 545 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 569 | 545 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 507 | 542 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 628 | 539 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 543 | 525 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 520 | 522 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 542 | 509 |
| r3 timey: month glued dense | 100000 | 424 | 504 |
| dl: digit two dashes break | 99996 | 555 | 494 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 402 | 465 |
| r3 timey: own number near-miss | 100000 | 487 | 453 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 374 | 413 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 357 | 410 |
| r3 timey: placeholders chain | 100004 | 396 | 409 |
| r3 timey: month words at run ends | 100000 | 377 | 405 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 389 | 399 |
| r3 timey: placeholder glued digits | 100000 | 388 | 395 |
| r3 timey: long glued zZ run | 100002 | 379 | 390 |
| r3 timey: Q1 initials | 100000 | 405 | 390 |
| r3 timey: SSN label glued own name | 100000 | 379 | 371 |
| dl: spaced phone chains | 99996 | 336 | 359 |
| r3 timey: Jane1 repeated | 100000 | 368 | 359 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 368 | 354 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 350 | 353 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 364 | 343 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 328 | 342 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 330 | 341 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 325 | 339 |
| r3 timez: ZZ/ZZZ run | 100002 | 352 | 338 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 365 | 336 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 348 | 336 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 328 | 335 |
| r3 timex: words glued both sides | 100000 | 339 | 334 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 333 | 334 |
| r3 timey: long glued ZZZ run | 100002 | 345 | 331 |
| r3 timey: DOB glued readings | 100000 | 336 | 330 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 326 | 327 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 335 | 324 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 328 | 324 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 324 | 322 |
| r3 timey: own number glued | 100000 | 300 | 321 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 334 | 320 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 311 | 312 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 303 | 309 |
| r3 timer: DE LA glued words | 100000 | 342 | 307 |
| dl: 100 k digit run | 100000 | 352 | 305 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 277 | 303 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 346 | 301 |
| r3 timez: initials Z run | 100002 | 300 | 298 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 280 | 294 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 319 | 292 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 277 | 289 |
| r3 timey: JANE repeated glued | 100002 | 255 | 287 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 296 | 287 |
| r3 timer: DE LA run 2 names | 100002 | 274 | 286 |
| dl: gap after a name as long as the letter | 99990 | 302 | 285 |
| dl: phone label before nine digits | 100000 | 262 | 281 |
| r3 timex: long word one glue | 100000 | 272 | 278 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 284 | 278 |
| r3 timer: DE LA run 3 names caps | 100002 | 263 | 276 |
| r3 timer: DE LA run camel | 100002 | 284 | 269 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 279 | 269 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 301 | 269 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 280 | 269 |
| r3 timey: camel own name before label numbers | 100000 | 276 | 268 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 225 | 268 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 264 | 268 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 283 | 268 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 268 | 265 |
| dl: one word glued to a digit | 100000 | 245 | 264 |
| r3 timer: LI camel words | 100000 | 246 | 262 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 256 | 260 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 276 | 260 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 261 | 260 |
| dl: SSNs back to back | 99996 | 263 | 259 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 291 | 259 |
| r3 timer: XU MA run | 100002 | 262 | 255 |
| r3 timey: zephyra pieces spaced | 100004 | 260 | 251 |
| dl: initials run after a name | 40008 | 277 | 247 |
| r3 timer: DE LA run caps | 100002 | 267 | 240 |
| r3 timex: medium words before digits | 100002 | 229 | 235 |
| dl: nine-digit runs | 100000 | 282 | 227 |
| r3 timey: camel aB | 100000 | 242 | 222 |
| r3 timey: camel AbAb glued | 100002 | 229 | 220 |
| dl: phones back to back | 99990 | 227 | 214 |
| r3 timer: LI run | 100002 | 219 | 214 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 216 | 205 |
| dl: initials run before a name | 40007 | 219 | 203 |
