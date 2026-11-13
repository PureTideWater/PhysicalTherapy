# Queues item 40 (letter redaction: R1-3, R1-4, ruling (A)'s initial): status

## RESUME-BLOCK (W70, 2026-11-13 about 09:35 UTC: THE MEASURED DESIGN NOTE IS WRITTEN; NOTHING IS BUILT; SIX QUESTIONS WAIT FOR A RULING)

- **The note:** `designs/lane-b-redact-item-40/design-note.md`. Scripts in `designs/lane-b-redact-item-40/scripts/`
  (`lay.sh <root>` then `measure.sh <root>`: about 22 minutes, everything below), counts in `measure/`. Base 17c234d2.
  No change under `packages/`, `apps/` or `fixtures/`; no branch, no PR.
- **The recommendation, in five lines.**
  1. R1-3: rule (a) asks for a letter or a number character that is no decimal digit beside the number
     (`[\p{L}\p{Nl}\p{No}]`): refuse. Base 3,780 rows clear of 953 characters in four forms; prototype 0.
  2. R1-4: where the text holds an unseen character (any `\p{C}` not default-ignorable, not white space, not the
     checks' marks: wider than the review's 62), the check reads it once more with each run as U+200B and refuses on
     either reading. Base 768 clear of 768 inside the number; prototype 0. The safer rule, refuse every such letter,
     is the fallback.
  3. (A): in the wider reading the period after a name that ends in a letter standing alone is that initial's:
     replace. Base 2,736 of 42,240 rows show a letter, and `Zephyr A.J.Q.` for JANE Q ZEPHYRA sends two initials;
     prototype 0.
  4. Measured for the three together against the base: the full uncached gate differ 0 of 975,489 (refused 463,002
     on both); item 34's generated set differ 0; base-refused, head-sent 0 of 60,000 fuzzed (438 newly refused); the
     rows 403,548,210 and 414,023,090 unchanged; time +1.5% to +3.6% on 20,000 letters, near the runs' spread.
  5. The gate holds almost none of these forms (94 letters, all refused already): what real letters with U+0085 line
     endings or C1 quotes cost is NOT measured, and stage 1's generated set is that measurement.
- **Open questions (each with the recommendation, in the note):** (1) R1-4 by one more reading, or refuse every letter
  that holds an unseen character: the reading; (2) the further reading for every identifier: yes; (3) a decimal digit
  NFKC makes beside the number (`①76543210`, 304 rows): stays the recorded longer-number residual; (4) (A) replace,
  refuse or leave: replace; (5) the further reading charged in full, budget not raised: yes; (6) the drafter's check
  takes R1-3 and R1-4, the verifier stays: yes.
- **Not established:** the note's section 4 (the further reading's charge in units; the redaction's own gates were
  not given the reading; lone surrogates; the product's suites were not run on the prototype).
- **Next stage (after the rulings):** stage 1, tests and item 40's generated set, no reader change, on
  `co-001/redact-item-40`: the exact rows are in the note's section 3.
