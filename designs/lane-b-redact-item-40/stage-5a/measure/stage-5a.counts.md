# Queues item 40, stage 5a: the measurements whole on the merged tree (2026-11-13, about 19:35 to 20:30 UTC)

The item's first independent measurement (not W75's session). Trees: the base read at 4d40557f, the merged base, whose
`redact.ts` and `confusables.ts` are 17c234d2's byte for byte (3b34d2a284c9); stage 3's 943be057 (24359600cc53); the
head's file in the checkout at 18777df0, e17c1192 with 4d40557f merged in (bfd54281f591, e17c1192's byte for byte;
`trees.sha256`). Scripts: `../measure-stage-5a.sh` (stage 4's, with the base read at 4d40557f and a step `product` for
the product's fuzzer), `../after-stage-5a.sh` (six property runs a tree, alternated, then the suites),
`../other-names.mts` (three trees at once). 4 cores. Synthetic letters only.

**Every count equals W75's stage-4 report, file for file** (`cmp` against `../../stage-4/measure/`): generated-set-40
and -34 (`.out`, `.exit`; the summaries differ only in two `slowestMsB` fields), fuzz 301 to 303, fuzz-changed 301
to 303, fuzz-product base/head and s3/head (and the six changed letters' jsonl byte for byte), a4 base/head and
s3/head, other-names on all three trees, units on both trees (the two budget rows 403,548,210 and 414,023,090 sent on
both). The gate report differs only in its paths, its run times and its timing table.

| gate | result (equal to W75's unless marked) |
| --- | --- |
| Item 40's generated set (51,833) | failures 0 in every family; PHI classes none; errors 0/0 |
| Item 34's generated set (14,356) | differ 0, failures 0 |
| Full uncached gate, 4 workers | 975,489 letters, same 975,489, differ 0, refused 463,002 on both, errors 0/0, spanMismatch 0; PHI, KEEP, UNPLACED and reverse classes none. **Differs (time only):** max A 1,024 ms, B 931 ms (W75: 1,141 and 1,178); corpus run 680 s (W75: 859 s) |
| Budget rows | 403,548,210 and 414,023,090, sent, on both trees |
| Fuzzed 60,000 (seeds 301 to 303) | base-refused, head-sent 0 in all three; stage 3 against head all the same |
| Product fuzzer 60,000 (seeds 401 to 403) | base/head: base-refused head-sent 0, newly refused 1,731, both sent different 6; s3/head: newly refused 0, newly sent 0, the same 6 letters byte for byte |
| a4 (64 names, 558 texts) | 0 texts changed, 0 new spans, base/head and s3/head |
| Ruling (A), 40 names (453,888 letters a tree) | clear 201,728 base and s3, 176,448 head, refused 0 |
| **Differs (time only):** reader over 20,000 letters, two runs a tree | base 1.0959 and 1.0747 ms per letter, head 1.0530 and 1.0586 (W75: base 1.3665 and 1.3716, head 1.4104 and 1.3356); refused 6,997 on each |
| **Differs (time only):** the 100-letter property, six runs a tree, alternated | base 3,268 to 3,504 ms (mean 3,353), head 3,341 to 3,452 (mean 3,393): **the head's slowest is 52 ms under the base's slowest** (W75: base 3,987 to 4,243, head 3,903 to 4,244) |
| Unit suites on the merged head | redact 54, packets 1,825, synth 192 passed; model-gateway 6,050 passed, 34 skipped, the two `.db.test.ts` files not run for want of DATABASE_URL (as W75 and the base) |

**The bar of design-note section 3:** passed on every line. Unexplained differences: none (every difference is a wall
time, on a quieter or faster machine than W75's; the head and base move together).
