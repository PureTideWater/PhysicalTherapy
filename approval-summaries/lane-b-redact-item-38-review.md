# Lane B, Queues item 38: adversarial review of 1fd9fddb

Scope: the one commit `1fd9fddb` on top of `a97d73e4`, one file,
`packages/model-gateway/src/redact.property.test.ts` (test code only; 75 added lines, no production change).
Nothing in the repository was edited. Synthetic data only.

## What was run and read

- Read: `packages/redact/src/redact.ts` at `Found.fresh` / `Found.withheld` (1065-1084), the label-through reading
  in `patternMatchesIn` (2370-2388), `merge` and `RANK` (3443-3476), `appliedMatches` (3509-3524),
  `redactionSpans` (3534-3567), `screenAsBothRead` / `screenAsFirstRead` (3629-3683), `chainLeft` (3709-3725),
  `holdsIdentifier`, `refusedAsFirstRead`, `holdsAsFirstRead` (3734-3815); the generator `ssnPhoneCase` and the
  whole of `sendsNoSsnOrPhoneIn` in the test file (1352-1496) and the pinned test (1504-1543).
- Ran `pnpm exec vitest run --project unit packages/model-gateway/src/redact.property.test.ts -t 'MOD-15'`:
  46 passed, 50 skipped, 9.7 s.
- Ran `pnpm exec eslint` on the file: clean. `prettier --check` warns on the file, and warns the same on the
  base's copy (not introduced here; `pnpm lint` is `tools/lint/run.ts`, not prettier).
- Scratch probes (outside the repository, a copy of the test file with the redaction source imported directly):
  1. The base's oracle (`screened.text === rebuilt + text.slice(kept)`) under `fc.check`, seed 1596478644,
     400 runs: fails at run 131, 128 shrinks. The shrunk counterexample is, segment for segment, the pinned
     test's case (survivor `Ref 900-12-34 56 on file. `, `SSN ` + member `9<ZWSP>00-0<ZWSP>0-0<ZWSP>000`,
     `\n` + `2<ZWSP>09<ZWSP>5<ZWSP>55<ZWSP>0<ZWSP>184 x123`, `SSN ` + `9<ZWSP>00-0<ZWSP>0-0<ZWSP>001`;
     member IDs `SYNMEMBER0042`, `900000000`; claim 2 `2005550100`; refused true). Screen
     `...\n[PHONE]. Noted. SSN [SSN]...`, spans `...\n[SSN]. Noted. SSN [SSN]...`, held true.
  2. 18,400 generated letters (seed 1596478644 and seeds 1001-1045, 400 each), each classified as: both
     entries equal; differ in a letter the check does NOT refuse; differ only by [PHONE]-for-[SSN]; differ by
     [SSN]-for-[PHONE]; differ any other way. Result: 18,399 equal, 1 [PHONE]-for-[SSN] (the seed's own
     letter, held), 0 of every other class; held equals the generator's `refused` in all 18,400.
  3. 19,168 generated letters filtered to those with one of the call's own numbers written immediately before a
     pattern number (seeds 2001-2014, 4,000 drawn each): 19,167 equal, 1 [PHONE]-for-[SSN] in a held letter
     (seed 2006: `SSN <own claim>; Noted. Subscriber <ten digits in another script, wrapped>`), 0 of every
     other class, held equals `refused` throughout.
  4. Nine hand-written variants of the pinned letter, each with and without the survivor (table under N1).

## Blockers

None found.

On the points asked:

1. Diagnosis: confirmed. `appliedMatches` (3517-3524) returns the settled matches alone when
   `chainLeft(written(normal, merge(settled)), ..., false)` refuses; `redactionSpans` (3541-3542) merges every
   match; `RANK` puts ssn (4) before phone (5), so the merged span of a settled phone and a fresh ssn is [SSN]
   in the spans and [PHONE] on the screen. The comment on `appliedMatches` (3509-3516) and on `Found.fresh`
   (1071-1074) say this in words: it is the documented design, not an accident.
   A sent letter cannot carry the divergence: the two entries differ only when the non-strict `chainLeft`
   refuses the settled text; `holdsAsFirstRead` (3799-3815) runs the strict `chainLeft` on that same text, which
   only adds to the non-strict one; so `refusedAsFirstRead(first.text)` is true, `screenAsBothRead` (3648)
   returns the first reading unwidened, and `holdsIdentifier(screened.text)` is true. Probe 2 and 3 agree: no
   letter of 37,568 differed while not held.
   With `held` false the new oracle demands exact equality (`else { expect(screened.text).toBe(applied); }`,
   test lines 1481-1483), and `expect(redactLetter(...).text).toBe(applied)` (1465) holds in both branches, so
   for every sent letter the three assertions together are the base's two.

