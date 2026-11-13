# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/14f5cb6e-9d89-50c5-95af-2713c818d1e9/scratchpad/m5a/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/14f5cb6e-9d89-50c5-95af-2713c818d1e9/scratchpad/m5a/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- corpus: 975489 letters, sha256 89a133ca67449143; 680 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1456290.9658390053, msRunB 1234549.076149982, msClassify 0, msParse 8393.911419007807

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

max A 1024 ms, max B 931 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1024 | 931 |
| dl: dates with slashes | 99995 | 900 | 858 |
| dl: digit and CRLF | 99999 | 821 | 828 |
| dl: digit and bare break | 100000 | 886 | 801 |
| dl: dates with a claim between | 99988 | 705 | 700 |
| r3 timez: many parts run ZzZ | 100002 | 657 | 678 |
| dl: digit dash break | 99999 | 668 | 658 |
| dl: date ranges | 99990 | 607 | 649 |
| r3 timey: spaced member chars | 100000 | 666 | 648 |
| r3 timez: many parts run zZ | 100002 | 634 | 638 |
| r3 timey: month words + overlap dates | 100000 | 592 | 624 |
| dl: long gap after a name and many initials | 100008 | 760 | 617 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 649 | 617 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 592 | 600 |
| dl: amount before a date | 99997 | 542 | 585 |
| r3 timey: Q1Q initials | 100000 | 567 | 571 |
| dl: amount ranges | 99988 | 565 | 566 |
| dl: digit and dash | 100000 | 601 | 562 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 603 | 558 |
| dl: amounts after a range | 99974 | 585 | 555 |
| r3 timez: many parts run | 100002 | 543 | 529 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 464 | 506 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 454 | 501 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 513 | 493 |
| dl: date ranges glued to next word | 99994 | 499 | 487 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 429 | 478 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 458 | 477 |
| dl: ranges glued to ordinal-like word | 99990 | 463 | 466 |
| dl: keep-noun list | 100004 | 500 | 465 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 398 | 455 |
| r3 timex: overlap dates 1.1.1 | 100000 | 454 | 451 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 508 | 449 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 480 | 446 |
| r3 timey: Z1 near-miss | 100000 | 429 | 444 |
| dl: digit and ZWSP | 100000 | 440 | 442 |
| dl: digit and indented break | 99996 | 440 | 442 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 437 | 438 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 477 | 433 |
| dl: digit two dashes break | 99996 | 398 | 429 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 439 | 423 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 399 | 422 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 424 | 421 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 428 | 418 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 444 | 417 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 427 | 416 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 503 | 405 |
| r3 timey: Q1 initials | 100000 | 406 | 393 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 392 | 388 |
| r3 timey: own number near-miss | 100000 | 377 | 376 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 506 | 374 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 375 | 367 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 352 | 348 |
| r3 timey: SSN label glued own name | 100000 | 336 | 337 |
| r3 timey: placeholder glued digits | 100000 | 362 | 334 |
| r3 timey: month glued dense | 100000 | 356 | 329 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 361 | 319 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 281 | 317 |
| r3 timez: ZZ/ZZZ run | 100002 | 292 | 314 |
| r3 timey: month words at run ends | 100000 | 305 | 296 |
| r3 timey: placeholders chain | 100004 | 308 | 296 |
| r3 timey: DOB glued readings | 100000 | 352 | 295 |
| r3 timey: long glued zZ run | 100002 | 314 | 293 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 312 | 290 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 284 | 288 |
| r3 timex: words glued both sides | 100000 | 271 | 281 |
| r3 timey: Jane1 repeated | 100000 | 283 | 280 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 257 | 278 |
| r3 timey: own number glued | 100000 | 271 | 277 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 277 | 277 |
| r3 timey: long glued ZZZ run | 100002 | 279 | 275 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 281 | 275 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 301 | 274 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 282 | 273 |
| r3 timey: camel own name before label numbers | 100000 | 286 | 270 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 208 | 270 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 273 | 270 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 269 | 267 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 294 | 266 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 288 | 262 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 270 | 261 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 276 | 261 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 264 | 261 |
| dl: phone label before nine digits | 100000 | 244 | 256 |
| r3 timex: long word one glue | 100000 | 277 | 253 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 231 | 252 |
| r3 timer: DE LA glued words | 100000 | 256 | 249 |
| dl: SSNs back to back | 99996 | 251 | 244 |
| r3 timez: initials Z run | 100002 | 261 | 244 |
| r3 timer: DE LA run 2 names | 100002 | 327 | 243 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 252 | 243 |
| r3 timer: DE LA run camel | 100002 | 235 | 240 |
| r3 timer: LI camel words | 100000 | 254 | 240 |
| dl: spaced phone chains | 99996 | 272 | 237 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 227 | 234 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 237 | 232 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 235 | 232 |
| r3 timer: XU MA run | 100002 | 239 | 231 |
| dl: initials run before a name | 40007 | 261 | 230 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 244 | 229 |
| r3 timey: zephyra pieces spaced | 100004 | 227 | 227 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 226 | 227 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 223 | 227 |
| dl: initials run after a name | 40008 | 260 | 226 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 222 | 226 |
| dl: nine-digit runs | 100000 | 220 | 225 |
| r3 timer: DE LA run caps | 100002 | 253 | 224 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 230 | 224 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 234 | 223 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 208 | 222 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 240 | 221 |
| r3 timey: camel aB | 100000 | 179 | 220 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 252 | 217 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 235 | 216 |
| r3 timer: DE LA run 3 names caps | 100002 | 238 | 213 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 221 | 213 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 221 | 211 |
| r3 timey: camel AbAb glued | 100002 | 183 | 210 |
| dl: 100 k digit run | 100000 | 224 | 208 |
| r3 timey: JANE repeated glued | 100002 | 234 | 206 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 230 | 206 |
| r3 timer: LI run | 100002 | 199 | 202 |
| dl: one word glued to a digit | 100000 | 202 | 198 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 222 | 198 |
| r3 timex: medium words before digits | 100002 | 185 | 197 |
| dl: gap after a name as long as the letter | 99990 | 263 | 189 |
| dl: phones back to back | 99990 | 175 | 189 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 178 | 165 |
