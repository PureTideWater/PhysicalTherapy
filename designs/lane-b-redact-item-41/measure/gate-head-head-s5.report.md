# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-s5/packages/model-gateway/src` (redact.ts d4a6faa9b5e4)
- corpus: 975489 letters, sha256 89a133ca67449143; 673 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1445561.8194039748, msRunB 1205175.5105380258, msClassify 0, msParse 8279.650296993756

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

max A 962 ms, max B 917 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 882 | 917 |
| dl: dates with slashes | 99995 | 962 | 868 |
| dl: digit and bare break | 100000 | 892 | 819 |
| dl: digit and CRLF | 99999 | 818 | 819 |
| r3 timez: many parts run zZ | 100002 | 691 | 738 |
| dl: dates with a claim between | 99988 | 775 | 727 |
| dl: date ranges | 99990 | 691 | 657 |
| dl: digit dash break | 99999 | 664 | 642 |
| r3 timey: spaced member chars | 100000 | 652 | 637 |
| r3 timez: many parts run ZzZ | 100002 | 663 | 636 |
| dl: long gap after a name and many initials | 100008 | 732 | 635 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 669 | 629 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 607 | 611 |
| dl: digit and dash | 100000 | 666 | 610 |
| r3 timey: Q1Q initials | 100000 | 639 | 603 |
| r3 timez: many parts run | 100002 | 627 | 600 |
| r3 timey: month words + overlap dates | 100000 | 692 | 594 |
| dl: amounts after a range | 99974 | 579 | 585 |
| dl: amount before a date | 99997 | 563 | 545 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 376 | 528 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 538 | 527 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 431 | 522 |
| dl: digit and ZWSP | 100000 | 472 | 516 |
| dl: amount ranges | 99988 | 515 | 508 |
| dl: keep-noun list | 100004 | 494 | 506 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 431 | 501 |
| r3 timey: Z1 near-miss | 100000 | 463 | 489 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 438 | 483 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 463 | 480 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 462 | 473 |
| dl: date ranges glued to next word | 99994 | 508 | 469 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 440 | 468 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 440 | 464 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 442 | 458 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 379 | 457 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 448 | 456 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 392 | 452 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 551 | 451 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 396 | 445 |
| dl: ranges glued to ordinal-like word | 99990 | 476 | 441 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 393 | 439 |
| dl: digit and indented break | 99996 | 428 | 432 |
| dl: digit two dashes break | 99996 | 414 | 411 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 390 | 409 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 392 | 408 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 404 | 406 |
| r3 timex: overlap dates 1.1.1 | 100000 | 387 | 386 |
| r3 timey: own number near-miss | 100000 | 368 | 376 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 405 | 349 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 339 | 343 |
| r3 timey: month words at run ends | 100000 | 329 | 338 |
| r3 timey: month glued dense | 100000 | 330 | 338 |
| r3 timey: Q1 initials | 100000 | 406 | 332 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 313 | 324 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 302 | 309 |
| r3 timey: placeholder glued digits | 100000 | 329 | 302 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 289 | 299 |
| r3 timey: SSN label glued own name | 100000 | 275 | 292 |
| dl: initials run after a name | 40008 | 347 | 289 |
| r3 timey: Jane1 repeated | 100000 | 294 | 287 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 299 | 285 |
| r3 timey: long glued zZ run | 100002 | 284 | 284 |
| r3 timez: ZZ/ZZZ run | 100002 | 304 | 282 |
| r3 timey: own number glued | 100000 | 291 | 282 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 248 | 282 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 337 | 282 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 292 | 282 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 318 | 281 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 299 | 279 |
| r3 timey: placeholders chain | 100004 | 279 | 278 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 294 | 277 |
| r3 timey: DOB glued readings | 100000 | 330 | 275 |
| dl: SSNs back to back | 99996 | 265 | 266 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 277 | 265 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 290 | 264 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 254 | 264 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 231 | 263 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 272 | 263 |
| r3 timer: LI camel words | 100000 | 238 | 262 |
| r3 timex: words glued both sides | 100000 | 260 | 262 |
| dl: initials run before a name | 40007 | 288 | 261 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 225 | 261 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 264 | 260 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 284 | 260 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 263 | 260 |
| r3 timey: camel own name before label numbers | 100000 | 249 | 259 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 251 | 258 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 274 | 257 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 258 | 257 |
| dl: phone label before nine digits | 100000 | 251 | 254 |
| r3 timey: long glued ZZZ run | 100002 | 276 | 252 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 245 | 252 |
| dl: spaced phone chains | 99996 | 262 | 251 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 256 | 251 |
| r3 timer: DE LA glued words | 100000 | 252 | 250 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 254 | 250 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 239 | 247 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 259 | 242 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 237 | 241 |
| r3 timer: XU MA run | 100002 | 245 | 239 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 256 | 239 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 244 | 238 |
| r3 timer: DE LA run camel | 100002 | 238 | 237 |
| r3 timey: zephyra pieces spaced | 100004 | 205 | 237 |
| r3 timer: DE LA run 2 names | 100002 | 240 | 233 |
| r3 timer: DE LA run 3 names caps | 100002 | 237 | 233 |
| dl: nine-digit runs | 100000 | 226 | 225 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 242 | 225 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 230 | 224 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 255 | 222 |
| dl: gap after a name as long as the letter | 99990 | 267 | 216 |
| r3 timez: initials Z run | 100002 | 221 | 215 |
| r3 timex: long word one glue | 100000 | 230 | 215 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 212 | 212 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 229 | 212 |
| dl: 100 k digit run | 100000 | 211 | 210 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 210 | 209 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 228 | 209 |
| r3 timer: DE LA run caps | 100002 | 222 | 204 |
| dl: one word glued to a digit | 100000 | 204 | 193 |
| r3 timey: JANE repeated glued | 100002 | 208 | 192 |
| dl: phones back to back | 99990 | 198 | 190 |
| r3 timer: LI run | 100002 | 209 | 183 |
| r3 timey: camel aB | 100000 | 172 | 179 |
| r3 timex: medium words before digits | 100002 | 173 | 178 |
| r3 timey: camel AbAb glued | 100002 | 176 | 176 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 188 | 162 |
