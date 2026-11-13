# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/417a997e-e736-5109-93dc-eff3b733f5ac/scratchpad/m40/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/417a997e-e736-5109-93dc-eff3b733f5ac/scratchpad/m40/proto/packages/model-gateway/src` (redact.ts a7b08a966c3f)
- corpus: 975489 letters, sha256 89a133ca67449143; 642 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1378583.7563799631, msRunB 1165475.2279039843, msClassify 0, msParse 7732.883376975448

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

max A 851 ms, max B 854 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 843 | 854 |
| dl: digit and CRLF | 99999 | 851 | 824 |
| dl: dates with spaces | 99995 | 758 | 774 |
| dl: dates with slashes | 99995 | 787 | 737 |
| dl: dates with a claim between | 99988 | 629 | 727 |
| r3 timez: many parts run ZzZ | 100002 | 603 | 632 |
| dl: digit dash break | 99999 | 656 | 625 |
| dl: long gap after a name and many initials | 100008 | 610 | 618 |
| r3 timey: Q1Q initials | 100000 | 531 | 616 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 695 | 616 |
| r3 timez: many parts run zZ | 100002 | 606 | 615 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 539 | 598 |
| dl: date ranges | 99990 | 656 | 592 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 584 | 575 |
| dl: digit and dash | 100000 | 636 | 535 |
| dl: amounts after a range | 99974 | 546 | 534 |
| dl: ranges glued to ordinal-like word | 99990 | 511 | 533 |
| r3 timey: spaced member chars | 100000 | 574 | 523 |
| r3 timey: month words + overlap dates | 100000 | 541 | 507 |
| dl: amount before a date | 99997 | 539 | 506 |
| r3 timez: many parts run | 100002 | 543 | 506 |
| r3 timex: overlap dates 1.1.1 | 100000 | 421 | 497 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 518 | 491 |
| dl: amount ranges | 99988 | 534 | 486 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 434 | 475 |
| dl: keep-noun list | 100004 | 556 | 474 |
| dl: digit and indented break | 99996 | 413 | 471 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 409 | 471 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 438 | 463 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 518 | 459 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 427 | 453 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 394 | 453 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 436 | 446 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 477 | 444 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 445 | 441 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 401 | 441 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 443 | 441 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 384 | 440 |
| dl: date ranges glued to next word | 99994 | 472 | 438 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 414 | 435 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 385 | 434 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 391 | 434 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 386 | 429 |
| dl: digit and ZWSP | 100000 | 438 | 423 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 416 | 421 |
| r3 timey: Z1 near-miss | 100000 | 412 | 400 |
| dl: digit two dashes break | 99996 | 399 | 371 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 349 | 358 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 374 | 352 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 324 | 345 |
| r3 timey: Q1 initials | 100000 | 349 | 342 |
| r3 timey: own number near-miss | 100000 | 339 | 338 |
| r3 timey: month glued dense | 100000 | 323 | 308 |
| r3 timey: SSN label glued own name | 100000 | 280 | 300 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 264 | 295 |
| r3 timey: long glued zZ run | 100002 | 294 | 294 |
| r3 timey: Jane1 repeated | 100000 | 266 | 293 |
| r3 timey: placeholder glued digits | 100000 | 291 | 291 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 274 | 290 |
| r3 timey: placeholders chain | 100004 | 277 | 285 |
| r3 timey: month words at run ends | 100000 | 302 | 281 |
| r3 timey: DOB glued readings | 100000 | 262 | 273 |
| r3 timez: ZZ/ZZZ run | 100002 | 272 | 272 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 279 | 272 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 273 | 271 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 273 | 271 |
| dl: SSNs back to back | 99996 | 237 | 270 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 275 | 270 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 275 | 270 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 265 | 267 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 228 | 264 |
| r3 timex: words glued both sides | 100000 | 261 | 262 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 277 | 258 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 258 | 255 |
| r3 timey: own number glued | 100000 | 257 | 253 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 252 | 252 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 279 | 250 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 248 | 250 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 303 | 250 |
| r3 timey: camel own name before label numbers | 100000 | 263 | 249 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 219 | 249 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 298 | 249 |
| r3 timer: DE LA glued words | 100000 | 233 | 247 |
| r3 timer: LI camel words | 100000 | 264 | 247 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 269 | 246 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 243 | 246 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 236 | 246 |
| r3 timey: long glued ZZZ run | 100002 | 251 | 244 |
| dl: initials run after a name | 40008 | 293 | 237 |
| dl: spaced phone chains | 99996 | 264 | 233 |
| dl: phone label before nine digits | 100000 | 234 | 229 |
| dl: nine-digit runs | 100000 | 241 | 228 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 231 | 227 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 261 | 226 |
| dl: gap after a name as long as the letter | 99990 | 262 | 225 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 253 | 224 |
| r3 timer: DE LA run 3 names caps | 100002 | 267 | 223 |
| r3 timey: zephyra pieces spaced | 100004 | 214 | 223 |
| r3 timer: DE LA run 2 names | 100002 | 229 | 221 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 226 | 221 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 249 | 220 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 246 | 219 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 217 | 217 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 244 | 216 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 225 | 215 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 223 | 214 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 214 | 214 |
| dl: initials run before a name | 40007 | 271 | 213 |
| r3 timer: DE LA run camel | 100002 | 212 | 213 |
| r3 timer: XU MA run | 100002 | 271 | 211 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 255 | 211 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 211 | 208 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 230 | 206 |
| dl: 100 k digit run | 100000 | 200 | 203 |
| r3 timex: long word one glue | 100000 | 224 | 202 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 228 | 202 |
| r3 timer: DE LA run caps | 100002 | 212 | 200 |
| dl: one word glued to a digit | 100000 | 218 | 199 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 200 | 196 |
| r3 timez: initials Z run | 100002 | 217 | 193 |
| r3 timey: JANE repeated glued | 100002 | 213 | 190 |
| r3 timey: camel AbAb glued | 100002 | 179 | 184 |
| r3 timer: LI run | 100002 | 186 | 179 |
| dl: phones back to back | 99990 | 190 | 176 |
| r3 timex: medium words before digits | 100002 | 168 | 173 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 190 | 173 |
| r3 timey: camel aB | 100000 | 182 | 170 |
