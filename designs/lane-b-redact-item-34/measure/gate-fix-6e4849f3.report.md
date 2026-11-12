# Gate report

- tree A: `/tmp/claude-0/-home-user-PhysicalTherapy/be57302d-3ca8-5745-8288-5443f9d38271/scratchpad/gen/base/packages/model-gateway/src` (redact.ts 8b2be7ade7ce)
- tree B: `/tmp/claude-0/-home-user-PhysicalTherapy/be57302d-3ca8-5745-8288-5443f9d38271/scratchpad/gen/head/packages/model-gateway/src` (redact.ts 60db2958f236)
- corpus: 975489 letters, sha256 89a133ca67449143; 613 s
- stats: letters 975489, same 975487, differ 2, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 2, annotated 0, msRunA 1252202.604272015, msRunB 1178018.2979690116, msClassify 29.6846000000005, msParse 8639.421597973367

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

max A 944 ms, max B 957 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and CRLF | 99999 | 910 | 957 |
| dl: digit and bare break | 100000 | 932 | 943 |
| dl: dates with spaces | 99995 | 944 | 921 |
| dl: dates with slashes | 99995 | 768 | 814 |
| dl: digit dash break | 99999 | 758 | 719 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 596 | 713 |
| r3 timey: Q1Q initials | 100000 | 617 | 686 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 728 | 684 |
| dl: date ranges | 99990 | 594 | 661 |
| dl: long gap after a name and many initials | 100008 | 661 | 639 |
| r3 timez: many parts run ZzZ | 100002 | 670 | 636 |
| r3 timez: many parts run | 100002 | 623 | 623 |
| dl: dates with a claim between | 99988 | 555 | 619 |
| dl: digit and dash | 100000 | 585 | 604 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 499 | 603 |
| dl: amounts after a range | 99974 | 591 | 595 |
| r3 timey: spaced member chars | 100000 | 592 | 594 |
| r3 timez: many parts run zZ | 100002 | 611 | 589 |
| dl: amount ranges | 99988 | 488 | 583 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 521 | 567 |
| dl: keep-noun list | 100004 | 530 | 565 |
| r3 timey: month words + overlap dates | 100000 | 537 | 564 |
| dl: date ranges glued to next word | 99994 | 537 | 549 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 455 | 547 |
| dl: amount before a date | 99997 | 564 | 546 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 464 | 528 |
| r3 timex: overlap dates 1.1.1 | 100000 | 409 | 527 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 479 | 519 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 462 | 512 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 467 | 499 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 491 | 498 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 530 | 498 |
| dl: digit and indented break | 99996 | 507 | 496 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 438 | 487 |
| dl: digit and ZWSP | 100000 | 635 | 483 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 420 | 478 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 426 | 477 |
| dl: ranges glued to ordinal-like word | 99990 | 492 | 460 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 489 | 460 |
| r3 timey: Z1 near-miss | 100000 | 430 | 459 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 434 | 450 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 423 | 448 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 440 | 431 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 467 | 423 |
| dl: digit two dashes break | 99996 | 418 | 421 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 469 | 417 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 488 | 409 |
| r3 timey: own number near-miss | 100000 | 372 | 388 |
| r3 timey: placeholder glued digits | 100000 | 308 | 362 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 348 | 354 |
| r3 timey: Q1 initials | 100000 | 330 | 348 |
| r3 timey: month glued dense | 100000 | 384 | 348 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 330 | 347 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 342 | 340 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 259 | 338 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 330 | 328 |
| r3 timez: ZZ/ZZZ run | 100002 | 287 | 315 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 259 | 313 |
| r3 timey: long glued zZ run | 100002 | 330 | 306 |
| r3 timey: month words at run ends | 100000 | 324 | 304 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 289 | 299 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 262 | 297 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 325 | 296 |
| r3 timey: long glued ZZZ run | 100002 | 327 | 294 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 303 | 294 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 322 | 294 |
| r3 timey: SSN label glued own name | 100000 | 319 | 291 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 291 | 289 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 327 | 288 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 302 | 287 |
| r3 timey: placeholders chain | 100004 | 361 | 286 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 291 | 279 |
| r3 timey: DOB glued readings | 100000 | 285 | 277 |
| r3 timey: Jane1 repeated | 100000 | 303 | 274 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 309 | 274 |
| r3 timey: camel own name before label numbers | 100000 | 286 | 269 |
| r3 timey: own number glued | 100000 | 273 | 268 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 241 | 268 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 228 | 267 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 271 | 262 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 240 | 260 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 255 | 256 |
| dl: gap after a name as long as the letter | 99990 | 256 | 254 |
| r3 timer: DE LA run 2 names | 100002 | 277 | 254 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 253 | 254 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 257 | 252 |
| r3 timer: LI camel words | 100000 | 248 | 250 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 249 | 250 |
| r3 timex: words glued both sides | 100000 | 246 | 248 |
| r3 timer: DE LA run 3 names caps | 100002 | 247 | 244 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 236 | 242 |
| r3 timer: DE LA run camel | 100002 | 265 | 240 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 225 | 240 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 245 | 240 |
| dl: SSNs back to back | 99996 | 244 | 237 |
| r3 timer: DE LA glued words | 100000 | 253 | 237 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 246 | 237 |
| r3 timer: DE LA run caps | 100002 | 225 | 235 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 252 | 234 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 272 | 233 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 251 | 233 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 252 | 233 |
| r3 timer: XU MA run | 100002 | 208 | 232 |
| r3 timez: initials Z run | 100002 | 255 | 230 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 232 | 230 |
| dl: initials run after a name | 40008 | 303 | 228 |
| dl: spaced phone chains | 99996 | 254 | 226 |
| dl: phone label before nine digits | 100000 | 219 | 222 |
| dl: 100 k digit run | 100000 | 201 | 221 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 221 | 217 |
| r3 timey: camel AbAb glued | 100002 | 200 | 216 |
| dl: initials run before a name | 40007 | 202 | 215 |
| r3 timey: zephyra pieces spaced | 100004 | 218 | 212 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 239 | 212 |
| dl: nine-digit runs | 100000 | 186 | 211 |
| r3 timey: camel aB | 100000 | 200 | 209 |
| r3 timey: JANE repeated glued | 100002 | 200 | 208 |
| dl: one word glued to a digit | 100000 | 225 | 206 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 217 | 206 |
| r3 timex: medium words before digits | 100002 | 167 | 205 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 229 | 205 |
| r3 timex: long word one glue | 100000 | 206 | 200 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 184 | 199 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 231 | 198 |
| dl: phones back to back | 99990 | 172 | 187 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 216 | 166 |
| r3 timer: LI run | 100002 | 193 | 161 |
