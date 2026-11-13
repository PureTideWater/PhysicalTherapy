# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-m/packages/model-gateway/src` (redact.ts 0c8f567efc68)
- corpus: 975489 letters, sha256 89a133ca67449143; 661 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1430233.570572993, msRunB 1194401.725004993, msClassify 0, msParse 8097.932044035029

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

max A 862 ms, max B 819 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and CRLF | 99999 | 798 | 819 |
| dl: dates with spaces | 99995 | 862 | 811 |
| dl: dates with slashes | 99995 | 762 | 799 |
| dl: digit and bare break | 100000 | 802 | 770 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 665 | 656 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 699 | 645 |
| dl: dates with a claim between | 99988 | 649 | 632 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 622 | 623 |
| dl: date ranges | 99990 | 536 | 621 |
| r3 timez: many parts run zZ | 100002 | 604 | 609 |
| r3 timez: many parts run ZzZ | 100002 | 572 | 598 |
| r3 timey: spaced member chars | 100000 | 555 | 597 |
| dl: digit dash break | 99999 | 649 | 574 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 520 | 546 |
| dl: long gap after a name and many initials | 100008 | 594 | 536 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 582 | 529 |
| dl: digit and dash | 100000 | 547 | 526 |
| dl: amounts after a range | 99974 | 571 | 526 |
| r3 timey: month words + overlap dates | 100000 | 500 | 508 |
| dl: ranges glued to ordinal-like word | 99990 | 454 | 502 |
| r3 timez: many parts run | 100002 | 527 | 496 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 506 | 491 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 412 | 486 |
| dl: amount before a date | 99997 | 517 | 484 |
| r3 timey: Q1Q initials | 100000 | 518 | 483 |
| dl: amount ranges | 99988 | 512 | 481 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 463 | 477 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 481 | 472 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 452 | 472 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 502 | 469 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 431 | 461 |
| dl: keep-noun list | 100004 | 504 | 460 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 487 | 456 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 437 | 456 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 449 | 447 |
| dl: date ranges glued to next word | 99994 | 483 | 444 |
| r3 timex: overlap dates 1.1.1 | 100000 | 396 | 443 |
| dl: digit two dashes break | 99996 | 476 | 437 |
| r3 timey: Z1 near-miss | 100000 | 454 | 433 |
| dl: digit and indented break | 99996 | 466 | 432 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 501 | 428 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 435 | 418 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 419 | 415 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 404 | 406 |
| dl: digit and ZWSP | 100000 | 456 | 405 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 493 | 405 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 448 | 399 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 363 | 399 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 431 | 390 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 385 | 385 |
| r3 timey: own number near-miss | 100000 | 337 | 332 |
| r3 timey: Q1 initials | 100000 | 328 | 318 |
| r3 timey: placeholder glued digits | 100000 | 381 | 314 |
| r3 timey: placeholders chain | 100004 | 320 | 314 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 297 | 314 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 300 | 304 |
| r3 timey: month glued dense | 100000 | 312 | 303 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 313 | 293 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 249 | 291 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 292 | 283 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 284 | 283 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 303 | 281 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 281 | 281 |
| r3 timey: month words at run ends | 100000 | 265 | 275 |
| r3 timey: SSN label glued own name | 100000 | 290 | 275 |
| r3 timey: long glued zZ run | 100002 | 268 | 272 |
| r3 timez: ZZ/ZZZ run | 100002 | 297 | 269 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 293 | 268 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 320 | 268 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 281 | 265 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 264 | 265 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 281 | 263 |
| r3 timey: camel own name before label numbers | 100000 | 295 | 261 |
| r3 timey: Jane1 repeated | 100000 | 279 | 260 |
| r3 timer: LI camel words | 100000 | 240 | 259 |
| r3 timey: own number glued | 100000 | 274 | 259 |
| dl: phone label before nine digits | 100000 | 246 | 257 |
| r3 timey: DOB glued readings | 100000 | 252 | 257 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 285 | 257 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 262 | 254 |
| r3 timex: words glued both sides | 100000 | 257 | 252 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 247 | 252 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 298 | 248 |
| r3 timer: DE LA glued words | 100000 | 253 | 247 |
| r3 timey: zephyra pieces spaced | 100004 | 239 | 243 |
| dl: nine-digit runs | 100000 | 210 | 242 |
| r3 timer: DE LA run 2 names | 100002 | 220 | 240 |
| r3 timer: DE LA run 3 names caps | 100002 | 254 | 239 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 243 | 239 |
| dl: SSNs back to back | 99996 | 229 | 238 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 244 | 238 |
| r3 timey: long glued ZZZ run | 100002 | 254 | 235 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 243 | 235 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 238 | 234 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 245 | 233 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 228 | 233 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 233 | 230 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 248 | 230 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 225 | 230 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 241 | 228 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 216 | 227 |
| dl: gap after a name as long as the letter | 99990 | 267 | 225 |
| r3 timex: long word one glue | 100000 | 216 | 218 |
| dl: initials run after a name | 40008 | 230 | 217 |
| dl: initials run before a name | 40007 | 210 | 217 |
| dl: spaced phone chains | 99996 | 223 | 215 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 249 | 211 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 227 | 210 |
| r3 timer: DE LA run camel | 100002 | 209 | 209 |
| r3 timer: XU MA run | 100002 | 225 | 209 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 231 | 209 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 231 | 206 |
| r3 timer: LI run | 100002 | 182 | 205 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 251 | 205 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 216 | 202 |
| r3 timey: camel AbAb glued | 100002 | 185 | 201 |
| dl: 100 k digit run | 100000 | 199 | 199 |
| r3 timer: DE LA run caps | 100002 | 201 | 197 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 206 | 197 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 218 | 193 |
| r3 timez: initials Z run | 100002 | 214 | 192 |
| dl: one word glued to a digit | 100000 | 204 | 190 |
| r3 timey: camel aB | 100000 | 183 | 188 |
| r3 timey: JANE repeated glued | 100002 | 202 | 184 |
| r3 timex: medium words before digits | 100002 | 172 | 170 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 196 | 169 |
| dl: phones back to back | 99990 | 182 | 156 |
