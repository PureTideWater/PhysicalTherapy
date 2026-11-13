# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/3b20d968-e1eb-5124-8ada-e8b86b077fc0/scratchpad/w74/root/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/3b20d968-e1eb-5124-8ada-e8b86b077fc0/scratchpad/w74/root/head/packages/model-gateway/src` (redact.ts 24359600cc53)
- corpus: 975489 letters, sha256 89a133ca67449143; 828 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1769243.2882779902, msRunB 1514819.1190970002, msClassify 0, msParse 9348.974715991932

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

max A 1122 ms, max B 1239 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1122 | 1239 |
| dl: digit and bare break | 100000 | 1073 | 1124 |
| dl: digit and CRLF | 99999 | 1058 | 1021 |
| dl: dates with slashes | 99995 | 1010 | 972 |
| dl: dates with a claim between | 99988 | 851 | 911 |
| r3 timez: many parts run zZ | 100002 | 682 | 817 |
| r3 timey: spaced member chars | 100000 | 742 | 812 |
| r3 timey: month words + overlap dates | 100000 | 710 | 808 |
| dl: digit dash break | 99999 | 776 | 790 |
| dl: date ranges | 99990 | 733 | 781 |
| r3 timez: many parts run ZzZ | 100002 | 848 | 750 |
| dl: digit and dash | 100000 | 666 | 737 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 596 | 721 |
| dl: ranges glued to ordinal-like word | 99990 | 597 | 720 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 891 | 714 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 685 | 714 |
| dl: long gap after a name and many initials | 100008 | 716 | 713 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 690 | 711 |
| dl: amounts after a range | 99974 | 748 | 710 |
| dl: keep-noun list | 100004 | 721 | 708 |
| dl: amount before a date | 99997 | 630 | 703 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 623 | 684 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 564 | 676 |
| dl: amount ranges | 99988 | 657 | 672 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 501 | 671 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 711 | 654 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 561 | 647 |
| r3 timey: Q1Q initials | 100000 | 719 | 642 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 514 | 637 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 492 | 629 |
| dl: digit and ZWSP | 100000 | 562 | 624 |
| dl: date ranges glued to next word | 99994 | 645 | 624 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 643 | 622 |
| r3 timey: Z1 near-miss | 100000 | 542 | 615 |
| dl: digit and indented break | 99996 | 502 | 596 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 540 | 580 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 572 | 573 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 567 | 570 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 726 | 565 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 551 | 561 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 500 | 554 |
| r3 timex: overlap dates 1.1.1 | 100000 | 600 | 551 |
| r3 timey: SSN label glued own name | 100000 | 387 | 527 |
| r3 timez: many parts run | 100002 | 655 | 524 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 543 | 524 |
| dl: digit two dashes break | 99996 | 521 | 513 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 564 | 496 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 469 | 490 |
| r3 timey: own number near-miss | 100000 | 424 | 476 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 468 | 453 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 533 | 449 |
| r3 timey: Q1 initials | 100000 | 433 | 440 |
| r3 timey: placeholders chain | 100004 | 377 | 428 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 364 | 428 |
| r3 timey: DOB glued readings | 100000 | 384 | 427 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 420 | 416 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 451 | 411 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 441 | 405 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 346 | 398 |
| r3 timey: month glued dense | 100000 | 455 | 395 |
| r3 timey: month words at run ends | 100000 | 353 | 391 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 340 | 387 |
| r3 timey: long glued zZ run | 100002 | 344 | 378 |
| r3 timey: Jane1 repeated | 100000 | 430 | 366 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 314 | 364 |
| r3 timer: LI camel words | 100000 | 312 | 362 |
| r3 timey: placeholder glued digits | 100000 | 434 | 358 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 325 | 357 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 326 | 357 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 353 | 354 |
| r3 timex: words glued both sides | 100000 | 321 | 344 |
| r3 timez: ZZ/ZZZ run | 100002 | 358 | 340 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 341 | 340 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 431 | 339 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 297 | 338 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 323 | 330 |
| r3 timey: own number glued | 100000 | 364 | 329 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 396 | 329 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 341 | 327 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 341 | 323 |
| r3 timey: camel own name before label numbers | 100000 | 347 | 322 |
| dl: initials run before a name | 40007 | 302 | 319 |
| dl: SSNs back to back | 99996 | 280 | 319 |
| r3 timex: long word one glue | 100000 | 292 | 319 |
| r3 timer: DE LA run 2 names | 100002 | 384 | 318 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 323 | 312 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 287 | 310 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 278 | 308 |
| r3 timey: long glued ZZZ run | 100002 | 357 | 307 |
| r3 timer: DE LA glued words | 100000 | 308 | 303 |
| r3 timer: DE LA run 3 names caps | 100002 | 333 | 300 |
| dl: initials run after a name | 40008 | 333 | 296 |
| r3 timer: DE LA run camel | 100002 | 300 | 296 |
| r3 timey: zephyra pieces spaced | 100004 | 297 | 289 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 289 | 289 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 274 | 288 |
| r3 timey: camel AbAb glued | 100002 | 226 | 286 |
| dl: phone label before nine digits | 100000 | 268 | 285 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 283 | 284 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 261 | 281 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 302 | 278 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 280 | 278 |
| r3 timer: DE LA run caps | 100002 | 268 | 277 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 288 | 274 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 285 | 273 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 320 | 272 |
| r3 timez: initials Z run | 100002 | 310 | 271 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 293 | 270 |
| dl: spaced phone chains | 99996 | 379 | 269 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 258 | 267 |
| r3 timer: XU MA run | 100002 | 275 | 266 |
| r3 timer: LI run | 100002 | 238 | 266 |
| r3 timey: JANE repeated glued | 100002 | 312 | 263 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 262 | 263 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 272 | 261 |
| dl: nine-digit runs | 100000 | 263 | 259 |
| dl: 100 k digit run | 100000 | 301 | 254 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 283 | 252 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 275 | 251 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 243 | 251 |
| dl: gap after a name as long as the letter | 99990 | 344 | 250 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 252 | 244 |
| dl: one word glued to a digit | 100000 | 226 | 234 |
| dl: phones back to back | 99990 | 227 | 232 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 273 | 229 |
| r3 timey: camel aB | 100000 | 228 | 224 |
| r3 timex: medium words before digits | 100002 | 220 | 205 |
