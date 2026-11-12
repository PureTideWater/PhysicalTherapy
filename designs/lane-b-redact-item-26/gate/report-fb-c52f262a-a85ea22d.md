# Gate report

- tree A: `/home/user/snapF/packages/model-gateway/src` (redact.ts d4c2d866afc9)
- tree B: `/home/user/snapB/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- corpus: 975489 letters, sha256 89a133ca67449143; 329 s
- stats: letters 975489, same 975489, differ 0, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 975489, metadata 0, annotated 0, msRunA 1301495.292133018, msRunB 132.67282499606745, msClassify 0, msParse 7093.017103978198

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

max A 1213 ms, max B 1179 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and CRLF | 99999 | 1213 | 1179 |
| dl: digit and bare break | 100000 | 1014 | 1016 |
| dl: dates with spaces | 99995 | 992 | 930 |
| dl: digit dash break | 99999 | 809 | 855 |
| dl: dates with slashes | 99995 | 855 | 854 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 735 | 754 |
| r3 timez: many parts run ZzZ | 100002 | 744 | 739 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 786 | 732 |
| r3 timez: many parts run zZ | 100002 | 783 | 724 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 699 | 715 |
| r3 timez: many parts run | 100002 | 687 | 702 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 507 | 643 |
| r3 timey: spaced member chars | 100000 | 657 | 636 |
| dl: long gap after a name and many initials | 100008 | 629 | 632 |
| dl: dates with a claim between | 99988 | 601 | 628 |
| dl: digit and dash | 100000 | 623 | 628 |
| dl: amounts after a range | 99974 | 737 | 626 |
| r3 timey: Q1Q initials | 100000 | 606 | 622 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 633 | 596 |
| dl: digit and ZWSP | 100000 | 500 | 591 |
| r3 timex: overlap dates 1.1.1 | 100000 | 506 | 581 |
| dl: amount before a date | 99997 | 672 | 572 |
| dl: date ranges | 99990 | 571 | 571 |
| dl: amount ranges | 99988 | 710 | 559 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 586 | 551 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 488 | 545 |
| dl: digit two dashes break | 99996 | 480 | 544 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 489 | 542 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 450 | 528 |
| r3 timey: month words + overlap dates | 100000 | 611 | 524 |
| dl: keep-noun list | 100004 | 506 | 520 |
| dl: date ranges glued to next word | 99994 | 474 | 512 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 491 | 511 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 562 | 510 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 508 | 501 |
| dl: digit and indented break | 99996 | 549 | 496 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 533 | 495 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 486 | 493 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 425 | 491 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 480 | 485 |
| dl: ranges glued to ordinal-like word | 99990 | 514 | 471 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 540 | 468 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 463 | 468 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 449 | 466 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 463 | 460 |
| r3 timey: Z1 near-miss | 100000 | 550 | 448 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 459 | 425 |
| r3 timey: own number near-miss | 100000 | 366 | 393 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 338 | 359 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 334 | 357 |
| r3 timey: month glued dense | 100000 | 360 | 354 |
| r3 timey: placeholder glued digits | 100000 | 350 | 346 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 338 | 337 |
| r3 timey: own number glued | 100000 | 295 | 335 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 280 | 332 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 361 | 326 |
| r3 timey: Q1 initials | 100000 | 420 | 324 |
| r3 timey: SSN label glued own name | 100000 | 344 | 315 |
| r3 timey: long glued zZ run | 100002 | 321 | 313 |
| r3 timey: placeholders chain | 100004 | 319 | 308 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 313 | 307 |
| r3 timey: month words at run ends | 100000 | 304 | 305 |
| r3 timey: Jane1 repeated | 100000 | 279 | 298 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 309 | 298 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 354 | 293 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 294 | 291 |
| r3 timex: words glued both sides | 100000 | 325 | 290 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 265 | 289 |
| dl: 100 k digit run | 100000 | 212 | 288 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 275 | 288 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 314 | 288 |
| r3 timez: ZZ/ZZZ run | 100002 | 428 | 287 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 303 | 287 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 298 | 283 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 298 | 282 |
| dl: one word glued to a digit | 100000 | 356 | 279 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 340 | 279 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 249 | 276 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 330 | 274 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 285 | 274 |
| r3 timey: DOB glued readings | 100000 | 294 | 272 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 272 | 271 |
| dl: gap after a name as long as the letter | 99990 | 284 | 270 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 257 | 270 |
| dl: phone label before nine digits | 100000 | 249 | 268 |
| r3 timer: DE LA glued words | 100000 | 283 | 268 |
| r3 timey: camel own name before label numbers | 100000 | 305 | 266 |
| dl: spaced phone chains | 99996 | 283 | 261 |
| r3 timey: long glued ZZZ run | 100002 | 255 | 260 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 259 | 260 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 300 | 255 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 288 | 253 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 272 | 253 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 268 | 248 |
| dl: SSNs back to back | 99996 | 243 | 247 |
| r3 timer: DE LA run camel | 100002 | 254 | 247 |
| r3 timer: LI camel words | 100000 | 242 | 246 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 260 | 245 |
| dl: initials run after a name | 40008 | 312 | 244 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 271 | 244 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 291 | 244 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 272 | 244 |
| r3 timer: DE LA run 2 names | 100002 | 260 | 242 |
| r3 timex: long word one glue | 100000 | 272 | 240 |
| r3 timey: zephyra pieces spaced | 100004 | 254 | 239 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 248 | 234 |
| r3 timex: medium words before digits | 100002 | 187 | 233 |
| dl: nine-digit runs | 100000 | 263 | 232 |
| r3 timer: DE LA run 3 names caps | 100002 | 227 | 231 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 255 | 231 |
| r3 timer: XU MA run | 100002 | 325 | 228 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 236 | 226 |
| r3 timer: DE LA run caps | 100002 | 239 | 225 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 289 | 224 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 251 | 221 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 233 | 220 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 247 | 219 |
| r3 timez: initials Z run | 100002 | 239 | 215 |
| dl: initials run before a name | 40007 | 214 | 214 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 221 | 213 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 228 | 209 |
| r3 timey: JANE repeated glued | 100002 | 203 | 207 |
| r3 timer: LI run | 100002 | 201 | 188 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 221 | 185 |
| r3 timey: camel AbAb glued | 100002 | 186 | 178 |
| dl: phones back to back | 99990 | 193 | 165 |
| r3 timey: camel aB | 100000 | 192 | 161 |
