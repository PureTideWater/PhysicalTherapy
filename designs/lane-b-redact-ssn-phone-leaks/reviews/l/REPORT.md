# Review L: the withheld-match condition in `matchesIn` (74c32149 -> ac412151)

The reviewer's report as its last message (2026-11-11; 15 tool calls), saved here by W13: the reviewer's own file write was
refused by its harness. Look-alike characters are written `<U+XXXX>` in this copy. Scripts, case files and outputs are beside
this file (synthetic twins only). W13's verification of each finding is in `VERIFIED.md`.

No BLOCKING finding. Two MAJOR findings as the brief defines them (L-1 under (d), L-2 under "must stay"), both the existing
one-identifier behaviour reaching the patient whose one identifier ends or begins another. Five MINOR lines.

All letters are synthetic twins. Patient unless stated: names `["JANE Q ZEPHYRA"]`, date of birth `1980-03-14`. Run with
`export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"`.

By reading: the delta changes only `appliedMatches` (the letter reader). `holdsIdentifier` counts `matchesIn(...).length`,
withheld or not, and `redactLetter` / `redactionSpans` merge every match, so neither moves.

## Findings

### L-1  MAJOR (d): a seven-digit number written right after the run is no longer among `candidates`

1. Letter `"Member ID: ZZ1980O314\n555-0123\nPaid in full."`, member IDs `["ZZ19800314","800314"]`, claims `[["SYNCLAIM0001"]]`
   - base: sent `"Member ID: ZZ1980O[PHONE]\nPaid in full."`, `5550123` offered
   - before: REFUSED, `5550123` offered
   - head: sent `"Member ID: [MEMBER_ID]\nPaid in full."`, candidates `["3145550123","3145550123PAID","ZZ1980O3145550123","ZZ1980O3145550123PAID"]`; `5550123` not offered
2. Letter `"Claim SYN445S667\n555-0123"`, member IDs `["ZZ7654321"]`, claims `[["SYN4455667","4455667"]]`
   - base: sent `"Claim SYN445S[PHONE]"`, offered
   - before: REFUSED, offered
   - head: sent `"Claim [CLAIM_1]"`, candidates `["6675550123","SYN445S6675550123"]`; not offered
3. Letter `"7654E210 555-0123"`, member IDs `["7654321","76543210"]`, claims `[["SYNCLAIM0001"]]`
   - base: sent `"7654E[PHONE]"`, offered
   - before: REFUSED, offered
   - head: sent `"[MEMBER_ID]"`, candidates `["2105550123","7654E2105550123"]`; not offered

Head branch on all three: `all` (fresh covering match, non-strict `chainLeft` false).

Mechanism: `matchesIn` no longer withholds the phone pattern that begins in the run's last three plain digits
(`314\n555-0123`), and `merge` joins it with the member ID's match into one span whose placeholder is `[MEMBER_ID]`.
`redactLetterForScreen` builds `screenText` by leaving out only the spans whose placeholder is `[SSN]` or `[PHONE]`, so the
merged span hides the number from `identifierCandidates(screenText)`, and `match.compacts` holds only the pattern's reading
with the identifier's own digits in front (`3145550123`), never the seven digits as written. The base offers it because its
span there is `[PHONE]` and is left as written for the screen. The function's own comment ("the letter with only the call's
own identifiers replaced (the Social Security and phone numbers left as written)") does not hold for a merged span.

The number itself is hidden in what is sent. For a patient with ONE identifier, "before" and head already give this same
outcome (letter 1 with member IDs `["ZZ19800314"]`: both sent, `5550123` not offered); the delta carries it to the patient
whose identifier ends another, where "before" refused the letter and offered the number.

Rate: 900 of 7,200 letters of the family (`families.mts`, first block: 4 patients x 3 writings x 4 leads x 10 gaps x 5
writings of `555-0123` x 3 ends) are base sent/offered, before refused/offered, head sent/not offered; none the other way.
In `steal.mts` (seed 3), 47 of the 100 letters where head and before differ. Only seven-digit numbers: no nine-, ten- or
eleven-digit number was dropped (`steal.mts`: 29 offered by head, 8 offered by no tree).

Reproduce: `node probe.mts cases3.json`, `node families.mts`, `node steal.mts 3 110 35`.

### L-2  MAJOR (must stay), narrow: letters the base sends and "before" sent are refused

