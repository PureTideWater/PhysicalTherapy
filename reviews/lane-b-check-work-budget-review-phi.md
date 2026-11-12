# Lane B review: the letter check's work budget, PHI safety

Scope: PHI safety only of the work budget added to the letter check.
Head `33380cd5` (branch `co-001/check-work-budget`, `/home/user/PhysicalTherapy`) against base `58fb29e5` (`/home/user/tree-base`).
Files read: the diff of `packages/redact/src/redact.ts` and `packages/model-gateway/src/functions/denial-letter.ts`, and line ranges of `redact.ts` where a question needed them.
Date: 2026-11-12. Synthetic data only (JANE Q ZEPHYRA, 900-12-3456, (202) 555-0123, SYN7700123, SYN555001).

Claim under attack: **the only change in any answer is from sent to refused; a count, never a clock.**

**Result: no BLOCKING finding.** In every run, nothing the base refuses was sent and nothing the base redacts was shown. Four RECORD findings, none of them a send; three time-review notes.

## How it was run

All scripts are in `/home/user/review-phi/`, run from the repo root as
`PATH=/opt/node24/bin:$PATH node_modules/.bin/tsx /home/user/review-phi/<script>.mts`.

| Script | What it does | Output kept in |
| --- | --- | --- |
| `fuzz.mts` | Differential fuzz: base, real head, and a scratch head with a random low budget per letter | quoted below; `fuzz-clean.out` |
| `probes.mts` | Targeted probes A to F on the real head (budget 420,000,000) against the base | `probes.out` |
| `p1.mts` | Reproduction of P-1 | quoted below |
| `timing.mts`, `timing-confirm.mts` | Processor time against counted work, 77 letter families | `timing0.out`, `timing1.out`, quoted below |

The scratch head is `/home/user/review-phi/x/redact.ts`: a copy of the head's `redact.ts` whose only differences (checked with `diff`) are `export let CHECK_WORK_BUDGET` and four appended exports (`__setBudget`, `__state`, `__someOf`, `__counted`).

Nothing under `/home/user/PhysicalTherapy` or `/home/user/tree-base` was modified (`git status --short` is empty in both). Nothing was committed or pushed.

### The fuzz

For each random synthetic letter (names with look-alikes, joiners and initials; SSNs, phones, member and claim numbers in several written forms; dates, amounts, digit-per-line runs, placeholders, a control mark; repeated units), `fuzz.mts` asserts:

1. Real head within budget: the redaction (text, replaced, candidates, claims) deep-equals the base's.
2. Real head sent implies base sent and the same text.
3. Scratch head with a budget drawn around that letter's own cost:
   - past the budget in the redaction: the result is exactly `{ text: U+0001, replaced: 0, candidates: [] }` with count budget+1;
   - within it: the result deep-equals the base's and the count equals the earlier run's;
   - sent implies base sent and the same text.
4. After each of the two entries, the module state is back to `checkWorkSpent === null`, `ownFold === 'plain'`, `viewsOfCheck === null`, `datesOfCheck === null`.
5. Immediately after a refused run, the same letter at the full budget equals the base (no poisoned state). The scratch module is one process for the whole run, so every later letter is also a "next letter after a throw" compared with a base that never threw.
6. The bare mark U+0001 is refused by `holdsIdentifier` with 3 and with 4 arguments.

Output:

```
{"seed":"1","n":3005,"baseSent":554,"baseRefused":2451,"xPastInRedaction":1236,"xPastInCheck":185,"xSent":131,"xRefusedSameAsBase":1453,"fails":0,"state":0}
{"seed":"2","n":3156,"baseSent":567,"baseRefused":2589,"xPastInRedaction":1350,"xPastInCheck":178,"xSent":130,"xRefusedSameAsBase":1498,"fails":0,"state":0}
{"voc":"clean","seed":"11","n":1502,"baseSent":302,"baseRefused":1200,"xPastInRedaction":216,"xPastInCheck":76,"xSent":188,"xRefusedSameAsBase":1022,"fails":0,"state":0}
```

Commands: `SEED=1 N=4000 MS=120000 ... fuzz.mts`, `SEED=2 ...`, and `VOC=clean LO=0.6 SPAN=3 SEED=11 N=6000 MS=95000 ... fuzz.mts`.