2. Oracle: no hole found in the relaxed branch (test lines 1467-1480).
   - Index arithmetic: `at` walks the screen text, `from` the letter. For each span, `between` is
     `text.slice(from, span.start)` and must equal `screened.text.slice(at, at + between.length)`; the
     placeholder must stand at `at`; `from = span.end`. A span at index 0 gives `between === ''` (passes on the
     empty slice, then the placeholder is checked at 0). Adjacent spans give `between === ''` likewise. A span
     at the end leaves `text.slice(from) === ''`, and the closing `expect(screened.text.slice(at)).toBe(...)`
     then requires the screen to end with the placeholder. No off-by-one.
   - A span left unredacted fails (the letter's characters stand where a placeholder must). A shortened or
     shifted span fails at the next `between` or the closing slice. An extra span on the screen fails at
     `between`. Any difference outside spans fails. `[`-prefixed letter text cannot fake a placeholder:
     `expect(normal).toBe(text)` (1457) holds only for a letter with no square bracket of its own.
   - The call's own numbers: the allowance applies only where `span.placeholder === '[SSN]'`; a span whose
     placeholder is [MEMBER_ID] or [CLAIM_n] must be written exactly so on the screen, and the unchanged
     `secrets` loop (1484-1488) still requires [MEMBER_ID] / [CLAIM_2] of the spans for the generator's own
     numbers.
   - Direction: right. The screen's matches are a subset of the spans' matches and `merge` takes the best
     rank of an overlapping group, so the spans' rank is never worse than the screen's: [SSN] in the spans over
     [PHONE] on the screen can arise, the reverse cannot. Probes 2 and 3 saw the reverse zero times.
   - The allowance is not weaker than what the generator's own oracle already accepts for a pattern number
     (`['[SSN]', '[PHONE]']`, line 1486).

3. Refactor: no assertion changed meaning. `holdsIdentifier(screened.text, patient, claims)` is called once
   with the same arguments as the old inline call and is a pure function of them (it saves and restores its
   counter, 3745-3765); the final `expect(held, ...).toBe(refused)` is the old assertion on that value. The
   order changed only in that the `redactLetter` equality is now asserted before the screen's; which fails first
   differs, what passes does not. `fc.property(ssnPhoneCase, sendsNoSsnOrPhoneIn)` passes the one generated
   value; `numRuns: 400` and the 60 s timeout are unchanged.

4. Pinned test: faithful (probe 1 reproduces it exactly, including "after 131 runs"), fails under the base's
   oracle (its own literals show the two entries' texts differ on the refused letter while `redactLetter`
   equals the spans), passes now. See N2 for one literal that pins more than the design promises.

5. Repository rules: no model name in the diff or the commit message; numbers are the generator's synthetic
   ones (900-range SSN shapes, 555-01xx phones, SYN-prefixed IDs); no run count, timeout, budget or threshold
   changed; eslint clean.

## Should-fix

None found. (S-level was considered for N1 and rejected: the stricter-than-design oracle fails closed, and the
base's oracle had the same exposure.)

## Notes

### N1. The oracle is stricter than the design in one respect the comment does not say; a future flake is possible, in the safe direction

Lines: test 1437-1445 (doc comment), 1468 (`// Refused: every span is replaced where it stands ...`), and the
commit message ("in a refused letter every span is replaced where it stands ... and nothing else may differ").

Evidence: `appliedMatches` drops every fresh match in a refused letter, not only one a settled match covers
whole. Where no settled match covers the number, the screen leaves it as written. Probe 4, with member
`900000000`, claim 2 `2005550100`, survivor first:

| letter after the survivor | screen (held) | spans / redactLetter |
|---|---|---|
| `SSN 900-00-0000. Noted. \n2095550184 x123. Noted. ` | `SSN [MEMBER_ID]. Noted. \n2095550184 x123. Noted. ` | `SSN [MEMBER_ID]. Noted. \n[SSN]. Noted. ` |
| `SSN 900-00-0000. Noted. \n2095550184. Noted. ` | `SSN [MEMBER_ID]. Noted. \n2095550184. Noted. ` | `SSN [MEMBER_ID]. Noted. \n[SSN]. Noted. ` |

(the same two with a zero-width space inside each group give [PHONE] on the screen, the pinned case; with
dashes both entries write [PHONE]; without the survivor every variant is the same in both entries and not
held.) This is the documented design ("Call Zephyra at 555-0123/555-0124 stays refused whole", 2375-2377), the
letter is refused either way, and it is the base's behaviour, unchanged by this commit. But the new held branch
would fail on such a letter, as the base's oracle did. The generator does not write one today (an unlabeled
bare ten is drawn with an area code 3-9, and 37,568 probed letters gave no difference of this kind), so the
property is green for the right reason; the wording "every span is replaced" describes the generator's
letters, not the design. The same holds for a fresh match that widens a settled span or joins two, and for a
fresh match of the call's own kind over a settled pattern match: all fail the held branch, none was seen.

Suggested fix (comment only, optional): add one sentence to the doc comment: a number only a fresh match takes
is left as written in a refused letter by design; the generator writes none, and the property would fail on
one. That keeps the next reader from "fixing" production if a later generator change draws such a letter.
Do not widen the allowance pre-emptively.

### N2. Two pinned literals fix [SSN] over a phone number in text that is sent

Lines: test 1533 and 1538-1540 (`'...\n[SSN]. Noted. SSN [SSN]. Noted. '` for `redactLetter` on the refused
letter and `sentText` for both entries on the letter without the survivor).

Evidence: the number is `209 555 0184 x123`, a phone; [SSN] is written because the "SSN" label three tokens
back is read through the call's own member ID, across ". Noted. " and a line break. Nothing leaks (a
placeholder hides the whole span, extension included), and the pin is what the code does. But the literal
makes a label choice part of the contract: later work that narrows how far a label is read through the call's
own number (a legitimate precision fix that would turn this into [PHONE] everywhere and remove the divergence
entirely) will break this test without having broken any rule. The two `sendsNoSsnOrPhoneIn` calls above the
literals (1529-1530) already assert everything the acceptance rules need.

