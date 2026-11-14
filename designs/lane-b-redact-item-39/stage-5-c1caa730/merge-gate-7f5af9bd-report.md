# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/a728ad9c-6507-5429-9919-94f1e72d18e5/scratchpad/base40/packages/redact/src` (redact.ts 1beb52e2500f)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/a728ad9c-6507-5429-9919-94f1e72d18e5/scratchpad/merge/packages/redact/src` (redact.ts c241b5127a4e)
- corpus: 975489 letters, sha256 89a133ca67449143; 1023 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 2251322.7317659697, msRunB 1795609.7857959685, msClassify 0, msParse 11210.03535096555

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

max A 998 ms, max B 1015 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 981 | 1015 |
| r3 timez: many parts run zZ | 100002 | 721 | 957 |
| dl: dates with slashes | 99995 | 859 | 902 |
| dl: digit and bare break | 100000 | 977 | 901 |
| dl: digit and CRLF | 99999 | 998 | 880 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 783 | 840 |
| r3 timey: spaced member chars | 100000 | 863 | 836 |
| dl: date ranges | 99990 | 779 | 807 |
| r3 timez: many parts run ZzZ | 100002 | 672 | 781 |
| dl: dates with a claim between | 99988 | 795 | 728 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 593 | 706 |
| dl: digit dash break | 99999 | 678 | 697 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 461 | 693 |
| r3 timez: many parts run | 100002 | 598 | 673 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 661 | 663 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 714 | 662 |
| dl: digit and dash | 100000 | 650 | 661 |
| dl: long gap after a name and many initials | 100008 | 702 | 656 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 495 | 647 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 547 | 637 |
| dl: amounts after a range | 99974 | 674 | 630 |
| dl: amount before a date | 99997 | 672 | 628 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 442 | 621 |
| dl: amount ranges | 99988 | 623 | 605 |
| r3 timey: Q1Q initials | 100000 | 611 | 590 |
| r3 timey: month words + overlap dates | 100000 | 627 | 583 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 552 | 573 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 552 | 567 |
| r3 timex: overlap dates 1.1.1 | 100000 | 641 | 565 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 602 | 560 |
| dl: keep-noun list | 100004 | 549 | 555 |
| dl: ranges glued to ordinal-like word | 99990 | 539 | 554 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 557 | 539 |
| dl: date ranges glued to next word | 99994 | 563 | 523 |
| dl: digit and indented break | 99996 | 439 | 519 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 471 | 509 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 502 | 504 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 561 | 502 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 549 | 487 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 498 | 485 |
| r3 timey: Z1 near-miss | 100000 | 484 | 477 |
| dl: digit two dashes break | 99996 | 536 | 474 |
| dl: digit and ZWSP | 100000 | 557 | 470 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 436 | 467 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 596 | 466 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 386 | 466 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 380 | 445 |
| r3 timey: placeholder glued digits | 100000 | 418 | 439 |
| r3 timey: own number near-miss | 100000 | 477 | 437 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 611 | 432 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 482 | 423 |
| r3 timey: Q1 initials | 100000 | 347 | 417 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 479 | 414 |
| r3 timey: SSN label glued own name | 100000 | 336 | 377 |
| r3 timey: long glued zZ run | 100002 | 268 | 368 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 306 | 362 |
| r3 timey: month words at run ends | 100000 | 359 | 358 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 316 | 355 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 343 | 352 |
| r3 timez: ZZ/ZZZ run | 100002 | 315 | 347 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 333 | 335 |
| r3 timey: Jane1 repeated | 100000 | 310 | 331 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 250 | 330 |
| r3 timer: LI camel words | 100000 | 263 | 329 |
| r3 timey: placeholders chain | 100004 | 425 | 327 |
| r3 timey: month glued dense | 100000 | 327 | 326 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 326 | 322 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 277 | 317 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 283 | 316 |
| r3 timer: DE LA glued words | 100000 | 316 | 315 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 267 | 315 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 348 | 314 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 310 | 314 |
| r3 timey: camel own name before label numbers | 100000 | 273 | 312 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 367 | 312 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 333 | 311 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 340 | 310 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 490 | 301 |
| r3 timey: DOB glued readings | 100000 | 274 | 300 |
| r3 timey: long glued ZZZ run | 100002 | 246 | 299 |
| r3 timey: own number glued | 100000 | 268 | 296 |
| r3 timer: DE LA run 3 names caps | 100002 | 289 | 290 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 302 | 286 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 248 | 285 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 410 | 283 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 273 | 282 |
| r3 timer: DE LA run 2 names | 100002 | 252 | 281 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 266 | 280 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 294 | 278 |
| r3 timer: DE LA run camel | 100002 | 243 | 277 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 261 | 274 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 236 | 273 |
| r3 timex: long word one glue | 100000 | 277 | 272 |
| dl: spaced phone chains | 99996 | 295 | 271 |
| r3 timer: XU MA run | 100002 | 272 | 271 |
| r3 timex: words glued both sides | 100000 | 282 | 271 |
| dl: SSNs back to back | 99996 | 264 | 270 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 282 | 269 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 301 | 269 |
| dl: initials run before a name | 40007 | 233 | 265 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 255 | 264 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 266 | 264 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 246 | 264 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 264 | 264 |
| dl: nine-digit runs | 100000 | 275 | 262 |
| r3 timer: DE LA run caps | 100002 | 259 | 257 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 249 | 257 |
| r3 timez: initials Z run | 100002 | 236 | 256 |
| dl: phone label before nine digits | 100000 | 276 | 254 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 300 | 250 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 249 | 250 |
| r3 timey: zephyra pieces spaced | 100004 | 283 | 249 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 254 | 248 |
| r3 timey: JANE repeated glued | 100002 | 235 | 243 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 256 | 242 |
| dl: 100 k digit run | 100000 | 216 | 240 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 293 | 235 |
| r3 timer: LI run | 100002 | 225 | 232 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 222 | 232 |
| dl: one word glued to a digit | 100000 | 233 | 230 |
| dl: initials run after a name | 40008 | 263 | 226 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 221 | 223 |
| r3 timex: medium words before digits | 100002 | 210 | 214 |
| r3 timey: camel aB | 100000 | 215 | 210 |
| r3 timey: camel AbAb glued | 100002 | 175 | 210 |
| dl: phones back to back | 99990 | 229 | 194 |
| dl: gap after a name as long as the letter | 99990 | 203 | 189 |
