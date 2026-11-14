# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-k/packages/model-gateway/src` (redact.ts b39bf1412321)
- corpus: 975489 letters, sha256 89a133ca67449143; 834 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1790101.697729984, msRunB 1518491.1026389946, msClassify 0, msParse 9566.264117055354

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

max A 1149 ms, max B 1123 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1084 | 1123 |
| dl: dates with slashes | 99995 | 1149 | 1096 |
| dl: digit and bare break | 100000 | 1023 | 1073 |
| dl: digit and CRLF | 99999 | 1033 | 956 |
| dl: long gap after a name and many initials | 100008 | 693 | 824 |
| r3 timez: many parts run ZzZ | 100002 | 753 | 816 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 735 | 806 |
| r3 timez: many parts run zZ | 100002 | 765 | 797 |
| dl: dates with a claim between | 99988 | 815 | 794 |
| dl: date ranges | 99990 | 793 | 786 |
| dl: amounts after a range | 99974 | 675 | 778 |
| dl: digit dash break | 99999 | 846 | 775 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 837 | 744 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 662 | 738 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 592 | 714 |
| dl: amount ranges | 99988 | 700 | 712 |
| r3 timex: overlap dates 1.1.1 | 100000 | 611 | 706 |
| dl: digit and dash | 100000 | 715 | 699 |
| dl: amount before a date | 99997 | 711 | 676 |
| r3 timey: month words + overlap dates | 100000 | 641 | 665 |
| r3 timey: spaced member chars | 100000 | 755 | 665 |
| dl: ranges glued to ordinal-like word | 99990 | 564 | 663 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 560 | 654 |
| r3 timez: many parts run | 100002 | 678 | 629 |
| r3 timey: Q1Q initials | 100000 | 585 | 623 |
| dl: digit and ZWSP | 100000 | 651 | 621 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 729 | 610 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 667 | 603 |
| dl: keep-noun list | 100004 | 639 | 597 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 597 | 597 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 593 | 587 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 561 | 586 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 545 | 585 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 487 | 582 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 546 | 580 |
| dl: date ranges glued to next word | 99994 | 594 | 577 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 721 | 570 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 509 | 566 |
| dl: digit and indented break | 99996 | 580 | 558 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 490 | 553 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 526 | 551 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 495 | 544 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 555 | 543 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 551 | 535 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 557 | 528 |
| r3 timey: Z1 near-miss | 100000 | 570 | 521 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 394 | 514 |
| dl: digit two dashes break | 99996 | 496 | 507 |
| dl: initials run before a name | 40007 | 491 | 494 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 481 | 456 |
| r3 timey: Q1 initials | 100000 | 450 | 440 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 481 | 433 |
| r3 timey: month glued dense | 100000 | 401 | 429 |
| r3 timey: own number near-miss | 100000 | 439 | 424 |
| r3 timey: DOB glued readings | 100000 | 302 | 398 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 355 | 391 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 367 | 380 |
| r3 timey: placeholder glued digits | 100000 | 371 | 368 |
| r3 timey: SSN label glued own name | 100000 | 376 | 366 |
| r3 timey: placeholders chain | 100004 | 358 | 365 |
| r3 timex: medium words before digits | 100002 | 244 | 364 |
| r3 timey: month words at run ends | 100000 | 363 | 361 |
| r3 timey: Jane1 repeated | 100000 | 305 | 354 |
| r3 timey: long glued zZ run | 100002 | 376 | 351 |
| r3 timex: words glued both sides | 100000 | 385 | 348 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 273 | 348 |
| r3 timey: zephyra pieces spaced | 100004 | 269 | 347 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 362 | 340 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 363 | 338 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 352 | 336 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 341 | 335 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 302 | 334 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 359 | 333 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 425 | 332 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 331 | 332 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 341 | 328 |
| r3 timez: ZZ/ZZZ run | 100002 | 327 | 326 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 339 | 325 |
| dl: phone label before nine digits | 100000 | 330 | 324 |
| r3 timey: own number glued | 100000 | 334 | 323 |
| r3 timey: long glued ZZZ run | 100002 | 343 | 321 |
| dl: gap after a name as long as the letter | 99990 | 228 | 320 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 423 | 319 |
| r3 timer: LI camel words | 100000 | 324 | 317 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 321 | 316 |
| dl: SSNs back to back | 99996 | 286 | 313 |
| dl: spaced phone chains | 99996 | 279 | 310 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 338 | 310 |
| r3 timey: camel own name before label numbers | 100000 | 330 | 305 |
| r3 timer: DE LA glued words | 100000 | 344 | 299 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 265 | 299 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 279 | 299 |
| dl: initials run after a name | 40008 | 330 | 294 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 300 | 293 |
| r3 timer: DE LA run camel | 100002 | 265 | 291 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 340 | 291 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 321 | 289 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 292 | 288 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 281 | 285 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 307 | 284 |
| dl: nine-digit runs | 100000 | 302 | 283 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 282 | 282 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 300 | 281 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 246 | 281 |
| r3 timer: DE LA run 2 names | 100002 | 278 | 279 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 303 | 278 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 296 | 272 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 273 | 269 |
| r3 timer: DE LA run 3 names caps | 100002 | 289 | 267 |
| r3 timex: long word one glue | 100000 | 296 | 266 |
| r3 timez: initials Z run | 100002 | 268 | 264 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 277 | 261 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 278 | 260 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 264 | 256 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 304 | 254 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 262 | 251 |
| dl: 100 k digit run | 100000 | 246 | 249 |
| r3 timer: DE LA run caps | 100002 | 257 | 249 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 346 | 244 |
| dl: one word glued to a digit | 100000 | 260 | 242 |
| r3 timey: camel AbAb glued | 100002 | 235 | 234 |
| r3 timer: XU MA run | 100002 | 282 | 231 |
| r3 timer: LI run | 100002 | 237 | 230 |
| r3 timey: JANE repeated glued | 100002 | 255 | 229 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 243 | 215 |
| dl: phones back to back | 99990 | 199 | 207 |
| r3 timey: camel aB | 100000 | 232 | 201 |