Totals: 7,663 letters; 2,802 throws mid-redaction; 439 throws mid-check; 449 letters sent by the budgeted head, each also sent by the base with identical text; 0 failures; 0 state leaks.

## Findings

None is BLOCKING.

### P-1 (RECORD): `spent = null` runs the check with no counter; `spent = 0n` crashes

`holdsIdentifier`'s guard is `!(spent >= 0 && spent <= CHECK_WORK_BUDGET)`.

- `null` coerces to 0 and passes the guard. Then `checkWorkSpent = spent` sets the counter to `null`, which is the "no check is running" state, so `work()` counts nothing and the budget is off for that call.
- `0n` passes the guard and then throws `TypeError` at the first `work()`. That is an uncaught exception out of `holdsIdentifier`, which in `prepare` is a crash and not a send.
- `true` and `{ valueOf: () => 0 }` pass as 1 and 0 and are counted normally.

The answer under `null` is the base's own answer: the letter is read to its end, uncounted. So this is not a send of anything the base refuses. It does break "one count for every caller". TypeScript callers cannot pass it without a cast, and `prepare` passes `checkWorkOf(...)`, which is always a number.

Reproduction, `p1.mts`:

```
5\n to 60,000 | base: false (1828 ms) | head, count handed on: true (757 ms) | head, spent=null: false (939 ms) | head, spent=0n: "THROWS TypeError" (0 ms)
Zephyra + 49,990 initials | base: false (820 ms) | head, count handed on: true (151 ms) | head, spent=null: false (235 ms) | head, spent=0n: "THROWS TypeError" (0 ms)
```

`probes.out` section C gives the whole table. The letter the base refuses (`Seen 150.00Zephyra today`) is refused under every value of `spent`, or throws for `0n`. NaN, -1, ±Infinity, budget+1, 1e300, strings, `[]`, `[7]` and `{}` all refuse a clean letter too.

Smallest fix: make the guard `if (typeof spent !== 'number' || !(spent >= 0 && spent <= CHECK_WORK_BUDGET)) return true;`.

### P-2 (RECORD): the count is lost by a copy of `redacted`, and by a caller that drops the fourth argument

`checkWorkOf({ ...redacted })` is 0, and `holdsIdentifier(text, patient, claims)` starts from 0. The check then has a whole budget of its own, so the worst case is twice the budget. The answer is the base's own answer, so this is a time matter only. A frozen `redacted` keeps its count.

Reproduction, `probes.out` section C2 (letter: `5\n` repeated to 60,000 characters):

```
base check of that letter                                      false (3419 ms)
head, count handed on (as prepare does)                        true (1574 ms)
head, count of a spread copy {...redacted} (0)                 false (2294 ms)
head, count of a frozen redacted                               true (1727 ms)
head, spent dropped (3 arguments)                              false (1641 ms)
```

Smallest fix: none is needed for PHI. For the time claim, make `spent` a required parameter with no `= 0` default, so that a future caller cannot drop it silently. The only production caller, `prepare`, already passes it.

### P-3 (RECORD): a public function with no counter, called inside a counted entry, throws `PastCheckWorkBudget` through itself

`redactLetter`, `redactionSpans`, `holdsNameOrNumber`, `nameOrNumberMatches` and `fold` have no catch. They are counted whenever `checkWorkSpent` is non-null, and that is only inside one of the two entries, synchronously. The only way to get there is a getter or Proxy on the patient or claims that calls back into the module.

When that happens, the throw passes through the inner public function, whose caller sees an error of an unexported class, and lands in the outer entry's catch. The outer letter is refused.

Reproduction, `probes.out` section D:

```
redactLetter (no counter of its own) inside a counted redaction {"outerText":"\"\\u0001\"","outerSpentPastBudget":true,"held":true,"seen":["inner THROWS PastCheckWorkBudget"]}
```

The result is a refusal, never a send. No production caller builds such inputs. Smallest fix: none; at most a sentence in the doc comment.

### P-4 (RECORD): `someOf` is not `Array.prototype.some` on a sparse list, or on a list the test grows

Reproduction, `probes.out` section F:

```
dense arrays: differing answers or call sequences in 20,000    0
sparse [ ,1], test v===undefined: some / someOf                [false,true]
list grown by the test: some / someOf                          [false,true]
units for a hit at index 2 of 4 (expect 3) and a miss (expect 4) [3,4]
a hit past the budget throws rather than answers               PastCheckWorkBudget
```

