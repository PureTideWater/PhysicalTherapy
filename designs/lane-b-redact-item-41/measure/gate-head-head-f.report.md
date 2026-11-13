# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-f/packages/model-gateway/src` (redact.ts 2a9c2cd49470)
- corpus: 975489 letters, sha256 89a133ca67449143; 667 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1443129.6576220002, msRunB 1198081.156496958, msClassify 0, msParse 8208.774038029178

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

max A 1047 ms, max B 1052 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1047 | 1052 |
| dl: digit and CRLF | 99999 | 921 | 932 |
| dl: dates with slashes | 99995 | 837 | 873 |
| dl: digit dash break | 99999 | 780 | 785 |
| dl: digit and bare break | 100000 | 807 | 781 |
| dl: dates with a claim between | 99988 | 742 | 747 |
| r3 timez: many parts run zZ | 100002 | 608 | 694 |
| r3 timez: many parts run ZzZ | 100002 | 679 | 669 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 598 | 657 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 709 | 649 |
| dl: digit and dash | 100000 | 553 | 640 |
| r3 timey: spaced member chars | 100000 | 605 | 629 |
| dl: date ranges | 99990 | 596 | 614 |
| r3 timey: month words + overlap dates | 100000 | 603 | 604 |
| dl: long gap after a name and many initials | 100008 | 693 | 599 |
| dl: amount before a date | 99997 | 532 | 595 |
| r3 timey: Q1Q initials | 100000 | 618 | 591 |
| dl: amounts after a range | 99974 | 515 | 570 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 555 | 529 |
| r3 timez: many parts run | 100002 | 601 | 528 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 435 | 505 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 473 | 499 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 440 | 493 |
| dl: amount ranges | 99988 | 516 | 491 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 509 | 486 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 473 | 476 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 492 | 473 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 486 | 468 |
| dl: keep-noun list | 100004 | 585 | 466 |
| dl: digit and ZWSP | 100000 | 511 | 462 |
| dl: date ranges glued to next word | 99994 | 490 | 461 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 471 | 460 |
| dl: ranges glued to ordinal-like word | 99990 | 466 | 449 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 404 | 442 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 466 | 442 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 404 | 440 |
| r3 timex: overlap dates 1.1.1 | 100000 | 493 | 434 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 441 | 433 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 500 | 433 |
| dl: digit and indented break | 99996 | 449 | 430 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 423 | 428 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 407 | 425 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 438 | 423 |
| dl: digit two dashes break | 99996 | 377 | 415 |
| r3 timey: own number near-miss | 100000 | 382 | 398 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 431 | 398 |
| r3 timey: Z1 near-miss | 100000 | 416 | 387 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 338 | 387 |
| r3 timey: Q1 initials | 100000 | 423 | 374 |
| r3 timey: month glued dense | 100000 | 400 | 366 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 409 | 346 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 350 | 337 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 358 | 323 |
| r3 timey: Jane1 repeated | 100000 | 303 | 316 |
| r3 timey: long glued zZ run | 100002 | 302 | 310 |
| r3 timey: placeholder glued digits | 100000 | 278 | 303 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 285 | 300 |
| r3 timey: month words at run ends | 100000 | 334 | 288 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 280 | 288 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 316 | 287 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 293 | 285 |
| r3 timey: SSN label glued own name | 100000 | 290 | 284 |
| r3 timey: own number glued | 100000 | 304 | 283 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 285 | 282 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 265 | 282 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 290 | 280 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 267 | 278 |
| r3 timex: words glued both sides | 100000 | 280 | 276 |
| r3 timey: long glued ZZZ run | 100002 | 277 | 275 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 294 | 275 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 268 | 275 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 283 | 275 |
| r3 timey: placeholders chain | 100004 | 278 | 271 |
| r3 timer: LI camel words | 100000 | 275 | 270 |
| r3 timey: DOB glued readings | 100000 | 287 | 270 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 261 | 270 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 274 | 269 |
| r3 timer: DE LA glued words | 100000 | 272 | 268 |
| dl: SSNs back to back | 99996 | 240 | 265 |
| r3 timer: DE LA run 2 names | 100002 | 246 | 265 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 269 | 264 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 238 | 262 |
| dl: spaced phone chains | 99996 | 260 | 261 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 277 | 260 |
| dl: initials run after a name | 40008 | 316 | 258 |
| r3 timez: ZZ/ZZZ run | 100002 | 273 | 258 |
| r3 timey: camel own name before label numbers | 100000 | 249 | 248 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 258 | 247 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 235 | 247 |
| r3 timer: DE LA run camel | 100002 | 237 | 246 |
| dl: initials run before a name | 40007 | 239 | 238 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 235 | 237 |
| r3 timer: LI run | 100002 | 211 | 236 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 233 | 235 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 203 | 234 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 291 | 234 |
| r3 timer: XU MA run | 100002 | 248 | 232 |
| r3 timer: DE LA run 3 names caps | 100002 | 263 | 231 |
| dl: 100 k digit run | 100000 | 218 | 230 |
| dl: phone label before nine digits | 100000 | 228 | 229 |
| r3 timez: initials Z run | 100002 | 242 | 229 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 244 | 228 |
| r3 timer: DE LA run caps | 100002 | 254 | 222 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 221 | 220 |
| dl: nine-digit runs | 100000 | 219 | 218 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 223 | 218 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 237 | 217 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 240 | 216 |
| dl: one word glued to a digit | 100000 | 204 | 215 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 209 | 215 |
| r3 timey: JANE repeated glued | 100002 | 231 | 213 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 230 | 213 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 283 | 213 |
| r3 timex: long word one glue | 100000 | 221 | 208 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 206 | 208 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 212 | 206 |
| dl: gap after a name as long as the letter | 99990 | 267 | 205 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 212 | 204 |
| r3 timey: zephyra pieces spaced | 100004 | 216 | 203 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 254 | 201 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 205 | 200 |
| r3 timey: camel AbAb glued | 100002 | 211 | 197 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 212 | 197 |
| r3 timey: camel aB | 100000 | 202 | 187 |
| r3 timex: medium words before digits | 100002 | 182 | 179 |
| dl: phones back to back | 99990 | 183 | 177 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 176 | 167 |