1. Letter `"Tel. 345-62\n03l41980 Seen 01/01/2020-150.00Paid"`, member IDs `["ZZ19800314","800314","03141980","141980"]`
   - base: sent `"Tel. [PHONE]l41980 Seen 01/01/2020-150.00Paid"`
   - before: sent `"Tel. 345-62\n[MEMBER_ID] Seen 01/01/2020-150.00Paid"`
   - head: REFUSED (its text `"Tel. [MEMBER_ID] Seen 01/01/2020-150.00Paid"`)
2. Letter `"SSN 1: 255-7654E210 Zephyra\nLine 3. 76<U+096B>4<U+06F3>213-45 6202 Paid"`, member IDs `["7654321","76543210"]`
   - base: sent `"SSN 1: 255-7654E210 [PATIENT_NAME]\nLine 3. 76<U+096B>4<U+06F3>213-45 6202 Paid"`
   - before: sent `"SSN 1: 255-[MEMBER_ID] [PATIENT_NAME]\nLine 3. 76<U+096B>4<U+06F3>213-45 6202 Paid"`
   - head: REFUSED (its text `"SSN 1: [MEMBER_ID] [PATIENT_NAME]\nLine 3. 76<U+096B>4<U+06F3>213-45 6202 Paid"`)

Claims `[["SYNCLAIM0001"]]`. Head branch on both: `all`.

