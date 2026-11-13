# Queues item 40, stage 5b: the measurement of fix round 1 (2026-11-13, about 20:35 to 21:20 UTC)

Script: `../measure-stage-5b.sh` (stage 5a's, with the middle tree read at 61600c7c, stage 5a's head, so `changed` and
`product` show what the fix round changes). Trees (`trees.sha256`): the base 4d40557f, stage 5a's head 61600c7c ("s3"
in the layout), the head ae0b6a3f (fix round 1). Fix round 2 (1a7c5270) changes no code line of the reader (a comment
only) and adds one test row. Steps: lay gen40 gen34 units fuzz changed product gate. 4 cores; Lane B's two delta reviews
and their skeptics ran beside the gate, so its times are on a busier machine. Synthetic letters only.

**Every count equals stage 5a's** (`cmp` against `../../stage-5a/measure/`): generated-set-40 and -34 (`.out`, `.exit`;
the summaries differ only in the head's tree hash and one `slowestMsB`), units base and head (the two budget rows
403,548,210 and 414,023,090, sent, on both), fuzz 301 to 303, the product fuzzer base/head. The gate report differs
only in its paths, run times and timing table.

| gate | result |
| --- | --- |
| Item 40's generated set (51,833) | failures 0 in every family; PHI classes none (equal to 5a) |
| Item 34's generated set (14,356) | differ 0, failures 0 (equal to 5a) |
| Full uncached gate, 4 workers | 975,489 letters, differ 0, refused 463,002 on both, errors 0/0, spanMismatch 0; PHI, KEEP, UNPLACED and reverse classes none. **Differs (time only):** max A 1,349 ms, B 1,287 ms (5a: 1,024 and 931), of 3,000; corpus run 1,022 s (5a: 680 s), on a busier machine |
| Budget rows | 403,548,210 and 414,023,090, sent, on both trees (equal to 5a) |
| Fuzzed 60,000 (seeds 301 to 303) | base-refused, head-sent 0 in all three (equal to 5a); 5a's head against this head: 60,000 the same, newly refused 0, newly sent 0 |
| Product fuzzer 60,000 (401 to 403) | base/head equal to 5a (base-refused head-sent 0, newly refused 1,731, both sent different 6); 5a's head against this head: 0 differ |

**The bar:** base-refused head-sent 0 (gate, both fuzzers, both sets); real-shaped newly refused 0 in the gate and the
sets, and the one real-shaped cost the delta reviews found is named (C-1: a claim letter with one footnote mark and
CR LF refused on cost from about 63,400 characters, pinned at 64,000; ADR 0054's cost 6); nothing else differs from 5a
but wall times. **Passed.**
