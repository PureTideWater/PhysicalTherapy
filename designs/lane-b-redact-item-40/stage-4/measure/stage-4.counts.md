# Queues item 40, stage 4 (ruling (A)): what was measured (W75, 2026-11-13)

Trees: the base 17c234d2 (`redact.ts` 3b34d2a284c9), stage 3's 943be057 (24359600cc53) and the head's file as committed
at e17c1192 (bfd54281f591; `trees.sha256`). Every count is from a file in this directory. Synthetic letters only.
Scripts: `measure-stage-4.sh` (lay gen40 gen34 units fuzz changed a4 gate timing), `after-stage-4.sh` (the 100-letter
property and the unit suites), `fuzz-changed.mts`, `fuzz-product-changed.mts`, `other-names.mts`.

| gate | result |
| --- | --- |
| Item 40's generated set (seed 40, 51,833 letters; `generated-set-40.stage-4.counts.md`) | **failures 0 in every family**, PHI classes none, errors 0/0. `A.length-*` 42,240: base clear / hidden / refused 2,736 / 39,504 / 0, head **0 / 42,240 / 0**; `A.other-names` 8: base 5 / 3 / 0, head **0 / 8 / 0**; `A.control.sentence` hidden on both. Refused 2,366 base, 8,570 head, as stage 3. Every other family, the classes and the newly refused rows (the real-shaped 84 of R1-4 and 96 of R1-3, form by form) are stage 3's to the count: only the 11 `A.*` forms differ from stage 3's summary. **Real-shaped newly refused by this stage: none.** |
| Item 34's generated set (14,356) | **differ 0**, failures 0, refused 5,789 on both, notes 6 (as stage 3) |
| Item 34's `a4.sh` measure (`cost-names.mts`, 64 names over 558 texts of the repository's synthetic prose) | base against head, and stage 3 against head: **texts changed 0, new spans 0, for every name** |
| The full uncached gate, 4 workers (`gate-base-head.report.md`) | 975,489 letters, **same 975,489, differ 0**, refused 463,002 on both, errors 0/0, spanMismatch 0; **PHI none, KEEP none (no KEEP.changed.text row), UNPLACED none, reverse PHI none, reverse KEEP none.** Timing max A 1,141 ms, B 1,178 ms |
| The two budget rows (`units-*.out`) | **403,548,210 and 414,023,090, both sent, on both trees** |
| Fuzzed 60,000, item 34's fuzzer, seeds 301 to 303 (`fuzz-30?.out`) | **base-refused, head-sent 0** in all three, 0 with a letter or digit outside placeholders; head refuses 558 / 569 / 558 more (stage 3's 1,685) |
| The same 60,000, stage 3 against head (`fuzz-changed-30?.out`) | **same 60,000: this stage changes none of them** |
| The product's fuzzed letters, 60,000, seeds 401 to 403 (the design note's set; `fuzz-product-*.out`) | base against head: base-refused, head-sent **0**, newly refused 1,731, both sent with a different text 6. Stage 3 against head: refused 8,272 on both, newly refused **0**, newly sent **0**, **6 sent with a different text: the note's 6, each read** (`fuzz-product-changed-s3-head.jsonl`) |
| Ruling (A) over 40 ordinary names (`other-names-*.out`, `other-names.classes.md`) | 453,888 letters per tree, refused 0; clear 201,728 on the base and on stage 3, **176,448 on the head**: the 30,336 of ruling (A)'s form become 5,056 (one undotted initial before a word in lower case, the first reading's rule); the rest is the same on all three trees and is not ruling (A)'s form |
| Reader's time, 20,000 letters of shard 0, two runs each (`timing-*.out`) | base 1.3665 and 1.3716 ms per letter, head 1.4104 and 1.3356; refused 6,997 on each |
| The 100-letter property (`property-100-letters.out`), six runs each, alternating | base 3,987 / 4,227 / 4,005 / 4,243 / 4,073 / 4,128 ms (mean 4,111); head 4,082 / 4,161 / 4,244 / 3,903 / 4,154 / 4,235 (mean 4,130). Head's range 3,903 to 4,244 against the base's 3,987 to 4,243: **its slowest run is 1 ms over the base's slowest** |
| Unit suites on the head (`unit-suites.out`) | redact 54 passed; packets 1,825 passed; synth 192 passed; model-gateway 6,050 passed, 34 skipped, and the two `.db.test.ts` files not running for want of DATABASE_URL (as on the base). `redact.leaks.test.ts` 1,543 passed, none owed |

## The six fuzzed letters this stage changes (each read; names and numbers are the fuzzer's synthetic ones)

In each the head replaces one or two more letters, each a first letter of a part of the held name written as a dotted
initial right after a writing of that name that ends in one letter standing alone; none is refused; no letter or digit
is in clear on the head that stage 3 hid.

1. 401/7010, NANA NAN: `NANA NANA.N.A.` was `[PATIENT_NAME].N.A.`, is `[PATIENT_NAME].[PATIENT_NAME].A.` (`A` is no initial of that name and stays, as on the base).
2. 401/9896, NANA NAN: `NANA NAN<LF>A.N.A5` was `[PATIENT_NAME].N.A5`, is `[PATIENT_NAME].[PATIENT_NAME].A5`.
3. 401/10319, NANA NAN: `NANA NAN;A.N:` was `[PATIENT_NAME].N:`, is `[PATIENT_NAME].[PATIENT_NAME]:`.
4. 402/14198, NANA NAN: `NANA NAN.A.N 000&11.` was `[PATIENT_NAME].N [CLAIM_1].`, is `[PATIENT_NAME].[PATIENT_NAME] [CLAIM_1].`.
5. 403/1526, ANNA HANNAH: `ann+A.H<CR>` was `[PATIENT_NAME].H`, is `[PATIENT_NAME].[PATIENT_NAME]`.
6. 403/8918, AAAAAAAA: `AAAAAA<CR>A.A.A.A 111A` was `[PATIENT_NAME].A.A 111A`, is `[PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME] 111A`.

## Unexplained differences

None. Against stage 3's files: item 40's set differs in the 11 `A.*` forms alone; item 34's set, the gate's report
(but for times), the budget rows and the 301-303 fuzz counts are the same to the count.
