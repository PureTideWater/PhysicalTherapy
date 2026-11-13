# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/base-m/packages/model-gateway/src` (redact.ts 485dc167e0d4)
- corpus: 975489 letters, sha256 89a133ca67449143; 675 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1451497.686108002, msRunB 1210305.637333992, msClassify 0, msParse 7966.946189976282

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

max A 855 ms, max B 881 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 855 | 881 |
| dl: digit and CRLF | 99999 | 793 | 841 |
| dl: digit and bare break | 100000 | 802 | 828 |
| dl: dates with slashes | 99995 | 773 | 818 |
| r3 timez: many parts run ZzZ | 100002 | 639 | 762 |
| dl: date ranges | 99990 | 635 | 693 |
| r3 timez: many parts run zZ | 100002 | 649 | 682 |
| dl: dates with a claim between | 99988 | 679 | 670 |
| r3 timey: month words + overlap dates | 100000 | 572 | 641 |
| dl: digit dash break | 99999 | 672 | 623 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 655 | 614 |
| dl: amounts after a range | 99974 | 645 | 605 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 584 | 605 |
| r3 timez: many parts run | 100002 | 577 | 601 |
| dl: amount before a date | 99997 | 610 | 598 |
| dl: amount ranges | 99988 | 585 | 598 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 588 | 591 |
| r3 timey: Q1Q initials | 100000 | 658 | 562 |
| dl: ranges glued to ordinal-like word | 99990 | 633 | 555 |
| dl: long gap after a name and many initials | 100008 | 659 | 549 |
| dl: date ranges glued to next word | 99994 | 562 | 545 |
| r3 timey: spaced member chars | 100000 | 516 | 536 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 494 | 528 |
| dl: digit and dash | 100000 | 575 | 518 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 459 | 516 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 492 | 502 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 466 | 501 |
| dl: keep-noun list | 100004 | 515 | 500 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 446 | 495 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 429 | 493 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 425 | 478 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 440 | 465 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 492 | 464 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 532 | 464 |
| r3 timex: overlap dates 1.1.1 | 100000 | 469 | 462 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 482 | 455 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 390 | 434 |
| dl: digit and indented break | 99996 | 430 | 433 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 418 | 433 |
| r3 timey: Q1 initials | 100000 | 420 | 430 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 376 | 428 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 412 | 422 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 412 | 418 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 409 | 418 |
| r3 timey: Z1 near-miss | 100000 | 430 | 416 |
| dl: digit and ZWSP | 100000 | 441 | 415 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 389 | 411 |
| dl: digit two dashes break | 99996 | 383 | 399 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 344 | 393 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 333 | 393 |
| r3 timey: own number near-miss | 100000 | 377 | 359 |
| r3 timey: month glued dense | 100000 | 385 | 357 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 366 | 356 |
| r3 timey: Jane1 repeated | 100000 | 293 | 323 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 271 | 307 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 314 | 303 |
| r3 timey: DOB glued readings | 100000 | 316 | 302 |
| r3 timer: DE LA run 3 names caps | 100002 | 292 | 301 |
| r3 timey: placeholders chain | 100004 | 283 | 299 |
| r3 timey: placeholder glued digits | 100000 | 289 | 297 |
| r3 timey: SSN label glued own name | 100000 | 305 | 294 |
| r3 timer: DE LA run camel | 100002 | 237 | 293 |
| r3 timey: month words at run ends | 100000 | 297 | 293 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 304 | 289 |
| r3 timey: own number glued | 100000 | 299 | 287 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 273 | 283 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 306 | 281 |
| r3 timey: long glued zZ run | 100002 | 285 | 278 |
| r3 timez: ZZ/ZZZ run | 100002 | 292 | 275 |
| r3 timer: LI camel words | 100000 | 282 | 270 |
| r3 timer: XU MA run | 100002 | 301 | 269 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 308 | 265 |
| r3 timer: DE LA glued words | 100000 | 289 | 264 |
| r3 timer: DE LA run 2 names | 100002 | 270 | 263 |
| r3 timex: words glued both sides | 100000 | 283 | 261 |
| r3 timey: long glued ZZZ run | 100002 | 323 | 260 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 269 | 259 |
| r3 timey: camel own name before label numbers | 100000 | 258 | 258 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 275 | 258 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 252 | 258 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 267 | 257 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 251 | 256 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 261 | 254 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 259 | 252 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 269 | 252 |
| r3 timez: initials Z run | 100002 | 269 | 251 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 257 | 251 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 246 | 248 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 265 | 241 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 241 | 238 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 227 | 235 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 222 | 235 |
| dl: phone label before nine digits | 100000 | 224 | 234 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 270 | 234 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 241 | 233 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 228 | 233 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 214 | 230 |
| dl: SSNs back to back | 99996 | 246 | 228 |
| dl: initials run before a name | 40007 | 220 | 227 |
| dl: spaced phone chains | 99996 | 235 | 227 |
| r3 timer: LI run | 100002 | 214 | 225 |
| r3 timey: camel AbAb glued | 100002 | 251 | 224 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 221 | 224 |
| r3 timer: DE LA run caps | 100002 | 241 | 223 |
| r3 timey: zephyra pieces spaced | 100004 | 224 | 223 |
| dl: initials run after a name | 40008 | 245 | 221 |
| r3 timey: camel aB | 100000 | 200 | 216 |
| dl: one word glued to a digit | 100000 | 243 | 215 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 220 | 214 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 229 | 214 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 229 | 213 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 241 | 213 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 224 | 212 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 214 | 211 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 231 | 210 |
| dl: nine-digit runs | 100000 | 214 | 209 |
| r3 timex: long word one glue | 100000 | 219 | 208 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 216 | 208 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 225 | 207 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 209 | 207 |
| r3 timey: JANE repeated glued | 100002 | 229 | 200 |
| dl: 100 k digit run | 100000 | 222 | 199 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 206 | 199 |
| r3 timex: medium words before digits | 100002 | 174 | 195 |
| dl: gap after a name as long as the letter | 99990 | 264 | 183 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 194 | 172 |
| dl: phones back to back | 99990 | 178 | 168 |
