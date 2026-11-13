# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-d/packages/model-gateway/src` (redact.ts 4da3a4375a33)
- corpus: 975489 letters, sha256 89a133ca67449143; 696 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1484411.4965770245, msRunB 1229883.6271649692, msClassify 0, msParse 8477.157184001271

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

max A 1049 ms, max B 906 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1049 | 906 |
| dl: dates with slashes | 99995 | 787 | 849 |
| dl: digit and bare break | 100000 | 824 | 815 |
| dl: digit and CRLF | 99999 | 795 | 783 |
| dl: dates with a claim between | 99988 | 716 | 758 |
| dl: digit dash break | 99999 | 600 | 645 |
| r3 timez: many parts run zZ | 100002 | 614 | 619 |
| r3 timez: many parts run ZzZ | 100002 | 620 | 601 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 616 | 600 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 570 | 574 |
| dl: long gap after a name and many initials | 100008 | 563 | 546 |
| dl: date ranges | 99990 | 575 | 544 |
| dl: amount ranges | 99988 | 550 | 538 |
| dl: digit and dash | 100000 | 553 | 515 |
| dl: amount before a date | 99997 | 566 | 511 |
| r3 timey: month words + overlap dates | 100000 | 506 | 511 |
| r3 timey: Q1Q initials | 100000 | 516 | 507 |
| dl: amounts after a range | 99974 | 513 | 506 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 516 | 501 |
| dl: date ranges glued to next word | 99994 | 472 | 500 |
| r3 timey: spaced member chars | 100000 | 550 | 498 |
| r3 timez: many parts run | 100002 | 524 | 495 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 527 | 493 |
| dl: keep-noun list | 100004 | 501 | 483 |
| dl: ranges glued to ordinal-like word | 99990 | 497 | 473 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 440 | 473 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 381 | 465 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 381 | 459 |
| dl: digit and ZWSP | 100000 | 425 | 452 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 401 | 446 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 406 | 436 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 380 | 434 |
| r3 timex: overlap dates 1.1.1 | 100000 | 424 | 426 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 434 | 426 |
| dl: digit two dashes break | 99996 | 404 | 425 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 403 | 425 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 478 | 425 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 376 | 416 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 375 | 411 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 419 | 408 |
| dl: digit and indented break | 99996 | 424 | 405 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 375 | 399 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 401 | 399 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 374 | 395 |
| r3 timey: Z1 near-miss | 100000 | 406 | 394 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 392 | 391 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 383 | 388 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 340 | 340 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 322 | 339 |
| r3 timey: Q1 initials | 100000 | 336 | 335 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 370 | 335 |
| r3 timey: own number near-miss | 100000 | 329 | 321 |
| r3 timey: month glued dense | 100000 | 304 | 305 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 252 | 297 |
| r3 timey: placeholder glued digits | 100000 | 282 | 291 |
| dl: initials run before a name | 40007 | 252 | 283 |
| r3 timey: SSN label glued own name | 100000 | 276 | 283 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 261 | 272 |
| r3 timey: placeholders chain | 100004 | 270 | 268 |
| dl: SSNs back to back | 99996 | 224 | 266 |
| r3 timey: long glued zZ run | 100002 | 268 | 266 |
| r3 timer: LI camel words | 100000 | 238 | 265 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 254 | 264 |
| r3 timey: month words at run ends | 100000 | 279 | 259 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 306 | 258 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 257 | 256 |
| r3 timey: Jane1 repeated | 100000 | 256 | 255 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 263 | 255 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 248 | 253 |
| r3 timez: ZZ/ZZZ run | 100002 | 261 | 251 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 259 | 251 |
| dl: gap after a name as long as the letter | 99990 | 251 | 250 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 255 | 250 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 268 | 250 |
| r3 timex: words glued both sides | 100000 | 260 | 249 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 252 | 249 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 249 | 249 |
| r3 timey: own number glued | 100000 | 256 | 248 |
| r3 timey: long glued ZZZ run | 100002 | 261 | 247 |
| r3 timey: DOB glued readings | 100000 | 257 | 245 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 251 | 245 |
| dl: initials run after a name | 40008 | 281 | 242 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 251 | 242 |
| dl: spaced phone chains | 99996 | 218 | 241 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 219 | 241 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 276 | 240 |
| r3 timey: camel own name before label numbers | 100000 | 249 | 239 |
| r3 timer: DE LA glued words | 100000 | 246 | 238 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 276 | 234 |
| r3 timer: DE LA run 2 names | 100002 | 217 | 232 |
| r3 timer: DE LA run camel | 100002 | 228 | 219 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 225 | 219 |
| r3 timey: zephyra pieces spaced | 100004 | 210 | 218 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 204 | 215 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 225 | 215 |
| dl: phone label before nine digits | 100000 | 220 | 214 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 229 | 214 |
| dl: one word glued to a digit | 100000 | 217 | 212 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 204 | 212 |
| dl: nine-digit runs | 100000 | 231 | 209 |
| r3 timer: DE LA run 3 names caps | 100002 | 229 | 209 |
| r3 timer: XU MA run | 100002 | 221 | 209 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 214 | 207 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 243 | 207 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 216 | 206 |
| r3 timez: initials Z run | 100002 | 212 | 203 |
| r3 timer: DE LA run caps | 100002 | 219 | 202 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 212 | 202 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 212 | 202 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 206 | 201 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 275 | 201 |
| r3 timex: long word one glue | 100000 | 215 | 200 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 209 | 200 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 211 | 200 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 207 | 200 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 201 | 199 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 205 | 198 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 210 | 198 |
| dl: 100 k digit run | 100000 | 194 | 193 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 198 | 192 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 202 | 184 |
| r3 timey: camel AbAb glued | 100002 | 179 | 180 |
| r3 timey: camel aB | 100000 | 198 | 179 |
| r3 timey: JANE repeated glued | 100002 | 196 | 179 |
| r3 timer: LI run | 100002 | 182 | 178 |
| r3 timex: medium words before digits | 100002 | 165 | 166 |
| dl: phones back to back | 99990 | 184 | 162 |
