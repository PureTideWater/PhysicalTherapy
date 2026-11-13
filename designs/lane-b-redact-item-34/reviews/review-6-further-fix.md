# Review 6: the further fix to finding (C) (95529e85, parent 287c68d3)

Read-only review of `packages/redact/src/redact.ts` and the test row in
`packages/model-gateway/src/redact.leaks.test.ts`. Synthetic data only.

## Verdict

**BLOCKER: 0. Lesser: 3** (one cost note, one unguarded assumption worth a comment or a test, one test-strength note).

No letter the base refuses was sent, nothing 287c68d3 hid is shown, and no counted unit changed, by reading and
by a three-tree run of 9,695 letters on a new seed (703 of them on the changed path).

## Evidence run

Script: `/tmp/claude-0/-home-user-PhysicalTherapy/179e1ec1-f2e5-5e51-954e-b58916f3dd83/scratchpad/r6/diff3.mts`
(trees base a97d73e4, 287c68d3, 95529e85; seed 7711 of `fuzzLetters`, its first 3,232 letters, each as generated and in
two variants with a name part glued to a number, the commit's own shapes among them: `RE: <Name>900-12-3456. `,
the zero-width-space SSN, name+member ID, claim number+name, CR LF and LF CR endings; stopped by its 140 s limit inside seed 7711;
seeds 7712 and 7713 were given and not reached).

| Count | Value |
|---|---|
| letters | 9,695 |
| base refused (screen entry) | 3,638 |
| base refused, 95529e85 sent (screen entry: `redactLetterForScreen` + `holdsIdentifier(text, checkWorkOf)`) | **0** |
| base refused, 95529e85 sent (`redactLetter` + `holdsIdentifier`) | **0** |
| verdict differs 287c68d3 vs 95529e85 (either entry) | 0 |
| text differs 287c68d3 vs 95529e85 (screen entry) | 703 |
| ... of which the only difference is the trailing U+0001 on 287c68d3 | 703 (other: 0) |
| ... of which 95529e85 then sends | 0 |
| ... of which `holdsIdentifier(text)` from a count of 0 answers false | 0 |
| `redactionSpans().text` differs | 703, all the trailing mark only |
| `redactionSpans().spans` differs | 0 |
| `redactLetter().text` differs, mark aside | 0 |
| `checkWorkOf` differs 287c68d3 vs 95529e85 | **0** |
| `candidates` differs / `replaced` differs | 0 / 0 |
| an entry threw | 0 |
| texts holding the mark: 287c68d3 / 95529e85 | 2,431 / 1,728 (difference 703) |

Largest `checkWorkOf` seen: 1,122,590 of a budget of 420,000,000, so the budget edge was not exercised (see
"Not checked").

## Question 1: can 95529e85 send a letter the base refuses? No.

The only new outcome is `null` at line 3907, and only when `onSent` (the base's text is `sent` and the base's wider
reading refused it) and the sandboxed `holdsIdentifier(sent, patient, claims)` is true. Every other path returns
what 287c68d3 returned (`refused` is passed through untouched; `onSent` is set at 3898 immediately before the
return, so a `PastCheckWorkBudget` caught at 3900 leaves it false and the mark is kept).

The implication "true in the sandbox from 0 implies true in the real check from the entry's count" holds:

- **The text is the same.** `redactionSpans` (3664-3670): `sent = wider.length === 0 ? asFirstWrote :
  written(normal, both)`, and on null it returns `{ text: normal, spans: both }` with `both = first` when
  `wider.length === 0`; `redactLetter` (3700-3701) writes `written(normal, spans)`, the same call on the same
  arguments. `screenAsBothRead` (3790-3796): `sent` is `first.text` or `written(normal, both)`, and on null it
  returns `asFirstWrote` (text `first.text`) or `widened(both)` (text `written(normal, both)`, line 3780). Run: 703
  of 703 texts equal 287c68d3's minus the mark.
- **The answer does not depend on the count except by refusing.** `checkWorkSpent` is read in four kinds of place
  only: `work` (333-338, throws past the budget), `takenAgain` (589, `=== null`, and a counter runs in both
  checks), `workSince` (600, a cost), and save/restore. `PastCheckWorkBudget` is caught at 3672, 3727, 3901 and
  4023 only, none of them inside the check's reading. So from a larger start the check either reaches the same
  answer or throws earlier and answers true (4027). A sandbox answer that is itself true by the budget is true
  from any larger start for the same reason (same charges in the same order, see next point).
- **State is the same at both checks.** The sandbox nulls `viewsOfCheck`, `datesOfCheck`, `formsOfCheck`,
  `alikeOfWider`, `storeScope`, sets `widerReading` false, `baseReading` false and the count 0 (3814-3822). The
  real check runs after the entry returned: the outermost `inOneReading` has emptied the stores (1238-1243),
  `storeScope` and `widerReading` are back to null/false by their own scopes, `baseReading` is restored from
  `kept` (now saved and restored, 3814/3826, where 287c68d3 set it false by hand), and `ownFold` is 'plain' at
  both (it is scoped by `onFold`, and neither entry calls the gate inside one). `subjectsAlike` is keyed by the
  subject object and `holdsIdentifier` builds its own subject (4002), so nothing carries between them; the other
  module maps are pure memos of code points.