Mechanism: a pattern that begins LEFT of the covered run and ends inside it (`345-62\n03`, `255-7654`) is no longer withheld
in `matchesIn`; `merge` joins it with the fresh member-ID match, so the label now stands directly against `[MEMBER_ID]`, and
`holdsIdentifier` refuses that text (a phone label against the call's own placeholder in a held letter; an SSN list label
read through the placeholder to the next line's number). Each line of the second letter alone is sent by all three trees.
For a patient with ONE identifier "before" already refuses both letters, and `"Tel. 03141980 Seen 01/01/2020-150.00Paid"`
(member IDs `["03141980"]`) is refused by "before" and head and sent by the base. This is outside the recorded cost, which
hides a number and refuses nothing.

Rate: 32 of 4,480 letters of the family (`families.mts`, second block; 0.7%, or 32 of the 1,344 that differ from "before");
the six printed all carry a `Tel.`, `Phone` or `Fax` label and the held ending. In the fuzzers: 2 of 1,848 differing letters
(`diff-l2.mts` seed 7), 0 of 1,682 (seed 11), 0 of 129 (`diff-l.mts` seed 1), 0 of 100 (`steal.mts`). It needs a look-alike
writing of the identifier with pattern-shaped digits right before it under a label, so whether that is "ordinary" content is
yours to judge.

Reproduce: `node probe.mts cases1.json`, `node families.mts`.

### MINOR
- Comment in `matchesIn` ("that match's placeholder replaces it") is not what `appliedMatches` does on its settled branch
  when the covering match is fresh: the pattern's placeholder is cut into the run and the covering match dropped. No effect:
  all 2,410 such letters were refused.
- `const own = [...found]` copies a list that does not change before its one use.
- Where the un-withheld pattern joins an own match the span takes the own placeholder: `"Tel. 445<U+06F5>66712\n5YN<U+0421>LA1M0001
  900-12-3456"` (five claims `SYNCLAIM0001`, `0001`, `4455667`, `667`, `SYNCLAIM`; member IDs `["ZZ7654321"]`) is `"Tel.
  [SSN]\n[CLAIM_1] [SSN]"` before and `"Tel. [CLAIM_1] [SSN]"` on head; the same characters are hidden.
- Beside this rule, same on all three trees: an own member ID with one letter glued before it is sent in clear (`"Fax
  X7654321 ext 12"`, IDs `["ZZ7654321","7654321"]`; `"Fax X76543210 ext 12"`, IDs `["76543210"]`). It shows through the
  delta once: `"Fax 555\n0123 #7654E210/X76543210 ext 12"` (IDs `["7654321","76543210"]`) was refused by "before" for the
  withheld phone match and is now sent as `"Fax [MEMBER_ID]/X76543210 ext 12"`; the base sends `"Fax
  [PHONE]E210/X76543210 ext 12"`. I did not rate it blocking because no tree's rules read that writing; you may judge
  otherwise.
- Beside this rule, same on all three trees: `ZEPHYR4` is not read as the name (`"Re: ZEPHYR4\n01-02-2020"`, names `["JANE
  Q ZEPHYRA","HYRA"]`, sent as `"Re: ZEPHYR[SSN]"`).

## Ran, nothing found

Flags checked on every letter where head and "before" differ: base refuses and head sends; head shows a letter or digit the
base's redaction replaced (by position); head shows what "before" hid; head sent with text unlike `redactLetter`'s; settled
branch taken and letter sent; non-strict `chainLeft` true with strict false or `holdsIdentifier` false. All zero in every
run below.

- **`diff-l.mts 1 100`**: random letters over 10 patients (the defect's; `ZZ7654321`+`654321`; `SYNMEMBER0042`+`0042`+
  `MEMBER0042`; claims ending another, as one claim and as separate claims; names ending another; `7654321`+`76543210`;
  member IDs ending the date of birth's digits; a plain ID that holds another in a crossed form; three nested IDs).
  Look-alike writings: four scripts' digits, U+A6EF, letters for digits, digits for letters, Greek and Cyrillic letters,
  pieces with joiners. Also labels, gaps, tails, ends, a second run nothing covers, two identifiers in one token. 90,140
  generated, 2,797 with a pattern over an own match, 129 differ from before. No flag.
- **`diff-l2.mts 7 150` and `diff-l2.mts 11 135`**: the same patients, aimed: a pattern that begins in the run's last plain
  digits, one that begins left and ends in its first digits, one that spans two runs (second covered or not), 21 formats.
  118,651 + 110,996 generated, 6,837 + 6,289 reached, 1,848 + 1,682 differ. No blocking flag; L-1 and L-2 come from here.
- **(a), inside the three runs above**: the settled branch of `appliedMatches` (fresh match, non-strict `chainLeft` true on
  the settled text). 3,912 letters, 2,410 of them with `[SSN]` or `[PHONE]` cut into a token. All refused; strict true on
  each.
- **`steal.mts 3 110 35`, phase 1**: a true number (25 writings of `900-12-3456`, `202-555-0123`, `555-0123`) or another own
  identifier right before or after a covered run, 18 gaps. 160,090 generated, 510 reached, 100 differ. No digit of the
  number shown by head where before refused or hid it; L-1 again.
- **`steal.mts`, phase 2**: texts with a placeholder cut into a look-alike run, held and not. 43,449 texts, 17,258 with
  non-strict true; strict true and `holdsIdentifier` true on all of them.
- **`families.mts`, third block, (b)**: one pattern over two runs, one covered and one not. 24,000 letters, 141 with a
  match still withheld on head: all 141 refused; no letter with one match withheld and another applied; no flag.
- **`families.mts`, fourth block**: names ending another (`VANTREE`+`TREE`, `ZEPHYRA`+`HYRA`, a hyphenated name) with
  digits for letters, numbers after and before. 18,720 letters; head equals before on every one.
- **Sanity, inside the fuzzers**: 7,589 letters with no pattern over an own match; head equals before on every one.
- **`perf.mts`**: 250 to 2,000 look-alike tokens in four mixes (covered, uncovered, with plain IDs and names, half and
  half). Linear; head/before 0.66 to 1.20 overall, 0.67 to 1.16 at 2,000 tokens. No exception in any run.

Counted, as recorded: letters "before" refused and head sends with the number hidden (86 + 1,166 + 1,038 + 82 across the
four fuzz runs), and letters where head hides what the base hid and "before" showed (the defect's family).

## Did not get to
- A date of birth in a written form, an initial, or a name with a middle dot as the covering match: the generators produced
  no letter where these changed the outcome, and I wrote no aimed family for them.
- Claim numbers written in pieces (`SYNCLAIM-OOO1`) as the covering match: only as random variants, not counted apart.
- The check's caches (`viewsOfCheck`, `datesOfCheck`) across `appliedMatches` and `holdsIdentifier`.
- The package's own test suite and `enum-author.mts` were not run.

Files: diff-l.mts, diff-l2.mts, steal.mts, families.mts, probe.mts, perf.mts; probe inputs cases1.json, cases2.json,
cases3.json; flagged letters from the fuzzers: out-diff-1.tsv, out-diff2-7.tsv, out-diff2-11.tsv, out-steal-3.tsv.
