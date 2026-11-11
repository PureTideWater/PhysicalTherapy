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
