# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/34d630db-4934-5280-b0e7-1cddc3e1c6b3/scratchpad/w75/root/base/packages/model-gateway/src` (redact.ts 3b34d2a284c9)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/34d630db-4934-5280-b0e7-1cddc3e1c6b3/scratchpad/w75/root/head/packages/model-gateway/src` (redact.ts bfd54281f591)
- corpus: 975489 letters, sha256 89a133ca67449143; 859 s
- stats: letters 975489, same 975489, differ 0, refusedA 463002, refusedB 463002, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 0, annotated 0, msRunA 1842031.3644910108, msRunB 1562096.0788379945, msClassify 0, msParse 9840.797368021886

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

max A 1141 ms, max B 1178 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: dates with spaces | 99995 | 1141 | 1178 |
| dl: digit and bare break | 100000 | 1067 | 1029 |
| dl: dates with slashes | 99995 | 1022 | 1008 |
| dl: digit and CRLF | 99999 | 1133 | 954 |
| dl: dates with a claim between | 99988 | 848 | 882 |
| r3 timez: many parts run zZ | 100002 | 786 | 844 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 770 | 823 |
| dl: digit dash break | 99999 | 1001 | 806 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 786 | 772 |
| dl: digit and dash | 100000 | 693 | 762 |
| r3 timez: many parts run ZzZ | 100002 | 756 | 761 |
| r3 timey: spaced member chars | 100000 | 681 | 741 |
| dl: date ranges | 99990 | 766 | 732 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 811 | 730 |
| r3 timez: many parts run | 100002 | 681 | 719 |
| dl: long gap after a name and many initials | 100008 | 784 | 716 |
| dl: amounts after a range | 99974 | 700 | 709 |
| dl: amount before a date | 99997 | 710 | 688 |
| r3 timey: month words + overlap dates | 100000 | 639 | 646 |
| r3 timey: Q1Q initials | 100000 | 690 | 642 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 541 | 641 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 605 | 629 |
| dl: amount ranges | 99988 | 702 | 615 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 567 | 608 |
| dl: ranges glued to ordinal-like word | 99990 | 630 | 603 |
| dl: keep-noun list | 100004 | 634 | 597 |
| dl: date ranges glued to next word | 99994 | 584 | 596 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 545 | 571 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 630 | 570 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 531 | 566 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 532 | 559 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 535 | 553 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 517 | 551 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 503 | 548 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 506 | 545 |
| dl: digit and ZWSP | 100000 | 555 | 541 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 505 | 537 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 456 | 533 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 477 | 522 |
| dl: digit and indented break | 99996 | 568 | 518 |
| r3 timey: Z1 near-miss | 100000 | 482 | 509 |
| r3 timex: overlap dates 1.1.1 | 100000 | 500 | 507 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 538 | 501 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 508 | 491 |
| dl: digit two dashes break | 99996 | 487 | 489 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 519 | 489 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 524 | 484 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 489 | 460 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 428 | 451 |
| r3 timey: Q1 initials | 100000 | 451 | 437 |
| r3 timey: own number near-miss | 100000 | 428 | 420 |
| r3 timey: placeholder glued digits | 100000 | 371 | 416 |
| r3 timey: long glued zZ run | 100002 | 344 | 414 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 390 | 405 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 332 | 395 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 422 | 386 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 436 | 383 |
| r3 timey: month glued dense | 100000 | 419 | 361 |
| r3 timey: camel own name before label numbers | 100000 | 329 | 361 |
| r3 timer: LI camel words | 100000 | 325 | 356 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 283 | 352 |
| r3 timey: placeholders chain | 100004 | 355 | 351 |
| r3 timex: words glued both sides | 100000 | 333 | 351 |
| dl: initials run before a name | 40007 | 303 | 349 |
| r3 timey: Jane1 repeated | 100000 | 325 | 343 |
| r3 timey: SSN label glued own name | 100000 | 345 | 342 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 330 | 342 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 270 | 341 |
| dl: spaced phone chains | 99996 | 309 | 338 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 260 | 336 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 320 | 334 |
| r3 timey: month words at run ends | 100000 | 324 | 329 |
| r3 timey: own number glued | 100000 | 335 | 328 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 266 | 328 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 320 | 328 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 335 | 326 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 348 | 322 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 331 | 319 |
| r3 timey: long glued ZZZ run | 100002 | 360 | 317 |
| r3 timer: DE LA run 2 names | 100002 | 269 | 316 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 362 | 314 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 346 | 312 |
| r3 timey: DOB glued readings | 100000 | 319 | 310 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 305 | 309 |
| dl: initials run after a name | 40008 | 387 | 306 |
| r3 timez: ZZ/ZZZ run | 100002 | 354 | 301 |
| dl: one word glued to a digit | 100000 | 292 | 300 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 326 | 298 |
| r3 timer: DE LA glued words | 100000 | 303 | 295 |
| dl: nine-digit runs | 100000 | 307 | 289 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 319 | 288 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 277 | 284 |
| r3 timer: DE LA run camel | 100002 | 239 | 283 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 323 | 283 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 308 | 281 |
| dl: SSNs back to back | 99996 | 288 | 278 |
| dl: phone label before nine digits | 100000 | 325 | 276 |
| r3 timer: DE LA run 3 names caps | 100002 | 340 | 274 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 256 | 273 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 266 | 269 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 267 | 269 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 278 | 268 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 312 | 267 |
| dl: 100 k digit run | 100000 | 259 | 264 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 291 | 263 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 254 | 263 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 299 | 263 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 262 | 262 |
| r3 timer: XU MA run | 100002 | 287 | 261 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 260 | 258 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 250 | 258 |
| r3 timer: LI run | 100002 | 232 | 257 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 321 | 256 |
| r3 timex: long word one glue | 100000 | 279 | 255 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 263 | 254 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 279 | 242 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 249 | 240 |
| dl: phones back to back | 99990 | 227 | 236 |
| r3 timez: initials Z run | 100002 | 253 | 231 |
| r3 timer: DE LA run caps | 100002 | 243 | 231 |
| r3 timey: zephyra pieces spaced | 100004 | 249 | 231 |
| r3 timey: JANE repeated glued | 100002 | 254 | 230 |
| r3 timey: camel AbAb glued | 100002 | 220 | 228 |
| dl: gap after a name as long as the letter | 99990 | 319 | 226 |
| r3 timey: camel aB | 100000 | 230 | 225 |
| r3 timex: medium words before digits | 100002 | 222 | 222 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 230 | 194 |