Neither case is reachable at the five call sites, read in the diff: `base`, `plain`, `found`, `leftToTheCheck` and `numbers` are built by spread, filter or push and are dense. The five tests read only `item` and mutate nothing. In `matchesIn`, `found.push` happens in the loop body, after `someOf(leftToTheCheck, ...)` has returned, and on a different list.

The fuzz found 0 differences from the base within budget. Smallest fix: none; optionally say "for a dense list the test does not change" in the doc comment.

## Answers to the five questions

### 1. Can the budget turn a refusal into a send?

No.

- **Catches.** `redact.ts` has three `try` blocks: `onFold`'s `try/finally` (it rethrows and restores `ownFold`) and the two entries. There is no other `catch`, no Promise, no async, no generator. The throw cannot be swallowed between `work()` and an entry.
- **Where `work()` can throw.** The counter is non-null only between an entry's first line and its `finally`, so `work()` throws only inside an entry. P-3 is the one way to put a public function in between, and it ends in a refusal.
- **The bare-mark return.** `redactLetterForScreen` has one caller in `packages/` and `apps/` outside tests: `prepare` in `denial-letter.ts`, line 230. No screen reads its `text` or `candidates` except through `prepare`'s return, which comes after the check.
- **The mark is refused by itself.** `holdsIdentifier` refuses the text U+0001 at its first line, before `spent` is looked at, with 3 or 4 arguments (the fuzz's last assertion; `probes.out` section B).
- **`prepare`.** It then throws `InputRefusedError('identifier_left')`. `gateway.ts:254` and `specs.ts:60` call `spec.prepare(input)` with no try around it.
- **`holdsIdentifier`'s own catch.** It returns `true`, and its only other exit under a throw is a rethrow.

### 2. Can a partial reading get through?

No.

- **Per-call state.** `ownFold`, `viewsOfCheck`, `datesOfCheck` and `checkWorkSpent` are restored by `finally`. The fuzz asserted that after every one of 3,241 throws: 0 leaks.
- **Memo maps.** `foldedCodePoints`, `plainlyFolded`, `digitValues` and `subjectsAlike` are written only after the value is complete. In `fold`, `work()` is the first statement, before the lookup. `subjectsAlike.set` comes after the `some` that can throw.
- **Regexes.** Every `exec` loop in the counted paths runs on a regex made in the call (`new RegExp(pattern.source, pattern.flags)`), or sets `lastIndex = 0` before its loop (the `datePattern` loops at 1066 and 4190). No module-level sticky or global regex carries a `lastIndex` out of a throw.
- **Refused, then normal.** After each of four real letters refused past the real budget (two in the redaction, two in the check), the PHI letter, a letter the base refuses, and a clean letter each deep-equal the base's answer. `probes.out` section B: 12 of 12 `true`.
- **Nesting.** An entry run inside another, through a getter, leaves the outer's count and answer unchanged (`probes.out` section D, first three lines).

### 3. Can an attacker drive the budget to a send?

No. The count can only throw, and the throw can only refuse.

- **`spent`.** See P-1. Every value either refuses, counts normally, throws `TypeError`, or (`null`) runs the base's uncounted reading. A letter the base refuses is refused under all 20 values tried.
- **The WeakMap.** See P-2. A lost count is 0, which costs time and never changes a decision.
- **`checkWorkSpent === null` paths.** See P-3. Outside an entry they are the base. `redactLetter` on the initials letter equals the base's text, in 25 s uncounted (`probes.out` section D).
- **`fold` outside the entries.** Identical to the base for every code point from U+0000 to U+1FFFF: 0 differences. 3,000,000 calls outside an entry, which would be 450,000,000 units if counted, do not throw (`probes.out` section E).

### 4. Is every loop counted or bounded?

Within what was measured, yes.

For 77 letter families (`timing.mts`), going from 12,500 to 50,000 characters, the count grew by exactly 4.0 in every family. So the count is linear, and the 350-per-character charge plus the sites cover it.

Time grew by 1.5x to 7x under a second process. The six families that grew fastest were rerun alone at 25,000, 50,000 and 100,000 characters (`timing-confirm.mts`) and are linear:

```
"[SSN]"    25000: 107 ms | 50000: 121 ms | 100000: 200 ms
"a5"       25000: 239 ms | 50000: 311 ms | 100000: 599 ms
"J Q "     25000: 230 ms | 50000: 335 ms | 100000: 724 ms
"5."       25000: 144 ms | 50000: 293 ms | 100000: 628 ms
"٥ "       25000: 249 ms | 50000: 472 ms | 100000: 947 ms
"5/"       25000: 126 ms | 50000: 278 ms | 100000: 645 ms
```

I found no super-linear uncounted pass. This is a sample of families, not a proof over every loop.

For the time review (not PHI):

- **T-1.** The time per counted unit ranges from about 1.5 to 14 ns across families on this shared machine (`timing0.out`, `timing1.out`), against the 2.5 ns the budget assumes. `a5` repeated is the dearest per unit, and still 0.6 s at 100,000 characters.
- **T-2.** With the count dropped (P-2), `5\n` at 100,000 characters is read to its end by the check alone and sent in 3.2 s (`probes.out` section C2, last line).
- **T-3.** The callers with no counter keep the base's times: `redactLetter` on `Zephyra` plus 49,990 initials and one look-alike took 25 s.

### 5. Equivalence under the budget

Holds.

- **Redaction.** For every letter within budget, the head's and the scratch head's redaction deep-equal the base's text, replaced, candidates and claims: 7,663 letters, 0 differences.
- **The check.** Every answer equals the base's unless the count refused it.
- **Determinism.** The count for a letter is the same run to run (fuzz assertion `count differs run to run`: 0).
- **`someOf`.** It calls the test on the same items in the same order with the same early exit as `some` on dense lists (20,000 random lists, 0 differences), and charges index+1 on a hit and length on a miss.
- **Placement of `work()`.** Every `work()` call in the diff is a statement of its own: first in its function, after the `someOf` loop, or first in the entry's `try`. Its only effect on control flow is the throw.

## Checked and found sound

| Check | Script |
| --- | --- |
| Head sent implies base sent with identical text, real budget and random low budgets | `fuzz.mts` |
| Past the budget in the redaction, the result is exactly U+0001, replaced 0, no candidates, count budget+1 | `fuzz.mts`; `probes.mts` B |
| The bare mark is refused by `holdsIdentifier` whatever the count | `fuzz.mts`; `probes.mts` B |
| No module state is left by a throw (`checkWorkSpent`, `ownFold`, `viewsOfCheck`, `datesOfCheck`) | `fuzz.mts`, 3,241 throws |
| A letter after a refused letter reads as in a fresh base | `probes.mts` B; `fuzz.mts` |
| A letter the base refuses is refused under every `spent` value | `probes.mts` C |
| Nested entries restore the outer count and answer | `probes.mts` D |
| `fold` outside the entries equals the base and never throws | `probes.mts` E |
| `someOf` equals `some` on dense lists, with the stated charge | `probes.mts` F |
| The count is linear in length for 77 families; time is linear for the six fastest-growing | `timing.mts`; `timing-confirm.mts` |
| `prepare` is the only non-test caller of `redactLetterForScreen`, `holdsIdentifier` and `checkWorkOf`; no try around `spec.prepare` in `gateway.ts` or `specs.ts` | grep of `packages/` and `apps/` |
| No `catch` in `redact.ts` other than the two entries; no async boundary | grep |

## Verdict

The claim holds in everything that was run. Across 7,663 fuzzed synthetic letters and 3,241 forced stops mid-reading, plus the real past-budget letters, the head never sent a letter the base refuses and never returned text other than the base's. A reading stopped by the budget returned only the mark U+0001, which the check refuses on its own, and left no state that changed the next letter. No finding is BLOCKING. The four RECORD findings concern the edges of the count: `spent = null` switches the counter off, a dropped or copied count gives the check a second budget, a nested uncounted public function can see the internal throw, and `someOf` equals `some` only on dense unmutated lists. In each, the answer is the base's answer or a refusal. The one change I would make before merge is the one-line `typeof spent !== 'number'` guard (P-1), with `spent` made a required parameter (P-2), so that "one count for the whole check" does not rest on the caller's types. The timing observations T-1 to T-3 are for the time review.
