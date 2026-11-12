# Gate report

- tree A: `<root>/base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `<root>/head/packages/model-gateway/src` (redact.ts 6d2e97775dfd)
- corpus: 975489 letters, sha256 89a133ca67449143; 1 s
- stats: letters 975489, same 975489, differ 0, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 975489, cachedB 975489, metadata 0, annotated 0, msRunA 91.45755099995904, msRunB 79.45321199997898, msClassify 0, msParse 761.8656399999296

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

max A 975 ms, max B 964 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 961 | 964 |
| dl: digit and bare break | 100000 | 973 | 950 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 941 | 946 |
| dl: digit and CRLF | 99999 | 975 | 937 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 732 | 847 |
| dl: digit dash break | 99999 | 749 | 832 |
| dl: dates with slashes | 99995 | 863 | 795 |
| r3 timez: many parts run zZ | 100002 | 764 | 792 |
| r3 timez: many parts run ZzZ | 100002 | 733 | 762 |
| dl: digit and dash | 100000 | 636 | 714 |
| dl: long gap after a name and many initials | 100008 | 724 | 684 |
| r3 timey: month words + overlap dates | 100000 | 696 | 649 |
| r3 timey: Q1Q initials | 100000 | 662 | 627 |
| dl: date ranges | 99990 | 557 | 623 |
| dl: dates with a claim between | 99988 | 600 | 619 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 573 | 618 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 525 | 617 |
| r3 timez: many parts run | 100002 | 708 | 615 |
| r3 timey: spaced member chars | 100000 | 649 | 615 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 607 | 614 |
| dl: amount ranges | 99988 | 624 | 578 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 470 | 577 |
| dl: keep-noun list | 100004 | 517 | 575 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 465 | 573 |
| dl: amounts after a range | 99974 | 610 | 559 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 529 | 555 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 525 | 554 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 466 | 549 |
| dl: amount before a date | 99997 | 652 | 542 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 644 | 536 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 436 | 532 |
| dl: ranges glued to ordinal-like word | 99990 | 453 | 529 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 522 | 526 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 561 | 526 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 444 | 518 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 447 | 510 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 509 | 509 |
| r3 timey: Z1 near-miss | 100000 | 455 | 502 |
| r3 timex: overlap dates 1.1.1 | 100000 | 579 | 497 |
| dl: digit and indented break | 99996 | 460 | 493 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 408 | 485 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 497 | 469 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 480 | 467 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 528 | 462 |
| dl: date ranges glued to next word | 99994 | 494 | 456 |
| dl: digit and ZWSP | 100000 | 477 | 455 |
| dl: digit two dashes break | 99996 | 442 | 454 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 500 | 440 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 344 | 402 |
| r3 timer: DE LA glued words | 100000 | 401 | 389 |
| r3 timex: words glued both sides | 100000 | 307 | 387 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 288 | 378 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 313 | 377 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 394 | 372 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 361 | 364 |
| r3 timey: Q1 initials | 100000 | 388 | 363 |
| r3 timey: own number near-miss | 100000 | 353 | 354 |
| r3 timer: DE LA run 3 names caps | 100002 | 265 | 350 |
| r3 timey: placeholder glued digits | 100000 | 357 | 350 |
| r3 timey: placeholders chain | 100004 | 314 | 349 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 310 | 339 |
| r3 timey: month glued dense | 100000 | 379 | 334 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 279 | 332 |
| r3 timey: long glued zZ run | 100002 | 355 | 326 |
| r3 timey: SSN label glued own name | 100000 | 344 | 322 |
| r3 timey: month words at run ends | 100000 | 325 | 307 |
| r3 timez: ZZ/ZZZ run | 100002 | 340 | 303 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 308 | 301 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 301 | 298 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 277 | 298 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 288 | 296 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 267 | 287 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 253 | 285 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 312 | 284 |
| r3 timey: Jane1 repeated | 100000 | 271 | 279 |
| dl: spaced phone chains | 99996 | 273 | 275 |
| r3 timey: camel aB | 100000 | 212 | 274 |
| r3 timey: long glued ZZZ run | 100002 | 298 | 273 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 298 | 271 |
| r3 timey: own number glued | 100000 | 269 | 263 |
| r3 timer: DE LA run 2 names | 100002 | 287 | 262 |
| r3 timey: camel own name before label numbers | 100000 | 247 | 262 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 274 | 260 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 316 | 260 |
| r3 timer: DE LA run caps | 100002 | 276 | 256 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 263 | 254 |
| r3 timey: DOB glued readings | 100000 | 293 | 252 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 255 | 251 |
| dl: nine-digit runs | 100000 | 224 | 249 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 259 | 249 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 235 | 247 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 256 | 247 |
| r3 timey: zephyra pieces spaced | 100004 | 319 | 245 |
| r3 timez: initials Z run | 100002 | 291 | 244 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 246 | 240 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 297 | 240 |
| r3 timer: XU MA run | 100002 | 251 | 238 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 325 | 236 |
| dl: one word glued to a digit | 100000 | 224 | 233 |
| dl: SSNs back to back | 99996 | 266 | 231 |
| r3 timer: DE LA run camel | 100002 | 273 | 231 |
| dl: phone label before nine digits | 100000 | 277 | 229 |
| dl: initials run after a name | 40008 | 228 | 227 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 236 | 227 |
| r3 timer: LI camel words | 100000 | 267 | 225 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 208 | 225 |
| r3 timex: long word one glue | 100000 | 240 | 224 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 240 | 222 |
| dl: initials run before a name | 40007 | 222 | 218 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 223 | 217 |
| dl: 100 k digit run | 100000 | 240 | 215 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 265 | 214 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 260 | 213 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 250 | 208 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 196 | 206 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 263 | 205 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 211 | 204 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 315 | 204 |
| r3 timey: camel AbAb glued | 100002 | 206 | 203 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 216 | 202 |
| r3 timey: JANE repeated glued | 100002 | 203 | 199 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 199 | 189 |
| r3 timer: LI run | 100002 | 273 | 186 |
| dl: phones back to back | 99990 | 188 | 185 |
| dl: gap after a name as long as the letter | 99990 | 285 | 182 |
| r3 timex: medium words before digits | 100002 | 195 | 180 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 188 | 176 |
