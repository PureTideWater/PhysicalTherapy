# The redact-range-glued differential gate

One command compares two checkouts' `packages/model-gateway/src` over a fixed corpus of synthetic letters and reports,
per class, what tree B sends or changes that tree A did not.

    run.sh <treeA> <treeB> <outdir> [--workers 4] [--limit N] [--no-cache] [--skip-timing] [--timing-only]

- A tree is a checkout root or a `packages/model-gateway/src` directory. Each tree's `redact.ts` is loaded by absolute
  path; nothing is written in either tree.
- Every letter goes through the real path of `denialLetterSpec.prepare`: `redactLetterForScreen`, then
  `holdsIdentifier` on the sent text (refused when it holds an identifier). `denial-letter.ts` is identical in
  cc3dd7f6, 6fc88092 and 3fcb9359; `prepare-check.mts` (run with tsx) confirms on a sample that this path equals
  `prepare` itself.
- Output: `<outdir>/report.md` (counts per class, up to 5 examples each, counts by source, timing table),
  `report.json`, and `hits/<class>.w<k>.jsonl` with every hit (letter, patient names, A and B outcome).
- Runs under `flock /tmp/laneb-heavy.lock`. With 4 workers a pair takes about 7.5 minutes cold (corpus about 6.5,
  timing about 1); outcomes are cached per tree (`cache/`, keyed by the sha256 of `redact.ts` and of the corpus: state
  and a hash of the sent text per letter), so with tree A cached (cc3dd7f6 is) a pair takes about 3.5 minutes, and a
  re-run of a pair about 1-4 (only the letters whose outcomes differ are redone). `--no-cache` ignores the cache;
  `--stride N` runs every Nth letter for a quick look; `--limit N` the first N per shard.
- `python3 -I analyze.py <outdir>...` prints signatures of the PHI and code hits that map them to the round-3 findings
  (PHI3-1/3-2 own identifier between label and number, glued or set apart; PHI3-3 label cut; PHI3-4 DOB glued digit to
  digit; GATEWAY3-1/3-2 codes, modifiers, units).
- `tests.sh <tree> <outdir>` runs the tree's three redaction test files and the property file under the three MOD-16
  CI seeds as fast-check's global seed, in a scratch mirror (`trees/mirror-<sha>`).

## Classes

A letter is classified only when the two trees' outcomes differ (refusal, or sent text). Secrets are the letter's SSNs,
phones and the call's own identifiers, located by the generator's metadata where it has it, else by `oracle.mts`
(below). Each tree's covered characters come from its own `redactionSpans` (checked equal to the sent text).

- `PHI.<kind>` (THE BAR, part 1): an occurrence of kind `ssn`, `phone`, `name` (a name part), `initial`, `dob`,
  `member` or `claim` that A refused or redacted and B sends with every letter and digit of it in clear; a letter
  counts once per kind. The note says how A protected it (`A refused`, `A redacted`, `A partly redacted`) and what the
  occurrence is glued to on each side (d digit, l lower-case, u upper-case, p punctuation, _ space or an end).
- `KEEP.changed.<class>` (THE BAR, part 2): both trees sent; a character B replaced and A did not, outside every
  secret occurrence, belongs to a token of that class: `code` (CPT, HCPCS, ICD-10, CARC/RARC, MA01-MA130, modifiers
  such as XU), `unit` ("15 min", "45min"), `amount`, `date`, `id` (NPI, TIN, ICN, ZIP, ZIP+4), `ref` (letters and
  digits: references, "Line1", "ALJ2"), `number` (other digits), `text` (letters of an ordinary word) or
  `short-name-part` (letters of a 1-3 letter part of the patient's name, glued, that the oracle does not read as the
  name: "$20jo", "Tel" for a part EL; not a listed must-stay class, an ambiguous boundary). Explicit keep tokens of the
  targeted generator take precedence over the token regexes, and codes and units are classed before short parts. The
  note says whether an SSN or phone word stands before 7+ digits in the letter.
