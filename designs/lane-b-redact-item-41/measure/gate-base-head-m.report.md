# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-m/packages/model-gateway/src` (redact.ts 7a2cb1745446)
- corpus: 975489 letters, sha256 89a133ca67449143; 684 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1455500.548943976, msRunB 1242607.829643959, msClassify 0, msParse 8337.243452997865

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

max A 870 ms, max B 971 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 869 | 971 |
| dl: digit and bare break | 100000 | 813 | 926 |
| dl: digit and CRLF | 99999 | 870 | 905 |
| dl: dates with slashes | 99995 | 798 | 826 |
| dl: date ranges | 99990 | 641 | 704 |
| r3 timez: many parts run zZ | 100002 | 661 | 688 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 632 | 674 |
| dl: digit dash break | 99999 | 717 | 645 |
| r3 timez: many parts run ZzZ | 100002 | 640 | 624 |
| dl: dates with a claim between | 99988 | 655 | 623 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 638 | 619 |
| dl: amount before a date | 99997 | 581 | 600 |
| r3 timey: month words + overlap dates | 100000 | 507 | 568 |
| r3 timez: many parts run | 100002 | 640 | 540 |
| dl: digit and dash | 100000 | 527 | 538 |
| r3 timey: spaced member chars | 100000 | 516 | 533 |
| dl: long gap after a name and many initials | 100008 | 617 | 525 |
| dl: amounts after a range | 99974 | 523 | 522 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 545 | 517 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 454 | 510 |
| r3 timey: Q1Q initials | 100000 | 558 | 503 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 611 | 501 |
| dl: amount ranges | 99988 | 588 | 500 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 518 | 500 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 487 | 486 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 441 | 482 |
| dl: keep-noun list | 100004 | 470 | 478 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 458 | 475 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 391 | 475 |
| dl: digit and ZWSP | 100000 | 481 | 463 |
| dl: digit and indented break | 99996 | 482 | 462 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 406 | 462 |
| dl: ranges glued to ordinal-like word | 99990 | 467 | 459 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 482 | 458 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 546 | 456 |
| dl: date ranges glued to next word | 99994 | 477 | 455 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 470 | 452 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 422 | 445 |
| r3 timex: overlap dates 1.1.1 | 100000 | 414 | 434 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 481 | 434 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 451 | 429 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 397 | 425 |
| dl: digit two dashes break | 99996 | 458 | 423 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 426 | 420 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 483 | 417 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 462 | 412 |
| r3 timey: own number near-miss | 100000 | 338 | 403 |
| r3 timey: Z1 near-miss | 100000 | 401 | 384 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 450 | 383 |
| r3 timey: Q1 initials | 100000 | 337 | 355 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 340 | 347 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 326 | 347 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 298 | 326 |
| r3 timey: SSN label glued own name | 100000 | 374 | 319 |
| r3 timey: month glued dense | 100000 | 336 | 309 |
| r3 timer: DE LA run camel | 100002 | 230 | 304 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 298 | 298 |
| r3 timey: long glued zZ run | 100002 | 299 | 294 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 314 | 294 |
| r3 timex: words glued both sides | 100000 | 279 | 289 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 304 | 289 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 333 | 287 |
| r3 timey: DOB glued readings | 100000 | 337 | 285 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 271 | 283 |
| r3 timey: long glued ZZZ run | 100002 | 289 | 282 |
| r3 timey: camel own name before label numbers | 100000 | 274 | 282 |
| r3 timey: placeholder glued digits | 100000 | 284 | 280 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 265 | 280 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 266 | 280 |
| dl: phone label before nine digits | 100000 | 245 | 278 |
| r3 timer: DE LA glued words | 100000 | 238 | 275 |
| r3 timey: Jane1 repeated | 100000 | 291 | 274 |
| r3 timey: placeholders chain | 100004 | 271 | 274 |
| r3 timey: month words at run ends | 100000 | 287 | 270 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 229 | 270 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 289 | 268 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 260 | 265 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 263 | 264 |
| r3 timez: ZZ/ZZZ run | 100002 | 273 | 263 |
| r3 timer: LI camel words | 100000 | 255 | 261 |
| r3 timey: own number glued | 100000 | 293 | 260 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 198 | 259 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 255 | 257 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 270 | 256 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 251 | 255 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 272 | 252 |
| r3 timer: XU MA run | 100002 | 240 | 248 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 236 | 247 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 236 | 239 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 231 | 238 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 249 | 237 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 257 | 236 |
| dl: spaced phone chains | 99996 | 216 | 235 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 269 | 230 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 229 | 230 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 227 | 229 |
| r3 timey: zephyra pieces spaced | 100004 | 222 | 228 |
| dl: SSNs back to back | 99996 | 241 | 226 |
| r3 timez: initials Z run | 100002 | 226 | 224 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 241 | 224 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 256 | 224 |
| r3 timer: DE LA run caps | 100002 | 284 | 223 |
| r3 timey: camel AbAb glued | 100002 | 200 | 222 |
| dl: initials run after a name | 40008 | 249 | 220 |
| r3 timer: DE LA run 3 names caps | 100002 | 238 | 220 |
| dl: nine-digit runs | 100000 | 246 | 219 |
| r3 timer: DE LA run 2 names | 100002 | 228 | 219 |
| dl: initials run before a name | 40007 | 264 | 218 |
| r3 timex: long word one glue | 100000 | 224 | 218 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 220 | 218 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 217 | 217 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 232 | 217 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 221 | 214 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 202 | 214 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 224 | 213 |
| dl: gap after a name as long as the letter | 99990 | 263 | 209 |
| dl: one word glued to a digit | 100000 | 197 | 209 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 228 | 209 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 228 | 207 |
| r3 timey: JANE repeated glued | 100002 | 221 | 203 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 201 | 201 |
| dl: 100 k digit run | 100000 | 199 | 199 |
| r3 timer: LI run | 100002 | 210 | 196 |
| r3 timey: camel aB | 100000 | 202 | 193 |
| r3 timex: medium words before digits | 100002 | 175 | 178 |
| dl: phones back to back | 99990 | 166 | 173 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 193 | 170 |
