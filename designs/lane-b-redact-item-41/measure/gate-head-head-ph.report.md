# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-ph/packages/model-gateway/src` (redact.ts b3818dafc2b5)
- corpus: 975489 letters, sha256 89a133ca67449143; 834 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1807637.369844006, msRunB 1498684.5448369998, msClassify 0, msParse 9687.56625700834

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

max A 1233 ms, max B 1166 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1233 | 1166 |
| dl: digit and CRLF | 99999 | 1151 | 1147 |
| dl: dates with slashes | 99995 | 1168 | 1025 |
| dl: digit and bare break | 100000 | 979 | 1022 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 694 | 869 |
| dl: dates with a claim between | 99988 | 840 | 814 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 739 | 809 |
| r3 timey: spaced member chars | 100000 | 750 | 792 |
| dl: digit dash break | 99999 | 805 | 788 |
| dl: long gap after a name and many initials | 100008 | 758 | 786 |
| r3 timez: many parts run zZ | 100002 | 814 | 782 |
| r3 timez: many parts run ZzZ | 100002 | 778 | 771 |
| dl: date ranges | 99990 | 772 | 757 |
| dl: digit and dash | 100000 | 694 | 756 |
| r3 timey: month words + overlap dates | 100000 | 690 | 740 |
| dl: amounts after a range | 99974 | 678 | 727 |
| dl: amount before a date | 99997 | 671 | 696 |
| dl: amount ranges | 99988 | 677 | 695 |
| r3 timey: Q1Q initials | 100000 | 692 | 674 |
| dl: date ranges glued to next word | 99994 | 573 | 663 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 538 | 645 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 725 | 641 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 633 | 636 |
| r3 timex: overlap dates 1.1.1 | 100000 | 620 | 630 |
| r3 timez: many parts run | 100002 | 619 | 620 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 699 | 618 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 557 | 615 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 574 | 597 |
| dl: ranges glued to ordinal-like word | 99990 | 556 | 596 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 488 | 592 |
| dl: keep-noun list | 100004 | 588 | 588 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 627 | 585 |
| dl: digit and ZWSP | 100000 | 531 | 581 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 549 | 575 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 511 | 567 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 624 | 563 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 588 | 556 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 534 | 553 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 513 | 550 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 523 | 521 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 506 | 514 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 581 | 513 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 505 | 502 |
| dl: digit two dashes break | 99996 | 482 | 498 |
| r3 timey: Z1 near-miss | 100000 | 552 | 498 |
| dl: digit and indented break | 99996 | 491 | 494 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 515 | 494 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 399 | 487 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 500 | 452 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 418 | 437 |
| r3 timey: SSN label glued own name | 100000 | 365 | 429 |
| r3 timey: Q1 initials | 100000 | 474 | 427 |
| r3 timey: own number near-miss | 100000 | 402 | 421 |
| r3 timey: placeholders chain | 100004 | 364 | 397 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 353 | 393 |
| r3 timey: placeholder glued digits | 100000 | 369 | 389 |
| r3 timey: DOB glued readings | 100000 | 347 | 369 |
| r3 timey: month glued dense | 100000 | 474 | 367 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 364 | 366 |
| dl: initials run after a name | 40008 | 459 | 361 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 399 | 353 |
| r3 timey: Jane1 repeated | 100000 | 339 | 351 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 357 | 351 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 344 | 350 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 421 | 346 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 368 | 345 |
| r3 timey: month words at run ends | 100000 | 357 | 344 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 342 | 343 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 388 | 340 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 291 | 338 |
| r3 timex: words glued both sides | 100000 | 354 | 336 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 268 | 335 |
| dl: initials run before a name | 40007 | 394 | 334 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 269 | 334 |
| r3 timey: long glued zZ run | 100002 | 340 | 331 |
| r3 timey: camel own name before label numbers | 100000 | 355 | 327 |
| dl: phone label before nine digits | 100000 | 263 | 324 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 322 | 320 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 335 | 319 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 379 | 318 |
| r3 timez: ZZ/ZZZ run | 100002 | 304 | 317 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 334 | 315 |
| r3 timey: own number glued | 100000 | 340 | 313 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 354 | 311 |
| r3 timer: DE LA glued words | 100000 | 298 | 310 |
| r3 timer: XU MA run | 100002 | 287 | 305 |
| dl: spaced phone chains | 99996 | 267 | 302 |
| r3 timer: LI camel words | 100000 | 318 | 302 |
| r3 timey: long glued ZZZ run | 100002 | 313 | 300 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 369 | 298 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 299 | 296 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 341 | 294 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 285 | 294 |
| dl: SSNs back to back | 99996 | 329 | 292 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 325 | 290 |
| r3 timer: DE LA run camel | 100002 | 263 | 288 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 293 | 287 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 278 | 286 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 308 | 286 |
| r3 timer: DE LA run 2 names | 100002 | 282 | 279 |
| r3 timey: zephyra pieces spaced | 100004 | 350 | 278 |
| dl: one word glued to a digit | 100000 | 247 | 277 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 287 | 269 |
| dl: 100 k digit run | 100000 | 307 | 268 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 264 | 268 |
| r3 timex: long word one glue | 100000 | 272 | 267 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 256 | 267 |
| r3 timer: LI run | 100002 | 227 | 266 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 265 | 266 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 263 | 265 |
| r3 timer: DE LA run 3 names caps | 100002 | 297 | 264 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 281 | 260 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 305 | 257 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 260 | 257 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 270 | 257 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 303 | 256 |
| r3 timey: camel AbAb glued | 100002 | 255 | 251 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 275 | 251 |
| dl: gap after a name as long as the letter | 99990 | 352 | 250 |
| r3 timer: DE LA run caps | 100002 | 273 | 249 |
| dl: nine-digit runs | 100000 | 264 | 247 |
| r3 timez: initials Z run | 100002 | 269 | 244 |
| dl: phones back to back | 99990 | 236 | 233 |
| r3 timex: medium words before digits | 100002 | 223 | 226 |
| r3 timey: camel aB | 100000 | 224 | 223 |
| r3 timey: JANE repeated glued | 100002 | 251 | 221 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 220 | 208 |