- **Nested `inOneReading`.** `apartFromTheEntry` opens fresh stores (3824); `holdsIdentifier`'s own
  `inOneReading` (4018) finds them open and shares them, as it shares nothing at top level but opens its own: the
  same fresh start. The finally at 3826 puts the entry's stores back whatever the inner one nulled.
- **`holdsIdentifier`'s save/restore.** Inside the sandbox it saves 0, sets `spent` (0), restores 0 (3998-4029);
  the sandbox then restores the entry's count. No leak either way.
- **An exception in the sandbox.** Anything but `PastCheckWorkBudget` leaves through both finallys (state
  restored) and through the entry's catch, which rethrows: the entry throws, no text is returned. Fail-closed; on
  287c68d3 the same letter came back marked, and the caller's own check would meet the same exception anyway.
- **`redactLetter`'s callers** have `checkWorkOf` 0 (the result is not in `workOfRedacted`), so their check is
  the sandbox's check exactly. Run: 0 sent.

## Question 2: can it show anything 287c68d3 hid? No.

On the null path 287c68d3 returned the base's text plus the mark, and that text `=== sent` by the `onSent`
condition; 95529e85 returns `sent`. Same characters replaced. Run: 703 differences, all the trailing U+0001 alone;
`redactionSpans` spans identical in all 9,695; candidates and `replaced` identical.

Residual by reading only: `onSent` compares texts, not span lists. If the base's spans and `both` ever wrote the
same string from different span lists, `redactionSpans().spans`, `replaced` and (screen entry, where
`base.spans === first.spans` but `wider.length > 0`) the candidates list could differ from 287c68d3's while the
text does not. That needs a wider match whose placeholder writes what it replaces; none in 9,695, and it would
show no more text either way.

## Question 3: does it change the counted units? No.

The sandbox saves and restores `checkWorkSpent` and every store the count depends on (3814/3826); the stores the
entry goes on to use are the entry's own objects, untouched. After a null the entry runs `widened(both)` where
287c68d3 ran `widened(base.spans)` on the same string, or `asFirstWrote` in both. Run: `checkWorkOf` equal on all
9,695 letters, the 703 changed ones included.

## Lesser findings

**L-1 (cost, not counted).** On the `onSent` path the entry now runs a whole `holdsIdentifier` more, on a counter
of its own: up to one more budget of uncounted work per entry, on top of the base's reading that 287c68d3 already
ran uncounted, and the caller's real check then reads the same text a third time. Bounded (each sandbox has the
budget), but the worst-case time of one entry grew and no budget row measures it. The path is common in letters of
this shape (703 of 9,695 here). Worth one timing row for a long letter on this path.

**L-2 (assumption held by convention only).** The null is sound because the caller then asks
`holdsIdentifier` of exactly the returned text. That was already the contract, but until this commit the
wider-only refusal of the base was carried by the mark in the text itself; now, for these letters, it is carried by
the caller's check alone, as it is for every `byFirstRead` letter. The comment at 3855-3859 says so; nothing tests
that a caller who writes `redactionSpans`' spans gets a text the check refuses beyond the two letters of the new
row. The run above covers it (0 of 9,695), a property row would keep it.

**L-3 (test row).** The row asserts refused, the `[SSN]` prefix and no mark, for two letters. It does not assert
`checkWorkOf` equal to the base's or 287c68d3's for these letters (measured equal here), and it would still pass
if the gate stopped asking the base's reading for them at all, since the head's own check refuses both. It pins the
text, which is what failed; it is not evidence for the rule. `expect(redactionSpans(letter).text).toBe(letter)`
holds only because both letters are NFKC-stable and unbracketed, which is true of them.

Nothing else wrong found in the diff: `asTheBaseRead` is `apartFromTheEntry(true, ...)` with the same resets as
before; restoring `baseReading` from `kept` is at least as safe as the old `baseReading = false` (and right if the
function is ever nested); the comments match the code.

## Not checked

- The budget edge: no letter in the run came near 420,000,000 units (largest 1,122,590), so "true by the budget
  from 0 implies true from the entry's count" rests on the reading above, not on a run.
- That the scratch trees are byte-identical to the commits (taken as given).
- The unit suites, the full gate, seeds 301-303 and the two budget rows (already measured by the requester).
- Wall time of the added check (L-1); callers outside `packages/` and `apps/` (none found inside them besides
  `redactLetter`).
- More than one new seed: the run is 9,695 letters (3,232 generated, each with two glued variants), all of seed 7711.
