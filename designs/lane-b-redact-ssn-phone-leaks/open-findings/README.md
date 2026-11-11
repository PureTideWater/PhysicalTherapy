# Open at the hand-over (74c32149, 2026-11-11): two findings, each with its reproduction

All letters are synthetic twins. Run every script with
`export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"`; the tree paths are at the
top of each (`../battery/README.md` says how to make them).

## 1. The withheld match (found by the battery on 74c32149; on every head since 91e1527a at least; NOT from round K)

**What happens.** `matchesIn` (`redact.ts`, the loop that ends the function) marks a Social Security or phone pattern
match `withheld` where it overlaps a run that holds one of the call's identifiers glued in a look-alike form
(`confusedGluedIn`), because the check then refuses that run whole and a placeholder inside it would hide the
identifier from the check. `appliedMatches` drops withheld matches. The assumption fails where another of the call's
identifiers replaces the whole run: nothing is left for the check, the letter is sent, and what the withheld match
covered beyond the run stays as written.

**The letter** (`pe.mts`; patient E of the D1 fuzzer: member IDs `ZZ7654321` and `7654321`, one ending the other):

```
"ID ZZ76543ꛯ1\n01-02-2020"
  ef3e8d20, cc3dd7f6:  sent  "ID ZZ76543ꛯ[SSN]"            (its SSN pattern reads "1", the break and the date)
  74c32149 and every head back to 91e1527a:  sent  "ID [MEMBER_ID]\n01-02-2020"
  with one member ID only (ZZ7654321):       sent  "ID [MEMBER_ID]"   (no glued run, the match is applied and merged)
```

So the head shows eight digits that ef3e8d20's redaction replaced: the exception to "ef3e8d20's reading stands and this
one only adds". The digits are a date that ef3e8d20 took for a Social Security number, and the head hides the whole
member ID where ef3e8d20 shows seven of its nine characters; the gate, whose oracle knows what was planted, reads no
PHI class. `pe2.mts` (7,600 letters: ten writings of the ID, ten separators, nineteen tails, four leads) finds the head
showing a tail that ef3e8d20 hides in 8 letters, all of them that date after a line break; where the tail is a phone or
a Social Security number by itself the head hides it or refuses the letter (`withheld-probe.txt`).

**How it was found.** `cd /home/user/review-d1/d1 && node fz.mts 120 5923` prints `"SENT_WITHHELD":1,"SHOWS":1`
(31,200 letters; the record is in `out/fz.5923.jsonl`). Both oracles read 0 on every earlier run of that fuzzer in this
build, and the reviewers' subsequence checks (H1 206,772 letters, I1 about 120,000, K 192,590) read 0 too: their
patients have no member ID that ends another.