Suggested fix (optional): keep the literals, and say in the comment at 1531 that the [SSN] label on this phone
number is today's reading and may become [PHONE] in both entries; or assert the screen literal and the fact of
the difference (`not.toBe`) only for the refused letter. No change is needed for correctness.

### N3. The allowance does not check why the label is lower

Lines: test 1474.

Evidence: any [SSN] span may be [PHONE] on the screen in any held letter. The test cannot see `Found.fresh`,
so it cannot tie the allowance to its cause; a regression that mislabelled a Social Security number as [PHONE]
on the screen in refused letters only would pass. The harm is bounded: the span is hidden whole, the letter is
refused, and the generator's oracle already accepts either label for a pattern number. In every case observed
(the seed, seed 2006, the variants) the span immediately before the relabelled one carried a placeholder of the
call's own ([MEMBER_ID] or [CLAIM_2]).

Suggested fix (optional, verify before adopting): allow [PHONE] for [SSN] only where an earlier span in the
letter is [MEMBER_ID] or [CLAIM_n]. I did not establish that this holds for every reach of the label-through
reading (a list number, "Phone 1:", also marks a match fresh, though the generator writes none), so this is a
tightening to try, not a required one.

### N4. The closing assertion of the held branch has no message

Line: test 1480 (`expect(screened.text.slice(at)).toBe(text.slice(from));`). The two assertions above it print
the letter and the screen text; this one does not. Add the same message for a readable failure. Cosmetic.

### N5. Formatting

`prettier --check` warns on the file before and after the commit; not introduced here and not part of
`pnpm lint`. No action for this commit.

## Verdict

The commit stands. The diagnosis is right and is the documented design of `appliedMatches`: the two entries
can differ only in a letter the check refuses, which the code shows by construction (the strict check that
gates sending reads no less than the non-strict one that drops the fresh matches) and 37,568 generated letters
confirm with no counterexample. For every letter that is sent the oracle is exactly as strong as the base's;
for a refused letter it gives up one thing only, [PHONE] where the spans say [SSN], in the one direction the
ranking allows, while still requiring every span hidden in place, the call's own placeholders exact and no
character changed outside spans; the index walk has no off-by-one. The refactor changes no assertion, no run
count, timeout or budget moved, the pinned case is the seed's shrunk counterexample exactly and fails on the
base's oracle, and no production redaction changed, so nothing the base redacts or refuses can be shown or sent
that was not before. No blocker and no should-fix; four optional notes, the most useful being a one-sentence
comment that a number only a fresh match takes is left as written in a refused letter by design (N1), so that
a future failure of this property is read correctly.
