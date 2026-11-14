# Queues item 42: a visible character inside a stored identifier, and a surname glued to a word (DRAFT, PAUSED)

**DRAFT. Paused 2026-11-14 about 01:30 UTC by the orchestrator, on the co-founder's word. Not a ruling document yet.**

## RESUME-BLOCK

- **Base:** `claude/build-platform` 6299c550 (item 40 merged). Reader laid byte for byte outside `packages/`
  (`scripts/lay42.sh`; hashes in `measure/trees.sha256`). No product file touched, no PR. Synthetic data only.
- **Measured and in `measure/`:**
  - `generated-set-42.manifest.json`: the generated set, 64,508 letters, 15,745 synthetic patients (mechanism 1 by
    kind and class, by representatives and swept; mechanism 2 by side, neighbour class and case; 2,192 real-shaped
    letters).
  - `census-g42.md`, `census-gate.md`, `census-g40.md`: one pass of the candidate finders (`scripts/rules42.ts`) on the
    base's reader over set 42, the gate's 975,489 letters and set 40: what the base sends, what each candidate and
    floor newly finds, and each finder's time.
  - `false-finds.md`: digit strings a real-shaped letter spells for a stored number, by length; name words in
    ordinary text, by length.
- **Was running when paused (stopped, nothing kept from them):** set 42 through the gate's worker, base against the
  two widest trees (`R`: refuse on 1 or 2 inserted and on any glued name word; `P`: replace in place on 1 or 2
  inserted and on the case-aware glued match). The gate itself on `R` and `P` had not started.
- **Not done:** the bar on the gate for any candidate (no PHI class, refusals, the slowest letter); the per-form
  table of what the base sends on set 42 by the gate's own path; set 40's census reads zero hits on every rule and
  has not been examined (it may be right: its forms are unseen characters and number characters, not these); the
  sections below are first readings, not reviewed; the questions for a ruling are not final.
- **Next step, exactly:** `scripts/lay42.sh <root>` with the `R` and `P` rules of `measure/trees.sha256`'s run, then
  `scripts/measure42.sh <root> run42 gate` (`TREES="R P"`), then write `scripts/summarize-run42.mjs` (named in
  `measure42.sh`, not written yet), finish sections 3 to 5 and the questions.

## 1. What the base sends (first reading)

Set 42, mechanism 1, letters where the identifier is written with an inserted character and the base neither
refuses the letter nor hides it (`census-g42.md`, "marked" columns):

- A member ID or claim number of digits: sent for every class tried (letter, punctuation, symbol, currency,
  emoji). A combining mark is read through today (`7654́3210` is hidden). About 13,400 of 15,900 swept and
  representative letters sent with one inserted character.
- A Social Security number and a phone number: sent for every class (2,151 and 1,989 letters with one inserted
  character). The base refuses 196 of the phone letters for other reasons.
- A date of birth, numeric or in words: sent (834 letters with one inserted character).
- A name: punctuation, symbols, currency, marks and emoji inside it are already read (11,133 hidden); a letter or a
  digit inside it is sent (`ZephXyra`, `Zeph2yra`: 4,505 letters).

Mechanism 2 (`census-g42.md`, `census-gate.md`): a name word of four letters or more glued to a letter before it is
sent whatever the case on either side; glued to a digit before it the letter is refused today; punctuation, a
symbol, a currency sign or an emoji before it is a boundary and the name is hidden. On the gate's 975,489 letters
the base sends a glued name word of four letters or more in about 103,400 letters it does not refuse
(`MsZephyra`, `DrJane`, `JaneZephyra`, `PAIDJane`, `ZEPHYRAJane`); the sample read by eye held only true names.

## 2. Candidates and what each costs (first reading; the gate's bar not yet run)

**Inserted characters (1 or 2 taken out), stored numbers, names and dates of birth; Social Security and phone
numbers by taking the characters out and reading again.**

- Closes on set 42: 23,611 letters at one inserted character, 25,379 at one or two (floor 5).
- False finds, real-shaped (2,192 letters, each named in `census-g42.md` and the samples): 10 letters at one
  inserted, 16 at one or two, all of them rows built so that the letter's own digits spell the stored number
  (`97110 (4` for 971104, `$153.90` for 15390, `09/14/2026` for 09142026, `$1,140.00` for 114000). No drawn number
  of 4 to 11 digits was found on any body.
- A drawn number refused on a real-shaped letter (`false-finds.md`): about 3 in 100,000 letters at 5 digits, 5 in a
  million at 6, 1 in 100 million at 8, when any character may be the inserted one. Leaving `. , / :` out of the
  inserted set (an amount's and a date's own punctuation) cuts each by about ten.
- Names, a letter inserted: no false find at 5 letters or more with one inserted, on the bodies or on 4.3 million
  characters of prose (one name, BANKS in "blanks"). At 4 letters and under it finds ordinary words (BOND in
  "bound", CASE in "cause", PAT in "part"). With two inserted, 5-letter names find words too (JONES in "joiners",
  CROSS in "crosses").
- The gate: 731 letters newly found at one inserted, 1,704 at one or two, nearly all by the Social Security and
  phone reading on adversarial digit runs (`747.17–$02.54` read as a phone number once `–$` is out). Refusing costs
  those letters; replacing would damage amounts there. Zero such finds on the real-shaped letters.

**Glued name words.**

- Refuse on any glued name word: closes every glued form, and refuses real-shaped letters for a patient whose name
  is an ordinary word's part: at floor 4, 75 of 2,192 (BILL in "billed", UNIT in "units", VISIT in "visits", ROSS in
  "BlueCross"); at floor 6, 12 (SHIELD, SPRING, CHOICE, HEALTH, SERVICE, BENEFIT).
- Case-aware (an all-capitals or capitalised name word right after a lower-case letter, a boundary after it):
  closes `fullZEPHYRA`, `MsZephyra`, `JaneZephyra`; leaves `PAIDJane`, `ZEPHYRApaid`, `fullzephyra`. Real-shaped
  finds, each named: a payer's camel-case name holding the patient's surname (CROSS and SHIELD in BlueCross
  BlueShield, WEST in TriWest, POINT in WellPoint, STAR in MedStar, SMART in HealthSmart, FIRST in HealthFirst and
  CareFirst, CALL in OneCall, LINK in HomeLink, RISK in MedRisk, SPRING in HealthSpring, CHOICE in BlueChoice): 13 of
  2,192 letters. No find under 4 letters.

**Time (the finders alone, on the base's letters):** stored identifiers 0.03 to 0.04 ms a letter (slowest 30 ms);
glued 0.01 ms (slowest 27 ms); the base's reader 2.5 ms a letter on the gate, 8.4 ms on set 42. The prototype's
Social Security and phone reading re-runs the whole reader (0.9 ms a letter on the gate, 6 ms on set 42, slowest
337 ms): a build would read inside the reader, under the work budget, not this way.

## 3. Questions for a ruling

Not final. To be written after the gate's bar is run.