**The fix (not built, not reviewed: W5 stood down before it under the orchestrator's limit).** In `matchesIn`, withhold
only where no match of the call's own covers the glued run whole:

```ts
  const settled = found.filter((match) => match.fresh !== true);
  const own = [...found];   // the call's own matches, before any pattern's
  for (const match of patternMatchesIn(marked, settled, subject)) {
    const inRun =
      (match.kind === 'ssn' || match.kind === 'phone') &&
      glued.some((range) => match.start < range.end && range.start < match.end && !own.some((whole) => whole.start <= range.start && range.end <= whole.end));
    found.push(inRun ? { ...match, withheld: true } : match);
  }
```

To check before trusting it: what `confusedGluedIn` returns as a range (the token, or the shorter identifier's part of
it: the covering test must hold for either); the branch of `appliedMatches` that applies the settled matches alone (the
letter is refused by the scan there: `fz.mts`'s `SENT_WITHHELD` and flip oracles must stay 0, `withheldRefused` may
fall); `pe.mts` must print `ID [MEMBER_ID]` for patient E on the head, `pe2.mts` must read `B:hides K:shows` 0, and the
259 letters it reads as `K:REF` where ef3e8d20 sends may turn to sent with `[PHONE]` (none may show a digit ef3e8d20
hides). Then rows in `redact.leaks.test.ts` on both sides (the letter above for a patient with the two member IDs:
sent as `ID [MEMBER_ID]`; a glued run that no own match covers whole: still refused), the six redaction files, the
battery with fresh seeds, the gate on both trees, and a review of the delta (it is a few lines: one reviewer).

**Or, with the orchestrator's ruling, record it** in ADR 0054's residuals instead of fixing it: "for a patient whose
one member ID ends another, written with a look-alike, a Social Security or phone match of ef3e8d20's that begins in
the ID's last digits is withheld and the longer ID's placeholder replaces the run, so what follows the ID is sent as
written where it is no Social Security or phone number by itself (`ID ZZ76543<U+A6EF>1`, a line break and `01-02-2020`:
ef3e8d20 reads the 1, the break and the date as an SSN and shows seven of the ID's nine characters)", with a pinned row.

W5's recommendation: fix it. It is the one known exception to the principle the amendment states, and the fix is one
condition.

## 2. K-1 (review K): a CR LF counts two against a label's reach. W5 recorded it; no code change proposed here

`k1.txt`, `k1-on-seven-trees.txt` (`node /home/user/work/cmp.mts k1.txt head=... base=...`).
`"SSN on file. Statement\r\nNo. 900-12-3456150.00"` is sent by 74c32149, 24ad1075, a66fee45, 8e599038, ef3e8d20 and
cc3dd7f6; only f2f9f05e refused it, through the defect review J reported (one CR LF read as a blank line: J-3), which
round K fixed. The same letter written with LF is refused on every head of the build: the Social Security label is then
24 characters before the number, inside `LABEL_REACH`, and owns it; with CR LF it is 25. One character further
(`"SSN on file.  Statement\nNo. ..."`) the letter is the residual ADR 0054 already records (a Social Security label out
of reach with a noun between). The reach is counted in characters in ef3e8d20's own reading too.

It is in the amendment draft's residuals (review K-1) with the five lesser forms of review K. Rows to pin when the
tests are next touched (each verified on 74c32149):

```ts
    unchanged('SSN on file. Statement\r\nNo. 900-12-3456150.00'),   // K-1, recorded: sent as on ef3e8d20
    refused('SSN on file. Statement\nNo. 900-12-3456150.00'),
    unchanged('SSN on file.  Statement\nNo. 900-12-3456150.00'),    // the label out of reach, recorded before
    unchanged('Phone number is 900 77.3283150.00'),                 // review K's minors, recorded
    unchanged('Phone # : 900 77.3283150.00'),
    unchanged('900-12-345601Jan 2020.12.31'),
```

To close it instead (W5's view: a follow-up item of its own beside MOD-23, not this pull request): count a CR LF once
in `scanLabeled`'s reach in the strict reading only, and set `departs.left` where a label is read that way, so the scan
still reads the text once more as ef3e8d20 read it.

## Also in this folder

- `fo.mts`, `flipown.json`, `month-named-flip.txt`: the one `FLIP-OWN` the same fuzzer run printed. It is the
  month-named patient's flip (ruling B: ef3e8d20 refuses, this head redacts the month's word as the name and sends;
  f2f9f05e sends it too), in a letter that also writes the member ID with a slash and a plus inside
  (`SYN/MEMB+ER0042`), a form no tree reads: ef3e8d20 sends `ID SYN/MEMB+ER0042` unchanged. No finding.
- Review K's comment notes, to settle with the next change to `redact.ts` (no effect on what is read):
  `NAMED_BEFORE`'s comment says no two connectors read the same character, and `(` is read by `\(S\)` and by the class
  (the second reading ends at the `S`; times stay flat); the `(?<![_~])` added before the run of underscores changes
  no match; `DATE_AFTER_REACH` 32 is the slice's end from the last group's start, so the date is read 28 characters
  past the last four (23 are needed).
