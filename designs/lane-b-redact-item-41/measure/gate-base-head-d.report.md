# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-d/packages/model-gateway/src` (redact.ts 4da3a4375a33)
- corpus: 975489 letters, sha256 89a133ca67449143; 735 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1579784.5121169684, msRunB 1322492.2336979958, msClassify 0, msParse 8931.423107988263

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

max A 989 ms, max B 983 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and CRLF | 99999 | 989 | 983 |
| dl: dates with spaces | 99995 | 952 | 981 |
| dl: digit and bare break | 100000 | 930 | 924 |
| dl: dates with slashes | 99995 | 875 | 846 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 684 | 690 |
| r3 timez: many parts run zZ | 100002 | 725 | 668 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 670 | 658 |
| dl: dates with a claim between | 99988 | 670 | 652 |
| dl: digit dash break | 99999 | 667 | 645 |
| dl: long gap after a name and many initials | 100008 | 711 | 639 |
| dl: date ranges | 99990 | 661 | 632 |
| r3 timey: month words + overlap dates | 100000 | 571 | 610 |
| r3 timez: many parts run ZzZ | 100002 | 636 | 603 |
| dl: amounts after a range | 99974 | 630 | 583 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 558 | 582 |
| dl: digit and dash | 100000 | 603 | 562 |
| r3 timez: many parts run | 100002 | 559 | 557 |
| dl: amount before a date | 99997 | 585 | 544 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 486 | 522 |
| r3 timey: Q1Q initials | 100000 | 514 | 521 |
| r3 timey: spaced member chars | 100000 | 545 | 519 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 416 | 516 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 551 | 512 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 543 | 510 |
| r3 timex: overlap dates 1.1.1 | 100000 | 440 | 498 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 479 | 494 |
| dl: ranges glued to ordinal-like word | 99990 | 481 | 493 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 414 | 492 |
| dl: date ranges glued to next word | 99994 | 497 | 487 |
| dl: amount ranges | 99988 | 534 | 483 |
| dl: digit and indented break | 99996 | 437 | 482 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 484 | 480 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 509 | 478 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 470 | 476 |
| dl: keep-noun list | 100004 | 511 | 473 |
| dl: digit and ZWSP | 100000 | 460 | 469 |
| dl: digit two dashes break | 99996 | 521 | 464 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 448 | 464 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 478 | 460 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 446 | 459 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 436 | 439 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 406 | 426 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 421 | 425 |
| r3 timey: Z1 near-miss | 100000 | 434 | 422 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 408 | 422 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 376 | 412 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 376 | 411 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 388 | 384 |
| r3 timey: Q1 initials | 100000 | 385 | 366 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 385 | 358 |
| r3 timey: own number near-miss | 100000 | 332 | 357 |
| r3 timey: month glued dense | 100000 | 374 | 345 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 328 | 328 |
| r3 timex: words glued both sides | 100000 | 250 | 310 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 273 | 308 |
| r3 timey: Jane1 repeated | 100000 | 279 | 306 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 308 | 300 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 262 | 298 |
| r3 timey: SSN label glued own name | 100000 | 272 | 294 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 301 | 292 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 326 | 291 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 328 | 288 |
| r3 timey: placeholder glued digits | 100000 | 285 | 287 |
| r3 timey: placeholders chain | 100004 | 296 | 281 |
| r3 timey: DOB glued readings | 100000 | 307 | 280 |
| r3 timez: ZZ/ZZZ run | 100002 | 295 | 277 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 287 | 272 |
| dl: SSNs back to back | 99996 | 237 | 268 |
| r3 timey: long glued zZ run | 100002 | 275 | 268 |
| dl: initials run before a name | 40007 | 271 | 267 |
| r3 timey: month words at run ends | 100000 | 278 | 261 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 262 | 261 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 250 | 261 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 260 | 260 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 260 | 257 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 257 | 256 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 253 | 256 |
| r3 timez: initials Z run | 100002 | 244 | 254 |
| r3 timey: own number glued | 100000 | 301 | 254 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 248 | 254 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 228 | 252 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 266 | 252 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 257 | 251 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 268 | 251 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 283 | 250 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 252 | 248 |
| r3 timey: camel own name before label numbers | 100000 | 238 | 244 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 246 | 244 |
| dl: phone label before nine digits | 100000 | 243 | 241 |
| r3 timer: DE LA run camel | 100002 | 218 | 240 |
| r3 timey: long glued ZZZ run | 100002 | 252 | 240 |
| r3 timer: DE LA run 2 names | 100002 | 228 | 238 |
| r3 timer: DE LA glued words | 100000 | 237 | 238 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 231 | 234 |
| dl: spaced phone chains | 99996 | 257 | 233 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 274 | 233 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 258 | 230 |
| dl: nine-digit runs | 100000 | 237 | 228 |
| r3 timer: LI camel words | 100000 | 232 | 228 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 267 | 227 |
| r3 timer: DE LA run 3 names caps | 100002 | 242 | 223 |
| dl: initials run after a name | 40008 | 251 | 221 |
| r3 timey: zephyra pieces spaced | 100004 | 204 | 219 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 227 | 218 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 237 | 217 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 224 | 215 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 216 | 215 |
| dl: one word glued to a digit | 100000 | 226 | 212 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 253 | 212 |
| dl: gap after a name as long as the letter | 99990 | 277 | 210 |
| r3 timer: XU MA run | 100002 | 217 | 210 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 221 | 210 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 212 | 209 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 214 | 205 |
| dl: 100 k digit run | 100000 | 204 | 204 |
| r3 timer: DE LA run caps | 100002 | 249 | 203 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 201 | 203 |
| r3 timex: long word one glue | 100000 | 232 | 202 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 214 | 201 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 205 | 197 |
| r3 timey: JANE repeated glued | 100002 | 212 | 182 |
| r3 timer: LI run | 100002 | 196 | 181 |
| r3 timey: camel aB | 100000 | 185 | 179 |
| dl: phones back to back | 99990 | 180 | 176 |
| r3 timex: medium words before digits | 100002 | 165 | 175 |
| r3 timey: camel AbAb glued | 100002 | 182 | 174 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 184 | 165 |
