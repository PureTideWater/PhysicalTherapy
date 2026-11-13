# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/a728ad9c-6507-5429-9919-94f1e72d18e5/scratchpad/base/packages/redact/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/a728ad9c-6507-5429-9919-94f1e72d18e5/scratchpad/wip/packages/redact/src` (redact.ts 5825060c4496)
- corpus: 975489 letters, sha256 89a133ca67449143; 728 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1552718.018700979, msRunB 1329277.2792289655, msClassify 0, msParse 8956.380290003059

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

max A 946 ms, max B 997 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 946 | 997 |
| dl: digit and CRLF | 99999 | 865 | 900 |
| dl: dates with slashes | 99995 | 862 | 886 |
| dl: digit and bare break | 100000 | 839 | 849 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 740 | 823 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 742 | 803 |
| r3 timez: many parts run ZzZ | 100002 | 755 | 790 |
| r3 timez: many parts run zZ | 100002 | 652 | 773 |
| dl: dates with a claim between | 99988 | 748 | 725 |
| dl: long gap after a name and many initials | 100008 | 653 | 711 |
| dl: date ranges | 99990 | 653 | 684 |
| r3 timez: many parts run | 100002 | 577 | 672 |
| dl: digit dash break | 99999 | 701 | 664 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 640 | 641 |
| r3 timey: spaced member chars | 100000 | 643 | 632 |
| r3 timey: month words + overlap dates | 100000 | 634 | 620 |
| dl: amounts after a range | 99974 | 618 | 598 |
| dl: amount before a date | 99997 | 644 | 585 |
| r3 timey: Q1Q initials | 100000 | 590 | 580 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 470 | 580 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 520 | 570 |
| dl: digit and dash | 100000 | 581 | 565 |
| dl: amount ranges | 99988 | 586 | 560 |
| dl: ranges glued to ordinal-like word | 99990 | 493 | 558 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 495 | 537 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 454 | 531 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 493 | 531 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 441 | 530 |
| dl: keep-noun list | 100004 | 512 | 527 |
| r3 timex: overlap dates 1.1.1 | 100000 | 515 | 522 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 499 | 518 |
| dl: date ranges glued to next word | 99994 | 548 | 513 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 476 | 509 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 417 | 502 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 469 | 499 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 466 | 488 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 454 | 478 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 461 | 477 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 494 | 475 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 402 | 470 |
| dl: digit and indented break | 99996 | 425 | 467 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 470 | 459 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 420 | 457 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 461 | 452 |
| r3 timey: Z1 near-miss | 100000 | 444 | 440 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 444 | 435 |
| dl: digit two dashes break | 99996 | 422 | 434 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 405 | 421 |
| dl: digit and ZWSP | 100000 | 430 | 411 |
| r3 timey: month glued dense | 100000 | 334 | 409 |
| r3 timey: own number near-miss | 100000 | 349 | 403 |
| r3 timey: long glued zZ run | 100002 | 283 | 384 |
| r3 timey: placeholder glued digits | 100000 | 407 | 379 |
| r3 timey: Q1 initials | 100000 | 420 | 376 |
| r3 timey: SSN label glued own name | 100000 | 346 | 361 |
| r3 timey: month words at run ends | 100000 | 344 | 358 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 400 | 357 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 293 | 350 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 273 | 347 |
| r3 timez: ZZ/ZZZ run | 100002 | 265 | 346 |
| r3 timex: words glued both sides | 100000 | 332 | 340 |
| r3 timey: long glued ZZZ run | 100002 | 288 | 336 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 300 | 328 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 299 | 326 |
| r3 timey: camel own name before label numbers | 100000 | 301 | 319 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 312 | 316 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 346 | 315 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 316 | 315 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 297 | 315 |
| r3 timer: DE LA run 2 names | 100002 | 268 | 314 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 317 | 314 |
| r3 timey: DOB glued readings | 100000 | 309 | 313 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 290 | 312 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 293 | 310 |
| dl: initials run after a name | 40008 | 310 | 308 |
| r3 timey: Jane1 repeated | 100000 | 323 | 302 |
| r3 timey: placeholders chain | 100004 | 305 | 302 |
| r3 timer: LI camel words | 100000 | 259 | 301 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 272 | 301 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 289 | 299 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 359 | 294 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 324 | 287 |
| dl: SSNs back to back | 99996 | 270 | 286 |
| r3 timer: DE LA run 3 names caps | 100002 | 283 | 283 |
| r3 timer: XU MA run | 100002 | 222 | 282 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 264 | 277 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 250 | 274 |
| dl: nine-digit runs | 100000 | 235 | 272 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 263 | 272 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 248 | 269 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 262 | 269 |
| r3 timey: own number glued | 100000 | 322 | 265 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 246 | 263 |
| r3 timez: initials Z run | 100002 | 245 | 262 |
| r3 timer: DE LA glued words | 100000 | 292 | 262 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 245 | 259 |
| dl: spaced phone chains | 99996 | 278 | 255 |
| r3 timer: DE LA run camel | 100002 | 236 | 255 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 234 | 255 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 192 | 254 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 252 | 254 |
| r3 timey: JANE repeated glued | 100002 | 270 | 252 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 343 | 252 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 248 | 252 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 238 | 252 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 254 | 252 |
| r3 timey: zephyra pieces spaced | 100004 | 219 | 251 |
| dl: phone label before nine digits | 100000 | 225 | 250 |
| r3 timey: camel aB | 100000 | 187 | 246 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 225 | 246 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 224 | 245 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 334 | 241 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 280 | 241 |
| r3 timey: camel AbAb glued | 100002 | 235 | 237 |
| r3 timer: DE LA run caps | 100002 | 246 | 236 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 269 | 236 |
| r3 timer: LI run | 100002 | 242 | 233 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 246 | 232 |
| r3 timex: long word one glue | 100000 | 240 | 227 |
| dl: initials run before a name | 40007 | 233 | 225 |
| dl: one word glued to a digit | 100000 | 226 | 223 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 236 | 223 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 227 | 221 |
| dl: phones back to back | 99990 | 199 | 215 |
| dl: 100 k digit run | 100000 | 201 | 206 |
| dl: gap after a name as long as the letter | 99990 | 268 | 188 |
| r3 timex: medium words before digits | 100002 | 170 | 188 |