- `KEEP.refused.must-stay.other`: B refuses a letter with no secret that A sent unchanged.
  `KEEP.refused.must-stay.after-ssn-phone-word`: the same where an SSN or phone word stands before 7 or more digits
  (the fail-safe class of review GATEWAY2-1, and the SEC fuzzers' letters of random 9xx SSNs the oracle cannot place).
  `KEEP.refused.letter-with-identifiers`: B refuses a letter A sent with every identifier redacted (a fail-safe
  refusal). A refusal by B of a letter A leaked from counts only as `REVERSE.PHI`.
- `UNPLACED.unrefused.after-ssn-phone-word` (part 1b): B sends a letter A refused that has 7+ digits after an SSN or
  phone word and no SSN or phone the oracle can place: a possible leak of a random-9xx SSN of the SEC fuzzers, or a
  fixed fail-safe refusal. Judge by the examples and the hits file.
- `REVERSE.*` (part 3): the same in the other direction (B fixes what A leaked, changed or refused). Information.
- `INFO.partial-in-clear.<kind>`: B sends some but not all letters or digits of an occurrence that A sent none of.
- Timing (part 4): every crafted 100 kB letter of `denial-letter.test.ts` (3fcb9359's rows, a superset of the earlier
  ones), the round-3 timing shapes (GATEWAY3-3: `timez`, `timer`, `timey`, `timex`) and 60 letters of the reviewers'
  timing harnesses (`corpus/timing-harvest.json`, 3 per harness), timed through the real path, one run per case and
  tree after a warm-up, against the 3 s budget.

Mapping a class to an ADR 0054 record is the judge's step: the report gives counts by source and the shortest distinct
examples; `hits/` has every letter.

## The oracle (`oracle.mts`), for letters without generator metadata

- SSN: a run of digits (joined by up to 3 of space, `.`, `,`, dashes, parentheses, `/`, `+`, soft hyphen, ZWSP) with
  `900` + 6 digits at a group start (or a leading 0 or 1 in the same group). Phone: `NPA 555 xxxx`, `555 xxx xxxx` or
  `555 xxxx` at a group start (synthetic twins only). Plus the digits each reviewer harness itself looked for in the
  output (captured during the harvest), placed by the letter's digits in order.
- Member ID, claim number: the compact value with one separator or invisible character allowed between characters.
- Date of birth: numeric (M/D/Y, D/M/Y, Y/M/D with 1-3 separators, two- or four-digit year, compact) and word forms
  (March / Mar. / ordinal day / "of").
- Name: a part of 4 or more letters anywhere (inside glued words too, accents and invisible characters ignored),
  except a month-word part used as a month in a date. A part of 1-3 letters or an initial only where a boundary is
  readable (not inside a lowercase word, never followed by a digit) and it stands beside another name occurrence,
  glued to one, after a name label (Dear, Ms, Patient, Re, ...), or (2-3 letters) beside another short part.

## The corpus (`gen/`, built once, fixed)

`gen/build-corpus.mts` writes `corpus/shard-0..7.jsonl.gz`, `patients.json` and `manifest.json` (counts per source and
the sha256 of every line). Deterministic: fixed seeds, fixed snapshots in `gen/snap/` (redact.ts and the property and
denial-letter tests of 3fcb9359 and cc3dd7f6), and the recorded harvest. Global dedupe by (patient, letter); the first
source in priority order keeps a letter; large harness sources are sampled by a hash of the letter.

1. `findings/*`: every input of `round3-findings.json` (PHI3-1..5, GATEWAY3-1..2) and the rows they cite (PHI2-1,
   PHI2-2, the MOD-16 counterexample), with their patients.
2. `T1/*`: PHI2-1/PHI2-2 glued shapes for every own-identifier kind: name parts (Title, UPPER, lower, camel, glued,
   "Last, First"), initials, 16 DOB forms, member IDs, claim numbers, glued before/after a digit, a letter, a range
   end and a placeholder, for JANE Q ZEPHYRA, AL Q ZEPHYRA, JANE MA, XU VANTREE, MAY ZEPHYRA, JUNE Q VANTREE,
   TY Q ZEPHYRA.
3. `T2/*`: SSN and phone labels (23) with the call's own identifier glued, camel-case or spaced between label and
   number, 13 SSN shapes and 13 phone shapes (one a nine-digit amount shape), for JANE Q ZEPHYRA, TY Q ZEPHYRA, SN VANTREE, AL ZEPHYRA, JANE MA.
4. `T3/*`: codes right after the patient's name and alone: CPT, HCPCS, ICD-10, CARC/RARC, all of MA01-MA130,
   modifiers (XU, GP, KX, 59, ...), units, amounts, dates, IDs, references, for 15 patients with short parts.
5. `T4/*`: the MOD-16 seed shape (a range glued to the next word between amounts), varied.
6. `T5/*`: the property tests' own generators (MOD-13 letterCase and gluedLetterCase, MOD-15 ssnPhoneCase, MOD-16
   keptSegment), from both snapshots, on fixed seeds including YEAR_BELOW_1900_SEED, LABEL_BOUNDARY_SEED and the three
   MOD-16 CI seeds (1034253323, 383403599, -1074798020) at 300 runs each.
7. `harness/*`: every letter the reviewers' and fixers' harnesses (rg-review-phi-1..3, rg-review-gateway-1..3,
   rg-fixer-1, -1b, -2, rg-sweep, rg-skeptic-phi, rg-skeptic-gateway) generate, recorded by running each harness with
   `gen/recorder.mts` standing in for every redact module (`gen/harvest-all.mts`; fs writes are no-ops there).
8. `data/*`: string literals in the reviewers' data files (hits lists, attack lists, findings), as letters of
   JANE Q ZEPHYRA.

Letters over 2,000 characters (the harnesses' timing letters) go to the timing set, not the corpus. Caps: round 3's
sweep1 and sweep2 whole, ownid3 70,000, other harness runs 20,000 / 6,000 / 3,000 by review round, data 40,000; MOD-13
and MOD-15 property letters are drawn sparingly (a new patient per letter costs 10-25 ms).

Rebuild: delete `corpus/` and run `run.sh` (or `node gen/harvest-all.mts` then `node gen/build-corpus.mts`, under the
lock). A rebuilt corpus has a new sha256 and invalidates `cache/`.
