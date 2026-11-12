# Gate report

- tree A: `<root>/base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `<root>/head/packages/model-gateway/src` (redact.ts a1f15736360a)
- corpus: 975489 letters, sha256 89a133ca67449143; 763 s
- stats: letters 975489, same 975487, differ 2, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 2, annotated 0, msRunA 1571489.600356034, msRunB 1448646.1600370184, msClassify 13.592963999995845, msParse 11647.264892006271

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

### KEEP.changed.text: 1
- how: no SSN/phone word 1
- by source: T5/MOD-13 letterCase@3fcb9359 1
  - "birth date Aug 4, 1933, Patient: K.FGK😀 for K.FGK😀 Dear FGK, K.😀 RE: Patient Fgk, Kre I.😀 " [KRE I FGK] A: "birth date [DATE_OF_BIRTH], Patient: [PATIENT_NAME].[CLAIM_1]😀 for [PATIENT_NAME].[CLAIM_1]😀 Dear [CLAIM_1], [PATIENT_NAME].😀 RE: Patient [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME].😀 " B: "birth date [DATE_OF_BIRTH], Patient: [PATIENT_NAME].[CLAIM_1]😀 for [PATIENT_NAME].[CLAIM_1]😀 Dear [CLAIM_1], [PATIENT_NAME]: Patient [CLAIM_1], [PATIENT_NAME] [PATIENT_NAME].😀 "

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

max A 937 ms, max B 891 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 937 | 891 |
| dl: digit and CRLF | 99999 | 865 | 869 |
| dl: dates with spaces | 99995 | 786 | 833 |
| dl: digit dash break | 99999 | 688 | 817 |
| dl: dates with slashes | 99995 | 768 | 778 |
| r3 timez: many parts run zZ | 100002 | 664 | 692 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 563 | 648 |
| dl: amount ranges | 99988 | 557 | 631 |
| r3 timey: spaced member chars | 100000 | 673 | 614 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 603 | 613 |
| dl: digit and dash | 100000 | 620 | 609 |
| r3 timez: many parts run ZzZ | 100002 | 664 | 602 |
| dl: date ranges | 99990 | 615 | 598 |
| r3 timey: Q1Q initials | 100000 | 519 | 581 |
| dl: amount before a date | 99997 | 646 | 573 |
| dl: long gap after a name and many initials | 100008 | 577 | 566 |
| r3 timez: many parts run | 100002 | 524 | 560 |
| dl: dates with a claim between | 99988 | 560 | 553 |
| dl: amounts after a range | 99974 | 602 | 549 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 504 | 521 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 536 | 513 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 484 | 510 |
| r3 timey: month words + overlap dates | 100000 | 477 | 501 |
| dl: date ranges glued to next word | 99994 | 480 | 500 |
| dl: digit and ZWSP | 100000 | 605 | 498 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 466 | 490 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 480 | 490 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 520 | 485 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 479 | 482 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 483 | 481 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 479 | 467 |
| dl: ranges glued to ordinal-like word | 99990 | 520 | 464 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 470 | 463 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 465 | 460 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 427 | 460 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 413 | 459 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 409 | 457 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 477 | 450 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 529 | 445 |
| dl: keep-noun list | 100004 | 491 | 443 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 473 | 439 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 424 | 428 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 408 | 426 |
| r3 timex: overlap dates 1.1.1 | 100000 | 507 | 421 |
| dl: digit and indented break | 99996 | 434 | 409 |
| r3 timey: Z1 near-miss | 100000 | 415 | 396 |
| dl: digit two dashes break | 99996 | 372 | 392 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 339 | 374 |
| r3 timey: own number near-miss | 100000 | 347 | 364 |
| r3 timey: Q1 initials | 100000 | 296 | 319 |
| r3 timey: month glued dense | 100000 | 309 | 312 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 336 | 310 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 307 | 302 |
| r3 timey: month words at run ends | 100000 | 311 | 301 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 288 | 291 |
| r3 timey: placeholders chain | 100004 | 271 | 290 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 305 | 290 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 260 | 287 |
| r3 timey: placeholder glued digits | 100000 | 343 | 286 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 273 | 281 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 300 | 270 |
| r3 timey: SSN label glued own name | 100000 | 281 | 269 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 248 | 269 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 259 | 262 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 269 | 260 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 230 | 260 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 227 | 258 |
| r3 timex: words glued both sides | 100000 | 242 | 257 |
| r3 timez: ZZ/ZZZ run | 100002 | 257 | 256 |
| r3 timey: long glued zZ run | 100002 | 261 | 255 |
| r3 timey: own number glued | 100000 | 240 | 252 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 264 | 252 |
| r3 timer: DE LA glued words | 100000 | 228 | 251 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 258 | 249 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 246 | 245 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 245 | 244 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 240 | 243 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 246 | 241 |
| r3 timey: Jane1 repeated | 100000 | 245 | 239 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 213 | 237 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 242 | 234 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 257 | 231 |
| r3 timey: long glued ZZZ run | 100002 | 231 | 230 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 207 | 230 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 232 | 229 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 260 | 229 |
| r3 timey: DOB glued readings | 100000 | 245 | 223 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 235 | 223 |
| r3 timey: camel own name before label numbers | 100000 | 222 | 220 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 258 | 220 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 222 | 220 |
| r3 timer: XU MA run | 100002 | 253 | 218 |
| r3 timey: zephyra pieces spaced | 100004 | 205 | 218 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 230 | 216 |
| r3 timer: DE LA run camel | 100002 | 250 | 215 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 252 | 214 |
| dl: SSNs back to back | 99996 | 257 | 212 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 231 | 212 |
| dl: spaced phone chains | 99996 | 230 | 210 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 233 | 210 |
| r3 timer: DE LA run 3 names caps | 100002 | 212 | 207 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 236 | 206 |
| r3 timer: DE LA run 2 names | 100002 | 205 | 205 |
| dl: initials run before a name | 40007 | 183 | 204 |
| dl: nine-digit runs | 100000 | 200 | 204 |
| dl: phone label before nine digits | 100000 | 212 | 204 |
| r3 timex: long word one glue | 100000 | 219 | 197 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 205 | 196 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 214 | 196 |
| dl: one word glued to a digit | 100000 | 208 | 194 |
| r3 timez: initials Z run | 100002 | 203 | 194 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 214 | 194 |
| r3 timer: DE LA run caps | 100002 | 193 | 191 |
| dl: 100 k digit run | 100000 | 186 | 189 |
| r3 timer: LI camel words | 100000 | 196 | 189 |
| dl: initials run after a name | 40008 | 216 | 185 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 195 | 185 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 190 | 184 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 211 | 182 |
| r3 timey: JANE repeated glued | 100002 | 182 | 173 |
| r3 timey: camel AbAb glued | 100002 | 170 | 166 |
| r3 timer: LI run | 100002 | 166 | 163 |
| r3 timex: medium words before digits | 100002 | 163 | 161 |
| r3 timey: camel aB | 100000 | 173 | 157 |
| dl: gap after a name as long as the letter | 99990 | 166 | 152 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 166 | 148 |
| dl: phones back to back | 99990 | 150 | 139 |
