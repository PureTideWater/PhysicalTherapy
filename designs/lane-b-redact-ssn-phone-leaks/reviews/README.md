# Reproductions of the build reviews (co-001/redact-ssn-phone-leaks; synthetic only)

Each folder holds one adversarial review's reproduction script as its reviewer wrote it (`repro.mts`, with `lib.mts`): every
finding's letters, run on the base (ef3e8d20), sometimes on the build before the fix round (aea2852d), and on the head.
The scripts carry the absolute paths of the session that wrote them (`/home/user/tree-ef3`, `/home/user/leaks` or
`/home/user/fix`, `/home/user/work/b1fix/lib.mts`): set them to two checkouts before a run, and run with
`node --import <gate folder>/ts-resolve.mjs repro.mts`.

- `b1/`: the build's PHI review (B1-1 to B1-13), on aea2852d.
- `b2/`: the build's must-stay review (B2-1 to B2-9), on aea2852d.
- `c1/`: the fix round's PHI review (C1-1 to C1-4), on a64cc9af. **The usage limit cut this reviewer off before it wrote a
  report, so it does not count as a review**; its reproductions and its triage file (`triage-at-a64cc9af.txt`) were read
  and every row re-run by the builder, and fixed in f0d6e914 (`repro-at-f0d6e914.txt`). `gen.mts`, `fz2.mts`, `cls.mts`
  and `corpus2.mts` are its letter generator, its base-against-head fuzzer, its classifier and its corpus scan.
- `c2/`: the fix round's must-stay review (C2-1 to C2-8), on a64cc9af. **Cut off by the usage limit before its report
  too, so no review either**; its reproductions (`repro-at-a64cc9af.txt`) and its rate measurement (`rate.mts`,
  `rate-at-a64cc9af.txt`) were read and every row re-run by the builder, and fixed in 0c0975a6 to 0ddfa078
  (`repro-at-19454724.txt`: 7 of 102 rows still differ from the base, the recorded costs C2-7 and C2-8's member IDs).
- `c1/withheld.mts`: over `c1/gen.mts`'s letters, a letter whose sent text differs from `redactLetter`'s (a match left as
  written) and that the check does not refuse. It must print `SENT_WITHHELD 0`.
- `d1/`: the PHI review of the fix round's delta (aea2852d to 0ddfa078), which ran to its report: one finding, D1-1 (an
  initial read only beside a name written with a new joiner stood as a settled match; `probe4.mts`), and a note on
  `redactLetter` (`probe2.mts`). `fz.mts`, `fz3.mts` and `canary.mts` are its fuzzers over `gen2.mts` and `gen3.mts`, and
  the `.txt` files their summaries on 0ddfa078. They read `/home/user/review-d1/d1/inst/redact.ts`, a copy of the head with
  one line appended: `export const __t = { unbracketed, letterSubject, matchesIn, unmarked, written, merge, chainLeft,
  masked, survivorLeft };`. Fixed in cf5094a0.
- `d2/`: the must-stay review of the same delta, which ran to its report: D2-1 to D2-7 (`probe1.mts` to `probe4.mts`;
  `probe3.mts` and `probe4.mts` read the generator `gen.mts` kept in `b2/`'s folder of the session, `/home/user/work/d2p6`).
  Fixed in cf5094a0 but what is recorded as a cost (`recorded-for-the-third-review.md`).
- `recorded-for-the-third-review.md`: what the round after D1 and D2 gives back, adds and leaves, as the reviewers of
  its delta were given it.
- `e1/`: the PHI review of the next delta (0ddfa078 to 5d685267; brief `brief-e1.md`), which ran to its report: E1-1 to
  E1-8 (`h.mts`, `h2.mts`, `h3.mts`; `findings.txt` holds every letter it reported, one JSON string a line). Each was run
  first and fixed in 8e599038; `rows-at-8e599038.txt` reads them there on the head, on 91e1527a and on the base (15 of 94
  are sent unchanged: its controls and the numbers a listed noun names).
- `e2/`: the must-stay review of the same delta (brief `brief-e2.md`), which ran to its report: E2-1 to E2-6 (`run.mts`,
  `exp2.mts`, `exp3.mts` with `lib.mts`; `time.mts` its timing; `cmp1.jsonl`, `cmp2.jsonl` its letters). E2-1 (a label's
  list number counted as a digit of the number the label names) was a fault; E2-1 to E2-5 are fixed in 8e599038
  (`rows-at-8e599038.txt`); E2-6 is a held-letter cost the amendment records.
- `brief-g1.md`, `brief-g2.md`, `recorded-for-the-fourth-review.md`: the briefs and the recorded list given to the two
  reviewers of the delta 91e1527a to 8e599038 (G1 PHI, G2 must-stay).
