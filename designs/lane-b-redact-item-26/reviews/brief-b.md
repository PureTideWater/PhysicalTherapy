# Review B (must-stay, time, and the other-patient screen)

Read `brief-common.md` beside this file first. Your folder: `/home/user/ops/designs/lane-b-redact-item-26/reviews/b/`.
Your report: `/home/user/ops/designs/lane-b-redact-item-26/reviews/review-b.md`.

Scope: what the head refuses or replaces that the base did not; time; and what the screen is offered.

1. **New refusals.** The design says the name rule and the stored-separator rule only redact and never refuse by
   themselves, and that a CR LF letter is refused exactly where its writing with LF is. Find synthetic letters the base
   sends and the head refuses, and say why for each family (a wider match left in the text the check reads; a CR LF
   letter; something else). Any family that is not one of those two stated costs is a finding. Ordinary denial-letter
   prose is in `/home/user/PhysicalTherapy/fixtures/synthetic` (`.txt`, `.md`) and in the gate's corpus
   (`/home/user/gate/corpus/shard-*.jsonl.gz`, about 975,000 synthetic letters with their patients: read
   `/home/user/gate/README.md` at the lines that describe the record's fields, and sample a few thousand).
2. **New redactions.** For patients whose names' letters are ordinary words apart (INA: "in a", ASA, ISA, TOBE, IDA,
   THEO, BEA, and others you find: ANA, ALA, ADA, NOA, IVA, ONA, MYA ...), measure how many places in ordinary prose
   the head replaces that the base kept, and whether the design's table understates it (its script:
   `/home/user/ops/designs/lane-b-redact-item-26/scripts/cost-names.mts`). Look for a replacement that damages what a
   reader of the letter needs (an amount, a date, a deadline, a code) rather than two words. A stored number with a
   separator: what else does `1234.56` or `ZZ12345/01` now replace (amounts, dates, units)?
3. **Time.** Crafted letters up to 100,000 characters against a budget of 3 seconds for `redactLetterForScreen` plus
   `holdsIdentifier`: the wider patterns (a space or period between every two letters of a part), many wider matches,
   initials beside wider names, CR LF letters (read twice), a patient with many names and a call with many claims and
   stored separators, look-alike text (the wider reading reads the look-alike fold too). Report any letter where the
   head takes more than 1.5 times the base's time on the same letter, or grows faster than its length.
4. **The screen.** For letters both send: every candidate the base offers must be offered by the head; and no
   candidate the head adds may be one of the call's own member IDs or claim numbers (compact form).
