# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/22ce82dc-ef4c-56a4-aa4c-fb090338e98d/scratchpad/w41/head-k/packages/model-gateway/src` (redact.ts b39bf1412321)
- corpus: 975489 letters, sha256 89a133ca67449143; 731 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1581435.0736069684, msRunB 1312683.0755359617, msClassify 0, msParse 8416.873798020408

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

max A 968 ms, max B 956 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 865 | 956 |
| dl: digit and CRLF | 99999 | 904 | 952 |
| dl: dates with spaces | 99995 | 968 | 883 |
| dl: dates with slashes | 99995 | 835 | 861 |
| dl: dates with a claim between | 99988 | 815 | 810 |
| dl: digit and dash | 100000 | 649 | 697 |
| dl: long gap after a name and many initials | 100008 | 660 | 674 |
| dl: digit dash break | 99999 | 802 | 670 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 811 | 670 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 642 | 646 |
| dl: amounts after a range | 99974 | 628 | 642 |
| r3 timey: spaced member chars | 100000 | 621 | 629 |
| r3 timez: many parts run zZ | 100002 | 835 | 610 |
| r3 timey: Q1Q initials | 100000 | 640 | 609 |
| r3 timez: many parts run | 100002 | 696 | 608 |
| r3 timey: month words + overlap dates | 100000 | 632 | 597 |
| dl: date ranges | 99990 | 756 | 588 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 601 | 588 |
| r3 timez: many parts run ZzZ | 100002 | 598 | 577 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 578 | 569 |
| dl: amount ranges | 99988 | 573 | 548 |
| dl: amount before a date | 99997 | 657 | 543 |
| dl: date ranges glued to next word | 99994 | 532 | 542 |
| r3 timex: overlap dates 1.1.1 | 100000 | 501 | 539 |
| dl: ranges glued to ordinal-like word | 99990 | 564 | 538 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 530 | 532 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 509 | 527 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 461 | 523 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 472 | 519 |
| dl: keep-noun list | 100004 | 485 | 510 |
| dl: digit and ZWSP | 100000 | 554 | 504 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 456 | 497 |
| dl: digit and indented break | 99996 | 510 | 492 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 464 | 491 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 427 | 484 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 450 | 481 |
| r3 timey: Q1 initials | 100000 | 412 | 474 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 495 | 470 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 407 | 466 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 429 | 464 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 434 | 460 |
| r3 timey: Z1 near-miss | 100000 | 551 | 459 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 327 | 443 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 508 | 442 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 482 | 438 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 401 | 426 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 422 | 423 |
| r3 timey: month glued dense | 100000 | 398 | 415 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 459 | 411 |
| dl: digit two dashes break | 99996 | 434 | 407 |
| r3 timey: own number near-miss | 100000 | 397 | 407 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 322 | 380 |
| r3 timey: placeholder glued digits | 100000 | 373 | 367 |
| dl: initials run before a name | 40007 | 268 | 365 |
| r3 timey: SSN label glued own name | 100000 | 350 | 362 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 398 | 361 |
| r3 timey: long glued ZZZ run | 100002 | 301 | 358 |
| r3 timey: DOB glued readings | 100000 | 326 | 353 |
| r3 timey: month words at run ends | 100000 | 342 | 327 |
| r3 timey: long glued zZ run | 100002 | 337 | 322 |
| r3 timey: placeholders chain | 100004 | 328 | 315 |
| r3 timey: Jane1 repeated | 100000 | 322 | 312 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 290 | 311 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 303 | 311 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 299 | 311 |
| r3 timex: words glued both sides | 100000 | 332 | 307 |
| r3 timey: own number glued | 100000 | 346 | 304 |
| dl: initials run after a name | 40008 | 286 | 303 |
| r3 timez: ZZ/ZZZ run | 100002 | 321 | 297 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 290 | 296 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 307 | 295 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 315 | 295 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 308 | 288 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 305 | 288 |
| r3 timer: LI camel words | 100000 | 248 | 286 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 307 | 284 |
| dl: SSNs back to back | 99996 | 272 | 282 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 276 | 281 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 301 | 275 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 322 | 275 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 283 | 270 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 266 | 269 |
| r3 timey: camel own name before label numbers | 100000 | 267 | 268 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 248 | 254 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 233 | 253 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 273 | 250 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 284 | 250 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 255 | 249 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 329 | 248 |
| r3 timex: long word one glue | 100000 | 311 | 240 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 274 | 239 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 314 | 238 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 252 | 235 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 241 | 234 |
| dl: nine-digit runs | 100000 | 220 | 232 |
| r3 timer: DE LA glued words | 100000 | 260 | 232 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 266 | 231 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 238 | 230 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 223 | 230 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 263 | 229 |
| dl: spaced phone chains | 99996 | 258 | 226 |
| r3 timey: JANE repeated glued | 100002 | 277 | 226 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 237 | 226 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 223 | 219 |
| r3 timer: DE LA run 2 names | 100002 | 230 | 217 |
| dl: 100 k digit run | 100000 | 197 | 216 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 264 | 216 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 207 | 215 |
| r3 timey: zephyra pieces spaced | 100004 | 231 | 214 |
| dl: gap after a name as long as the letter | 99990 | 275 | 213 |
| r3 timey: camel AbAb glued | 100002 | 227 | 213 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 203 | 212 |
| dl: phone label before nine digits | 100000 | 268 | 211 |
| r3 timer: DE LA run 3 names caps | 100002 | 233 | 211 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 219 | 211 |
| r3 timer: DE LA run camel | 100002 | 234 | 210 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 208 | 210 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 206 | 206 |
| r3 timey: camel aB | 100000 | 231 | 202 |
| r3 timer: XU MA run | 100002 | 231 | 201 |
| r3 timer: DE LA run caps | 100002 | 223 | 196 |
| r3 timez: initials Z run | 100002 | 215 | 193 |
| dl: one word glued to a digit | 100000 | 214 | 192 |
| r3 timex: medium words before digits | 100002 | 184 | 191 |
| r3 timer: LI run | 100002 | 192 | 178 |
| dl: phones back to back | 99990 | 207 | 170 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 189 | 157 |
