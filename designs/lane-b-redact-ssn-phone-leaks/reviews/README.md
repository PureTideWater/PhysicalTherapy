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
- `g1/`: the PHI review of that delta, which ran to its report: G1-1 (blocking: a number's own first digits taken for a
  list number, so letters the base refuses were sent; the fuzzers' run on 8e599038 had shown the same 22 letters,
  `fuzzer-flips-at-8e599038.txt`), G1-2 to G1-5 and five lines of residuals (`findings.mts` holds every letter, `mech.mts`
  puts one line of the delta back at a time, `gen.mts` is its generator by mode). Each was run first and fixed in d3657ba2
  and a66fee45; `rows-at-a66fee45.txt` reads its letters on the head, on 8e599038 and on the base.
- `g2/`: the must-stay review of the same delta, which ran to its report: G2-1 to G2-3 (major: a month's word after a
  space read as a date glued to a number; a row's bars and a file name's underscores read as a date's joiners; a label
  two line breaks above its number no longer naming it), G2-4 to G2-7 and one measured cost in a recorded family
  (`a.mts` to `f.mts`, `findings.jsonl`, `findings2.jsonl`; `c.mts` measures the rates). Fixed in d3657ba2 and a66fee45
  (`rows-at-a66fee45.txt`).
- `brief-h1.md`, `brief-h2.md`, `recorded-for-the-fifth-review.md`: the briefs and the recorded list given to the two
  reviewers of the delta 8e599038 to a66fee45 (H1 PHI, H2 must-stay).
- `h1/`: the PHI review of that delta, which ran to its report. The claim that the scan keeps the base's reading held (no
  line from the audit copy over 206,772 letters). H1-1: a letter that writes the checks' own U+0002 beside a word that
  touches a digit is refused by the base and was sent since review B1-4's fix (not from this round). H1-2 to H1-5: four
  give-backs of the round wider than its record said (`verify1.txt` to `verify3.txt`, `hand.txt` hold its letters;
  `fam.mts` sweeps the four families, `gen.mts`, `enum.mts` and `tight.mts` are its generators). Fixed in 24ad1075
  (`rows-at-24ad1075.txt`); its five lines of residuals are recorded.
- `h2/`: the must-stay review of the same delta, which ran to its report: H2-1 to H2-8 (`letters.txt` holds the letters
  of its report as the builder re-ran them; `m.mts`, `r.mts`, `s.mts`, `a.mts`, `t.mts` are its layouts, rates and
  timing; `build.mjs` makes its probe copies of the head). H2-3, H2-4, H2-6 and H2-7 were new in the round and are fixed
  in 24ad1075 with H2-1 and H2-8; H2-2 (a header row over its rows) and H2-5 are recorded costs (`rows-at-24ad1075.txt`).
- `brief-i1.md`, `brief-i2.md`, `recorded-for-the-sixth-review.md`: the briefs and the recorded list given to the two
  reviewers of the delta a66fee45 to 24ad1075 (I1 PHI, I2 must-stay).
- `i1/`: the PHI review of that delta, which ran to its report: no letter the base or the tree before refused or redacted
  is sent outside the recorded give-backs (89,106 and 31,050 generated letters, the audit copy silent). I1-1, not a
  leak: the check did not return on a long rule of underscores or box lines between a noun and a number (the round had
  put a repeated run inside a repeated group). Five lines of residuals (`hand1.txt` to `hand3.txt`; `glue.mts`,
  `glue2.mts`, `ivshapes.mts`, `marks.mts`, `marks2.mts`, `fam.mts` are its generators, `redos*.mts` its timings).
- `i2/`: the must-stay review of the same delta, which ran to its report: I2-1 (the same backtracking, measured: times
  1.47 for each character of the rule), I2-2 (a `#` or a colon alone under a label, a table's alignment row), I2-3 (the
  month's word after a bare run read one way and after a shape another), I2-4 to I2-6 (`letters.txt` holds the letters
  of both reports as the builder re-ran them; `main.mts`, `forms.mts`, `a1.mts`, `time.mts`, `trig.mts`, `eq.mts`).
  Fixed in f2f9f05e (`rows-at-f2f9f05e.txt`), with one letter the gate's replay showed (a Medicare number written with
  a point).
- `brief-j.md`, `recorded-for-the-seventh-review.md`: the brief and the recorded list given to the one reviewer of the
  delta 24ad1075 to f2f9f05e (105 diff lines; one reviewer with three lenses: what is sent, what must stay, logic and time).
- `j/`: that review, which ran to its report: no blocking finding in about 33,400 letters, five major. J-1 (the guard
  after a spaced year also turned away a real year before a comma), J-2 (a stray mark or an empty table row as the
  middle line of a three-line label), J-3 (one CR LF read as a blank line, so a label that held one named nothing),
  J-4 (an indented number or a padded cell under a ruled label), J-5 (a table's corner "+" read two ways: exponential
  again). `findings.jsonl` holds its letters, `rows-at-f2f9f05e.txt` their outcomes as the builder re-ran them;
  `probe*.mts`, `fuzz.mts`, `fuzz3.mts` and `time.mts` are its probes, generators and timing. The label-over-number
  layouts had now failed a review four rounds running, so 74c32149 withdraws that reading for one rule (one line break
  at most inside a label and one at most before the number) and records what that refuses (`rows-at-74c32149.txt`).
- `brief-k.md`, `recorded-for-the-eighth-review.md`: the brief and the recorded list given to the one reviewer of the
  delta f2f9f05e to 74c32149 (130 diff lines, most of them removals).
