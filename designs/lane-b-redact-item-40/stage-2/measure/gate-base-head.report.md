# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/e1774162-c3fc-50b9-a705-dbe1d88abf32/scratchpad/w72/root/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/e1774162-c3fc-50b9-a705-dbe1d88abf32/scratchpad/w72/root/head/packages/model-gateway/src` (redact.ts 28cb0f16f860)
- corpus: 975489 letters, sha256 89a133ca67449143; 784 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1675687.8319699583, msRunB 1430095.4485849934, msClassify 0, msParse 9344.663300003334

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

max A 1326 ms, max B 1167 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 1011 | 1167 |
| dl: dates with slashes | 99995 | 991 | 1138 |
| dl: digit and CRLF | 99999 | 994 | 1043 |
| dl: dates with spaces | 99995 | 1326 | 1007 |
| dl: date ranges | 99990 | 696 | 949 |
| dl: dates with a claim between | 99988 | 802 | 872 |
| dl: digit dash break | 99999 | 949 | 815 |
| r3 timey: month words + overlap dates | 100000 | 656 | 788 |
| dl: long gap after a name and many initials | 100008 | 947 | 746 |
| r3 timez: many parts run zZ | 100002 | 816 | 723 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 707 | 713 |
| dl: amounts after a range | 99974 | 655 | 711 |
| r3 timez: many parts run ZzZ | 100002 | 738 | 707 |
| dl: digit and ZWSP | 100000 | 540 | 685 |
| dl: date ranges glued to next word | 99994 | 673 | 679 |
| r3 timez: many parts run | 100002 | 750 | 674 |
| dl: digit and dash | 100000 | 677 | 673 |
| r3 timey: spaced member chars | 100000 | 678 | 665 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 669 | 655 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 668 | 652 |
| r3 timey: Q1Q initials | 100000 | 732 | 642 |
| dl: amount before a date | 99997 | 628 | 620 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 620 | 617 |
| dl: amount ranges | 99988 | 627 | 615 |
| dl: ranges glued to ordinal-like word | 99990 | 541 | 599 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 488 | 560 |
| r3 timex: overlap dates 1.1.1 | 100000 | 487 | 557 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 462 | 556 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 575 | 554 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 500 | 552 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 542 | 551 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 499 | 544 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 488 | 540 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 572 | 540 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 447 | 529 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 504 | 528 |
| dl: digit two dashes break | 99996 | 476 | 527 |
| dl: digit and indented break | 99996 | 529 | 523 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 424 | 523 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 513 | 507 |
| dl: keep-noun list | 100004 | 571 | 504 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 545 | 498 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 499 | 495 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 461 | 489 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 567 | 477 |
| r3 timey: Z1 near-miss | 100000 | 514 | 462 |
| r3 timer: DE LA glued words | 100000 | 320 | 441 |
| r3 timey: Q1 initials | 100000 | 471 | 441 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 466 | 438 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 364 | 430 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 492 | 420 |
| r3 timey: Jane1 repeated | 100000 | 352 | 417 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 408 | 411 |
| r3 timey: month glued dense | 100000 | 351 | 410 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 325 | 388 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 322 | 387 |
| r3 timey: DOB glued readings | 100000 | 403 | 382 |
| r3 timey: placeholder glued digits | 100000 | 386 | 376 |
| r3 timey: own number near-miss | 100000 | 475 | 373 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 351 | 371 |
| dl: initials run before a name | 40007 | 341 | 353 |
| r3 timey: placeholders chain | 100004 | 372 | 346 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 348 | 345 |
| r3 timey: SSN label glued own name | 100000 | 292 | 344 |
| dl: SSNs back to back | 99996 | 327 | 333 |
| r3 timez: ZZ/ZZZ run | 100002 | 350 | 333 |
| r3 timey: own number glued | 100000 | 289 | 333 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 247 | 332 |
| r3 timex: words glued both sides | 100000 | 333 | 330 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 315 | 323 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 324 | 321 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 337 | 320 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 371 | 320 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 350 | 316 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 366 | 313 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 323 | 313 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 334 | 312 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 361 | 300 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 393 | 297 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 323 | 296 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 265 | 294 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 225 | 293 |
| dl: initials run after a name | 40008 | 343 | 291 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 335 | 290 |
| dl: 100 k digit run | 100000 | 269 | 288 |
| dl: phone label before nine digits | 100000 | 281 | 280 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 274 | 277 |
| dl: nine-digit runs | 100000 | 338 | 276 |
| r3 timey: month words at run ends | 100000 | 332 | 274 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 285 | 272 |
| dl: spaced phone chains | 99996 | 269 | 271 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 322 | 271 |
| r3 timer: DE LA run camel | 100002 | 238 | 270 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 261 | 270 |
| r3 timer: DE LA run 3 names caps | 100002 | 323 | 269 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 277 | 269 |
| r3 timey: zephyra pieces spaced | 100004 | 262 | 268 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 282 | 268 |
| r3 timey: long glued zZ run | 100002 | 306 | 267 |
| r3 timey: camel own name before label numbers | 100000 | 297 | 267 |
| r3 timez: initials Z run | 100002 | 260 | 266 |
| r3 timey: long glued ZZZ run | 100002 | 291 | 266 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 297 | 264 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 268 | 264 |
| r3 timer: LI camel words | 100000 | 238 | 263 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 277 | 262 |
| r3 timer: DE LA run 2 names | 100002 | 277 | 260 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 282 | 258 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 284 | 253 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 276 | 253 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 258 | 251 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 259 | 251 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 255 | 250 |
| dl: one word glued to a digit | 100000 | 270 | 245 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 255 | 245 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 242 | 240 |
| r3 timex: long word one glue | 100000 | 262 | 232 |
| dl: gap after a name as long as the letter | 99990 | 236 | 229 |
| r3 timey: JANE repeated glued | 100002 | 229 | 222 |
| r3 timer: XU MA run | 100002 | 383 | 211 |
| dl: phones back to back | 99990 | 226 | 210 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 238 | 210 |
| r3 timex: medium words before digits | 100002 | 213 | 208 |
| r3 timey: camel aB | 100000 | 206 | 207 |
| r3 timer: DE LA run caps | 100002 | 283 | 202 |
| r3 timey: camel AbAb glued | 100002 | 197 | 201 |
| r3 timer: LI run | 100002 | 190 | 183 |
